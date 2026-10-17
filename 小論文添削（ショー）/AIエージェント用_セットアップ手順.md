# AIエージェント用 セットアップ手順

このファイルは、利用者の PC で動く AI エージェント（Claude Code / Claude デスクトップアプリなど）が、
「小論文添削（ショー）」を使える状態にするための手順です。上から順に実行し、最後に結果を利用者へ報告してください。

## 1. zip を展開して保存する

- zip の場所: 利用者がダウンロードした `小論文添削（ショー）.zip`（通常は「ダウンロード」フォルダ）
- 保存先: 利用者の指定がなければ「ドキュメント」フォルダ
- 同じ名前のフォルダがすでにあり、中に `添削結果/` などの作業データがあれば、上書きせず利用者に確認する

Windows（PowerShell）:
```powershell
Expand-Archive -Path "$HOME\Downloads\小論文添削（ショー）.zip" -DestinationPath "$HOME\Documents" -Force
```
Mac / Linux:
```bash
cd ~/Documents && unzip ~/Downloads/小論文添削（ショー）.zip
```

展開後、`小論文添削（ショー）/CLAUDE.md` があることと、フォルダ名・ファイル名が文字化けしていないことを確認する。

## 2. 必要なライブラリを入れる

```bash
cd "<保存先>/小論文添削（ショー）"
python -m pip install -r tools/requirements.txt
```
- Windows で `python` が見つからなければ `py -m pip …` を試す。Python 自体がなければ、利用者に Python 3（https://www.python.org/）のインストールを案内する。

## 3. 動作確認

```bash
python -c "import docx, pptx, jsonschema; print('ライブラリOK')"
python tools/tensaku.py count 提出/サンプル_食品ロス_答案.txt
```
2つ目で `{"total": …}` のように字数が表示されれば準備完了。

## 4. 利用者への報告

次の内容を伝える。
- 保存した場所（フォルダのパス）
- 動作確認の結果
- 使い方: 「このフォルダを Claude Code（またはデスクトップ版 Claude）で開き、チャットで『ショー、添削お願い』と言ってください。詳しくは `使い方_かんたん手順.md` を見てください。」
