// 定期処理：経過日数に応じた配信
import { loadActiveUsersWithSteps, recordDeliveries } from './db.js';
import { nextStep, renderStep } from './scenario.js';

const MULTICAST_MAX = 500;

// 戻り値: { sent: 送った人数, remaining: 上限のため次回に回した人数, stoppedByQuota, errors }
export async function runDaily(env, line, now = new Date()) {
  const maxRequests = Number(env.MAX_LINE_REQUESTS_PER_RUN || 40);
  const targets = await loadActiveUsersWithSteps(env.DB);

  // 同じ配信・同じ文面（決済リンクなど個別の差し込みがない）の人をまとめて一斉送信する
  const groups = new Map();
  for (const { user, sentSteps } of targets) {
    const step = nextStep(user, sentSteps, now);
    if (!step) continue;
    const messages = renderStep(step, user);
    const key = `${step}\n${JSON.stringify(messages)}`;
    if (!groups.has(key)) groups.set(key, { step, messages, userIds: [] });
    groups.get(key).userIds.push(user.user_id);
  }

  const batches = [];
  for (const g of groups.values()) {
    for (let i = 0; i < g.userIds.length; i += MULTICAST_MAX) {
      batches.push({ step: g.step, messages: g.messages, userIds: g.userIds.slice(i, i + MULTICAST_MAX) });
    }
  }

  const result = { sent: 0, remaining: 0, stoppedByQuota: false, errors: [] };
  let requests = 0;
  for (const batch of batches) {
    if (requests >= maxRequests || result.stoppedByQuota) {
      result.remaining += batch.userIds.length;
      continue;
    }
    requests++;
    try {
      if (batch.userIds.length === 1) await line.push(batch.userIds[0], batch.messages);
      else await line.multicast(batch.userIds, batch.messages);
      await recordDeliveries(env.DB, batch.userIds, batch.step, now);
      result.sent += batch.userIds.length;
    } catch (err) {
      if (err.isQuotaExceeded) {
        result.stoppedByQuota = true;
        result.remaining += batch.userIds.length;
      } else {
        // 記録しないので、次回の実行で再送を試みる
        result.errors.push({ step: batch.step, users: batch.userIds.length, error: String(err.message || err) });
      }
    }
  }
  return result;
}
