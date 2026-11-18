"""入塾書類（高校生）の自動作成ブック（.xlsx・マクロなし）を作る。

    python3 builder/enroll/build_enroll.py dist/入塾書類作成_高校生.xlsx

シート：使い方／入力／入塾提案書／概要書面／入塾申込書／入塾契約書／計算／料金マスタ
入力シートの黄色のセルに入れると、ほかの書類はすべて数式で埋まる。
"""
import math
import os
import sys

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.pagebreak import Break

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fees as F  # noqa: E402

FONT = "游ゴシック"
RED = "C00000"
NAVY = "1F3864"
YELLOW = PatternFill("solid", fgColor="FFF2CC")
HEAD = PatternFill("solid", fgColor="D9E2F3")
LIGHT = PatternFill("solid", fgColor="F2F2F2")
PICK = PatternFill("solid", fgColor="FCE4D6")
thin = Side(style="thin", color="808080")
thick_red = Side(style="medium", color=RED)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
YEN = '#,##0"円";-#,##0"円";"0円"'
YEN_BLANK = '#,##0"円";-#,##0"円";"―"'
DATE_JP = 'yyyy"年"m"月"d"日"'
MONTH_JP = 'yyyy"年"m"月分"'
NCOL = 10            # 書類シートの列数（A〜J）
COLW = 9.6
LINE_PX = NCOL * (COLW * 7 + 5)


def font(size=10, bold=False, color=None):
    return Font(name=FONT, size=size, bold=bold, color=color)


def cell(ws, rng, value=None, size=10, bold=False, align="left", valign="center", wrap=True,
         color=None, fill=None, border=None, fmt=None):
    """rng（"A1" または "A1:C1"）に値を置く。範囲なら結合する。"""
    if ":" in rng:
        ws.merge_cells(rng)
        first = rng.split(":")[0]
        cells = [c for row in ws[rng] for c in row]
    else:
        first = rng
        cells = [ws[rng]]
    c = ws[first]
    if value is not None:
        c.value = value
    c.font = font(size, bold, color)
    c.alignment = Alignment(horizontal=align, vertical=valign, wrap_text=wrap)
    if fmt:
        c.number_format = fmt
    for x in cells:
        if fill:
            x.fill = fill
        if border:
            x.border = border
    return c


def lines_for(text, size, width_cols=NCOL):
    px = width_cols * (COLW * 7 + 5) - 8
    per = max(1, int(px / (size * 1.30)))
    n = 0
    for part in str(text).split("\n"):
        n += max(1, math.ceil(len(part) / per))
    return n


def para(ws, r, text, size=9.5, bold=False, color=None, cols=(1, NCOL), fill=None, border=None,
         min_lines=None, align="left"):
    a, b = cols
    rng = f"{get_column_letter(a)}{r}:{get_column_letter(b)}{r}"
    cell(ws, rng, text, size=size, bold=bold, color=color, fill=fill, border=border, valign="top", align=align)
    est = text if not str(text).startswith("=") else "あ" * 60
    n = max(min_lines or 0, lines_for(est, size, b - a + 1) if not str(text).startswith("=") else (min_lines or 1))
    ws.row_dimensions[r].height = n * size * 1.45 + 5
    return r + 1


def section(ws, r, title, size=11):
    cell(ws, f"A{r}:J{r}", title, size=size, bold=True, color="FFFFFF", fill=PatternFill("solid", fgColor=NAVY))
    ws.row_dimensions[r].height = size * 1.6 + 4
    return r + 1


def red_box(ws, r, texts, size=9.5):
    """赤枠・赤字の囲み（特定商取引法で赤枠赤字にする事項）。texts は段落のリスト。"""
    start = r
    for t in texts:
        r = para(ws, r, t, size=size, color=RED, bold=t is texts[0])
    for rr in range(start, r):
        for col in range(1, NCOL + 1):
            c = ws.cell(rr, col)
            c.border = Border(left=thick_red if col == 1 else None, right=thick_red if col == NCOL else None,
                              top=thick_red if rr == start else None, bottom=thick_red if rr == r - 1 else None)
    return r


def doc_sheet(wb, title, fit_height=1):
    ws = wb.create_sheet(title)
    for i in range(1, NCOL + 1):
        ws.column_dimensions[get_column_letter(i)].width = COLW
    ws.sheet_view.showGridLines = False
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = "portrait"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = fit_height
    ws.page_margins.left = ws.page_margins.right = 0.5
    ws.page_margins.top = ws.page_margins.bottom = 0.5
    ws.print_options.horizontalCentered = True
    return ws


def name(wb, nm, ref):
    wb.defined_names[nm] = DefinedName(nm, attr_text=ref)


def add_list(ws, rng, formula, prompt=None):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True)
    if prompt:
        dv.prompt, dv.showInputMessage = prompt, True
    ws.add_data_validation(dv)
    dv.add(rng)


# ---------------------------------------------------------------------------
# 料金マスタ
# ---------------------------------------------------------------------------
def build_master(wb):
    ws = wb.create_sheet("料金マスタ")
    ws.column_dimensions["A"].width = 34
    for c in "BCDEFG":
        ws.column_dimensions[c].width = 13
    ws.column_dimensions["I"].width = 40
    cell(ws, "A1", "料金マスタ（2026年度・税込）　※料金が変わったらこのシートだけ直す", 12, True, wrap=False)
    cell(ws, "A2", "出典：2026規定書 P15〜16・P24〜25・P27〜28、総合推薦入塾申込.xlsx「最新版」シート", 9, wrap=False,
         color="595959")
    # 授業料表
    hdr = ["キー（自動）", "コース", "学年"] + F.KOMA
    for j, h in enumerate(hdr):
        cell(ws, f"{get_column_letter(j + 1)}3", h, 10, True, "center", fill=HEAD, border=BOX)
    r = 4
    for (course, grade), vals in F.TUITION.items():
        ws.cell(r, 1, f'=B{r}&"|"&C{r}')
        ws.cell(r, 2, course)
        ws.cell(r, 3, grade)
        for j, v in enumerate(vals):
            c = ws.cell(r, 4 + j, v)
            c.number_format = YEN_BLANK
        for j in range(1, 8):
            ws.cell(r, j).border = BOX
            ws.cell(r, j).font = font(10)
        r += 1
    name(wb, "m_tuition_keys", "'料金マスタ'!$A$4:$A$9")
    name(wb, "m_tuition_vals", "'料金マスタ'!$D$4:$G$9")
    name(wb, "m_koma_hdr", "'料金マスタ'!$D$3:$G$3")
    cell(ws, "A10", "※個別指導コースに「通い放題」はありません（空欄＝選べない）。兄弟姉妹割は計算シートで掛けます。", 9,
         wrap=False, color="595959")

    singles = [
        ("m_entry", "入塾金（高校生・入塾時のみ）", F.ENTRY_FEE),
        ("m_facility", "施設維持費（各月）", F.FACILITY),
        ("m_print1", "プリント代（高校1・2年・一年間）", F.PRINT_FEE["高1"]),
        ("m_print3", "プリント代（高校3年・一年間）", F.PRINT_FEE["高3"]),
        ("m_ins", "塾総合保険料（一年間）※10月〜2月の入塾は半額", F.INSURANCE),
        ("m_jishu", "自習室使い放題（週1コマの受講者・月額）", F.JISHU),
        ("m_goukaku", "大学受験必勝合格講座（高3・9〜12月の各月）", F.GOUKAKU_MONTHLY),
        ("m_early", "早割（体験から1週間以内の入塾・中高生）", F.EARLY),
        ("m_transfer", "転塾割（テキスト・プリント代から）", F.TRANSFER),
    ]
    r = 12
    cell(ws, f"A{r}:B{r}", "その他の料金", 10, True, fill=HEAD, border=BOX)
    r += 1
    for nm, label, v in singles:
        cell(ws, f"A{r}", label, 10, border=BOX)
        cell(ws, f"B{r}", v, 10, border=BOX, fmt=YEN, align="right")
        name(wb, nm, f"'料金マスタ'!$B${r}")
        r += 1

    r += 1
    cell(ws, f"A{r}:B{r}", "テスト対策（高校生）", 10, True, fill=HEAD, border=BOX)
    r += 1
    t0 = r
    for k, v in F.TEST_OPTIONS.items():
        cell(ws, f"A{r}", k, 10, border=BOX)
        cell(ws, f"B{r}", v, 10, border=BOX, fmt=YEN, align="right")
        r += 1
    name(wb, "m_test_tbl", f"'料金マスタ'!$A${t0}:$B${r - 1}")
    name(wb, "l_test", f"'料金マスタ'!$A${t0}:$A${r - 1}")

    r += 1
    cell(ws, f"A{r}:C{r}", "兄弟姉妹割（同時に在籍）", 10, True, fill=HEAD, border=BOX)
    r += 1
    cell(ws, f"A{r}", "区分", 9, True, border=BOX)
    cell(ws, f"B{r}", "授業料の割引率", 9, True, border=BOX)
    cell(ws, f"C{r}", "施設費の掛け率", 9, True, border=BOX)
    r += 1
    s0 = r
    for k, (rate, mult) in F.SIBLING.items():
        cell(ws, f"A{r}", k, 10, border=BOX)
        cell(ws, f"B{r}", rate, 10, border=BOX, fmt="0%", align="right")
        cell(ws, f"C{r}", mult, 10, border=BOX, fmt="0%", align="right")
        r += 1
    name(wb, "m_sib_tbl", f"'料金マスタ'!$A${s0}:$C${r - 1}")
    name(wb, "l_sib", f"'料金マスタ'!$A${s0}:$A${r - 1}")
    cell(ws, f"A{r}", "※兄弟姉妹が入塾する場合、入塾金は無料。施設費の掛け率 50%＝半額、0%＝無料。", 9, wrap=False,
         color="595959")

    r += 2
    cell(ws, f"A{r}:C{r}", "総合型選抜・学校推薦型選抜（入塾生向け「最新版」）", 10, True, fill=HEAD, border=BOX)
    r += 1
    cell(ws, f"A{r}", "講座", 9, True, border=BOX)
    cell(ws, f"B{r}", "金額", 9, True, border=BOX)
    cell(ws, f"C{r}", "種別（one/month）", 9, True, border=BOX)
    r += 1
    g0 = r
    for k, (v, kind) in F.SOGO.items():
        cell(ws, f"A{r}", k, 10, border=BOX)
        cell(ws, f"B{r}", v, 10, border=BOX, fmt=YEN, align="right")
        cell(ws, f"C{r}", kind, 10, border=BOX, align="center")
        r += 1
    name(wb, "m_sogo_tbl", f"'料金マスタ'!$A${g0}:$C${r - 1}")
    name(wb, "l_sogo", f"'料金マスタ'!$A${g0}:$A${r - 1}")
    cell(ws, f"A{r}", "※one＝一括または分割（最大6回）、month＝毎月。※追加は50分11,000円（税込）。", 9, wrap=False,
         color="595959")

    # 選択肢
    lists = {
        "l_grade": ("学年", F.GRADES),
        "l_koma": ("週のコマ数", F.KOMA),
        "l_course": ("コース", F.COURSES),
        "l_yesno": ("有無", ["なし", "あり"]),
        "l_early": ("早割", ["適用しない", "適用する"]),
        "l_jishu": ("自習室", ["申し込まない", "申し込む"]),
        "l_goukaku": ("合格講座", ["受講する", "受講しない"]),
        "l_split": ("支払回数", ["一括", "分割（最大6回）"]),
        "l_pick": ("採用プラン", [1, 2, 3]),
    }
    col = 9
    cell(ws, "I3", "選択肢（入力シートのプルダウン）", 10, True, wrap=False)
    for nm, (label, vals) in lists.items():
        cl = get_column_letter(col)
        ws.column_dimensions[cl].width = 22
        cell(ws, f"{cl}4", label, 9, True, fill=HEAD, border=BOX)
        for i, v in enumerate(vals):
            ws.cell(5 + i, col, v).font = font(10)
        name(wb, nm, f"'料金マスタ'!${cl}$5:${cl}${4 + len(vals)}")
        col += 1
    return ws


