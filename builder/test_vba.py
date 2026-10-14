"""生成した .xlsm を LibreOffice で開き、VBA マクロを実行して Python 版の反映結果と突き合わせる。

    python3 builder/test_vba.py dist/xxx.xlsm
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import openpyxl  # noqa: E402

import build as B  # noqa: E402
import data as D  # noqa: E402
from lo_harness import Office  # noqa: E402

CASES = [
    dict(name="国立理系・基礎→標準", school1="群馬大学", bunri="理系", current=45, social1="地理", social2="なし",
         science="物理・化学", kyote_use="しない"),
    dict(name="私大文系・標準", school1="明治大学", bunri="文系", current=52.5, social1="世界史", social2="なし",
         science="化学基礎・生物基礎", kyote_use="しない"),
    dict(name="私大理系・共テ利用", school1="東京理科大学", bunri="理系", current=58, social1="地理", social2="なし",
         science="化学・生物", kyote_use="する"),
    dict(name="国立文系・倫理", school1="千葉大学", bunri="文系", current=48, social1="地理", social2="公共・倫理",
         science="物理基礎・化学基礎", kyote_use="しない"),
    dict(name="私大文系・数学", school1="早稲田大学", bunri="文系", current=66, social1="数学", social2="なし",
         science="化学基礎・生物基礎", kyote_use="しない"),
]


def expected(case):
    univ = {u[0]: (u[1], u[2], u[3]) for u in D.UNIVERSITIES}
    inp = dict(case, target_manual=None)
    j = B.judge(inp, univ)
    subjects = B.recommend_subjects(j, inp)
    wb = openpyxl.Workbook()
    ws = wb.active
    db_index = {(r[0], r[1], r[2], r[3]): r[4] for r in D.build_db()}
    B.reflect(ws, j, inp, subjects, db_index, inp["school1"])
    cells = {}
    for r in range(B.FIRST, B.LAST + 1):
        for c in list(range(2, 2 + B.NPER)) + [B.COL_KY] + list(B.KY_COLS):
            v = ws.cell(r, c).value
            if v not in (None, ""):
                cells[(r, c)] = str(v)
    merges = {str(m) for m in ws.merged_cells.ranges}
    mats = [m[1] for m in B.materials_for(ws, subjects)]
    return j, subjects, cells, merges, mats


def main(path):
    fails = 0
    with Office() as off:
        doc = off.open(path)
        sh = off.sheet(doc, "生徒情報")
        plan = off.sheet(doc, B.PLAN)
        mock = off.sheet(doc, "模試・自学")
        sett = off.sheet(doc, "設定")
        # 0) 初期状態のまま反映しても、Python が作った初期表示と同じになるか
        for case in CASES:
            off.set(doc, "生徒情報", "B21", "しない")  # 自動反映を切ってから入力（イベントの影響を避ける）
            for ref, key in (("B11", "school1"), ("B14", "bunri"), ("B15", "current"), ("B17", "social1"),
                             ("B18", "social2"), ("B19", "science"), ("B20", "kyote_use")):
                off.set(doc, "生徒情報", ref, case[key])
            doc.calculateAll()
            off.run(doc, "modCurriculum.ApplyRecommendedSilent")
            le = off.run(doc, "modCurriculum.LastError")[0]
            if le:
                print("    VBAエラー:", le)
            doc.calculateAll()
            j, subjects, cells, merges, mats = expected(case)
            got_sys = sh.getCellRangeByName("B25").String
            got_pre, got_post = sh.getCellRangeByName("B28").String, sh.getCellRangeByName("B29").String
            errs = []
            if (got_sys, got_pre, got_post) != (j["system"], j["pre"], j["post"]):
                errs.append(f"判定 {got_sys},{got_pre},{got_post} != {j['system']},{j['pre']},{j['post']}")
            for i, subj in enumerate(D.SUBJECT_NAMES):
                g = (sett.getCellByPosition(1, B.SET_FIRST + i - 1).String, sett.getCellByPosition(2, B.SET_FIRST + i - 1).String)
                if g != subjects[subj]:
                    errs.append(f"科目 {subj}: {g} != {subjects[subj]}")
            got = {}
            for r in range(B.FIRST, B.LAST + 1):
                for c in list(range(2, 2 + B.NPER)) + [B.COL_KY] + list(B.KY_COLS):
                    v = plan.getCellByPosition(c - 1, r - 1).String
                    if v:
                        got[(r, c)] = v
            if got != cells:
                diff = [(k, got.get(k), cells.get(k)) for k in sorted(set(got) | set(cells)) if got.get(k) != cells.get(k)]
                errs.append(f"管理表のセルが {len(diff)} 個ちがう: {diff[:5]}")
            # 結合
            gm = set()
            for r in range(B.FIRST, B.LAST + 1):
                c = 2
                while c <= 1 + B.NPER:
                    cell = plan.getCellByPosition(c - 1, r - 1)
                    cur = plan.createCursorByRange(cell)
                    cur.collapseToMergedArea()
                    a = cur.getRangeAddress()
                    if a.EndColumn > a.StartColumn:
                        gm.add(f"{openpyxl.utils.get_column_letter(a.StartColumn + 1)}{r}:{openpyxl.utils.get_column_letter(a.EndColumn + 1)}{r}")
                        c = a.EndColumn + 2
                    else:
                        c += 1
            if gm != merges:
                errs.append(f"結合ちがい: VBAのみ {sorted(gm - merges)[:4]} / Pythonのみ {sorted(merges - gm)[:4]}")
            gmats = [mock.getCellByPosition(0, B.MAT_FIRST + i - 1).String for i in range(B.MAT_N)]
            gmats = [x for x in gmats if x]
            if gmats != mats:
                errs.append(f"教材 {gmats} != {mats}")
            # 非表示行（科目を反映）
            hidden = [r for r in range(B.FIRST, B.LAST + 1) if not plan.getRows().getByIndex(r - 1).IsVisible]
            status = "OK" if not errs else "NG"
            fails += bool(errs)
            print(f"[{status}] {case['name']}: {j['system']} 前期{j['pre']} 後期{j['post']}  セル{len(got)} 結合{len(gm)} 非表示行{len(hidden)} 教材{len(gmats)}")
            for e in errs:
                print("    ", e)
        # ダブルクリックの代わりに、☑ を付けて進捗の数式を確認
        plan.getCellRangeByName("C9").String = "☑" + plan.getCellRangeByName("C9").String
        doc.calculateAll()
        print("進捗 S8 =", repr(plan.getCellRangeByName("S8").String), " 成績表 E8 =", off.cell(doc, "成績表", "E8"))
        off.run(doc, "modReport.PrepareReport")
        print("HasChecks →", off.run(doc, "modCurriculum.HasChecks"))
        out = os.path.join(os.path.dirname(os.path.abspath(path)), "_lo_after_test.pdf")
        doc.close(True)
    return fails


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
