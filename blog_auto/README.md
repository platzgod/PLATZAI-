# ブログ自動更新システム（platz2017.com）

毎月、記事を自動で作って WordPress に **下書き** として登録します。
公開はしません。塾長が WordPress で内容を確認して、公開ボタンを押してください。

| 記事 | 作る日 | 内容 |
|---|---|---|
| 塾長ブログ | 毎月1日 9:13 | 保護者向けの教育コラム。最近の教育ニュースを調べてテーマを決める |
| PLATZ STORY | 毎月15日 9:13 | `inputs/story/` にメモがあれば **教室の活動報告**、なければ **勉強のコツ** の記事 |

## しくみ

1. **過去記事を集める**（`collect.py`）: 公開中の記事を WordPress から取得して `corpus/` に保存します。
2. **調査**（`generate.py`）: Claude がネットを検索し、テーマを決めて、事実と出典をメモにまとめます。
3. **執筆**（`generate.py`）: `style/` の文体ガイドと過去記事を手本にして、調査メモの事実だけで記事を書きます。
   情報源の文章は写さず、塾長の言葉・口調に置き換えます。
4. **画像を作る**（`images.py`）: 記事に合う場面を OpenAI の画像生成 AI で作ります（文字なし・顔がはっきり写らない構図）。
5. **下書き登録**（`wordpress.py`）: 画像をメディアライブラリに入れ、アイキャッチと本文に配置して、
   カテゴリ（塾長ブログ / PLATZ STORY）を付けて下書きで登録します。
6. **履歴の保存**: 作った記事を `output/` に保存し、`output/history.json` に記録します。

WordPress の下書きには本文だけが入ります。**「確認してほしい点」と「参考にした情報源」は GitHub にだけ残ります**
（Actions の実行結果ページと `output/〇〇.md`）。公開前にこちらを見て、数字や年度を確かめてください。
**画像は AI（OpenAI）で自動で作ります。** アイキャッチ1枚と本文の画像（塾長ブログ 1〜3枚、STORY 1〜2枚）です。
作った画像はメディアライブラリに登録され、GitHub の `output/images/` にも保存されます。
活動報告で実際の写真を入れたい場所には「【ここに画像：（塾長の写真）〇〇】」と目印を残すので、撮った写真に差し替えてください
（実際の行事の写真は、AI で作り物を作らないようにしています）。

## はじめにやること（1回だけ）

### 1. WordPress でアプリケーションパスワードを発行する
1. WordPress の管理画面にログイン →「ユーザー」→「プロフィール」
2. 下の方の「アプリケーションパスワード」で、名前に `GitHub自動投稿` と入れて「新しいアプリケーションパスワードを追加」
3. 表示された `xxxx xxxx xxxx xxxx xxxx xxxx` をメモする（この画面でしか表示されません）

※ ログイン用のパスワードとは別物です。いつでもこの画面から取り消せます。
※ 「アプリケーションパスワード」の欄がない場合は、セキュリティ系プラグインで無効になっています。

### 2. Claude API キーを発行する
1. https://platform.claude.com/ にログイン →「API Keys」→「Create Key」
2. 「Billing」でクレジットを購入する（目安: 1記事あたり数十円〜100円程度）

### 3. OpenAI API キーを発行する（画像用）
1. https://platform.openai.com/ にログイン →「API keys」→「Create new secret key」
2. 「Billing」でクレジットを購入する（目安: 画像1枚あたり数円〜20円程度、1記事で2〜4枚）
3. 画像生成のモデルを使うには、OpenAI の「組織の本人確認（Verify Organization）」が必要な場合があります

### 4. GitHub に登録する
GitHub のこのリポジトリ →「Settings」→「Secrets and variables」→「Actions」→「New repository secret」で、次の4つを登録します。

| Name | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | 2 の API キー |
| `WP_USER` | WordPress のユーザー名（ログインに使う名前） |
| `WP_APP_PASSWORD` | 1 のアプリケーションパスワード |
| `OPENAI_API_KEY` | 3 の API キー（登録しないと画像なしで記事だけ作ります） |

### 5. 動作確認
「Actions」→「ブログ記事の自動作成」→「Run workflow」で
1. `kind` を **check** にして実行 → WordPress にログインできるか確認
2. `kind` を **blog**、`dry_run` に ✓ を入れて実行 → 記事ができるか確認（WordPress には登録しない）
3. `dry_run` の ✓ を外して実行 → WordPress に下書きが入ることを確認

※ 自動実行（毎月1日・15日）は、このファイルがリポジトリの既定ブランチ（main）に入ってから動きます。

## 毎月の使い方

- **書いてほしいテーマがあるとき**: `inputs/blog_topics.md` または `inputs/story_topics.md` に
  `- [ ] テーマ` と書いておくと、次の回にそのテーマで書きます。
  すぐに作りたいときは「Run workflow」の `topic` にテーマを入れて実行します。
- **教室の行事を記事にしたいとき**: `inputs/story/` にメモ（`.md`）を置きます。
  書き方は `inputs/story/_書き方の見本.md` を見てください。メモに書いたことだけが記事になります。
- **できた記事を直したいとき**: WordPress の下書きをそのまま編集してください。

## 手元のパソコンで動かす場合

```bash
pip install -r blog_auto/requirements.txt
export ANTHROPIC_API_KEY=... OPENAI_API_KEY=... WP_USER=... WP_APP_PASSWORD=...
python -m blog_auto.collect            # 過去記事を集める
python -m blog_auto.run blog --dry-run # 記事を作る（登録しない）
python -m blog_auto.run blog           # 記事を作って下書き登録
```

## ファイル

- `config.py` … サイトURL・カテゴリID・使うモデル
- `collect.py` … 過去記事の収集
- `generate.py` … 調査と執筆（Claude API）
- `images.py` … 画像の生成（OpenAI。モデル・サイズ・画質は環境変数 `OPENAI_IMAGE_MODEL` などで変更可）
- `render.py` … WordPress 用 HTML への変換（見出しは過去記事に合わせて 塾長ブログ=h5、STORY=h3）
- `wordpress.py` … WordPress REST API（`/wp-json/` がブロックされているため `?rest_route=` も使う）
- `run.py` … 実行の入口
- `style/` … 文体ガイド（過去記事から読み取った傾向。自由に書き直せます）
- `inputs/` … テーマ候補・活動報告メモ
- `output/` … 作った記事と履歴
