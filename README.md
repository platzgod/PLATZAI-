# PLATZAI-

## 合格一貫カリキュラム マスターテンプレート

- `dist/合格一貫カリキュラム_マスターテンプレート.xlsm` … 生徒1人1ファイルのテンプレート（マクロ有効で開く）
- `dist/前提と仮定の一覧.md` … 作成時に置いた前提・仮定と動作確認の結果

### 作り直し方

```
python3 builder/build.py <元の試作ファイル.xlsm> dist/合格一貫カリキュラム_マスターテンプレート.xlsm
python3 builder/test_vba.py dist/合格一貫カリキュラム_マスターテンプレート.xlsm   # LibreOffice でマクロを実行して検証
```

- `builder/data.py` … 講座・教材・志望校・カリキュラムのマスターデータ
- `builder/vba/` … VBA ソース（vbaProject.bin はここから生成）
- `builder/vbaproject.py` … VBA プロジェクト（MS-OVBA / CFB）の生成
- `builder/package.py` … .xlsx → .xlsm への変換とボタンの追加

## 小論文添削（ショー）

`小論文添削（ショー）/` フォルダを Claude Code（または Claude デスクトップアプリ）で開き、
チャットで「ショー、添削お願い」と言うと小論文の添削シート（.docx）を、
「ショー、ワークシート作って」と言うと東洋大学版と同じ形式の小論文ワークシート（.pptx）を作る。
使い方は [`小論文添削（ショー）/はじめにお読みください.md`](小論文添削（ショー）/はじめにお読みください.md)。