# ---------------------------------------------------------------------------
# 入力
# ---------------------------------------------------------------------------
INPUT_ROWS = []  # (name, row, label, kind, note)


def build_input(wb):
    ws = wb.create_sheet("入力", 1)
    ws.column_dimensions["A"].width = 2
    ws.column_dimensions["B"].width = 30
    for c in "CDE":
        ws.column_dimensions[c].width = 22
    ws.column_dimensions["F"].width = 50
    ws.sheet_view.showGridLines = False
    cell(ws, "B1:F1", "入塾書類の入力シート（高校生）", 14, True, wrap=False)
    cell(ws, "B2:F2", "黄色のセルに入力すると、入塾提案書・概要書面・入塾申込書・入塾契約書が自動で埋まります。金額はすべて税込。",
         10, wrap=False, color="595959")

    def head(r, t):
        cell(ws, f"B{r}:F{r}", t, 11, True, color="FFFFFF", fill=PatternFill("solid", fgColor=NAVY))

    def inp(r, nm, label, value=None, fmt=None, lst=None, note="", cols="C"):
        cell(ws, f"B{r}", label, 10, border=BOX, fill=LIGHT)
        rng = f"{cols}{r}" if len(cols) == 1 else f"{cols[0]}{r}:{cols[1]}{r}"
        c = cell(ws, rng, value, 10, border=BOX, fill=YELLOW, fmt=fmt)
        if lst:
            add_list(ws, rng.split(":")[0], lst)
        if note:
            cell(ws, f"F{r}", note, 9, color="595959")
        name(wb, nm, f"'入力'!${cols[0]}${r}")
        INPUT_ROWS.append((nm, r, cols[0]))
        return c

    head(4, "書類")
    inp(5, "in_date", "作成日（提案日・契約日）", "=TODAY()", DATE_JP, note="数式（今日）のままでも、日付を入れてもよい")
    inp(6, "in_seq", "契約番号の連番", 1, note="同じ日に複数作るときに 1, 2, 3 …")
    inp(7, "in_staff", "担当者（契約締結担当者）", "", note="概要書面・契約書に載る（法律で必要）")
    head(9, "生徒")
    inp(10, "in_name", "生徒氏名", "")
    inp(11, "in_kana", "ふりがな", "")
    inp(12, "in_school", "高校名", "")
    inp(13, "in_grade", "学年（料金の学年）", "高2", lst="=l_grade", note="新年度から入る場合は新しい学年")
    head(15, "保護者（契約者）")
    inp(16, "in_parent", "保護者氏名", "")
    inp(17, "in_zip", "郵便番号", "")
    inp(18, "in_addr", "住所", "", cols=("C", "E"))
    inp(19, "in_tel", "電話番号", "")
    inp(20, "in_mail", "メールアドレス", "", cols=("C", "E"))

    head(22, "授業プラン（提案書では3つを比べる。使わないプランはコースを空欄に）")
    for j, h in enumerate(["プラン1", "プラン2", "プラン3"]):
        cell(ws, f"{'CDE'[j]}23", h, 10, True, "center", fill=HEAD, border=BOX)
    cell(ws, "B24", "プランの名前（提案書に表示）", 10, border=BOX, fill=LIGHT)
    cell(ws, "B25", "コース", 10, border=BOX, fill=LIGHT)
    cell(ws, "B26", "週のコマ数", 10, border=BOX, fill=LIGHT)
    defaults = [("スタンダード", "集団個別コース", "週2コマ"), ("しっかり", "集団個別コース", "週3コマ"),
                ("通い放題", "集団個別コース", "通い放題")]
    for j, (nm, course, koma) in enumerate(defaults):
        col = "CDE"[j]
        for rr, v, lst in ((24, nm, None), (25, course, "=l_course"), (26, koma, "=l_koma")):
            cell(ws, f"{col}{rr}", v, 10, border=BOX, fill=YELLOW, align="center")
            if lst:
                add_list(ws, f"{col}{rr}", lst)
        cell(ws, f"{col}27", f'=IF(\'計算\'!E{31 + j},"","×このコースでは選べません")', 9, color=RED, align="center")
    name(wb, "in_plan_names", "'入力'!$C$24:$E$24")
    name(wb, "in_plan_courses", "'入力'!$C$25:$E$25")
    name(wb, "in_plan_komas", "'入力'!$C$26:$E$26")
    cell(ws, "F25", "集団個別コース／個別指導コース／なし（総合型のみ）", 9, color="595959")
    cell(ws, "F26", "個別指導コースは週1〜3コマ", 9, color="595959")
    inp(28, "in_pick", "申し込むプラン（申込書・契約書に使う）", 1, lst="=l_pick", note="提案書では★が付く")

    head(30, "受講期間・オプション")
    inp(31, "in_start", "入塾日（授業開始日）", None, DATE_JP, note="初回の授業の日")
    inp(32, "in_end", "契約の最終月（空欄なら自動）", None, 'yyyy"年"m"月"',
        note="自動：高1・2＝次の3月分まで、高3＝次の2月分まで")
    cell(ws, "D32", '=IF(in_end="","自動："&TEXT(\'計算\'!C6,"yyyy年m月")&"分まで","")', 9, color="595959")
    inp(33, "in_jishu", "自習室使い放題（週1コマのとき）", "申し込まない", lst="=l_jishu", note="週2コマ以上は無料")
    inp(34, "in_test", "テスト対策", "申し込まない", lst="=l_test", note="定期テスト2週間前から通い放題")
    inp(35, "in_goukaku", "大学受験必勝合格講座（高3）", "受講する", lst="=l_goukaku",
        note="高3のみ。9〜12月に各11,000円（原則全員必修）")
    inp(36, "in_sogo", "総合型選抜・学校推薦型選抜の講座", "申し込まない", lst="=l_sogo", cols=("C", "D"))
    inp(37, "in_split", "総合型の講座の支払回数", "一括", lst="=l_split", note="分割は2か月目から口座振替（最大6回）")

    head(39, "割引")
    inp(40, "in_sib", "兄弟姉妹", "なし", lst="=l_sib", cols=("C", "D"), note="入塾金無料・授業料5%/10%引き・施設費半額/無料")
    inp(41, "in_ref", "塾生からの紹介", "なし", lst="=l_yesno", note="入塾金が半額")
    inp(42, "in_trial", "初回の体験授業の日", None, DATE_JP, note="提案書に早割の期限（1週間後）を出す")
    inp(43, "in_early", "早割（体験から1週間以内に入塾決定）", "適用しない", lst="=l_early", note="初回のお支払いから10,000円引き")
    inp(44, "in_transfer", "転塾（他塾から）", "なし", lst="=l_yesno", note="プリント代から10,000円引き")

    head(46, "金額を手で直すとき（空欄なら料金マスタから自動）")
    inp(47, "ov_entry", "入塾金", None, YEN)
    inp(48, "ov_print", "プリント代（一年間）", None, YEN, note="年度の途中で入る場合など")
    inp(49, "ov_test", "テスト対策", None, YEN)
    inp(50, "ov_ins", "塾総合保険料", None, YEN)
    head(52, "特約・備考（契約書の特約欄に載る）")
    inp(53, "in_note", "特約・備考", "", cols=("C", "F"))
    ws.row_dimensions[53].height = 40
    ws.freeze_panes = "A4"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    return ws


