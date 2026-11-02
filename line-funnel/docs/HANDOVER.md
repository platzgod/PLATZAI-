# 引き継ぎ資料（本体PCで続きを行うために）

最終更新：2026年11月2日

この資料は、LINE 自動配信システムの準備を、作業用の Mac から**本体PC**に移して続けるためのものです。
上から順に読めば、続きから作業できるようにしてあります。

---

## 1. いまの状況（ひとことで）

**LINE とシステムはつながり、動いています。**残っているのは、動作確認・配信文の差し替え・Stripe（カード決済）の準備です。

システム本体は Cloudflare のサーバーで24時間動いています。**Mac の電源を切っても、本体PCに移っても、配信は止まりません。**
パソコンを使うのは、設定を変えて反映するときだけです。

---

## 2. 終わったこと

| | 内容 | 状態 |
|---|---|---|
| ✅ | Cloudflare のアカウント作成・ログイン | 完了 |
| ✅ | データベース（D1）の作成と表の作成 | 完了 |
| ✅ | LINE 公式アカウントの作成・Messaging API の有効化 | 完了 |
| ✅ | 秘密情報の登録（チャネルシークレット・アクセストークン・管理用トークン） | 完了 |
| ✅ | システムの公開（`npx wrangler deploy`） | 完了 |
| ✅ | 公開先の住所（workers.dev のサブドメイン）の作成 | 完了 |
| ✅ | LINE の Webhook URL の設定と「検証」 | **成功** |

## 3. 控えておく情報（秘密ではありません）

| 項目 | 値 |
|---|---|
| システムの URL | https://line-funnel.platz-sogosuisen-support.workers.dev |
| LINE の Webhook URL | https://line-funnel.platz-sogosuisen-support.workers.dev/line/webhook |
| Stripe の Webhook URL（これから使う） | https://line-funnel.platz-sogosuisen-support.workers.dev/stripe/webhook |
| Cloudflare のサブドメイン | `platz-sogosuisen-support` |
| Worker（システム）の名前 | `line-funnel` |
| データベースの名前 | `line-funnel`（ID は `wrangler.toml` に記入済み） |
| 定期配信の時刻 | 毎日 日本時間 10:00〜11:50 に10分おき |
| 決済の方針 | Stripe（カード）＋ 銀行振込 |
| 初期設定 | 購入直後のお礼を送る／1人1日1通まで／送れなかった月のお役立ち情報はさかのぼらない |

### 登録済みの秘密情報（値は Cloudflare の中だけにあり、どこにも書いていません）

| 名前 | 中身 | 状態 |
|---|---|---|
| `LINE_CHANNEL_SECRET` | LINE のチャネルシークレット | 登録済み・検証成功 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE のチャネルアクセストークン（長期） | 登録済み（再発行したもの） |
| `ADMIN_TOKEN` | 管理用トークン（**Mac のメモアプリに保存**） | 登録済み |
| `STRIPE_WEBHOOK_SECRET` | Stripe の署名シークレット | **未登録**（Stripe の準備のときに登録） |

---

## 4. 残っていること（この順に進めます）

### A. 本体PCの準備 → 「5. 本体PCの準備手順」
### B. 動作確認
- [ ] スマホで公式アカウントを友だち追加し、「ご登録ありがとうございます！」（登録プレゼント①）が届くか確かめる
  （QRコードは LINE Developers の「Messaging API設定」タブにあります。すでに友だちなら、ブロック → ブロック解除）
- [ ] 管理用の確認コマンドで、登録者数が `"total": 1` になっているか確かめる（「7. よく使うコマンド」）
- [ ] LINE Official Account Manager の「設定」→「応答設定」で、**Webhook：オン／あいさつメッセージ：オフ** になっているか確かめる

