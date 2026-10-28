// LINE Messaging API
const API = 'https://api.line.me/v2/bot';

export class LineApiError extends Error {
  constructor(status, body) {
    super(`LINE API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
  // 月の送信上限に達した（無料プランの200通など）
  get isQuotaExceeded() {
    return this.status === 429 && /monthly limit/i.test(this.body);
  }
}

export class LineClient {
  // Workers では fetch をメソッドとして呼ぶとエラーになるため、関数で包む
  constructor(accessToken, fetchImpl = (...args) => fetch(...args)) {
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
  }

  async call(path, init = {}) {
    const res = await this.fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new LineApiError(res.status, text);
    return text ? JSON.parse(text) : {};
  }

  // 応答メッセージ（友だち追加などへの返信。通数に数えられない）
  reply(replyToken, messages) {
    return this.call('/message/reply', { method: 'POST', body: JSON.stringify({ replyToken, messages }) });
  }

  push(to, messages) {
    return this.call('/message/push', { method: 'POST', body: JSON.stringify({ to, messages }) });
  }

  // 同じ内容を最大500人へ1回のリクエストで送る（通数は人数分）
  multicast(to, messages) {
    return this.call('/message/multicast', { method: 'POST', body: JSON.stringify({ to, messages }) });
  }

  getProfile(userId) {
    return this.call(`/profile/${encodeURIComponent(userId)}`);
  }
}