# ---------------------------------------------------------------------------
# 計算
# ---------------------------------------------------------------------------
SCHED0 = 50  # 計算シートのお支払い予定の先頭行


def build_calc(wb):
    ws = wb.create_sheet("計算")
    ws.column_dimensions["A"].width = 2
    ws.column_dimensions["B"].width = 30
    for c in "CDEFGHIJKLMN":
        ws.column_dimensions[c].width = 13
    cell(ws, "B1:H1", "計算シート（数式のみ。直さないでください）", 12, True, wrap=False)
    scalars = [
        ("c_start", "開始月", "=IF(in_start=\"\",DATE(YEAR(in_date),MONTH(in_date),1),DATE(YEAR(in_start),MONTH(in_start),1))", 'yyyy/m/d'),
        ("c_startday", "入塾日", "=IF(in_start=\"\",c_start,in_start)", 'yyyy/m/d'),
        ("c_end", "最終月", '=IF(in_end<>"",DATE(YEAR(in_end),MONTH(in_end),1),IF(in_grade="高3",DATE(YEAR(c_start)+IF(MONTH(c_start)>2,1,0),2,1),DATE(YEAR(c_start)+IF(MONTH(c_start)>=3,1,0),3,1)))', 'yyyy/m/d'),
        ("c_endday", "契約の終了日", "=EOMONTH(c_end,0)", 'yyyy/m/d'),
        ("c_n", "月数", "=MAX(0,MIN(13,(YEAR(c_end)-YEAR(c_start))*12+MONTH(c_end)-MONTH(c_start)+1))", "0"),
        ("c_sibrate", "兄弟割（授業料）", "=VLOOKUP(in_sib,m_sib_tbl,2,FALSE)", "0%"),
        ("c_sibfac", "兄弟割（施設費の掛け率）", "=VLOOKUP(in_sib,m_sib_tbl,3,FALSE)", "0%"),
        ("c_entry", "入塾金", '=IF(ov_entry<>"",ov_entry,IF(in_sib<>"なし",0,IF(in_ref="あり",ROUNDDOWN(m_entry/2,0),m_entry)))', YEN),
        ("c_print", "プリント代", '=IF(ov_print<>"",ov_print,IF(in_grade="高3",m_print3,m_print1))', YEN),
        ("c_transfer", "転塾割", '=IF(in_transfer="あり",MIN(m_transfer,c_print),0)', YEN),
        ("c_test", "テスト対策", '=IF(ov_test<>"",ov_test,VLOOKUP(in_test,m_test_tbl,2,FALSE))', YEN),
        ("c_ins", "保険料", '=IF(ov_ins<>"",ov_ins,IF(OR(MONTH(c_start)>=10,MONTH(c_start)<=2),ROUNDDOWN(m_ins/2,0),m_ins))', YEN),
        ("c_early", "早割", '=IF(in_early="適用する",m_early,0)', YEN),
        ("c_sogo_price", "総合型の金額", "=VLOOKUP(in_sogo,m_sogo_tbl,2,FALSE)", YEN),
        ("c_sogo_kind", "総合型の種別", "=VLOOKUP(in_sogo,m_sogo_tbl,3,FALSE)", "@"),
        ("c_prep", "準備コース（月額）", '=IF(c_sogo_kind="month",c_sogo_price,0)', YEN),
        ("c_one", "総合型（一括/分割の総額）", '=IF(c_sogo_kind="one",c_sogo_price,0)', YEN),
        ("c_k", "総合型の支払回数", '=IF(OR(in_split="一括",c_one=0),1,MAX(1,MIN(6,c_n-1)))', "0"),
        ("c_g1", "初月の合格講座", '=IF(AND(in_grade="高3",in_goukaku="受講する",MONTH(c_start)>=9,MONTH(c_start)<=12),m_goukaku,0)', YEN),
        ("c_extras", "入塾時の費用（入塾金・プリント・保険・テスト対策）", "=c_entry+c_print+c_ins+c_test", YEN),
        ("c_disc", "初回の割引（早割＋転塾割）", "=c_early+c_transfer", YEN),
        ("c_goukaku_sum", "合格講座の合計", f"=SUM(I{SCHED0}:I{SCHED0 + 12})", YEN),
        ("c_contract_no", "契約番号", '="PL-"&TEXT(in_date,"yyyymmdd")&"-"&TEXT(in_seq,"00")', "@"),
        ("c_parent", "宛名", '=IF(in_parent<>"",in_parent&"　様",IF(in_name<>"",in_name&"　様　保護者様","　　　　　　　　様"))', "@"),
        ("c_trial_end", "早割の期限", '=IF(in_trial="","",in_trial+7)', 'yyyy/m/d'),
    ]
    for i, (nm, label, f, fmt) in enumerate(scalars):
        r = 3 + i
        cell(ws, f"B{r}", label, 10, border=BOX)
        c = cell(ws, f"C{r}", f, 10, border=BOX, fmt=fmt, align="right")
        name(wb, nm, f"'計算'!$C${r}")
    assert 3 + len(scalars) < 29
    # プラン別
    r0 = 30
    hdr = ["プラン", "コース", "コマ", "選べる", "定価", "授業料", "施設費", "自習室", "毎月", "初回", "期間の総額", "名前", "レギュラー"]
    for j, h in enumerate(hdr):
        cell(ws, f"{get_column_letter(2 + j)}{r0}", h, 9, True, "center", fill=HEAD, border=BOX)
    for p in range(3):
        r = r0 + 1 + p
        col = "CDE"[p]
        f = {
            "B": p + 1,
            "C": f"='入力'!{col}25&\"\"",
            "D": f"='入力'!{col}26&\"\"",
            "N": f'=AND(C{r}<>"",LEFT(C{r},2)<>"なし")',
            "F": f"=IF(N{r},IFERROR(INDEX(m_tuition_vals,MATCH(C{r}&\"|\"&in_grade,m_tuition_keys,0),MATCH(D{r},m_koma_hdr,0)),0),0)",
            "E": f"=OR(NOT(N{r}),F{r}>0)",
            "G": f"=IF(E{r},ROUNDDOWN(F{r}*(1-c_sibrate),0),0)",
            "H": f"=IF(N{r},ROUNDDOWN(m_facility*c_sibfac,0),0)",
            "I": f'=IF(AND(N{r},D{r}="週1コマ",in_jishu="申し込む"),m_jishu,0)',
            "J": f"=G{r}+H{r}+I{r}+c_prep",
            "K": f"=IF(c_n=0,0,J{r}+c_extras-c_disc+c_g1+IF(c_k=1,c_one,0))",
            "L": f"=J{r}*c_n+c_goukaku_sum+IF(c_n=0,0,c_extras-c_disc+c_one)",
            "M": f"='入力'!{col}24&\"\"",
        }
        for k, v in f.items():
            c = cell(ws, f"{k}{r}", v, 10, border=BOX, align="right" if k in "FGHIJKL" else "center",
                     fmt=YEN if k in "FGHIJKL" else None)
    name(wb, "c_plan_tbl", f"'計算'!$B${r0 + 1}:$N${r0 + 3}")
    # 採用プラン
    pick = [("s_course", 2), ("s_koma", 3), ("s_tuition", 6), ("s_facility", 7), ("s_jishu", 8), ("s_monthly", 9),
            ("s_initial", 10), ("s_total", 11), ("s_regular", 13)]
    cell(ws, f"B{r0 + 5}", "申し込むプラン", 10, True)
    for i, (nm, k) in enumerate(pick):
        r = r0 + 6 + i
        cell(ws, f"B{r}", nm, 9, border=BOX)
        cell(ws, f"C{r}", f"=INDEX(c_plan_tbl,in_pick,{k})", 10, border=BOX, align="right",
             fmt=YEN if nm not in ("s_course", "s_koma", "s_regular") else None)
        name(wb, nm, f"'計算'!$C${r}")
    # お支払い予定
    hdr = ["回", "対象月", "引き落とし日", "授業料", "施設費", "自習室", "準備コース", "合格講座", "総合型", "入塾時の費用", "割引", "合計"]
    for j, h in enumerate(hdr):
        cell(ws, f"{get_column_letter(2 + j)}{SCHED0 - 1}", h, 9, True, "center", fill=HEAD, border=BOX)
    for i in range(1, 14):
        r = SCHED0 + i - 1
        C = f"C{r}"
        g = lambda e: f'=IF({C}="","",{e})'  # noqa: E731
        f = {
            "B": i,
            "C": f'=IF({i}<=c_n,EDATE(c_start,{i - 1}),"")',
            "D": g(f'IF({i}=1,"",WORKDAY(DATE(YEAR({C}),MONTH({C})-1,26),1))'),
            "E": g("s_tuition"),
            "F": g("s_facility"),
            "G": g("s_jishu"),
            "H": g("c_prep"),
            "I": g(f'IF(AND(in_grade="高3",in_goukaku="受講する",MONTH({C})>=9,MONTH({C})<=12),m_goukaku,0)'),
            "J": g(f"IF(c_one=0,0,IF(c_k=1,IF({i}=1,c_one,0),IF(AND({i}>=2,{i}<=c_k+1),ROUNDDOWN(c_one/c_k,0)+IF({i}=2,c_one-ROUNDDOWN(c_one/c_k,0)*c_k,0),0)))"),
            "K": g(f"IF({i}=1,c_extras,0)"),
            "L": g(f"IF({i}=1,-c_disc,0)"),
            "M": g(f"SUM(E{r}:L{r})"),
        }
        for k, v in f.items():
            fmt = 'yyyy/m' if k == "C" else ('m/d' if k == "D" else (YEN if k >= "E" else None))
            cell(ws, f"{k}{r}", v, 10, border=BOX, align="right", fmt=fmt)
    r = SCHED0 + 13
    cell(ws, f"B{r}:D{r}", "合計", 10, True, border=BOX)
    for k in "EFGHIJKLM":
        cell(ws, f"{k}{r}", f"=SUM({k}{SCHED0}:{k}{SCHED0 + 12})", 10, True, border=BOX, fmt=YEN, align="right")
    name(wb, "c_sched_total", f"'計算'!$M${r}")
    return ws


