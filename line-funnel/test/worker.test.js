import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { runDaily } from '../src/daily.js';
import { LineClient } from '../src/line.js';
import { createD1, mockLineFetch, env, lineRequest, stripeRequest, insertUser, sent } from './helpers.js';

let DB, line;
beforeEach(() => { DB = createD1(); });
afterEach(() => line?.restore());

const user = (id) => DB.raw.prepare('SELECT * FROM users WHERE user_id = ?').get(id);
const follow = (userId) => ({ type: 'follow', replyToken: `rt-${userId}`, source: { type: 'user', userId } });

test('署名が正しくない LINE Webhook は拒否', async () => {
  line = mockLineFetch();
  const res = await worker.fetch(lineRequest([follow('U1')], 'wrong'), env(DB));
  assert.equal(res.status, 401);
  assert.equal(user('U1'), undefined);
});

test('LINE の接続確認（イベントなし）は 200', async () => {
  line = mockLineFetch();
  const res = await worker.fetch(lineRequest([]), env(DB));
  assert.equal(res.status, 200);
});

test('友だち追加：登録して、プレゼント①を応答メッセージで送る', async () => {
  line = mockLineFetch((path) => (path.startsWith('/profile/') ? { status: 200, body: { displayName: '山田' } } : null));
  const res = await worker.fetch(lineRequest([follow('U1')]), env(DB));
  assert.equal(res.status, 200);
  const u = user('U1');
  assert.equal(u.display_name, '山田');
  assert.equal(u.front_purchased, 0);
  assert.match(u.ref_code, /^[A-Z2-9]{6}$/);
  const reply = line.calls.find((c) => c.path === '/message/reply');
  assert.equal(reply.body.replyToken, 'rt-U1');
  assert.match(reply.body.messages[0].text, /プレゼント①/);
  assert.deepEqual(sent(DB, 'U1'), ['welcome']);
});

test('ブロック → 再追加：登録日はそのまま、配信対象に戻る', async () => {
  line = mockLineFetch();
  await worker.fetch(lineRequest([follow('U1')]), env(DB));
  const registeredAt = user('U1').registered_at;
  await worker.fetch(lineRequest([{ type: 'unfollow', source: { type: 'user', userId: 'U1' } }]), env(DB));
  assert.equal(user('U1').status, 'blocked');
  await worker.fetch(lineRequest([follow('U1')]), env(DB));
  assert.equal(user('U1').status, 'active');
  assert.equal(user('U1').registered_at, registeredAt);
});

test('応答メッセージに失敗しても、定期処理でプレゼント①を送り直す', async () => {
  line = mockLineFetch((path) => (path === '/message/reply' ? { status: 400, body: 'Invalid reply token' } : null));
  await worker.fetch(lineRequest([follow('U1')]), env(DB));
  assert.deepEqual(sent(DB, 'U1'), []);
  const r = await runDaily(env(DB), new LineClient('t'), new Date());
  assert.equal(r.sent, 1);
  assert.equal(line.calls.at(-1).path, '/message/push');
  assert.deepEqual(sent(DB, 'U1'), ['welcome']);
});

const checkout = (id, userId, extra = {}) => ({
  id,
  type: 'checkout.session.completed',
  data: { object: { id: `cs_${id}`, client_reference_id: userId, payment_status: 'paid', ...extra } },
});

test('Stripe 決済完了：購入フラグを立て、お礼を送り、重複受信は無視', async () => {
  line = mockLineFetch();
  insertUser(DB, { userId: 'Ubuyer1', registeredAt: new Date().toISOString() });
  const res = await worker.fetch(stripeRequest(checkout('evt_1', 'Ubuyer1')), env(DB));
  assert.equal(res.status, 200);
  assert.equal(user('Ubuyer1').front_purchased, 1);
  assert.equal(user('Ubuyer1').purchase_method, 'stripe');
  assert.deepEqual(sent(DB, 'Ubuyer1'), ['purchaseThanks']);

  const dup = await worker.fetch(stripeRequest(checkout('evt_1', 'Ubuyer1')), env(DB));
  assert.equal((await dup.json()).duplicate, true);
  assert.equal(line.calls.filter((c) => c.path === '/message/push').length, 1);
});

test('Stripe：署名不正・期限切れ・未入金は購入扱いにしない', async () => {
  line = mockLineFetch();
  insertUser(DB, { userId: 'Ubuyer2', registeredAt: new Date().toISOString() });
  assert.equal((await worker.fetch(stripeRequest(checkout('e1', 'Ubuyer2'), 'whsec_wrong'), env(DB))).status, 400);
  const old = Math.floor(Date.now() / 1000) - 3600;
  assert.equal((await worker.fetch(stripeRequest(checkout('e2', 'Ubuyer2'), 'whsec_test', old), env(DB))).status, 400);
  await worker.fetch(stripeRequest(checkout('e3', 'Ubuyer2', { payment_status: 'unpaid' })), env(DB));
  assert.equal(user('Ubuyer2').front_purchased, 0);
  // コンビニ払いなどの入金完了
  await worker.fetch(stripeRequest({ ...checkout('e4', 'Ubuyer2'), type: 'checkout.session.async_payment_succeeded' }), env(DB));
  assert.equal(user('Ubuyer2').front_purchased, 1);
});

