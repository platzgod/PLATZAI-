"""名簿（JSON）から生徒ごとのファイルを作る。

    python3 builder/make_students.py <元の試作ファイル.xlsm> <生徒.json> <出力フォルダ>

生徒.json：[{name, highschool, grade, school1, school2, school3, bunri, current, pattern_manual, tier,
             ko:[個別試験の項目], ky:[共通テストの項目] （省略で標準パターン）, note}]
年度（高3の年度）は学年から決める：高2→翌年、高1→翌々年（基準：作成日の年度）。
個人情報を含むので、生徒.json と出力はリポジトリに入れないこと。
"""
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402
import data as D  # noqa: E402


def school_year(today=None):
    today = today or datetime.date.today()
    return today.year if today.month >= 4 else today.year - 1


def make(src, students, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    fy = school_year()
    univ = B.univ_table()
    rows = []
    for i, st in enumerate(students, start=1):
        grade = st.get("grade") or "高2"
        year = fy + {"高1": 2, "高2": 1, "高3": 0}.get(grade, 1)
        sample = dict(name=st["name"], highschool=st.get("highschool", ""), grade=grade, tantou=st.get("tantou", ""),
                      school1=st.get("school1") or "", school2=st.get("school2") or "", school3=st.get("school3") or "",
                      bunri=st.get("bunri") or "文系", current=st.get("current"), pattern_manual=st.get("pattern_manual"),
                      tier=st.get("tier"), auto="する", year=year)
        if sample["school1"] and sample["school1"] not in univ:
            raise SystemExit(f"志望校マスタにない大学：{sample['school1']}（{st['name']}）")
        j = B.judge(sample, univ)
        if st.get("ko") is not None or st.get("ky") is not None:
            ko, ky = st.get("ko") or [], st.get("ky") or []
            bad = [x for x in ko + ky if x not in D.ITEM_NAMES]
            assert not bad, (st["name"], bad)
            sample["checks"] = {it: (it in ko, it in ky) for it in D.ITEM_NAMES}
        fn = f"{i:02d}_{year}_{grade}_{st['name']}.xlsm"
        B.build(src, os.path.join(out_dir, fn), sample)
        checks = sample.get("checks") or B.standard_checks(j["system"])
        rows.append(dict(no=i, file=fn, name=st["name"], grade=grade, highschool=sample["highschool"],
                         school=sample["school1"] or "（未定）", bunri=j["bunri"], pattern=j["pattern"],
                         variant=j["variant"], year=year,
                         ko="・".join(k for k in D.ITEM_NAMES if checks[k][0]) or "なし",
                         ky="・".join(k for k in D.ITEM_NAMES if checks[k][1]) or "なし", note=st.get("note", "")))
        print(f"[{i:02d}] {fn}  {j['pattern']}")
    return rows


if __name__ == "__main__":
    students = json.load(open(sys.argv[2], encoding="utf-8"))
    rows = make(sys.argv[1], students, sys.argv[3])
    json.dump(rows, open(os.path.join(sys.argv[3], "_一覧.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
