"""入塾書類ブックを LibreOffice で開き、入力を変えて再計算し、fees.calc（参照実装）と金額を突き合わせる。

    python3 builder/enroll/test_enroll.py dist/入塾書類作成_高校生.xlsx [PDFの出力先フォルダ]

書類シートに数式エラー（#NAME? など）がないことも確かめる。PDF の出力先を渡すと、シナリオ1の書類を PDF にする。
"""
import datetime as dt
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import fees as F  # noqa: E402
from lo_harness import Office, _pv  # noqa: E402
import uno  # noqa: E402

CELLS = dict(in_date="C5", in_seq="C6", in_staff="C7", in_name="C10", in_kana="C11", in_school="C12", in_grade="C13",
             in_parent="C16", in_zip="C17", in_addr="C18", in_tel="C19", in_mail="C20", in_pick="C28",
             in_start="C31", in_end="C32", in_jishu="C33", in_test="C34", in_goukaku="C35", in_sogo="C36",
             in_split="C37", in_sib="C40", in_ref="C41", in_trial="C42", in_early="C43", in_transfer="C44",
             ov_entry="C47", ov_print="C48", ov_test="C49", ov_ins="C50", in_note="C53")
BASE = dict(in_date=dt.date(2026, 11, 18), in_seq=1, in_staff="山田 太郎", in_name="見本 花子", in_kana="みほん はなこ",
            in_school="県立太田高校", in_grade="高2", in_parent="見本 一郎", in_zip="373-0000",
            in_addr="群馬県太田市○○町1-2-3", in_tel="0276-00-0000", in_mail="", in_pick=1,
            in_start=dt.date(2026, 12, 1), in_end=None, in_jishu="申し込まない", in_test="申し込まない",
            in_goukaku="受講する", in_sogo="申し込まない", in_split="一括", in_sib="なし", in_ref="なし",
            in_trial=dt.date(2026, 11, 14), in_early="適用しない", in_transfer="なし",
            ov_entry=None, ov_print=None, ov_test=None, ov_ins=None, in_note="",
            plans=[("スタンダード", "集団個別コース", "週2コマ"), ("しっかり", "集団個別コース", "週3コマ"),
                   ("通い放題", "集団個別コース", "通い放題")])

SCENARIOS = [
    ("高2・12月入塾・割引なし", {}),
    ("高3・4月入塾・個別週1・オプション全部・兄弟・早割・転塾・総合型分割",
     dict(in_grade="高3", in_start=dt.date(2026, 4, 6), in_date=dt.date(2026, 3, 30), in_jishu="申し込む",
          in_test="高3・1学期のみ（8,800円）", in_sogo="総合型選抜アドバンスコース", in_split="分割（最大6回）",
          in_sib="兄弟姉妹が在籍中（2人目）", in_early="適用する", in_transfer="あり",
          plans=[("個別", "個別指導コース", "週1コマ"), ("集団", "集団個別コース", "週2コマ"), ("", "", "")])),
    ("高1・3月入塾・紹介・プラン3を申込", dict(in_grade="高1", in_start=dt.date(2027, 3, 1), in_ref="あり", in_pick=3,
                                    in_test="年間（22,000円）")),
    ("高3・総合型のみ・一括・6月入塾", dict(in_grade="高3", in_start=dt.date(2026, 6, 15), in_sogo="総合型選抜プレミアムコース",
                                  plans=[("総合型", "なし（総合型のみ）", ""), ("", "", ""), ("", "", "")])),
    ("高3・11月入塾・総合型分割（期間が短い）・3人目・最終月を手入力・手入力の金額",
     dict(in_grade="高3", in_start=dt.date(2026, 11, 20), in_sogo="面接対策", in_split="分割（最大6回）",
          in_sib="兄弟姉妹が在籍中（3人目以降）", in_end=dt.date(2027, 3, 1), ov_print=5000, ov_ins=0,
          plans=[("A", "集団個別コース", "通い放題"), ("B", "個別指導コース", "通い放題"), ("C", "個別指導コース", "週3コマ")])),
    ("高2・準備コース（月額）・週1・自習室", dict(in_sogo="高1・高2生 総合推薦準備コース（月額）", in_jishu="申し込む",
                                     plans=[("週1", "集団個別コース", "週1コマ"), ("", "", ""), ("", "", "")])),
]


def serial(d):
    return (d - dt.date(1899, 12, 30)).days


def put(c, v):
    if v is None or v == "":
        c.setFormula("")
    elif isinstance(v, dt.date):
        c.Value = serial(v)
    elif isinstance(v, (int, float)):
        c.Value = v
    else:
        c.String = v


def fill(doc, inp):
    sh = doc.Sheets.getByName("入力")
    for k, addr in CELLS.items():
        put(sh.getCellRangeByName(addr), inp[k])
    for j, (nm, course, koma) in enumerate(inp["plans"]):
        col = "CDE"[j]
        put(sh.getCellRangeByName(f"{col}24"), nm)
        put(sh.getCellRangeByName(f"{col}25"), course)
        put(sh.getCellRangeByName(f"{col}26"), koma)
    doc.calculateAll()


