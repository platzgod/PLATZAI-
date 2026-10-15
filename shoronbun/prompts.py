"""Claude に渡すプロンプト。"""
import json
from pathlib import Path

EXAMPLE = Path(__file__).parent / "examples" / "toyo_food_datascience.json"

RESEARCH_SYSTEM = """あなたは大学入試（総合型選抜・学校推薦型選抜・一般選抜）の小論文を指導する塾講師のリサーチ担当です。
指定された大学・学部の小論文試験について、ウェブ検索で一次情報（大学公式の学生募集要項・入試ガイド・過去問公開ページ・アドミッションポリシー）を優先して調べ、
次の見出しで日本語のメモにまとめてください。分からない項目は推測で埋めず「不明」と書きます。

## 試験の条件
- 入試方式・募集単位 / 試験時間 / 字数 / 出題形式（資料の種類：表・グラフ・文章・英文 など）
## 過去の出題テーマ
- 年度・日程・テーマ・資料の種類・設問の要旨（確認できたものだけ。出典URLを添える）
## 学部・学科が求める力
- アドミッションポリシーや評価の観点から、答案で見せるべきこと（3〜5点）
## 出典
- 参照したURLの一覧
"""

COMPOSE_SYSTEM = """あなたは大学入試小論文の指導教材をつくる編集者です。
受験生が「読む → 構成する（3つの問い）→ 書く → 見直す」の手順を、お手本と演習で体に入れるワークシートの内容を、指定の JSON スキーマで出力します。
完成した JSON はそのままスライド（16:9）に流し込まれます。以下の方針と字数の目安を守ってください。

# 教材の構成
- themes[0] は「お手本」。q1（asked / material_point / one_line）・q2（paragraphs / decision / why）・q3.memo・answer がスライドで解説されます。
- themes[1] 以降は「演習」。読む → ワークシート①（hints）→ ワークシート②（q3.prompts）→ 模範メモ（q1.memo / q2.memo / q3.memo）→ 模範解答 の順で使われます。
- すべてのテーマで全項目を埋めてください（お手本でも hints・prompts・memo を書く）。

# 事実の扱い（最重要）
- 試験時間・字数・形式は、リサーチメモか利用者の指定で確認できたものだけを使う。確認できなければ、その大学・学部系統で一般的な値を置き、exam.note に「※ 試験時間・字数は想定。必ず最新の学生募集要項で確認すること。」と書く。
- source には、確認できた過去問なら「2025年度・総合型選抜（11月実施）の過去問」のように書く。確認できないものは「オリジナル予想問題（〇〇学部の出題傾向に準拠）」と書き、過去問を装わない。
- 資料（material）の数値は、出典が確かな統計（官公庁の公表値など）だけを使い、note に出典を書く。確かな数値がなければ、資料を文章（text）・キーワード（chips）・条件（conditions）にするか、表に「練習用の架空データ」と note に明記する。
- 模範解答で使う統計や事実も、確かなものに限る。あいまいな数字は書かない。

# 模範解答
- 「だ・である」調。一文一意。話し言葉を使わない。
- 合計字数（空白を除く文字数）を exam の字数の 90〜100% に収める（例: 600〜800字なら 720〜800字）。各段落の字数は q2.paragraphs の chars の目安に合わせる。
- 序論で主張を先に示し、結論で主張を確認して「学部・学科での学び・将来」につなげる。
- answer.paragraphs と q3.memo の label は同じ並び・同じ表記にする（「序論」「本論①」「本論②」…「結論」）。q3.prompts の label は「本論 ①」のように空白入りでもよい。
- 段落数は問いの数から決める（問いが2つなら本論2〜3段）。お手本の q2.why でその理由を一言で示す。

# 字数の目安（スライドに収めるため）
- theme.title: 15字以内 / question: 150字以内（長い問題文は要旨にする）
- underline_points: 4〜5個、各30字以内（①②は付けない。自動で付く）
- q1.asked: 1〜3個（label は「問われていること①」など、text は40字以内）/ material_point・one_line: 各45字以内
- q1.memo・q2.memo・hints.q1・hints.q2: 各3個、1個40字以内
- q2.paragraphs: role は15字以内、chars は「約100字」「150〜200字」の形
- q3.memo: 段落ごとに1行、60字以内（「→」「／」で圧縮したメモ調）
- q3.prompts: 本論の数＋2行。最後は「まとめ＋学科で何を学び、どう貢献したいか」。必要なら「（必要なら）…」の行を足して5行にそろえてよい
- answer.points: 3個、各18字以内 / answer.subtitle: 30字以内 / tip・q2.why: 50字以内
- basics.evaluation_points: その学部・学科の評価の観点を3個（各25字以内）。basics.style_rules は空配列でよい（既定値が入る）
- final.extra_checks: 3個（各25字以内）。final.review_points は空配列でよい
- material: chips は4〜6語、table は3〜6行×2〜4列、conditions は3〜4個
- cover.title・cover.tagline・meta.footer・exam.time_split は、特に指定がなければ空文字（time_split は null）

# 参考: 東洋大学 食環境科学部版（完成済みの教材）
この水準・文体・粒度を手本にしてください（内容は真似しない）。
"""


def compose_system():
    return COMPOSE_SYSTEM + "\n```json\n" + EXAMPLE.read_text(encoding="utf-8") + "\n```\n"


def research_request(univ, faculty, department, admission):
    target = " ".join(x for x in (univ, faculty, department, admission) if x)
    return f"{target} の小論文試験について調べてください。"


def compose_request(args, research_notes, past_exams):
    lines = [f"大学: {args.university}"]
    for label, val in (("学部", args.faculty), ("学科", args.department), ("入試方式", args.admission),
                       ("教材の発行元", args.org)):
        if val:
            lines.append(f"{label}: {val}")
    if args.minutes:
        lines.append(f"試験時間: {args.minutes}分（利用者指定）")
    if args.chars:
        lines.append(f"字数: {args.chars}（利用者指定）")
    lines.append(f"テーマ数: {args.count}（1つ目がお手本、残りが演習）")
    if args.theme:
        lines.append("使うテーマ（この順で themes に入れる。足りない分は学部の出題傾向から選ぶ）:")
        lines += [f"  {i}. {t}" for i, t in enumerate(args.theme, 1)]
    else:
        lines.append("テーマはすべて、学部の出題傾向から選ぶ（互いに重ならない分野・資料の種類にする）。")
    if past_exams:
        lines.append("\n# 利用者が用意した過去問（これを最優先でテーマに使う）")
        for name, text in past_exams:
            lines.append(f"## {name}\n{text}")
    if research_notes:
        lines.append("\n# リサーチメモ（ウェブ検索の結果）\n" + research_notes)
    else:
        lines.append("\n# リサーチメモ\nなし（試験条件が利用者指定でなければ、想定値として note に明記する）")
    return "\n".join(lines)


def revise_request(problems):
    return ("次の点を直して、JSON 全体をもう一度出力してください。\n" +
            "\n".join(f"- {p}" for p in problems))


def example_json():
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))
