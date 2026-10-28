// Cloudflare Workers のエントリーポイント
//   POST /line/webhook    … LINE の Webhook（友だち追加・ブロック）
//   POST /stripe/webhook  … Stripe の Webhook（決済完了）
//   GET  /admin/stats     … 登録者数・購入者数・配信数（要 ADMIN_TOKEN）
//   POST /admin/purchase  … 銀行振込などの購入を手動で登録（要 ADMIN_TOKEN）
//   POST /admin/run-daily … 定期処理をすぐに実行（動作確認用・要 ADMIN_TOKEN）
//   毎日の定期処理        … scheduled（wrangler.toml の crons）
import { timingSafeEqual, verifyLineSignature, verifyStripeSignature } from './crypto.js';
import { LineClient } from './line.js';
import {
  claimStripeEvent, getUser, getUserByRefCode, markBlocked, markPurchased,
  recordDeliveries, releaseStripeEvent, stats, upsertFollower,
} from './db.js';
import { allowedPaymentLinkId, purchaseThanksEnabled, renderStep } from './scenario.js';
import { runDaily } from './daily.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function requireEnv(env, names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new Error(`環境変数が未設定です: ${missing.join(', ')}`);
}

// ---------- LINE ----------

async function handleFollow(env, line, event, now) {
  const userId = event.source?.userId;
  if (!userId) return;
  let displayName = null;
  try {
    displayName = (await line.getProfile(userId)).displayName ?? null;
  } catch (err) {
    console.warn('プロフィール取得に失敗', err.message);
  }
  const { user } = await upsertFollower(env.DB, userId, displayName, now);

  // 登録プレゼント①は応答メッセージで送る（通数に数えない）。
  // 再追加の人にも再度送る（応答なので無料）。失敗したら定期処理が push で送り直す。
  try {
    await line.reply(event.replyToken, renderStep('welcome', user));
    await recordDeliveries(env.DB, [userId], 'welcome', now);
  } catch (err) {
    console.error('登録直後の配信に失敗', err.message);
  }
}

async function handleLineWebhook(request, env, ctx, now) {
  requireEnv(env, ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN']);
  const body = await request.text();
  const ok = await verifyLineSignature(body, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET);
  if (!ok) return json({ error: 'invalid signature' }, 401);

  const { events = [] } = JSON.parse(body);
  const line = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
  for (const event of events) {
    if (event.type === 'follow') await handleFollow(env, line, event, now);
    else if (event.type === 'unfollow' && event.source?.userId) await markBlocked(env.DB, event.source.userId, now);
    // メッセージへの返信は LINE Official Account Manager の応答設定で行う
  }
  return json({ ok: true });
}

// ---------- 購入 ----------

// 購入を登録し、シナリオを購入者用に切り替える
async function registerPurchase(env, userId, method, now) {
  const user = await getUser(env.DB, userId);
  if (!user) return { ok: false, reason: 'user not found' };
  const changed = await markPurchased(env.DB, userId, method, now);
  if (changed && purchaseThanksEnabled() && user.status === 'active' && env.LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const line = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
      await line.push(userId, renderStep('purchaseThanks', user));
      await recordDeliveries(env.DB, [userId], 'purchaseThanks', now);
    } catch (err) {
      console.error('購入お礼の送信に失敗', err.message);
    }
  }
  return { ok: true, alreadyPurchased: !changed, userId };
}

async function handleStripeWebhook(request, env, ctx, now) {
  requireEnv(env, ['STRIPE_WEBHOOK_SECRET']);
  const body = await request.text();
  const ok = await verifyStripeSignature(
    body, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, Math.floor(now.getTime() / 1000),
  );
  if (!ok) return json({ error: 'invalid signature' }, 400);

  const event = JSON.parse(body);
  const session = event.data?.object ?? {};
  // checkout.session.completed：カードなど即時決済（payment_status = paid）
  // checkout.session.async_payment_succeeded：コンビニ払いなど後から入金される決済
  const isPaid =
    (event.type === 'checkout.session.completed' && session.payment_status === 'paid') ||
    event.type === 'checkout.session.async_payment_succeeded';
  if (!isPaid) return json({ ok: true, ignored: event.type });

  const linkId = allowedPaymentLinkId();
  if (linkId && session.payment_link !== linkId) return json({ ok: true, ignored: 'other payment link' });

  const userId = session.client_reference_id;
  if (!userId) {
    console.warn('client_reference_id のない決済', session.id);
    return json({ ok: true, ignored: 'no client_reference_id' });
  }

  if (!(await claimStripeEvent(env.DB, event.id, now))) return json({ ok: true, duplicate: true });
  try {
    const result = await registerPurchase(env, userId, 'stripe', now);
    if (!result.ok) console.warn('決済に対応するLINEユーザーが見つかりません', userId, session.id);
    return json(result);
  } catch (err) {
    await releaseStripeEvent(env.DB, event.id); // Stripe の再送で処理し直せるようにする
    throw err;
  }
}

// ---------- 管理用 ----------

function isAdmin(request, env) {
  const auth = request.headers.get('authorization') || '';
  return Boolean(env.ADMIN_TOKEN) && timingSafeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`);
}

async function handleAdmin(request, env, ctx, now, path) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

  if (request.method === 'GET' && path === '/admin/stats') return json(await stats(env.DB));

  if (request.method === 'POST' && path === '/admin/purchase') {
    // 例: {"refCode":"ABC234"} または {"userId":"U..."}。method は省略時 bank
    const { refCode, userId, method = 'bank' } = await request.json();
    const target = refCode ? await getUserByRefCode(env.DB, refCode) : userId ? await getUser(env.DB, userId) : null;
    if (!target) return json({ ok: false, reason: 'user not found' }, 404);
    return json(await registerPurchase(env, target.user_id, method, now));
  }

  if (request.method === 'POST' && path === '/admin/run-daily') {
    requireEnv(env, ['LINE_CHANNEL_ACCESS_TOKEN']);
    return json(await runDaily(env, new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN), now));
  }

  return json({ error: 'not found' }, 404);
}

// ---------- エントリーポイント ----------

export default {
  async fetch(request, env, ctx) {
    const now = new Date();
    const { pathname } = new URL(request.url);
    try {
      if (request.method === 'POST' && pathname === '/line/webhook') return await handleLineWebhook(request, env, ctx, now);
      if (request.method === 'POST' && pathname === '/stripe/webhook') return await handleStripeWebhook(request, env, ctx, now);
      if (pathname.startsWith('/admin/')) return await handleAdmin(request, env, ctx, now, pathname);
      if (pathname === '/') return new Response('ok');
      return json({ error: 'not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'internal error' }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    requireEnv(env, ['LINE_CHANNEL_ACCESS_TOKEN']);
    const result = await runDaily(env, new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN), new Date(controller.scheduledTime));
    console.log('定期配信', JSON.stringify(result));
  },
};
