// 経過日数とユーザーの状態から、今日送るべき配信を決める（副作用なし）。
import { links, frontProduct, schedule, scenario } from './scenario-config.js';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 日本時間の日付で数えた経過日数（登録日 = 0）
export function daysSince(registeredAtIso, now) {
  const jstDay = (ms) => Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
  return jstDay(now.getTime()) - jstDay(Date.parse(registeredAtIso));
}

// 1人あたり1日1通まで。複数の配信が同時に期限を迎えたら、早いものから順に1つずつ送る。
// user: { registered_at, front_purchased }, sentSteps: Set<string>
export function nextStep(user, sentSteps, now) {
  const day = daysSince(user.registered_at, now);
  const purchased = Boolean(user.front_purchased);

  if (!sentSteps.has('welcome')) return 'welcome'; // 応答メッセージで送れなかった場合の予備
  if (day >= schedule.present2Day && !sentSteps.has('present2')) return 'present2';

  if (purchased) {
    if (day >= schedule.backendConsultDay && !sentSteps.has('backendConsult')) return 'backendConsult';
    return null;
  }

  if (day >= schedule.frontOfferDay && !sentSteps.has('frontOffer')) return 'frontOffer';

  // お役立ち情報：フロント案内の日から monthlyIntervalDays ごとに1回。
  // 取りこぼした回はさかのぼって送らず、その時点の回だけを送る。
  if (sentSteps.has('frontOffer') && scenario.monthly.length > 0) {
    const n = Math.floor((day - schedule.frontOfferDay) / schedule.monthlyIntervalDays);
    if (n >= 1 && !sentSteps.has(`monthly:${n}`)) return `monthly:${n}`;
  }
  return null;
}

export function paymentUrl(userId) {
  if (!links.frontPaymentLinkUrl) return ''; // 銀行振込のみで運用する場合
  const url = new URL(links.frontPaymentLinkUrl);
  url.searchParams.set('client_reference_id', userId);
  return url.toString();
}

function fill(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vars ? vars[key] : m));
}

function stepConfig(step) {
  if (step.startsWith('monthly:')) {
    const n = Number(step.slice('monthly:'.length));
    return scenario.monthly[(n - 1) % scenario.monthly.length];
  }
  const config = scenario[step];
  if (!config) throw new Error(`unknown step: ${step}`);
  return config;
}

// 配信の LINE メッセージ（差し込み済み）を返す
export function renderStep(step, user) {
  const vars = {
    ...links,
    refCode: user.ref_code,
    name: user.display_name || '',
    frontName: frontProduct.name,
    frontPrice: frontProduct.priceText,
    paymentUrl: paymentUrl(user.user_id),
  };
  vars.bankTransferText = fill(frontProduct.bankTransferText, vars);

  // text 以外のメッセージ（ボタンなど）の中の文字列もまとめて差し込む
  const walk = (value) => {
    if (typeof value === 'string') return fill(value, vars).trim();
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(stepConfig(step).messages);
}

export function purchaseThanksEnabled() {
  return scenario.purchaseThanks?.enabled !== false;
}

export function allowedPaymentLinkId() {
  return frontProduct.stripePaymentLinkId || '';
}