def sched(col, i):
    return f"'計算'!{col}{SCHED0 + i - 1}"


def stot(col):
    return f"'計算'!{col}{SCHED0 + 13}"


# ---------------------------------------------------------------------------
# 共通の部品
# ---------------------------------------------------------------------------
S = F.SCHOOL
SCHOOL_BLOCK = (f"{S['zip']}　{S['addr']}\n{S['name']}（{S['company']}）\n"
                f"TEL＆FAX：{S['tel']}　携帯：{S['mobile']}　メール：{S['mail']}")
OPTIONS_TEXT = ('=TRIM(IF(s_jishu>0,"自習室使い放題（月"&TEXT(s_jishu,"#,##0")&"円）　","")'
                '&IF(c_goukaku_sum>0,"大学受験必勝合格講座（9〜12月 各"&TEXT(m_goukaku,"#,##0")&"円）　","")'
                '&IF(c_test>0,"テスト対策（"&in_test&"）　","")'
                '&IF(in_sogo<>"申し込まない",in_sogo&"　",""))')


def title_block(ws, title, sub=None):
    cell(ws, "A1:J1", title, 18, True, "center")
    ws.row_dimensions[1].height = 32
    r = 2
    if sub:
        cell(ws, f"A{r}:J{r}", sub, 9, align="center", color="595959")
        r += 1
    return r


def money_row(ws, r, label, formula, lcols=("A", "D"), vcols=("E", "F"), bold=False, fill=None):
    cell(ws, f"{lcols[0]}{r}:{lcols[1]}{r}", label, 10, bold, border=BOX, fill=fill or LIGHT)
    cell(ws, f"{vcols[0]}{r}:{vcols[1]}{r}", formula, 10.5 if bold else 10, bold, "right", border=BOX, fmt=YEN, fill=fill)


def schedule_table(ws, r, size=9):
    hdr = [("A", "A", "対象月"), ("B", "C", "お支払い日・方法"), ("D", "D", "授業料"), ("E", "E", "施設維持費"),
           ("F", "G", "講座・その他"), ("H", "H", "入塾時の費用"), ("I", "I", "割引"), ("J", "J", "合計")]
    for a, b, h in hdr:
        cell(ws, f"{a}{r}" if a == b else f"{a}{r}:{b}{r}", h, size, True, "center", fill=HEAD, border=BOX)
    r += 1
    for i in range(1, 14):
        ws.row_dimensions[r].height = 15
        cell(ws, f"A{r}", f'=IF({sched("C", i)}="","",TEXT({sched("C", i)},"yyyy年m月")&"分")', size, align="center",
             border=BOX, wrap=False)
        cell(ws, f"B{r}:C{r}", f'=IF({sched("C", i)}="","",IF({i}=1,"初回授業時（現金）","口座振替 "&TEXT({sched("D", i)},"m月d日")))',
             size, align="center", border=BOX, wrap=False)
        for col, src in (("D", "E"), ("E", "F"), ("H", "K"), ("I", "L"), ("J", "M")):
            cell(ws, f"{col}{r}", f"={sched(src, i)}", size, col == "J", "right", border=BOX, fmt=YEN_BLANK, wrap=False)
        other = "+".join(sched(c, i) for c in "GHIJ")
        cell(ws, f"F{r}:G{r}", f'=IF({sched("C", i)}="","",{other})', size, align="right", border=BOX, fmt=YEN_BLANK, wrap=False)
        r += 1
    cell(ws, f"A{r}:C{r}", '="合計（"&c_n&"か月）"', size, True, "center", border=BOX, fill=LIGHT)
    for col, src in (("D", "E"), ("E", "F"), ("H", "K"), ("I", "L"), ("J", "M")):
        cell(ws, f"{col}{r}", f"={stot(src)}", size, True, "right", border=BOX, fmt=YEN, fill=LIGHT, wrap=False)
    cell(ws, f"F{r}:G{r}", "=" + "+".join(stot(c) for c in "GHIJ"), size, True, "right", border=BOX, fmt=YEN, fill=LIGHT)
    return r + 1