### C. 後片付け
- [ ] 作業中に間違ってできた、`LINE_CHANNEL_SECRET` の後ろに文字が続く**長い名前の秘密情報**を削除する（使われていないので急ぎではありません。次回 Claude に「長い名前の秘密情報を消したい」と伝えれば案内します）
- [ ] チャネルシークレットが一度チャットに出てしまったため、**LINE Developers の「チャネル基本設定」でチャネルシークレットを「発行」し直したか**確かめる。まだなら、発行し直してから登録し直す（「6. 秘密情報の登録のしかた」）
- [ ] 管理用トークンを Mac のメモアプリから本体PCへ移す。移すのが面倒なら、本体PCで作り直して登録し直してもよい（「6.」）

### D. 配信文・リンクの差し替え（中身が決まりしだい）
`line-funnel/src/scenario-config.js` を編集し、`npx wrangler deploy` で反映します。

- [ ] 登録プレゼント①②の内容と URL（`present1Url` / `present2Url`）
- [ ] フロント商品の名前・価格（`frontProduct.name` / `priceText`）
- [ ] 銀行振込の振込先（`bankTransferText`）
- [ ] 個別相談の予約ページ URL（`consultUrl`）
- [ ] お役立ち情報の本文（`monthly`）

### E. Stripe（カード決済）の準備 → `docs/SETUP.md` のステップ6〜8
- [ ] Stripe のアカウント作成（最初は**テストモード**で）
- [ ] フロント商品の Payment Link（決済リンク）を作り、`scenario-config.js` の `frontPaymentLinkUrl` に貼る
- [ ] Stripe の Webhook を作る（URL は上の表、イベントは `checkout.session.completed` と `checkout.session.async_payment_succeeded`）
- [ ] 署名シークレット（`whsec_` で始まる）を `STRIPE_WEBHOOK_SECRET` として登録（「6.」）
- [ ] `npx wrangler deploy` で反映し、テスト用カード `4242 4242 4242 4242` で購入テスト
- [ ] 問題なければ本番モードに切り替えて、決済リンク・Webhook・署名シークレットを作り直す

### F. 運用開始前
- [ ] LINE の料金プランの確認（無料プランは月200通まで。月の新規登録が60〜70人を超えるなら有料プランを検討）
- [ ] 会場で掲示する友だち追加用 QR コードの用意（LINE Official Account Manager の「友だちを増やす」から作れます）

---

## 5. 本体PCの準備手順

### 5-1. Node.js を入れる
**https://nodejs.org/ja/download** から LTS 版のインストーラーを入れます（Windows は `.msi`、Mac は `.pkg`）。

### 5-2. システムのファイルを用意する
1. GitHub にログインしたブラウザで次を開き、ZIP をダウンロードします
   **https://github.com/platzgod/PLATZAI-/archive/refs/heads/claude/nice-bell-y7h8mb.zip**
   （データベースの ID なども記入済みの、最新の状態です）
2. ZIP を展開し、中にある **`line-funnel` フォルダ**を **「ドキュメント」フォルダ**に移します
3. ターミナルを開いて、作業フォルダに入ります

| | ターミナルの開き方 | 作業フォルダに入るコマンド |
|---|---|---|
| Windows | スタート → `powershell` と入力 →「Windows PowerShell」 | `cd ([Environment]::GetFolderPath('MyDocuments') + '\line-funnel')` |
| Mac | `command` + `スペース` →「ターミナル」 | `cd ~/Documents/line-funnel` |

4. 部品を入れます（Windows は `npm.cmd`、Mac は `npm`）

```bash
npm.cmd install
```

### 5-3. Cloudflare にログインする
1. **先にブラウザで https://dash.cloudflare.com/ にログイン**しておきます（**Mac で使ったのと同じアカウント**）
2. ターミナルで次を実行し、開いたページで**すぐに「Allow」**を押します（時間がたつと失敗します）

```bash
npx.cmd wrangler login
```

3. 確認します。Mac と同じメールアドレスが出れば OK です

```bash
npx.cmd wrangler whoami
```

