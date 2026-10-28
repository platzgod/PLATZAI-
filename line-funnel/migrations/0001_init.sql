-- 登録ユーザー
CREATE TABLE users (
  user_id         TEXT PRIMARY KEY,           -- LINE のユーザーID
  display_name    TEXT,                       -- LINE の表示名（管理用）
  ref_code        TEXT NOT NULL UNIQUE,       -- 申込番号（銀行振込の照合用）
  registered_at   TEXT NOT NULL,              -- 登録日時（ISO 8601, UTC）
  front_purchased INTEGER NOT NULL DEFAULT 0, -- フロント商品購入の有無
  purchased_at    TEXT,                       -- 購入日時
  purchase_method TEXT,                       -- stripe / bank
  status          TEXT NOT NULL DEFAULT 'active', -- active / blocked
  updated_at      TEXT NOT NULL
);

-- 配信状況（どのユーザーにどの配信を送ったか）
CREATE TABLE deliveries (
  user_id TEXT NOT NULL,
  step    TEXT NOT NULL,   -- welcome / present2 / frontOffer / backendConsult / purchaseThanks / monthly:N
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, step)
);

-- Stripe Webhook の重複受信防止
CREATE TABLE stripe_events (
  event_id    TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
