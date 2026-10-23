"""取り込み用CSV（架空のサンプル）を作る。

    python3 forest_app/tools/make_sample_csv.py

本物のフォレスタの目次が届いたら、csv/単元.csv を差し替え、
ロードマップは先生が Excel で直接直す（このスクリプトはひな形づくり専用）。
Excel で文字化けしないよう UTF-8（BOM付き）で書き出す。
"""
import csv
import datetime as dt
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "csv"

GRADES = ["中1", "中2", "中3"]
SUBJECTS = [("英語", "E"), ("数学", "M"), ("国語", "J"), ("理科", "R"), ("社会", "S")]
UNITS_PER = 12  # 架空。本物の単元数は目次をもらってから

# 学期（定期テストで区切る）。日付は架空
TERMS = [
    ("2026-1", "1学期中間まで", dt.date(2026, 4, 6), dt.date(2026, 5, 22)),
    ("2026-2", "1学期期末まで", dt.date(2026, 5, 25), dt.date(2026, 7, 3)),
    ("2026-3", "2学期中間まで", dt.date(2026, 7, 6), dt.date(2026, 10, 9)),
    ("2026-4", "2学期期末まで", dt.date(2026, 10, 12), dt.date(2026, 11, 27)),
    ("2026-5", "学年末まで", dt.date(2026, 11, 30), dt.date(2027, 2, 26)),
]
# 学期ごとに進める単元数（標準）と、先取り（自学年→次の学年）
STD_SPLIT = [3, 2, 3, 2, 2]
FAST_OWN = [4, 4, 4, 0, 0]
FAST_NEXT = [0, 0, 0, 3, 3]


def code(grade, letter, n):
    return f"{grade[1]}{letter}-{n:02d}"


def mondays(start, end):
    d = start - dt.timedelta(days=start.weekday())
    if d < start:
        d += dt.timedelta(days=7)
    out = []
    while d <= end:
        out.append(d)
        d += dt.timedelta(days=7)
    return out


def spread(weeks, n):
    """n 個の単元を学期の週に均等に置く。"""
    if n == 0:
        return []
    step = len(weeks) / n
    return [weeks[int(i * step)] for i in range(n)]


def write(name, header, rows):
    with open(OUT / name, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def main():
    for t in TERMS:
        assert t[2].weekday() == 0, t
    write("学期.csv", ["Title", "TermName", "StartDate", "EndDate"],
          [(c, n, s.isoformat(), e.isoformat()) for c, n, s, e in TERMS])

    units = []
    for g in GRADES:
        for subj, letter in SUBJECTS:
            for i in range(1, UNITS_PER + 1):
                units.append((code(g, letter, i), g, subj,
                              f"（サンプル）{g}{subj} 単元{i:02d}", i))
    write("単元.csv", ["Title", "Grade", "Subject", "UnitName", "SortOrder"], units)

    road = []
    for gi, g in enumerate(GRADES):
        nxt = GRADES[gi + 1] if gi + 1 < len(GRADES) else None
        for subj, letter in SUBJECTS:
            for pattern in ("標準", "先取り"):
                own = next_n = 0
                for ti, (tc, _, s, e) in enumerate(TERMS):
                    if pattern == "標準":
                        plan = [code(g, letter, own + k + 1) for k in range(STD_SPLIT[ti])]
                        own += STD_SPLIT[ti]
                    else:
                        plan = [code(g, letter, own + k + 1) for k in range(FAST_OWN[ti])]
                        own += FAST_OWN[ti]
                        if nxt:  # 中3の先取りの後半は範囲外（要確認）
                            plan += [code(nxt, letter, next_n + k + 1) for k in range(FAST_NEXT[ti])]
                            next_n += FAST_NEXT[ti]
                    for wk, uc in zip(spread(mondays(s, e), len(plan)), plan):
                        road.append((f"{tc}|{pattern}|{g}|{uc}", tc, pattern, g, subj,
                                     uc, wk.isoformat(), ""))
    write("ロードマップ.csv", ["Title", "TermCode", "Pattern", "Grade", "Subject",
                          "UnitCode", "PlanWeek", "TargetLaps"], road)

    students = []
    for i in range(1, 21):
        g = "中1" if i <= 7 else "中2" if i <= 14 else "中3"
        students.append((f"S{i:02d}", g, "本校", "先取り" if i in (3, 10, 17) else "標準", "在籍"))
    write("生徒.csv", ["Title", "Grade", "Campus", "Pattern", "Status"], students)

    write("設定.csv", ["Title", "SettingValue", "Description"], [
        ("DefaultTargetLaps", "2", "目標周回数の初期値（ロードマップの TargetLaps が空の行に使う）"),
        ("LapCountMode", "合算", "達成に数える種類：「授業のみ」または「合算」（授業＋宿題）"),
        ("DelayGraceDays", "0", "遅れの猶予日数：予定週の日曜日からこの日数を過ぎても0周なら「遅れ」"),
    ])
    print(f"units={len(units)} roadmap={len(road)}")


if __name__ == "__main__":
    main()
