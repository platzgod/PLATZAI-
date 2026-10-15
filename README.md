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

## 小論文ワークシート自動作成

大学名・テーマを入れると、東洋大学版と同じ形式の小論文ワークシート（.pptx）を作る。詳しくは [`shoronbun/README.md`](shoronbun/README.md)。

```
python3 shoronbun/generate.py --university 東洋大学 --faculty 食環境科学部 --theme "食品ロス"
```
