// テスト用：node:sqlite で D1 の API を再現し、LINE API への通信を記録する
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
}

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    batch: async (stmts) => Promise.all(stmts.map((s) => s.all())),
  };
}

// LINE API の偽物。respond(path, body) で応答を変えられる
export function mockLineFetch(respond = () => ({ status: 200, body: {} })) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace('/v2/bot', '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, body });
    const r = respond(path, body) ?? { status: 200, body: {} };
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export const env = (DB, extra = {}) => ({
  DB,
  LINE_CHANNEL_SECRET: 'line-secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  ADMIN_TOKEN: 'admin-token',
  MAX_LINE_REQUESTS_PER_RUN: '40',
  ...extra,
});

export function lineRequest(events, secret = 'line-secret') {
  const body = JSON.stringify({ destination: 'Uxxx', events });
  const sig = createHmac('sha256', secret).update(body).digest('base64');
  return new Request('https://worker.example/line/webhook', {
    method: 'POST', body, headers: { 'x-line-signature': sig },
  });
}

export function stripeRequest(event, secret = 'whsec_test', t = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(event);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return new Request('https://worker.example/stripe/webhook', {
    method: 'POST', body, headers: { 'stripe-signature': `t=${t},v1=${v1}` },
  });
}

export function insertUser(DB, { userId, registeredAt, purchased = 0, status = 'active', ref = null }) {
  DB.raw.prepare(
    `INSERT INTO users (user_id, ref_code, registered_at, front_purchased, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, ref ?? userId.slice(-6).toUpperCase(), registeredAt, purchased, status, registeredAt);
}

export function sent(DB, userId) {
  return DB.raw.prepare('SELECT step FROM deliveries WHERE user_id = ? ORDER BY sent_at, step').all(userId).map((r) => r.step);
}
