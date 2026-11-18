"""入塾書類（高校生）の料金マスタと、Excel の数式と同じ計算をする参照実装（テスト用）。

金額はすべて税込。出典：2026規定書（P15〜16・P24〜25・P27〜28）と
『総合推薦入塾申込.xlsx』の「最新版」シート（2026年6月更新）。
"""
import datetime as dt

GRADES = ["高1", "高2", "高3"]
KOMA = ["週1コマ", "週2コマ", "週3コマ", "通い放題"]
COURSES = ["集団個別コース", "個別指導コース", "なし（総合型のみ）"]

# 月の授業料（税込）[週1, 週2, 週3, 通い放題]
TUITION = {
    ("集団個別コース", "高1"): [17600, 30800, 36300, 40700],
    ("集団個別コース", "高2"): [19800, 34100, 39600, 44000],
    ("集団個別コース", "高3"): [24200, 40700, 53900, 59400],
    ("個別指導コース", "高1"): [26400, 44000, 59400, None],
    ("個別指導コース", "高2"): [28600, 46200, 61600, None],
    ("個別指導コース", "高3"): [30800, 48400, 66000, None],
}
COURSE_NOTE = {
    "集団個別コース": "集団個別授業（1コマ130分）",
    "個別指導コース": "個別指導（80分 1対2の個別授業＋45分 少人数授業）",
    "なし（総合型のみ）": "レギュラー授業なし",
}

ENTRY_FEE = 22000          # 入塾金（高校生）
FACILITY = 2970            # 施設維持費（各月）
PRINT_FEE = {"高1": 13200, "高2": 13200, "高3": 22000}   # プリント代（一年間・一括）
INSURANCE = 660            # 塾総合保険料（一年間）。10月以降の入塾は半額
INSURANCE_HALF_MONTHS = (10, 11, 12, 1, 2)
JISHU = 5500               # 自習室使い放題（週1コマの受講者・月額）
GOUKAKU_MONTHLY = 11000    # 大学受験必勝合格講座（高3）9〜12月 各11,000円
GOUKAKU_MONTHS = (9, 10, 11, 12)
TEST_OPTIONS = {"年間（22,000円）": 22000, "高3・1学期のみ（8,800円）": 8800, "申し込まない": 0}
EARLY = 10000              # 早割（体験から1週間以内の入塾・中高生）
TRANSFER = 10000           # 転塾割（テキスト代から）
SIBLING = {  # 兄弟姉妹：授業料の割引率、施設維持費の掛け率
    "なし": (0.0, 1.0),
    "兄弟姉妹が在籍中（2人目）": (0.05, 0.5),
    "兄弟姉妹が在籍中（3人目以降）": (0.10, 0.0),
}

# 総合型選抜・学校推薦型選抜（「最新版」シート）：名前 → (金額, 種別) 種別 one=一括/分割、month=月額
SOGO = {
    "申し込まない": (0, "none"),
    "総合型選抜ベーシックコース": (253000, "one"),
    "総合型選抜アドバンスコース": (352000, "one"),
    "総合型選抜プレミアムコース": (638000, "one"),
    "併願対策講座ベーシック": (165000, "one"),
    "併願対策講座アドバンス": (198000, "one"),
    "志望理由書作成講座A": (55000, "one"),
    "志望理由書作成講座B": (165000, "one"),
    "小論文対策講座 ライトプラン": (35200, "one"),
    "小論文対策講座": (77000, "one"),
    "課題作成講座": (165000, "one"),
    "過去問対策 3テーマ": (61600, "one"),
    "過去問対策 5テーマ": (105600, "one"),
    "面接対策": (52800, "one"),
    "志望校選定セッション": (11000, "one"),
    "高1・高2生 総合推薦準備コース（月額）": (13200, "month"),
}

SCHOOL = dict(
    company="株式会社PLATZ",
    name="自立学習型個人指導塾PLATZ",
    rep="代表取締役　藤田 文枝",
    zip="〒373-0817",
    addr="群馬県太田市飯塚町1417-1",
    tel="0276-55-4230",
    mobile="090-9821-8919",
    mail="info@platz2017.com",
    court="前橋地方裁判所",
    collector="日本システム収納株式会社",
)
MAX_ROWS = 13