test('管理用：申込番号で銀行振込の購入を登録（トークン必須）', async () => {
  line = mockLineFetch();
  insertUser(DB, { userId: 'Ubank01', registeredAt: new Date().toISOString(), ref: 'KX7P2Q' });
  const req = (token) => new Request('https://worker.example/admin/purchase', {
    method: 'POST', body: JSON.stringify({ refCode: 'kx7p2q' }), headers: { authorization: `Bearer ${token}` },
  });
  assert.equal((await worker.fetch(req('wrong'), env(DB))).status, 401);
  const res = await worker.fetch(req('admin-token'), env(DB));
  assert.equal(res.status, 200);
  assert.equal(user('Ubank01').front_purchased, 1);
  assert.equal(user('Ubank01').purchase_method, 'bank');

  const statsRes = await worker.fetch(new Request('https://worker.example/admin/stats', {
    headers: { authorization: 'Bearer admin-token' },
  }), env(DB));
  const s = await statsRes.json();
  assert.equal(s.users.purchased_bank, 1);
});

const daysAgo = (now, d) => new Date(now.getTime() - d * 86400000).toISOString();

test('定期処理：同じ文面はまとめて一斉送信、決済リンク入りは個別に送る', async () => {
  line = mockLineFetch();
  const now = new Date('2026-11-20T01:00:00Z');
  for (const id of ['Ua00001', 'Ua00002', 'Ua00003']) {
    insertUser(DB, { userId: id, registeredAt: daysAgo(now, 7) });
    DB.raw.prepare("INSERT INTO deliveries VALUES (?, 'welcome', ?)").run(id, daysAgo(now, 7));
  }
  for (const id of ['Ub00001', 'Ub00002']) {
    insertUser(DB, { userId: id, registeredAt: daysAgo(now, 14) });
    for (const st of ['welcome', 'present2']) DB.raw.prepare('INSERT INTO deliveries VALUES (?, ?, ?)').run(id, st, daysAgo(now, 7));
  }
  insertUser(DB, { userId: 'Uc00001', registeredAt: daysAgo(now, 7), status: 'blocked' });

  const r = await runDaily(env(DB), new LineClient('t'), now);
  assert.equal(r.sent, 5);
  const multicast = line.calls.filter((c) => c.path === '/message/multicast');
  assert.equal(multicast.length, 1);
  assert.deepEqual(multicast[0].body.to, ['Ua00001', 'Ua00002', 'Ua00003']);
  const pushes = line.calls.filter((c) => c.path === '/message/push');
  assert.equal(pushes.length, 2);
  assert.match(pushes[0].body.messages[0].text, /client_reference_id=Ub0000/);
  assert.deepEqual(sent(DB, 'Ub00001').sort(), ['frontOffer', 'present2', 'welcome']);
  assert.deepEqual(sent(DB, 'Uc00001'), []);

  // 同じ日にもう一度動いても二重に送らない
  const again = await runDaily(env(DB), new LineClient('t'), now);
  assert.equal(again.sent, 0);
});

test('定期処理：1回の上限を超えた分は次回、月の通数上限に達したら止める', async () => {
  const now = new Date('2026-11-20T01:00:00Z');
  for (let i = 0; i < 5; i++) {
    const id = `Uq0000${i}`;
    insertUser(DB, { userId: id, registeredAt: daysAgo(now, 14) });
    for (const st of ['welcome', 'present2']) DB.raw.prepare('INSERT INTO deliveries VALUES (?, ?, ?)').run(id, st, daysAgo(now, 7));
  }
  line = mockLineFetch();
  const r1 = await runDaily(env(DB, { MAX_LINE_REQUESTS_PER_RUN: '2' }), new LineClient('t'), now);
  assert.deepEqual([r1.sent, r1.remaining], [2, 3]);
  line.restore();

  line = mockLineFetch(() => ({ status: 429, body: '{"message":"You have reached your monthly limit."}' }));
  const r2 = await runDaily(env(DB), new LineClient('t'), now);
  assert.equal(r2.stoppedByQuota, true);
  assert.equal(r2.sent, 0);
  assert.equal(line.calls.length, 1); // 上限に達したら以降は呼ばない
  line.restore();

  line = mockLineFetch();
  const r3 = await runDaily(env(DB), new LineClient('t'), now);
  assert.equal(r3.sent, 3);
});