# ---------------------------------------------------------------------------
# 入塾提案書
# ---------------------------------------------------------------------------
def build_proposal(wb):
    ws = doc_sheet(wb, "入塾提案書")
    r = title_block(ws, "入 塾 提 案 書")
    cell(ws, f"G{r}:J{r}", "=in_date", 10, align="right", fmt=DATE_JP)
    r += 1
    cell(ws, f"A{r}:F{r}", "=c_parent", 13, True)
    ws.row_dimensions[r].height = 22
    r += 1
    cell(ws, f"A{r}:J{r}", '="生徒：　"&in_name&"　さん　（"&in_school&"　"&in_grade&"）"', 11)
    r += 1
    r = para(ws, r, "このたびは自立学習型個人指導塾PLATZの体験授業にご参加いただき、ありがとうございます。"
                    "面談の内容をもとに、下記のとおり授業プランをご提案いたします。コースの内容は年度の途中でも変更できます。"
                    "ご要望・ご質問がございましたら、お気軽にご相談ください。", 9.5)
    r += 1
    r = section(ws, r, "■ ご提案プランの比較（金額はすべて税込）")
    pc = [("E", "F"), ("G", "H"), ("I", "J")]
    rows = [
        ("", lambda p: f'=IF(\'計算\'!C{31 + p}="","",IF(in_pick={p + 1},"★ ","")&\'計算\'!M{31 + p})', None, True),
        ("コース", lambda p: f"='計算'!C{31 + p}", None, False),
        ("週のコマ数", lambda p: f'=IF(\'計算\'!C{31 + p}="","",IF(\'計算\'!N{31 + p},\'計算\'!D{31 + p},"―"))', None, False),
        ("月の授業料", lambda p: f'=IF(\'計算\'!C{31 + p}="","",\'計算\'!G{31 + p})', YEN, False),
        ("施設維持費（各月）", lambda p: f'=IF(\'計算\'!C{31 + p}="","",\'計算\'!H{31 + p})', YEN, False),
        ("自習室・準備コース（各月）", lambda p: f'=IF(\'計算\'!C{31 + p}="","",\'計算\'!I{31 + p}+c_prep)', YEN_BLANK, False),
        ("毎月のお支払い額", lambda p: f'=IF(\'計算\'!C{31 + p}="","",\'計算\'!J{31 + p})', YEN, True),
        ("初回のお支払い額", lambda p: f'=IF(\'計算\'!C{31 + p}="","",\'計算\'!K{31 + p})', YEN, True),
        ('="契約期間（"&c_n&"か月）の合計"', lambda p: f'=IF(\'計算\'!C{31 + p}="","",\'計算\'!L{31 + p})', YEN, False),
    ]
    top = r
    for label, fn, fmt, bold in rows:
        cell(ws, f"A{r}:D{r}", label, 10, bold, border=BOX, fill=HEAD if label == "" else LIGHT)
        for p, (a, b) in enumerate(pc):
            cell(ws, f"{a}{r}:{b}{r}", fn(p), 10.5 if bold else 10, bold, "center" if not fmt else "right",
                 border=BOX, fmt=fmt, fill=HEAD if label == "" else None)
        ws.row_dimensions[r].height = 26 if label == "コース" else 17
        r += 1
    for p, (a, b) in enumerate(pc):
        ws.conditional_formatting.add(f"{a}{top + 1}:{b}{r - 1}",
                                      FormulaRule(formula=[f"in_pick={p + 1}"], fill=PICK))
    r = para(ws, r, '="※兄弟姉妹割・紹介・早割・転塾割は、該当する場合に反映しています。契約期間："'
                    '&TEXT(c_startday,"yyyy年m月d日")&"〜"&TEXT(c_endday,"yyyy年m月d日")', 8.5, color="595959", min_lines=1)
    r += 1
    r = section(ws, r, '="■ 初回のお支払い（★"&INDEX(in_plan_names,in_pick)&"）　初回授業時までに現金でお願いします"')
    left = [("入塾金", "c_entry"), ("プリント代（一年間）", "c_print"), ("塾総合保険料（一年間）", "c_ins"),
            ("テスト対策", "c_test"), ("1か月分の授業料", "s_tuition"), ("施設維持費", "s_facility")]
    right = [("自習室・準備コース", "s_jishu+c_prep"), ("大学受験必勝合格講座", "c_g1"),
             ("総合型選抜の講座", f"{sched('J', 1)}"), ("早割", "-c_early"), ("転塾割", "-c_transfer")]
    for i in range(6):
        money_row(ws, r + i, left[i][0], "=" + left[i][1], ("A", "C"), ("D", "E"))
        if i < 5:
            money_row(ws, r + i, right[i][0], "=" + right[i][1], ("F", "H"), ("I", "J"))
        ws.row_dimensions[r + i].height = 16
    money_row(ws, r + 5, "初回のお支払い額　合計", "=s_initial", ("F", "H"), ("I", "J"), bold=True, fill=PICK)
    r += 7
    r = section(ws, r, '="■ お支払いの予定（★"&INDEX(in_plan_names,in_pick)&"）"')
    r = schedule_table(ws, r)
    r = para(ws, r, "※2か月目からは前月27日（金融機関の休業日は翌営業日）に口座から自動で引き落とします（前払い）。"
                    "「講座・その他」は自習室・準備コース・合格講座・総合型選抜の講座、「入塾時の費用」は入塾金・プリント代・保険料・テスト対策です。",
             8.5, color="595959")
    r += 1
    r = section(ws, r, "■ 特典・割引")
    r = para(ws, r, '=IF(in_trial<>"","● 早割：体験授業の日（"&TEXT(in_trial,"m月d日")&"）から1週間以内（"&TEXT(c_trial_end,"m月d日")&"まで）に入塾を決めていただくと、初回のお支払いから10,000円を割り引きます。"&IF(c_early>0,"（上の金額に反映済み）",""),"● 早割：初めての体験授業の日から1週間以内に入塾を決めていただくと、初回のお支払いから10,000円を割り引きます。")',
             9.5, min_lines=2)
    r = para(ws, r, '="● 適用している割引："&IF(TRIM(IF(in_sib<>"なし","兄弟姉妹割（"&in_sib&"）　","")&IF(AND(in_ref="あり",in_sib="なし"),"紹介（入塾金半額）　","")&IF(c_early>0,"早割　","")&IF(c_transfer>0,"転塾割（プリント代から"&TEXT(c_transfer,"#,##0")&"円引き）",""))="","なし",TRIM(IF(in_sib<>"なし","兄弟姉妹割（"&in_sib&"）　","")&IF(AND(in_ref="あり",in_sib="なし"),"紹介（入塾金半額）　","")&IF(c_early>0,"早割　","")&IF(c_transfer>0,"転塾割（プリント代から"&TEXT(c_transfer,"#,##0")&"円引き）","")))',
             9.5, min_lines=1)
    r = para(ws, r, "● ほかにも、兄弟姉妹割（入塾金無料・授業料5％引き・施設費半額）、お友達の紹介（入塾金半額）、"
                    "転塾割（テキスト代10,000円引き）があります。", 9.5)
    r += 1
    r = section(ws, r, "■ 別にかかる費用")
    r = para(ws, r, "● 春期・夏期・冬期講習（原則必修）と限界突破合宿は、日程と金額をその都度ご案内します。\n"
                    "● ウイングネットのテキスト代（各講座1冊880円〜）など、科目で必要なテキスト代は、月末に集計して別にご請求します。", 9.5)
    r = para(ws, r, "※この提案書は契約書ではありません。ご入塾の際は「概要書面」をお渡ししたうえで、「入塾申込書」と「入塾契約書」を取り交わします。",
             8.5, color="595959", min_lines=2)
    r += 1
    para(ws, r, SCHOOL_BLOCK + '', 9, cols=(5, 10), min_lines=3)
    cell(ws, f"A{r}:D{r}", '="担当："&in_staff', 10, valign="top")
    ws.print_area = f"A1:J{r}"
    return ws


# ---------------------------------------------------------------------------
# 概要書面（特定商取引法 第42条第1項）
# ---------------------------------------------------------------------------
COOLING_OFF = [
    "クーリング・オフについて",
    "① ご契約者は、契約書面を受け取った日から数えて8日を経過するまでは、書面または電磁的記録（電子メールなど）で、"
    "無条件に契約を解除（クーリング・オフ）できます。効力は、書面などを発信した時に生じます。",
    "② クーリング・オフをした場合、当塾は損害賠償や違約金を請求しません。すでに授業が始まっていても、その対価は請求しません。"
    "受け取った金銭は、速やかに全額お返しします。",
    "③ 関連商品（プリント・テキスト）もあわせて解除できます。返品にかかる費用は当塾が負担します。",
    "④ 当塾が事実と違うことを告げたり威迫したりして、クーリング・オフを妨げた場合は、当塾があらためて交付する書面を受け取った日から"
    "数えて8日を経過するまで、クーリング・オフができます。",
]
CANCEL = [
    "① クーリング・オフの期間が過ぎた後も、ご契約者は、将来に向かって契約を解除（中途解約）できます。",
    "② 中途解約のとき、当塾がご請求できる金額は、次の額が上限です。\n"
    "　(1) 授業の開始前：11,000円\n"
    "　(2) 授業の開始後：提供済みの授業の対価に、20,000円または1か月分の授業料のいずれか低い額を加えた額",
    "③ 受け取った金額のうち、上の額を超える部分は、速やかにお返しします。",
    "④ 関連商品は、未使用のものは返品できます。使用したもの・返品されないものは、その販売価格に相当する額を上限としてご負担いただきます。",
]