def to_ref(inp):
    m = {k[3:] if k.startswith("in_") else k: v for k, v in inp.items()}
    return dict(grade=m["grade"], start=m["start"], end_manual=m["end"], pick=m["pick"], jishu=m["jishu"], test=m["test"],
                goukaku=m["goukaku"], sogo=m["sogo"], sogo_n="一括" if m["split"] == "一括" else "分割",
                sibling=m["sib"], referral=m["ref"], early=m["early"], transfer=m["transfer"],
                ov_entry=inp["ov_entry"], ov_print=inp["ov_print"], ov_test=inp["ov_test"], ov_ins=inp["ov_ins"],
                plans=[(c, k) for _, c, k in inp["plans"]])


def errors(doc):
    bad = []
    for name in ("入力", "入塾提案書", "概要書面", "入塾申込書", "入塾契約書", "計算"):
        sh = doc.Sheets.getByName(name)
        cur = sh.createCursor()
        cur.gotoEndOfUsedArea(False)
        end = cur.getRangeAddress()
        data = sh.getCellRangeByPosition(0, 0, end.EndColumn, end.EndRow)
        for r in range(end.EndRow + 1):
            for c in range(end.EndColumn + 1):
                cl = data.getCellByPosition(c, r)
                if cl.getError() != 0 or cl.String.startswith(("#", "Err:")):
                    bad.append(f"{name}!{chr(65 + c)}{r + 1}={cl.String}({cl.getError()})")
    return bad


def main(path, pdf_dir=None):
    fails = 0
    with Office() as off:
        doc = off.open(path)
        calc = doc.Sheets.getByName("計算")

        def v(addr):
            return calc.getCellRangeByName(addr).Value

        for no, (title, over) in enumerate(SCENARIOS, start=1):
            inp = {**BASE, **over}
            fill(doc, inp)
            ref = to_ref(inp)
            exp = F.calc(ref)
            got = dict(n=v("C7"), entry=v("C10"), print=v("C11"), transfer=v("C12"), test=v("C13"), ins=v("C14"),
                       early=v("C15"), monthly=v("C41"), initial=v("C42"), total=v("C43"), sched_total=v("M63"))
            want = dict(n=exp["n"], entry=exp["entry"], print=exp["print"], transfer=exp["transfer"], test=exp["test"],
                        ins=exp["ins"], early=exp["early"], monthly=exp["monthly"], initial=exp["initial"],
                        total=exp["total"], sched_total=exp["total"])
            msgs = [f"{k}: 期待 {want[k]} / ブック {got[k]}" for k in want if abs(want[k] - got[k]) > 0.5]
            for i, row in enumerate(exp["rows"]):
                r = 50 + i
                for col, key in zip("EFGHIJKLM", ["tuition", "facility", "jishu", "prep", "goukaku", "sogo", None, None, "total"]):
                    w = row[key] if key else (row["entry"] + row["print"] + row["ins"] + row["test"] if col == "K" else row["discount"])
                    if abs(v(f"{col}{r}") - w) > 0.5:
                        msgs.append(f"{i + 1}回目 {col}列: 期待 {w} / ブック {v(f'{col}{r}')}")
                if i > 0:
                    d = dt.date(1899, 12, 30) + dt.timedelta(days=int(v(f"D{r}")))
                    if d != row["pay"]:
                        msgs.append(f"{i + 1}回目 引き落とし日: 期待 {row['pay']} / ブック {d}")
            for p in (1, 2, 3):  # 3プランの比較
                course, koma = ref["plans"][p - 1]
                ok = not course or course.startswith("なし") or F.TUITION[(course, ref["grade"])][F.KOMA.index(koma)]
                if not course:
                    continue
                if ok:
                    e2 = F.calc(ref, p)
                    for col, key in (("J", "monthly"), ("K", "initial"), ("L", "total")):
                        if abs(v(f"{col}{30 + p}") - e2[key]) > 0.5:
                            msgs.append(f"プラン{p} {key}: 期待 {e2[key]} / ブック {v(f'{col}{30 + p}')}")
                elif calc.getCellRangeByName(f"E{30 + p}").Value != 0:
                    msgs.append(f"プラン{p} は選べないはず")
            bad = errors(doc)
            status = "OK" if not msgs and not bad else "NG"
            fails += status == "NG"
            print(f"[{status}] {no}. {title}  月額{exp['monthly']:,} 初回{exp['initial']:,} 合計{exp['total']:,}（{exp['n']}か月）")
            for m in msgs + bad[:20]:
                print("     ", m)
            if pdf_dir and no in (1, 2):
                os.makedirs(pdf_dir, exist_ok=True)
                out = os.path.join(pdf_dir, f"scenario{no}.pdf")
                doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(out)), (_pv("FilterName", "calc_pdf_Export"),))
        doc.close(True)
    print("失敗" if fails else "すべて一致", f"（{len(SCENARIOS) - fails}/{len(SCENARIOS)}）")
    return fails


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None) else 0)
