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

## 入塾書類の自動作成（高校生）

- `dist/入塾書類作成_高校生.xlsx` … 入力シートに入れると、入塾提案書・概要書面・入塾申込書・入塾契約書（同意書つき）が自動で埋まる（マクロなし、生徒ごとにコピーして使う）
- `dist/入塾書類_前提と仮定の一覧.md` … 料金の決まり方、元の書類との食い違いの扱い、特定商取引法への対応、動作確認の結果
- `dist/入塾書類_見本（印刷イメージ）.pdf`、`dist/preview_入塾書類/` … 印刷イメージ

```
python3 builder/enroll/build_enroll.py dist/入塾書類作成_高校生.xlsx      # ブックを作る（料金は builder/enroll/fees.py）
python3 builder/enroll/test_enroll.py dist/入塾書類作成_高校生.xlsx       # LibreOffice で再計算し、参照計算と突き合わせる
```