def build_overview(wb):
    ws = doc_sheet(wb, "概要書面")
    r = title_block(ws, "概 要 書 面", "（特定継続的役務提供・学習塾　契約を結ぶ前にお渡しする書面）")
    r = red_box(ws, r, ["この書面の内容を十分にお読みください。"], 11)
    r += 1
    cell(ws, f"A{r}:F{r}", "=c_parent", 12, True)
    cell(ws, f"G{r}:J{r}", '="交付日："&TEXT(in_date,"yyyy年m月d日")', 10, align="right")
    ws.row_dimensions[r].height = 20
    r += 2

    def item(r, label, text, lines=1, color=None):
        cell(ws, f"A{r}:C{r}", label, 9.5, True, border=BOX, fill=LIGHT, valign="top")
        cell(ws, f"D{r}:J{r}", text, 9.5, border=BOX, valign="top", color=color)
        est = lines_for(text, 9.5, 7) if not str(text).startswith("=") else lines
        ws.row_dimensions[r].height = max(lines, est) * 9.5 * 1.45 + 6
        return r + 1

    r = item(r, "1. 事業者", f"{S['company']}（{S['name']}）　{S['rep']}\n{S['zip']}　{S['addr']}\n"
                             f"電話：{S['tel']}　メール：{S['mail']}", 3)
    r = item(r, "2. 役務（授業）の内容",
             '=s_course&IF(s_regular,"（"&VLOOKUP(s_course,\'計算\'!$P$1:$Q$3,2,FALSE)&"）　"&s_koma&"・1コマ130分","")'
             '&CHAR(10)&"受講生："&in_name&"（"&in_grade&"）　指導科目：英語・数学・国語を原則とし、理科・社会は相談のうえ決めます。"'
             f'&IF({OPTIONS_TEXT[1:]}="","",CHAR(10)&"含まれる講座："&{OPTIONS_TEXT[1:]})', 6)
    r = item(r, "3. 関連商品", '="プリント（一年間分）："&TEXT(c_print,"#,##0")&"円　／　テキスト（ウイングネットなど・必要に応じて）：都度ご請求（各講座1冊880円〜）"&CHAR(10)&"販売業者：' + S["company"] + '"', 3)
    r = item(r, "4. お支払いいただく金額（税込）",
             '="入塾金："&TEXT(c_entry,"#,##0")&"円　毎月："&TEXT(s_monthly,"#,##0")&"円（授業料"&TEXT(s_tuition,"#,##0")&"円＋施設維持費"&TEXT(s_facility,"#,##0")&"円"&IF(s_jishu+c_prep>0,"＋その他"&TEXT(s_jishu+c_prep,"#,##0")&"円","")&"）"'
             '&CHAR(10)&"契約期間の合計："&TEXT(s_total,"#,##0")&"円（入塾金・関連商品・保険料・割引を含む。内訳は契約書の別表）"', 4)
    r = item(r, "5. お支払いの時期と方法",
             f'="初回：入塾金・プリント代・保険料・1か月分の授業料などを、初回授業時までに現金で（"&TEXT(s_initial,"#,##0")&"円）。"&CHAR(10)&"2か月目から：前月27日（休業日は翌営業日）に、{S["collector"]}を通じた口座振替（前払い）。"&IF(AND(c_one>0,c_k>1),CHAR(10)&"総合型選抜の講座："&c_k&"回の分割で口座振替。","")', 5)
    r = item(r, "6. 役務の提供期間", '=TEXT(c_startday,"yyyy年m月d日")&"　〜　"&TEXT(c_endday,"yyyy年m月d日")', 1)
    st = r
    cell(ws, f"A{r}:C{r}", "7. クーリング・オフ", 9.5, True, border=BOX, fill=LIGHT, valign="top", color=RED)
    cell(ws, f"D{r}:J{r}", "\n".join(COOLING_OFF[1:]), 9.5, border=BOX, valign="top", color=RED)
    ws.row_dimensions[r].height = lines_for("\n".join(COOLING_OFF[1:]), 9.5, 7) * 9.5 * 1.45 + 8
    for col in range(1, NCOL + 1):
        ws.cell(r, col).border = Border(top=thick_red, bottom=thick_red, left=thick_red if col == 1 else thin,
                                        right=thick_red if col == NCOL else None)
    r += 1
    r = item(r, "8. 中途解約", "\n".join(CANCEL))
    r = item(r, "9. 前払金の保全措置", "前払金の保全措置は講じていません。（授業料は1か月ごとの前払いです）")
    r = item(r, "10. 特約", '=IF(in_note="","なし",in_note)', 2)
    r = item(r, "11. その他", "季節講習・合宿・英検対策講座・模試などは、この契約に含まれません（その都度お申し込み）。"
                             "そのほかの決まりは「2026規定書」をご覧ください。")
    r += 1
    cell(ws, f"A{r}:J{r}", '="契約締結担当者："&in_staff', 10)
    ws.print_area = f"A1:J{r}"
    return ws


# ---------------------------------------------------------------------------
# 入塾申込書（元の様式の項目をそのまま）
# ---------------------------------------------------------------------------
def build_application(wb):
    ws = doc_sheet(wb, "入塾申込書")
    cell(ws, "A1:F1", "=c_parent", 13, True)
    cell(ws, "G1:J1", "=in_date", 10, align="right", fmt=DATE_JP)
    ws.row_dimensions[1].height = 22
    cell(ws, "A2:J2", "[ 入塾申込書 ]", 18, True, "center")
    ws.row_dimensions[2].height = 32
    r = 3
    r = para(ws, r, "授業コースについて、下記のとおりお申し込みいただきます。なお、コースの内容は年度の途中でも変更できます。"
                    "ご要望・ご質問がございましたら、お気軽にご相談ください。", 9.5)
    r += 1
    cell(ws, f"A{r}:B{r}", "生徒名", 10, True, border=BOX, fill=LIGHT)
    cell(ws, f"C{r}:F{r}", "=in_name", 12, True, border=BOX)
    cell(ws, f"G{r}", "学年", 10, True, border=BOX, fill=LIGHT)
    cell(ws, f"H{r}:J{r}", '=in_school&"　"&in_grade', 10, border=BOX)
    ws.row_dimensions[r].height = 22
    r += 1
    cell(ws, f"A{r}:B{r}", "コース", 10, True, border=BOX, fill=LIGHT)
    cell(ws, f"C{r}:J{r}", '=s_course&IF(s_regular,"　"&s_koma,"")&IF(' + OPTIONS_TEXT[1:] + '="","","　／　"&' + OPTIONS_TEXT[1:] + ')',
         10, border=BOX)
    ws.row_dimensions[r].height = 46
    r += 2
    r = section(ws, r, "■ 毎月のお支払い額（税込）")
    money_row(ws, r, "授業料", "=s_tuition"); r += 1
    money_row(ws, r, "施設維持費", "=s_facility"); r += 1
    money_row(ws, r, "自習室・準備コース", "=s_jishu+c_prep"); r += 1
    money_row(ws, r, "合計", "=s_monthly", bold=True, fill=PICK); r += 1
    box_top = r - 4
    cell(ws, f"G{box_top}:J{r - 1}", '="毎月の費用は、前月27日（金融機関の休業日は翌営業日）に口座から自動で引き落とします（前払い）。"&IF(c_goukaku_sum>0,CHAR(10)&"大学受験必勝合格講座は9〜12月に各"&TEXT(m_goukaku,"#,##0")&"円を加えて引き落とします。","")',
         9, valign="top", border=BOX)
    r += 1
    r = section(ws, r, "■ 初回のお支払い（初回授業時までに現金で）")
    items = [("【入塾金】", "=c_entry"), ("高【プリント代】（一年間）", "=c_print"), ("高【テキスト代】", None),
             ("高校生テスト対策", "=c_test"), ("【総合保険料】", "=c_ins"), ("1か月分の授業料・施設維持費など", "=s_monthly"),
             ("大学受験必勝合格講座・総合型選抜の講座", f"=c_g1+{sched('J', 1)}"), ("割引（早割・転塾割）", "=-c_disc")]
    for label, fml in items:
        if fml is None:
            cell(ws, f"A{r}:D{r}", label, 10, border=BOX, fill=LIGHT)
            cell(ws, f"E{r}:F{r}", "都度ご請求", 10, align="right", border=BOX)
        else:
            money_row(ws, r, label, fml)
        r += 1
    money_row(ws, r, "初回お支払い額", "=s_initial", bold=True, fill=PICK)
    cell(ws, f"G{r - 8}:J{r}", '="ウイングネットのテキスト代（各講座1冊880円〜）は、月末に集計して別にご請求します。"&CHAR(10)&CHAR(10)&"口座振替のお手続き（団体コード 0956467）は、入塾から1週間以内にお願いします。手続きが済むまでは、振込または現金でのお支払いになります。"',
         9, valign="top", border=BOX)
    r += 2
    r = section(ws, r, "■ 注意事項")
    r = para(ws, r, "・塾外の事故・盗難については、当塾の故意または過失による場合を除き、責任を負いかねます。塾内でも、貴重品は各自で十分に管理してください。\n"
                    "・諸規定については「2026規定書」をよくお読みください。\n"
                    "・当塾のHP・チラシなどに生徒の写真を掲載する場合があります。1人・2人で写っている写真の掲載を望まない場合は、事前にお申し出ください。\n"
                    "・契約の内容（クーリング・オフ・中途解約を含む）は、「入塾契約書」のとおりです。", 9.5)
    r += 1
    cell(ws, f"A{r}:J{r}", "上記の内容で申し込みます。", 11, True)
    r += 1
    cell(ws, f"A{r}:J{r}", "　　　　　年　　　月　　　日", 11)
    ws.row_dimensions[r].height = 22
    r += 1
    for label, val in (("御住所", '=IF(in_zip<>"","〒"&in_zip&"　","")&in_addr'), ("御電話", "=in_tel"),
                       ("御氏名（ご署名）", "")):
        cell(ws, f"A{r}:C{r}", label, 10.5, border=Border(bottom=thin))
        cell(ws, f"D{r}:I{r}", val, 11, border=Border(bottom=thin))
        cell(ws, f"J{r}", "印" if label.startswith("御氏名") else "", 11, align="center", border=Border(bottom=thin))
        ws.row_dimensions[r].height = 28
        r += 1
    r += 1
    para(ws, r, SCHOOL_BLOCK + f"\n塾長：藤田 文枝　　印", 9, cols=(5, 10), min_lines=4)
    ws.print_area = f"A1:J{r}"
    return ws


