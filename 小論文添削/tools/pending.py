"""添削前フォルダの未処理ファイルを一覧し、PDF / Word は本文を抽出する。

使い方:
    python tools/pending.py [添削前フォルダ] [添削後フォルダ]
    （省略時はこのスクリプトの親フォルダ直下の「添削前」「添削後」）

出力は JSON。各ファイルについて
  - student / university / faculty : ファイル名から読み取った値（形式が違えば null）
  - output : 保存先の .docx パス
  - text   : 抽出した本文（画像は null。Claude が画像を直接読んで文字起こしする）
  - status : "pending" / "skipped"（処理済み）/ "needs_vision"（画像）/ "empty"（文字が取れない）
"""

import json
import sys
from pathlib import Path

TARGET_EXTS = {".pdf", ".jpg", ".jpeg", ".docx"}


def parse_name(stem):
    parts = stem.split("_")
    if len(parts) == 3 and all(parts):
        return parts
    return None, None, None


def extract_text(path):
    ext = path.suffix.lower()
    if ext == ".pdf":
        import pdfplumber

        with pdfplumber.open(path) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages).strip()
    if ext == ".docx":
        from docx import Document

        return "\n".join(p.text for p in Document(path).paragraphs).strip()
    return None


def main():
    base = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else base / "添削前"
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else base / "添削後"
    dst.mkdir(parents=True, exist_ok=True)

    results = []
    for path in sorted(src.iterdir()):
        if not path.is_file() or path.suffix.lower() not in TARGET_EXTS or path.name.startswith("~$"):
            continue
        student, university, faculty = parse_name(path.stem)
        output = dst / f"{path.stem}_添削完了.docx"
        item = {
            "file": str(path),
            "student": student,
            "university": university,
            "faculty": faculty,
            "output": str(output),
            "text": None,
        }
        if output.exists():
            item["status"] = "skipped"
        elif path.suffix.lower() in {".jpg", ".jpeg"}:
            item["status"] = "needs_vision"
        else:
            try:
                item["text"] = extract_text(path)
                item["status"] = "pending" if item["text"] else "empty"
            except Exception as e:  # 壊れたファイルなどは報告に回す
                item["status"] = "error"
                item["error"] = str(e)
        results.append(item)

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