> Mac の場合は、`npm.cmd` → `npm`、`npx.cmd` → `npx` と読み替えてください。
> Windows で `npx` のまま実行して「スクリプトの実行が無効」と出た場合も、`npx.cmd` を使えば動きます。

---

## 6. 秘密情報の登録のしかた（間違いが起きない方法）

これまで、コピーの順番が入れ替わって別の文字が登録されることが何度かありました。
次のコマンドは、**実行すると一度止まり → その間にブラウザで値をコピー → ターミナルに戻って Enter だけ押す**、という流れです。
**コピーした中身が正しい形かを自動で確かめてから**登録するので、間違ったものは登録されません。

**ターミナルにもチャットにも、秘密の値を貼り付けないでください。**

### Windows（PowerShell）

チャネルシークレット：
```bash
Read-Host "LINEのチャネルシークレットをコピーしてから Enter を押してください"; $s = (Get-Clipboard | Out-String).Trim(); if ($s -match '^[0-9a-f]{32}$') { $s | npx.cmd wrangler secret put LINE_CHANNEL_SECRET } else { Write-Host "[注意] チャネルシークレットではありません（$($s.Length)文字）。やり直してください" }
```

アクセストークン：
```bash
Read-Host "LINEのチャネルアクセストークンをコピーしてから Enter を押してください"; $s = (Get-Clipboard | Out-String).Trim(); if ($s -match '^[A-Za-z0-9+/=]{100,}$') { $s | npx.cmd wrangler secret put LINE_CHANNEL_ACCESS_TOKEN } else { Write-Host "[注意] アクセストークンではありません（$($s.Length)文字）。やり直してください" }
```

Stripe の署名シークレット：
```bash
Read-Host "Stripeの署名シークレット（whsec_…）をコピーしてから Enter を押してください"; $s = (Get-Clipboard | Out-String).Trim(); if ($s -match '^whsec_[A-Za-z0-9]+$') { $s | npx.cmd wrangler secret put STRIPE_WEBHOOK_SECRET } else { Write-Host "[注意] 署名シークレットではありません（$($s.Length)文字）。やり直してください" }
```

管理用トークンを作り直す（作ったトークンは自動でコピーされるので、**まずメモ帳などに貼って保存**してから、2行目を実行）：
```bash
node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))" | Set-Clipboard
```
```bash
(Get-Clipboard | Out-String).Trim() | npx.cmd wrangler secret put ADMIN_TOKEN
```

### Mac（ターミナル）

チャネルシークレット：
```bash
read "?LINEのチャネルシークレットをコピーしてから Enter を押してください: " && S=$(pbpaste) && if [[ "$S" =~ ^[0-9a-f]{32}$ ]]; then printf %s "$S" | npx wrangler secret put LINE_CHANNEL_SECRET; else echo "[注意] チャネルシークレットではありません（${#S}文字）。やり直してください"; fi
```

アクセストークン：
```bash
read "?LINEのチャネルアクセストークンをコピーしてから Enter を押してください: " && S=$(pbpaste) && if [[ "$S" =~ ^[A-Za-z0-9+/=]{100,}$ ]]; then printf %s "$S" | npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN; else echo "[注意] アクセストークンではありません（${#S}文字）。やり直してください"; fi
```

Stripe の署名シークレット：
```bash
read "?Stripeの署名シークレット（whsec_…）をコピーしてから Enter を押してください: " && S=$(pbpaste) && if [[ "$S" =~ ^whsec_[A-Za-z0-9]+$ ]]; then printf %s "$S" | npx wrangler secret put STRIPE_WEBHOOK_SECRET; else echo "[注意] 署名シークレットではありません（${#S}文字）。やり直してください"; fi
```

---

## 7. よく使うコマンド（作業フォルダに入ってから実行）