# ---------------------------------------------------------------------------
# 入塾契約書（契約書面）＋同意書
# ---------------------------------------------------------------------------
def build_contract(wb):
    ws = doc_sheet(wb, "入塾契約書", fit_height=0)
    r = title_block(ws, "入 塾 契 約 書", "（特定継続的役務提供契約書面）")
    r = red_box(ws, r, ["この書面の内容を十分にお読みください。",
                        "この契約は、この書面を受け取った日から数えて8日を経過するまで、書面または電子メールなどで無条件に解除"
                        "（クーリング・オフ）できます（第5条）。"], 10)
    r += 1
    cell(ws, f"A{r}:E{r}", '="契約番号："&c_contract_no', 10)
    cell(ws, f"F{r}:J{r}", '="契約締結日："&TEXT(in_date,"yyyy年m月d日")', 10, align="right")
    r += 1
    r = para(ws, r, f'="{S["company"]}（以下「甲」という）と、"&IF(in_parent="","　　　　　　",in_parent)&"（以下「乙」という）は、乙の子である受講生 "&IF(in_name="","　　　　",in_name)&"（以下「受講生」という）の学習指導について、次のとおり契約を結ぶ。"',
             10, min_lines=2)
    r += 1
    art = [
        ("第1条（役務の内容）",
         ['="1. 甲は、受講生に対し、"&s_course&IF(s_regular,"（"&VLOOKUP(s_course,\'計算\'!$P$1:$Q$3,2,FALSE)&"）　"&s_koma,"")&"の学習指導を行う。授業は一コマ130分（総合指導時間を含む）とし、レギュラー授業年間カレンダーにより行う。"',
          "2. 指導科目は、英語・数学・国語を原則とし、理科・社会は甲乙の相談により決める。曜日によって選べる科目が決まっている。",
          f'=IF({OPTIONS_TEXT[1:]}="","3. 本契約に含む講座：なし","3. 本契約に含む講座："&{OPTIONS_TEXT[1:]})',
          "4. 欠席した授業の振替は、規定書の振替授業規定による。",
          "5. 季節講習（春期・夏期・冬期）、合宿、英検対策講座、模試などは本契約に含まず、その都度、別に申し込む。"]),
        ("第2条（役務の提供期間）",
         ['="本契約の期間は、"&TEXT(c_startday,"yyyy年m月d日")&"から"&TEXT(c_endday,"yyyy年m月d日")&"までとする。"']),
        ("第3条（対価と支払方法）",
         ["1. 乙が甲に支払う金額（税込）は、別表のとおりとする。",
          "2. 初回は、入塾金、プリント代、塾総合保険料、1か月分の授業料、施設維持費などを、初回授業時までに現金で支払う。",
          f"3. 2か月目以降の授業料などは前払いとし、前月27日（金融機関の休業日は翌営業日）に、{S['collector']}を通じて乙の指定口座から自動で振り替える。"
          "口座振替の手続きが済むまでは、振込または現金で支払う。",
          '=IF(AND(c_one>0,c_k>1),"4. 総合型選抜の講座（"&in_sogo&"）の代金は、"&c_k&"回に分けて、2か月目から口座振替で支払う。","4. 総合型選抜の講座を分割で支払う場合は、2か月目から最大6回の口座振替とする。")']),
        ("第4条（関連商品）",
         [f"プリント（一年間分）とテキストは本契約の関連商品とし、販売業者は甲とする。ウイングネットのテキスト（各講座1冊880円〜）など、"
          "科目で必要なテキストは、月末に集計して別に請求する。"]),
    ]
    for head_, lines in art:
        cell(ws, f"A{r}:J{r}", head_, 10, True)
        ws.row_dimensions[r].height = 17
        r += 1
        for t in lines:
            r = para(ws, r, t, 9.5, min_lines=2 if t.startswith("=") else None)
    r += 1
    cell(ws, f"A{r}:J{r}", "別表　お支払いいただく金額（税込）", 10, True)
    r += 1
    tb = [("入塾金", "=c_entry"),
          ('="授業料（月"&TEXT(s_tuition,"#,##0")&"円×"&c_n&"か月）"', f"={stot('E')}"),
          ('="施設維持費（月"&TEXT(s_facility,"#,##0")&"円×"&c_n&"か月）"', f"={stot('F')}"),
          ("自習室・準備コース", f"={stot('G')}+{stot('H')}"),
          ("大学受験必勝合格講座", f"={stot('I')}"),
          ("総合型選抜の講座", f"={stot('J')}"),
          ("テスト対策", "=c_test"),
          ("プリント代（関連商品）", "=c_print"),
          ("塾総合保険料", "=c_ins"),
          ("割引（早割・転塾割）", "=-c_disc")]
    for i, (label, fml) in enumerate(tb):
        rr = r + i % 5
        if i < 5:
            money_row(ws, rr, label, fml, ("A", "C"), ("D", "E"))
        else:
            money_row(ws, rr, label, fml, ("F", "H"), ("I", "J"))
        ws.row_dimensions[rr].height = 16
    r += 5
    money_row(ws, r, "合計（契約期間）", "=c_sched_total", ("F", "H"), ("I", "J"), bold=True, fill=PICK)
    cell(ws, f"A{r}:E{r}", '="うち初回のお支払い："&TEXT(s_initial,"#,##0")&"円"', 9.5, valign="center")
    r += 1
    r = para(ws, r, "※月ごとのお支払い予定は、入塾提案書の「お支払いの予定」のとおり。季節講習・合宿・テキスト代などは含まない。",
             8.5, color="595959")
    ws.row_breaks.append(Break(id=r))
    r += 1
    # 2ページ目
    cell(ws, f"A{r}:J{r}", "第5条（クーリング・オフ）", 10, True, color=RED)
    r += 1
    r = red_box(ws, r, ["クーリング・オフについて（必ずお読みください）"] + COOLING_OFF[1:], 9.5)
    art2 = [
        ("第6条（中途解約）", CANCEL + ["⑤ 口座振替を止める手続きのため、退塾・休塾の連絡は、できるだけ前月10日までにする。"
                                     "連絡が遅れて引き落とされた金額のうち、②の額を超える部分は返す。"]),
        ("第7条（休塾）", ["休塾は、前月10日までに所定の申請書を出す。休塾中は授業料はかからないが、施設維持費は前もって支払い、再開後に返す。"
                         "病気・留学などのやむを得ない場合を除き、1か月を超える休塾はできない。"]),
        ("第8条（甲からの解除）", ["甲は、次のいずれかにあたるときは、相当の期間を定めて催告したうえで本契約を解除できる。この場合の精算は前条（第6条②〜④）による。\n"
                               "(1) 2か月続けて支払いがなく、催告しても支払わないとき\n"
                               "(2) 受講生が他の生徒の学習を著しく妨げ、注意しても改めないとき"]),
        ("第9条（前払金の保全措置）", ["甲は、前払金の保全措置を講じていない。"]),
        ("第10条（合格の保証・学校の方針）", ["甲は、合格に向けて最善の指導を行うが、合格を保証するものではない。指導の内容が学校の方針と異なる場合、最終的な判断は乙がする。"]),
        ("第11条（事故・盗難）", ["塾外の事故・盗難について、甲は、甲の故意または過失による場合を除き責任を負わない。塾内でも貴重品は各自で管理する。"
                              "甲は塾総合保険（損保ジャパン）に加入し、塾内と通塾途中の不慮の事故に備える。"]),
        ("第12条（個人情報・写真）", ["甲と乙は、本契約で知った個人情報を第三者に開示しない。甲は、提出された個人情報を当塾の業務にのみ使う。"
                                 "甲は、HP・チラシなどに受講生の写真を載せることがある。1人・2人で写った写真の掲載を望まない場合は、乙が事前に申し出る。"]),
        ("第13条（規定書）", ["本契約に定めのないことは「2026規定書」による。規定書と本契約が異なるときは、本契約を優先する。"]),
        ("第14条（合意管轄）", [f"本契約に関する紛争は、{S['court']}を第一審の管轄裁判所とする。"]),
        ("特約", ['=IF(in_note="","なし",in_note)']),
    ]
    for head_, lines in art2:
        cell(ws, f"A{r}:J{r}", head_, 10, True)
        ws.row_dimensions[r].height = 17
        r += 1
        for t in lines:
            r = para(ws, r, t, 9.5, min_lines=2 if t.startswith("=") else None)
    ws.row_breaks.append(Break(id=r))
    r += 1
    cell(ws, f"A{r}:J{r}", "署 名 欄", 16, True, "center")
    ws.row_dimensions[r].height = 30
    r += 1
    r = para(ws, r, "本契約の成立を証するため、本書2通を作成し、甲乙が記名押印のうえ、各1通を保有する。", 9.5)
    r += 1
    cell(ws, f"A{r}", "甲", 11, True)
    cell(ws, f"B{r}:J{r}", f"{S['addr']}　{S['company']}（{S['name']}）", 10)
    r += 1
    cell(ws, f"B{r}:I{r}", f"{S['rep']}　　電話 {S['tel']}", 10)
    cell(ws, f"J{r}", "印", 11, align="center")
    r += 1
    cell(ws, f"B{r}:J{r}", '="契約締結担当者："&in_staff', 10)
    r += 2
    cell(ws, f"A{r}", "乙", 11, True)
    for label, val in (("住所", '=IF(in_zip<>"","〒"&in_zip&"　","")&in_addr'), ("電話", "=in_tel"), ("氏名（ご署名）", "")):
        cell(ws, f"B{r}:C{r}", label, 10, border=Border(bottom=thin))
        cell(ws, f"D{r}:I{r}", val, 10.5, border=Border(bottom=thin))
        cell(ws, f"J{r}", "印" if label.startswith("氏名") else "", 11, align="center", border=Border(bottom=thin))
        ws.row_dimensions[r].height = 26
        r += 1
    cell(ws, f"B{r}:C{r}", "受講生", 10, border=Border(bottom=thin))
    cell(ws, f"D{r}:J{r}", '=in_name&"（"&in_school&"　"&in_grade&"）"', 10.5, border=Border(bottom=thin))
    ws.row_dimensions[r].height = 26
    r += 3
    # 同意書
    cell(ws, f"A{r}:J{r}", "同 意 書", 16, True, "center")
    ws.row_dimensions[r].height = 30
    r += 1
    r = para(ws, r, "乙は、入塾契約書と2026規定書の内容を確認し、次のことに同意します。（□にチェックを入れてください）", 10)
    r += 1
    for t in ("合格に向けて最善の指導が行われますが、その指導が合格を保証するものではないこと。",
              "指導の内容が学校の方針と異なる場合があり、その際の最終的な判断は乙がすること。",
              "授業料などは前払いで、2か月目から毎月27日（休業日は翌営業日）に口座振替になること。",
              "当塾のHP・チラシなどに受講生の写真が載る場合があること（1人・2人の写真の掲載を望まない場合は申し出ること）。",
              "契約書面を受け取った日から8日間はクーリング・オフができ、その後も中途解約ができること（第5条・第6条）。"):
        cell(ws, f"A{r}", "□", 14, align="center")
        cell(ws, f"B{r}:J{r}", t, 10)
        ws.row_dimensions[r].height = max(22, lines_for(t, 10, 9) * 15 + 6)
        r += 1
    r += 1
    cell(ws, f"A{r}:J{r}", "　　　　　年　　　月　　　日", 11)
    r += 1
    cell(ws, f"B{r}:C{r}", "保護者氏名（ご署名）", 10, border=Border(bottom=thin))
    cell(ws, f"D{r}:I{r}", "", 10.5, border=Border(bottom=thin))
    cell(ws, f"J{r}", "印", 11, align="center", border=Border(bottom=thin))
    ws.row_dimensions[r].height = 28
    ws.print_area = f"A1:J{r}"
    return ws


