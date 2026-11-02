# PLATZAI-

## 合格一貫カリキュラム マスターテンプレート

- `dist/合格一貫カリキュラム_マスターテンプレート.xlsm` … 生徒1人1ファイルのテンプレート（マクロ有効で開く）
- `dist/前提と仮定の一覧.md` … 作成時に置いた前提・仮定と動作確認の結果

### 作り直し方

```
python3 -I builder/parse_guide.py <講座ガイド.pdf> builder/guide_patterns.json    # 講座ガイドが新しくなったときだけ
python3 builder/build.py <元の試作ファイル.xlsm> dist/合格一貫カリキュラム_マスターテンプレート.xlsm
python3 builder/test_vba.py dist/合格一貫カリキュラム_マスターテンプレート.xlsm   # LibreOffice でマクロを実行して検証
```

- `builder/parse_guide.py` … 2027年度 高校生ウイングネット 学習・講座ガイド（PDF）の『合格一貫カリキュラム』15パターンを読み取る（PyMuPDF）
- `builder/guide_patterns.json` / `builder/guide_data.py` … 読み取った15パターンと講座一覧（管理表の期間への読み替え）
- `builder/data.py` … 教材・志望校・カリキュラムDB のマスターデータ
- `builder/vba/` … VBA ソース（vbaProject.bin はここから生成）
- `builder/vbaproject.py` … VBA プロジェクト（MS-OVBA / CFB）の生成
- `builder/package.py` … .xlsx → .xlsm への変換とボタンの追加

## 学習報告書 自動送信システム

- `report_system/` … 授業後の学習報告書を、講師がスマホのフォームで答え → 教室長が確認 → 保護者の LINE／メールに自動送信（Google フォーム＋スプレッドシート＋Apps Script）
- 質問と届く文面の見本：`report_system/学習報告書_質問票.md`、導入手順：`report_system/README.md`
- テスト：`node report_system/test/run_tests.js`