| やりたいこと | Windows（PowerShell） | Mac |
|---|---|---|
| 設定の変更を反映する | `npx.cmd wrangler deploy` | `npx wrangler deploy` |
| 登録済みの秘密情報の名前を見る | `npx.cmd wrangler secret list` | `npx wrangler secret list` |
| 動作の記録をリアルタイムで見る（終わるときは `Ctrl` + `C`） | `npx.cmd wrangler tail` | `npx wrangler tail` |

登録者数・購入者数・配信数を見る（止まったら管理用トークンをコピーして Enter）：

Windows：
```bash
Read-Host "管理用トークンをコピーしてから Enter を押してください"; $t = (Get-Clipboard | Out-String).Trim(); Invoke-RestMethod -Uri https://line-funnel.platz-sogosuisen-support.workers.dev/admin/stats -Headers @{ Authorization = "Bearer $t" } | ConvertTo-Json -Depth 5
```

Mac：
```bash
read "?管理用トークンをコピーしてから Enter を押してください: " && curl -s https://line-funnel.platz-sogosuisen-support.workers.dev/admin/stats -H "Authorization: Bearer $(pbpaste)"
```

---

## 8. 作業中に分かった注意点

- **ターミナルを開いたら、最初に作業フォルダに入る。**入らずに実行すると「Required Worker name missing」などのエラーになります。
- **`wrangler tail` を動かしたままだと、ほかのコマンドが効きません。**ウィンドウ上部に `wrangler tail` と出ていたら、`Ctrl` + `C`（Mac は `control` + `C`）で止めます。
- **秘密の値（トークン・シークレット）は、チャットにもターミナルの `%` や `>` の後ろにも貼らない。**チャットに出てしまったら、LINE や Stripe の画面で発行し直します。
- **確認の質問は、`y` を押してから Enter。**Enter だけだと「いいえ」になる質問があります（住所の作成がこれで一度止まりました）。
- **workers.dev の住所には小文字・数字・ハイフンだけ**が使えます。
- **設定の変更と反映は、本体PCに一本化する。**Mac と本体PCの両方から `deploy` すると、古い設定で上書きしてしまうことがあります。本体PCに移ったら、Mac からは反映しないでください。
- 住所を作った直後は、ブラウザで `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` が出ることがあります。数分〜30分待てば直ります。

---

## 9. 次回 Claude に伝えること（そのまま貼り付けて使えます）

> LINE 自動配信システム（line-funnel）の続きです。`line-funnel/docs/HANDOVER.md` の「4. 残っていること」から再開したいです。本体PCは（Windows／Mac）です。

### 技術メモ（Claude 向け）
- リポジトリ `platzgod/PLATZAI-`、ブランチ `claude/nice-bell-y7h8mb`、フォルダ `line-funnel/`
- Cloudflare Workers + D1。Worker 名 `line-funnel`、URL `https://line-funnel.platz-sogosuisen-support.workers.dev`、D1 `line-funnel`（ID は `wrangler.toml`、マイグレーション `0001_init.sql` 適用済み）、cron `*/10 1-2 * * *`
- 登録済み secret：`LINE_CHANNEL_SECRET`（LINE の Webhook 検証成功）、`LINE_CHANNEL_ACCESS_TOKEN`（再発行したもの）、`ADMIN_TOKEN`。`STRIPE_WEBHOOK_SECRET` は未登録
- 誤って作られた secret が1つある（名前が `LINE_CHANNEL_SECRET` に32桁の16進数が続くもの）。未使用なので削除するだけでよい。名前に含まれる値はチャットに出たので、チャネルシークレットの再発行が済んだかをユーザーに確認すること
- 未確認：友だち追加でプレゼント①が届くか、`/admin/stats` の値
- ユーザーはターミナル操作に不慣れ。秘密情報は「6.」のクリップボード検証付きコマンドで登録してもらうこと（直接貼り付けで誤登録・チャットへの露出が複数回起きた）。1回の返答で頼む作業は少なめにし、結果は該当行だけ送ってもらう