def build_help(wb):
    ws = wb.active
    ws.title = "使い方"
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 110
    ws.sheet_view.showGridLines = False
    cell(ws, "B1", "入塾書類の自動作成（高校生）　使い方", 15, True, wrap=False)
    lines = [
        ("■ 手順", True),
        ("1. このファイルをコピーして、生徒ごとに1ファイルで使います（元のファイルは残しておく）。", False),
        ("2.「入力」シートの黄色のセルに入力します。プラン1〜3に比べたいプランを入れ、「申し込むプラン」で1〜3を選びます。", False),
        ("3. 面談：「入塾提案書」を印刷して渡します（3つのプランの比較・初回のお支払い・月ごとのお支払い予定）。", False),
        ("4. 入塾が決まったら：「概要書面」を先に渡し、次に「入塾申込書」と「入塾契約書」（2部）に署名・押印していただきます。", False),
        ("　 入塾契約書は3ページ（契約書2ページ＋同意書1ページ）。2部印刷して、1部を保護者に渡します。", False),
        ("5. 印刷：シートを開いて［ファイル］→［印刷］（A4縦）。PDFにするときは［名前を付けて保存］で PDF を選ぶか、印刷先を「Microsoft Print to PDF」に。", False),
        ("", False),
        ("■ 金額の決まり方（規定書どおり・税込）", True),
        ("・授業料：料金マスタの表（コース×学年×週のコマ数）。兄弟姉妹割は授業料の5％／10％引き（1円未満切り捨て）。", False),
        ("・初回（初回授業時に現金）：入塾金＋プリント代＋塾総合保険料＋テスト対策＋1か月分の授業料と施設維持費など−早割−転塾割。", False),
        ("・2か月目から：前月27日に口座振替（土日は翌営業日。祝日は考えていないので、祝日に当たるときは手で読み替える）。", False),
        ("・契約期間：入塾日から、高1・2は次の3月分まで、高3は次の2月分まで（入力シートで変えられる）。", False),
        ("・入塾金：兄弟姉妹が在籍中＝無料、紹介＝半額。保険料：10月〜2月の入塾は半額。高3の合格講座：9〜12月に各11,000円。", False),
        ("・金額を変えたいときは、入力シートの「金額を手で直すとき」に入れる（空欄に戻すと自動）。料金改定は「料金マスタ」だけ直す。", False),
        ("", False),
        ("■ ご注意", True),
        ("・契約書・概要書面の条文は、特定商取引法（特定継続的役務提供）の記載事項に合わせた案です。使う前に専門家（行政書士・弁護士）の確認を受けてください。", False),
        ("・「計算」「料金マスタ」シートは数式です。料金マスタの金額以外は直さないでください。", False),
    ]
    r = 3
    for t, b in lines:
        cell(ws, f"B{r}", t, 10.5, b, wrap=True)
        ws.row_dimensions[r].height = 18
        r += 1


def build(out):
    wb = Workbook()
    build_help(wb)
    build_master(wb)
    build_input(wb)
    calc = build_calc(wb)
    # コース説明（契約書の第1条で使う）
    for i, (k, v) in enumerate(F.COURSE_NOTE.items()):
        calc.cell(1 + i, 16, k)
        calc.cell(1 + i, 17, v)
    build_proposal(wb)
    build_overview(wb)
    build_application(wb)
    build_contract(wb)
    order = ["使い方", "入力", "入塾提案書", "概要書面", "入塾申込書", "入塾契約書", "計算", "料金マスタ"]
    wb._sheets = [wb[n] for n in order]
    wb.active = 1
    for n in ("計算", "料金マスタ"):
        wb[n].sheet_properties.tabColor = "A6A6A6"
    wb["入力"].sheet_properties.tabColor = "FFC000"
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    wb.save(out)
    print("saved", out)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "dist/入塾書類作成_高校生.xlsx")
