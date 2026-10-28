# 初回の準備手順

人の手作業が必要な準備を、上から順に1つずつ進めるための手順書です。
各ステップの「開くページ」をブラウザで開き、終わったらチェックを入れて次へ進んでください。
（画面の文言は変わることがあります。見当たらない場合は近い名前のメニューを探してください。）

作業はご自身のパソコンのターミナル（Mac は「ターミナル」、Windows は「PowerShell」）で行います。
コマンドは `line-funnel` フォルダの中で実行します。

途中で控えるもの（**他人に見せない・コードに書かない**）：

| 名前 | どこで手に入るか | 登録先 |
|---|---|---|
| チャネルシークレット | ステップ3 | `LINE_CHANNEL_SECRET` |
| チャネルアクセストークン（長期） | ステップ3 | `LINE_CHANNEL_ACCESS_TOKEN` |
| Stripe の署名シークレット（`whsec_` で始まる） | ステップ7 | `STRIPE_WEBHOOK_SECRET` |
| 管理用トークン（自分で作る長いランダム文字列） | ステップ4 | `ADMIN_TOKEN` |

---

## ステップ0：パソコンの準備

- [ ] Node.js（LTS 版）をインストールする
  開くページ：https://nodejs.org/ja/download
- [ ] ターミナルで次を実行し、バージョンが表示されることを確認する

```bash
node -v
```

- [ ] `line-funnel` フォルダで次を実行する

```bash
npm install
```

## ステップ1：Cloudflare に登録してログインする

- [ ] Cloudflare のアカウントを作る（無料プランでよい）
  開くページ：https://dash.cloudflare.com/sign-up
- [ ] ターミナルからログインする（ブラウザが開くので「Allow」を押す）

```bash
npx wrangler login
```

## ステップ2：データベース（D1）を作る

- [ ] 次を実行する

```bash
npx wrangler d1 create line-funnel
```

- [ ] 表示された `database_id = "...."` の値を、`wrangler.toml` の `REPLACE_WITH_YOUR_DATABASE_ID` と置き換える
- [ ] テーブルを作る

```bash
npm run db:init:remote
```

## ステップ3：LINE 公式アカウントと Messaging API の準備

1. [ ] LINE 公式アカウントを作る（作成済みなら飛ばす）
   開くページ：https://entry.line.biz/start/jp/
2. [ ] LINE Official Account Manager で、作ったアカウントを開き、
   右上の「設定」→ 左メニュー「Messaging API」→「Messaging APIを利用する」を押す。
   プロバイダー（会社名・屋号など）を選ぶか新しく作る
   開くページ：https://manager.line.biz/
3. [ ] LINE Developers コンソールを開き、プロバイダー → 作られたチャネル（Messaging API）を開く
   開くページ：https://developers.line.biz/console/
4. [ ] 「チャネル基本設定」タブの **チャネルシークレット** を控える
5. [ ] 「Messaging API設定」タブの一番下、**チャネルアクセストークン（長期）** の「発行」を押して控える
6. [ ] LINE Official Account Manager の「設定」→「応答設定」で次のようにする
   - **Webhook：オン**
   - **あいさつメッセージ：オフ**（オンのままだと、このシステムのプレゼント①と二重に届きます）
   - 応答メッセージ：お好みで（来場者からの質問に自動返信したい場合はオン）

## ステップ4：秘密情報を Cloudflare に登録する

1つずつ実行し、聞かれたら値を貼り付けて Enter を押します（画面には表示されません）。

- [ ] チャネルシークレット

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
```

- [ ] チャネルアクセストークン（長期）

```bash
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

- [ ] 管理用トークン。まず次で長いランダム文字列を作り、控えてから登録する

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

```bash
npx wrangler secret put ADMIN_TOKEN
```

（Stripe の署名シークレットはステップ7で登録します）

## ステップ5：公開（デプロイ）して LINE の Webhook URL を設定する

- [ ] 次を実行する

```bash
npx wrangler deploy
```

