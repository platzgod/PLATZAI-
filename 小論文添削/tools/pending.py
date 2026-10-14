"""添削前フォルダの未処理の提出物を一覧し、PDF / Word は本文を抽出する。

使い方:
    python tools/pending.py [添削前フォルダ] [添削後フォルダ]
    （省略時はこのスクリプトの親フォルダ直下の「添削前」「添削後」）

提出物の置き方（1 人分 = 1 フォルダ、または 1 ファイル）:
    添削前/小論文_田中太郎_早稲田大学_法学部/
        設問.jpg        … ファイル名に「設問」を含むものは設問・資料として扱う
        1.jpg, 2.jpg    … それ以外は本文。名前の順（1, 2, …10）に並べる
    添削前/志願理由書_田中太郎_早稲田大学_法学部.docx   … 1 ファイルの場合（設問も同じファイルに含める）

出力は JSON。提出物ごとに
  - doc_type / student / university / faculty : 名前から読み取った値（読み取れなければ null）
  - output   : 保存先の .docx パス
  - prompt_files / body_files : 各ファイルの path と text。
        text が null のファイル（画像、文字が取れない PDF）は Claude が Read ツールで直接読む。
  - status   : "pending" / "skipped"（処理済み）/ "error"
"""

import json
import re
import sys
from pathlib import Path

TARGET_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".heic", ".docx"}
DOC_TYPES = ("小論文", "志願理由書")


def parse_name(stem):
    parts = stem.split("_")
    info = {"doc_type": None, "student": None, "university": None, "faculty": None}
    if parts and parts[0] in DOC_TYPES:
        info["doc_type"] = parts.pop(0)
    if len(parts) == 3 and all(parts):
        info["student"], info["university"], info["faculty"] = parts
    elif parts and parts[0]:
        info["student"] = parts[0]
    return info


def natural_key(path):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", path.name)]


def extract_text(path):
    ext = path.suffix.lower()
    if ext == ".pdf":
        import pdfplumber

        with pdfplumber.open(path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages).strip()
    elif ext == ".docx":
        from docx import Document

        text = "\n".join(p.text for p in Document(path).paragraphs).strip()
    else:
        return None  # 画像は Claude が直接読む
    return text or None


def describe(path):
    item = {"path": str(path)}
    try:
        item["text"] = extract_text(path)
    except Exception as e:  # 壊れたファイルなどは報告に回す
        item["text"] = None
        item["error"] = str(e)
    return item


def main():
    base = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else base / "添削前"
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else base / "添削後"
    dst.mkdir(parents=True, exist_ok=True)

    results = []
    for entry in sorted(src.iterdir(), key=natural_key):
        if entry.name.startswith(("~$", ".")):
            continue
        if entry.is_dir():
            files = sorted(
                (f for f in entry.iterdir()
                 if f.is_file() and f.suffix.lower() in TARGET_EXTS and not f.name.startswith(("~$", "."))),
                key=natural_key,
            )
            name = entry.name
        elif entry.suffix.lower() in TARGET_EXTS:
            files = [entry]
            name = entry.stem
        else:
            continue

        output = dst / f"{name}_添削完了.docx"
        item = {"submission": str(entry), **parse_name(name), "output": str(output)}
        if output.exists():
            item["status"] = "skipped"
        elif not files:
            item["status"] = "error"
            item["error"] = "フォルダに対象ファイルがありません"
        else:
            prompts = [f for f in files if "設問" in f.stem]
            bodies = [f for f in files if f not in prompts]
            item["prompt_files"] = [describe(f) for f in prompts]
            item["body_files"] = [describe(f) for f in bodies]
            item["status"] = "pending"
        results.append(item)

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
