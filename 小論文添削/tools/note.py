"""添削後フォルダの「納品一覧.txt」に 1 行追記する。

make_docx.py が納品のたびに自動で呼ぶ。添削できなかった提出物は Claude が直接呼ぶ:
    python tools/note.py <提出物名> <理由>
    例: python tools/note.py 小論文_田中太郎_早稲田大学_法学部 "読み取り不可（画像がぼやけている）"
"""

import sys
from datetime import datetime
from pathlib import Path

LOG_NAME = "納品一覧.txt"
HEADER = "日時\t提出物\t結果\t総合評価\t指摘件数\t要確認\n"


def append(out_dir, submission, result, rank="", count="", notes=""):
    log = Path(out_dir) / LOG_NAME
    new = not log.exists()
    # BOM 付き UTF-8 にしておくと、メモ帳でも Excel でも文字化けしない
    with open(log, "a", encoding="utf-8-sig" if new else "utf-8") as f:
        if new:
            f.write(HEADER)
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        f.write(f"{stamp}\t{submission}\t{result}\t{rank}\t{count}\t{notes}\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    base = Path(__file__).resolve().parent.parent
    append(base / "添削後", sys.argv[1], "未納品", notes=sys.argv[2])
    print(f"{LOG_NAME} に記録しました: {sys.argv[1]}（{sys.argv[2]}）")