- [ ] 表示された URL（`https://line-funnel.<あなたのサブドメイン>.workers.dev`）を控える
- [ ] LINE Developers コンソールの「Messaging API設定」タブで
  - **Webhook URL** に `https://line-funnel.<あなたのサブドメイン>.workers.dev/line/webhook` を入れて「更新」
  - 「検証」を押して「成功」と出ることを確認
  - **Webhookの利用** をオンにする
- [ ] 自分のスマホで公式アカウントを友だち追加し、プレゼント①のメッセージが届くことを確認する
  （友だち追加用の QR コードは「Messaging API設定」タブにあります。会場用の QR コードもこれを使います）

## ステップ6：Stripe に登録して、フロント商品の決済リンクを作る

最初は **テストモード** で作り、動作を確認してから本番モードで作り直すのがおすすめです。

- [ ] Stripe のアカウントを作る
  開くページ：https://dashboard.stripe.com/register
- [ ] 本番で使う前に、ビジネス情報・本人確認・入金先口座の登録を済ませる（Stripe の案内に従う）
- [ ] 決済リンクを作る：「Payment Links」→「新規作成」→ 商品を追加（商品名・価格）→ 作成
  開くページ：https://dashboard.stripe.com/payment-links
- [ ] できたリンク（`https://buy.stripe.com/...`）を `src/scenario-config.js` の `frontPaymentLinkUrl` に貼る
- [ ] （任意）同じ画面で表示される決済リンクの ID（`plink_` で始まる）を `stripePaymentLinkId` に貼ると、
  ほかの商品の決済を誤ってフロント購入扱いしなくなります
- [ ] 商品名・価格の表記・銀行振込の案内も `src/scenario-config.js` で直す

> Stripe の審査が通らない・使わない場合は、`frontPaymentLinkUrl` を空文字（`''`）にし、
> フロント案内の文面から「お申込み（カード決済）はこちら」と `{{paymentUrl}}` の行を消して、銀行振込の案内だけにしてください。

## ステップ7：Stripe の Webhook を設定する

- [ ] 「開発者」→「Webhook」→「エンドポイントを追加」（「送信先を追加」と表示される場合もあります）
  開くページ：https://dashboard.stripe.com/webhooks
  - エンドポイント URL：`https://line-funnel.<あなたのサブドメイン>.workers.dev/stripe/webhook`
  - 受け取るイベント：`checkout.session.completed` と `checkout.session.async_payment_succeeded`
- [ ] 作成後に表示される **署名シークレット**（`whsec_` で始まる）を控えて登録する

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

- [ ] 設定ファイルの変更を反映する

```bash
npx wrangler deploy
```

## ステップ8：通しで動作確認する

- [ ] 定期処理をすぐに動かす（登録したばかりだと送るものがないので `"sent": 0` になるのが正常です）

```bash
curl -X POST https://line-funnel.<あなたのサブドメイン>.workers.dev/admin/run-daily -H "Authorization: Bearer <ADMIN_TOKEN>"
```

- [ ] フロント案内のメッセージを確認したい場合は、`src/scenario-config.js` の `frontOfferDay` を一時的に `0` にしてデプロイし、
  上の `run-daily` を実行する（確認が終わったら `14` に戻してデプロイし直す）
- [ ] 届いた決済リンクを開き、テストモードならカード番号 `4242 4242 4242 4242`（有効期限は未来の日付、CVC は任意の3桁）で支払う
- [ ] 購入お礼のメッセージが届き、次のコマンドで `purchased` が 1 になっていることを確認する

```bash
curl https://line-funnel.<あなたのサブドメイン>.workers.dev/admin/stats -H "Authorization: Bearer <ADMIN_TOKEN>"
```

- [ ] テストモードで確認できたら、Stripe を本番モードに切り替えてステップ6・7をやり直す
  （決済リンク・Webhook・署名シークレットは本番用に別のものが発行されます）

## 運用中によく使う操作

- 配信文やプレゼントの URL を変える：`src/scenario-config.js` を直して `npx wrangler deploy`
- 銀行振込の入金を登録する：README の「購入の検知」を参照
- 動作ログを見る：Cloudflare ダッシュボード → Workers & Pages → line-funnel →「ログ」、またはターミナルで次を実行

```bash
npx wrangler tail
```
