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

## 英検3級 面接トレーナー（`eiken3/`）

- `eiken3/index.html` … ダウンロードして Chrome で開くだけで動く（音声認識・読み上げつき、無料・サーバー不要）
- `eiken3/app.html` … 本体（Artifact 公開用）。編集後は `python3 eiken3/build.py` で `index.html` を作り直す
- 問題カード8枚はすべてオリジナル（過去問は使っていない）。音声認識が使えない環境では自己チェックモードで動く
- 授業モード（1回20分）：前半12分は本番の流れでカード2枚を通し、後半8分でフィードバック（3分）・改善箇所の言い直し（3分）・宿題（2分）。授業タイマー表示、宿題は次回ホームに表示
- 本番練習（入室〜退室の通し）、問題別ドリル（音読 / No.1 / No.2・3 / No.4・5）、学習記録（苦手分析、端末のブラウザに保存）、答え方のコツ
