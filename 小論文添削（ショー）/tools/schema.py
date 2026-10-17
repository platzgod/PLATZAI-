"""ワークシートの内容 JSON の形。

Claude の構造化出力（output_config.format）にそのまま渡せる JSON Schema と、
レンダリング前のチェック（validate）をまとめる。
"""
import jsonschema

S = {"type": "string"}
SA = {"type": "array", "items": S}


def obj(**props):
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


LABELED = obj(label=S, text=S)  # label は「序論」「本論①」「結論」など

THEME = obj(
    title=S,                      # 例: 農業経営体数の推移
    source=S,                     # 例: 2026年度・自己推薦（12月14日実施）の過去問 / オリジナル予想問題（〇〇大の出題傾向に準拠）
    question=S,                   # 問題文（要旨）
    material=obj(
        type={"type": "string", "enum": ["table", "chips", "conditions", "text", "none"]},
        heading=S,                # 資料ブロックの見出し（例: 資料に挙げられた機能）
        columns=SA,               # table のときの見出し行
        rows={"type": "array", "items": SA},  # table のときの各行
        items=SA,                 # chips / conditions のときの項目
        text=S,                   # text のときの資料本文（要旨）
        note=S,                   # table の出典など（任意・空文字可）
    ),
    underline_points=SA,          # 「読むときに線を引くところ」4〜5個（①②は自動で付く）
    q1=obj(
        asked={"type": "array", "items": LABELED},  # label: 問われていること①… / text: 内容
        material_point=S,         # 資料のポイント
        one_line=S,               # 一言でいうと
        memo=SA,                  # 模範メモ用 Q1 の箇条書き（3個）
    ),
    q2=obj(
        lead=S,                   # お手本 Q2 のリード文
        paragraphs={"type": "array", "items": obj(label=S, chars=S, role=S)},
        decision=S,               # 例: 5段落（序論1・本論3・結論1）。合計700〜750字をねらう。
        why_title=S,              # 例: なぜ3段？
        why=S,
        memo=SA,                  # 模範メモ用 Q2 の箇条書き（3個）
    ),
    q3=obj(
        memo={"type": "array", "items": LABELED},     # 段落ごとのメモ（模範）
        prompts={"type": "array", "items": LABELED},  # ワークシート②の問いかけ（段落ごと）
    ),
    hints=obj(q1=SA, q2=SA),     # ワークシート①のヒント（各3個）
    tip=S,                        # お手本 Q1 のフッター「コツ」
    answer=obj(
        subtitle=S,               # 模範解答スライドのサブタイトル（例: 選んだ機能：水源の涵養／5段落）
        paragraphs={"type": "array", "items": LABELED},
        points=SA,                # ポイント（3個・各20字以内）
    ),
)

WORKSHEET_SCHEMA = obj(
    meta=obj(
        university=S,             # 例: 東洋大学
        faculty=S,                # 例: 食環境科学部
        admission=S,              # 例: 総合型選抜
        target=S,                 # 例: 対象：食環境科学部 フードデータサイエンス学科（第1部）自己推薦入試志願者
        org=S,                    # 例: 個人指導塾PLATZ
        footer=S,                 # 空文字なら「{org}　{university} {faculty} 小論文ワークシート」
    ),
    exam=obj(
        minutes={"type": "integer"},
        chars_min={"type": ["integer", "null"]},   # 「800字以内」型なら null
        chars_max={"type": "integer"},
        time_split={"type": ["array", "null"], "items": {"type": "integer"}},  # [読む, 構成, 書く, 見直す]。null なら自動
        format_label=S,           # 例: 資料＋意見
        format_caption=S,         # 例: 資料を読み解いて意見を述べる形式
        overview=SA,              # 試験の全体像の説明（2段落）
        note=S,                   # 注意書き
    ),
    cover=obj(title=S, tagline=S),  # 空文字なら既定値
    basics=obj(style_rules=SA, evaluation_points=SA),
    themes={"type": "array", "items": THEME},
    final=obj(review_points=SA, extra_checks=SA),
)


class ContentError(ValueError):
    pass


def validate(data):
    """スキーマ違反と、レイアウトが崩れる内容の不整合を検出する。"""
    try:
        jsonschema.validate(data, WORKSHEET_SCHEMA)
    except jsonschema.ValidationError as e:
        path = "/".join(str(p) for p in e.absolute_path)
        raise ContentError(f"{path}: {e.message}") from None
    errs = []
    if not data["themes"]:
        errs.append("themes が空です")
    for i, th in enumerate(data["themes"], 1):
        mat = th["material"]
        if mat["type"] == "table" and (not mat["columns"] or not mat["rows"]):
            errs.append(f"テーマ{i}: table には columns と rows が必要です")
        if mat["type"] in ("chips", "conditions") and not mat["items"]:
            errs.append(f"テーマ{i}: {mat['type']} には items が必要です")
        if mat["type"] == "text" and not mat["text"]:
            errs.append(f"テーマ{i}: text には text が必要です")
        if not 2 <= len(th["q2"]["paragraphs"]) <= 7:
            errs.append(f"テーマ{i}: 段落数は2〜7にしてください")
        labels = [p["label"] for p in th["answer"]["paragraphs"]]
        if [m["label"] for m in th["q3"]["memo"]] != labels:
            errs.append(f"テーマ{i}: q3.memo と answer.paragraphs の段落ラベルが一致しません")
        if len(th["underline_points"]) > 10:
            errs.append(f"テーマ{i}: underline_points は10個までです")
    if errs:
        raise ContentError("\n".join(errs))
    return data


def char_report(data):
    """各テーマの模範解答の字数を数え、規定字数との差を返す。"""
    from render import count_chars
    ex = data["exam"]
    lo, hi = ex["chars_min"] or int(ex["chars_max"] * 0.9), ex["chars_max"]
    out = []
    for i, th in enumerate(data["themes"], 1):
        counts = [count_chars(p["text"]) for p in th["answer"]["paragraphs"]]
        total = sum(counts)
        out.append({"theme": i, "title": th["title"], "total": total, "counts": counts,
                    "ok": max(lo, int(hi * 0.9)) <= total <= hi})
    return out
