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
4. **下書き登録**（`wordpress.py`）: カテゴリ（塾長ブログ / PLATZ STORY）を付けて、下書きで登録します。
5. **履歴の保存**: 作った記事を `output/` に保存し、`output/history.json` に記録します。

下書きの末尾には、赤い点線の枠で **「確認してほしい点」と「参考にした情報源」** が付きます。
**公開する前に、この枠ごと削除してください。**
写真を入れる位置には「【ここに画像：〇〇】」と書いてあるので、写真に差し替えてください。

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

### 3. GitHub に登録する
GitHub のこのリポジトリ →「Settings」→「Secrets and variables」→「Actions」→「New repository secret」で、次の3つを登録します。

| Name | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | 2 の API キー |
| `WP_USER` | WordPress のユーザー名（ログインに使う名前） |
| `WP_APP_PASSWORD` | 1 のアプリケーションパスワード |

### 4. 動作確認
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
export ANTHROPIC_API_KEY=... WP_USER=... WP_APP_PASSWORD=...
python -m blog_auto.collect            # 過去記事を集める
python -m blog_auto.run blog --dry-run # 記事を作る（登録しない）
python -m blog_auto.run blog           # 記事を作って下書き登録
```

## ファイル

- `config.py` … サイトURL・カテゴリID・使うモデル
- `collect.py` … 過去記事の収集
- `generate.py` … 調査と執筆（Claude API）
- `render.py` … WordPress 用 HTML への変換（見出しは過去記事に合わせて 塾長ブログ=h5、STORY=h3）
- `wordpress.py` … WordPress REST API（`/wp-json/` がブロックされているため `?rest_route=` も使う）
- `run.py` … 実行の入口
- `style/` … 文体ガイド（過去記事から読み取った傾向。自由に書き直せます）
- `inputs/` … テーマ候補・活動報告メモ
- `output/` … 作った記事と履歴
