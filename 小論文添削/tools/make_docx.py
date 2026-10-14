"""添削結果 JSON から「<元ファイル名>_添削完了.docx」を生成する。

使い方:
    python tools/make_docx.py <添削結果.json> <出力先.docx>

JSON の形式は tools/sample_result.json を参照。
指摘箇所は corrections[].target（原文中の文字列そのまま）で指定する。
丸数字は原文での出現順に自動で振り直すので、corrections の並び順は問わない。
"""

import json
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

FONT_NAME = "游明朝"
FONT_SIZE = Pt(10.5)
RED = RGBColor(0xFF, 0x00, 0x00)


def circled(n):
    """1〜20 は ①〜⑳、21 以降は (21)(22)…"""
    return chr(0x2460 + n - 1) if 1 <= n <= 20 else f"({n})"


def set_run_font(run, size=None, bold=False, color=None):
    run.font.name = FONT_NAME
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT_NAME)
    run.font.size = size or FONT_SIZE
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color


def set_red_underline(run):
    """文字色は変えず、下線だけを赤にする。"""
    rPr = run._element.get_or_add_rPr()
    u = OxmlElement("w:u")
    u.set(qn("w:val"), "single")
    u.set(qn("w:color"), "FF0000")
    rPr.append(u)


def add_text(doc, text, size=None, bold=False, align=None):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    set_run_font(p.add_run(text), size=size, bold=bold)
    return p


def add_heading(doc, text):
    add_text(doc, text, size=Pt(12), bold=True)


def add_multiline(doc, text):
    for line in text.splitlines():
        add_text(doc, line)


def locate(original, corrections):
    """各指摘の (開始, 終了) を求め、出現順に並べる。見つからない・重なる場合はエラー。"""
    spans = []
    for c in corrections:
        target = c["target"]
        occurrence = c.get("occurrence", 1)
        start = -1
        for _ in range(occurrence):
            start = original.find(target, start + 1)
            if start < 0:
                sys.exit(f"エラー: 原文に「{target}」が{occurrence}回目まで見つかりません。")
        spans.append((start, start + len(target), c))
    spans.sort(key=lambda s: s[0])
    for (s1, e1, c1), (s2, _, c2) in zip(spans, spans[1:]):
        if s2 < e1:
            sys.exit(f"エラー: 指摘箇所が重なっています:「{c1['target']}」と「{c2['target']}」")
    return spans


def add_marked_body(doc, original, spans):
    """原文を掲載し、指摘箇所に赤下線、その直後に赤字の丸数字を付ける。"""
    segments = []  # (文字列, 下線の有無, 直後に付ける番号 or None)
    pos = 0
    for n, (start, end, _) in enumerate(spans, 1):
        if pos < start:
            segments.append((original[pos:start], False, None))
        segments.append((original[start:end], True, n))
        pos = end
    if pos < len(original):
        segments.append((original[pos:], False, None))

    p = doc.add_paragraph()
    for text, underlined, number in segments:
        for i, part in enumerate(text.split("\n")):
            if i > 0:
                p = doc.add_paragraph()
            if part:
                run = p.add_run(part)
                set_run_font(run)
                if underlined:
                    set_red_underline(run)
        if number is not None:
            set_run_font(p.add_run(circled(number)), color=RED)


def build(data, out_path):
    original = data["original_text"].replace("\r\n", "\n")
    spans = locate(original, data.get("corrections", []))

    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = FONT_NAME
    normal.font.size = FONT_SIZE
    normal.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT_NAME)

    # 1. 見出し
    add_text(doc, "小論文 添削結果", size=Pt(16), bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_text(doc, f"生徒名：{data.get('student') or '不明'}")
    add_text(doc, f"志望大学：{data.get('university') or '不明'}")
    add_text(doc, f"学部：{data.get('faculty') or '不明'}")
    if data.get("prompt"):
        add_text(doc, f"設問：{data['prompt']}")

    # 2. 本文（添削入り）
    add_heading(doc, "【本文（添削入り）】")
    add_marked_body(doc, original, spans)

    # 3. 改善アドバイス
    add_heading(doc, "【改善アドバイス】")
    if not spans:
        add_text(doc, "指摘事項はありません。")
    for n, (_, _, c) in enumerate(spans, 1):
        add_text(doc, f"{circled(n)}「{c['target']}」", bold=True)
        add_text(doc, f"指摘内容：{c['issue']}")
        criteria = "・".join(c.get("criteria", []))
        reason = c.get("reason", "")
        add_text(doc, f"理由：［{criteria}］{reason}" if criteria else f"理由：{reason}")
        add_text(doc, f"改善の方向性：{c['suggestion']}")

    # 4. 添削例
    add_heading(doc, "【添削例（改善後の完成文）】")
    if data.get("length_note"):
        add_text(doc, data["length_note"])
    add_multiline(doc, data["revised_text"])

    # 5. アドミッションポリシー
    add_heading(doc, "【参照したアドミッションポリシー】")
    policy = data.get("admission_policy") or {}
    for line in policy.get("summary", []):
        add_text(doc, f"・{line}")
    for url in policy.get("sources", []):
        add_text(doc, f"出典：{url}")
    if policy.get("note"):
        add_text(doc, policy["note"])
    if not policy:
        add_text(doc, "志望校が特定できなかったため、固定基準のみで添削しました。")

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_path)
    print(f"保存しました: {out_path}（指摘 {len(spans)} 件）")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        build(json.load(f), sys.argv[2])