def month_add(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    return dt.date(d.year + y, m + 1, 1)


def debit_date(month_first):
    """N月分の引き落とし日：前月27日（土日なら翌営業日。祝日は考えない）。"""
    d = month_add(month_first, -1).replace(day=27)
    while d.weekday() >= 5:
        d += dt.timedelta(days=1)
    return d


def end_month(start, grade, manual=None):
    if manual:
        return manual.replace(day=1)
    s = start.replace(day=1)
    if grade == "高3":
        return dt.date(s.year + (1 if s.month > 2 else 0), 2, 1)
    return dt.date(s.year + (1 if s.month >= 3 else 0), 3, 1)


def plan_tuition(course, koma, grade, sibling):
    if course.startswith("なし"):
        return 0
    v = TUITION[(course, grade)][KOMA.index(koma)]
    if v is None:
        raise ValueError("選べないコマ数")
    rate = SIBLING[sibling][0]
    return int(v * (1 - rate))  # 切り捨て


def calc(inp, plan=None):
    """inp: dict（入力シートと同じ項目）。plan: 1〜3（省略で採用プラン）。"""
    p = plan or inp["pick"]
    course, koma = inp["plans"][p - 1][:2]
    grade = inp["grade"]
    s = inp["start"].replace(day=1)
    e = end_month(inp["start"], grade, inp.get("end_manual"))
    n = max(0, min(MAX_ROWS, (e.year - s.year) * 12 + e.month - s.month + 1))
    regular = not course.startswith("なし")
    tuition = plan_tuition(course, koma, grade, inp["sibling"])
    facility = int(FACILITY * SIBLING[inp["sibling"]][1]) if regular else 0
    jishu = JISHU if (regular and koma == "週1コマ" and inp["jishu"] == "申し込む") else 0
    sogo_price, sogo_kind = SOGO[inp["sogo"]]
    prep = sogo_price if sogo_kind == "month" else 0
    entry = inp.get("ov_entry")
    if entry is None:
        entry = 0 if inp["sibling"] != "なし" else (ENTRY_FEE // 2 if inp["referral"] == "あり" else ENTRY_FEE)
    prt = inp.get("ov_print")
    if prt is None:
        prt = PRINT_FEE[grade]
    transfer = min(TRANSFER, prt) if inp["transfer"] == "あり" else 0
    test = inp.get("ov_test")
    if test is None:
        test = TEST_OPTIONS[inp["test"]]
    ins = inp.get("ov_ins")
    if ins is None:
        ins = INSURANCE // 2 if s.month in INSURANCE_HALF_MONTHS else INSURANCE
    early = EARLY if inp["early"] == "適用する" else 0
    # 総合型（一括・分割）
    one = sogo_price if sogo_kind == "one" else 0
    k = 1 if (inp["sogo_n"] == "一括" or one == 0) else max(1, min(6, n - 1))
    rows = []
    for i in range(n):
        m = month_add(s, i)
        r = dict(month=m, tuition=tuition, facility=facility, jishu=jishu, prep=prep,
                 goukaku=GOUKAKU_MONTHLY if (grade == "高3" and inp["goukaku"] == "受講する" and m.month in GOUKAKU_MONTHS) else 0,
                 sogo=0, entry=0, print=0, ins=0, test=0, discount=0)
        if one:
            if k == 1:
                r["sogo"] = one if i == 0 else 0
            elif 1 <= i <= k:
                r["sogo"] = one // k + (one - one // k * k if i == 1 else 0)
        if i == 0:
            r.update(entry=entry, print=prt, ins=ins, test=test, discount=-(early + transfer))
        r["total"] = sum(v for kk, v in r.items() if kk != "month")
        r["pay"] = "初回授業時（現金）" if i == 0 else debit_date(m)
        rows.append(r)
    return dict(n=n, end=e, tuition=tuition, facility=facility, jishu=jishu, prep=prep,
                monthly=tuition + facility + jishu + prep, entry=entry, print=prt, transfer=transfer,
                test=test, ins=ins, early=early, sogo_one=one, sogo_k=k, rows=rows,
                initial=rows[0]["total"] if rows else 0, total=sum(r["total"] for r in rows))
