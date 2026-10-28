// D1（SQLite）へのデータ保存
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 読み間違えやすい I/O/0/1 を除く

function newRefCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

export function getUser(db, userId) {
  return db.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
}

export function getUserByRefCode(db, refCode) {
  return db.prepare('SELECT * FROM users WHERE ref_code = ?').bind(refCode.trim().toUpperCase()).first();
}

// 友だち追加：新規なら登録、再追加（ブロック解除）なら有効に戻す。登録日は最初の日のまま。
export async function upsertFollower(db, userId, displayName, now) {
  const iso = now.toISOString();
  const existing = await getUser(db, userId);
  if (existing) {
    await db
      .prepare('UPDATE users SET status = ?, display_name = COALESCE(?, display_name), updated_at = ? WHERE user_id = ?')
      .bind('active', displayName, iso, userId)
      .run();
    return { user: await getUser(db, userId), isNew: false };
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await db
        .prepare(
          `INSERT INTO users (user_id, display_name, ref_code, registered_at, status, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?)`,
        )
        .bind(userId, displayName, newRefCode(), iso, iso)
        .run();
      break;
    } catch (err) {
      // 申込番号の重複（まれ）なら作り直す。同じユーザーの同時登録なら既存を使う。
      if (await getUser(db, userId)) break;
      if (attempt >= 4) throw err;
    }
  }
  return { user: await getUser(db, userId), isNew: true };
}

export function markBlocked(db, userId, now) {
  return db
    .prepare("UPDATE users SET status = 'blocked', updated_at = ? WHERE user_id = ?")
    .bind(now.toISOString(), userId)
    .run();
}

// 購入フラグを立てる。すでに購入済みなら false を返す。
export async function markPurchased(db, userId, method, now) {
  const iso = now.toISOString();
  const result = await db
    .prepare(
      `UPDATE users SET front_purchased = 1, purchased_at = ?, purchase_method = ?, updated_at = ?
       WHERE user_id = ? AND front_purchased = 0`,
    )
    .bind(iso, method, iso, userId)
    .run();
  return result.meta.changes > 0;
}

// 何人分でも1クエリで記録する（D1 無料プランは1回の実行で50クエリまでのため）
export function recordDeliveries(db, userIds, step, now) {
  return db
    .prepare('INSERT OR IGNORE INTO deliveries (user_id, step, sent_at) SELECT value, ?, ? FROM json_each(?)')
    .bind(step, now.toISOString(), JSON.stringify(userIds))
    .run();
}

export async function getSentSteps(db, userId) {
  const { results } = await db.prepare('SELECT step FROM deliveries WHERE user_id = ?').bind(userId).all();
  return new Set(results.map((r) => r.step));
}

// 定期処理の対象：有効なユーザー全員と、それぞれの配信済みステップ
export async function loadActiveUsersWithSteps(db) {
  const [{ results: users }, { results: rows }] = await db.batch([
    db.prepare("SELECT * FROM users WHERE status = 'active' ORDER BY registered_at"),
    db.prepare(
      "SELECT d.user_id, d.step FROM deliveries d JOIN users u ON u.user_id = d.user_id WHERE u.status = 'active'",
    ),
  ]);
  const steps = new Map(users.map((u) => [u.user_id, new Set()]));
  for (const r of rows) steps.get(r.user_id)?.add(r.step);
  return users.map((u) => ({ user: u, sentSteps: steps.get(u.user_id) }));
}

// Stripe イベントを初めて受け取ったときだけ true
export async function claimStripeEvent(db, eventId, now) {
  const result = await db
    .prepare('INSERT OR IGNORE INTO stripe_events (event_id, received_at) VALUES (?, ?)')
    .bind(eventId, now.toISOString())
    .run();
  return result.meta.changes > 0;
}

export function releaseStripeEvent(db, eventId) {
  return db.prepare('DELETE FROM stripe_events WHERE event_id = ?').bind(eventId).run();
}

export async function stats(db) {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'active') AS active,
         SUM(status = 'blocked') AS blocked,
         SUM(front_purchased) AS purchased,
         SUM(front_purchased AND purchase_method = 'stripe') AS purchased_stripe,
         SUM(front_purchased AND purchase_method = 'bank') AS purchased_bank
       FROM users`,
    )
    .first();
  const { results } = await db
    .prepare('SELECT step, COUNT(*) AS count FROM deliveries GROUP BY step ORDER BY step')
    .all();
  return { users: row, deliveries: Object.fromEntries(results.map((r) => [r.step, r.count])) };
}
