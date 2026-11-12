"""記事データ（JSON）を WordPress 用の HTML と、確認用の Markdown にする。"""
from __future__ import annotations

from html import escape

# 過去記事に合わせた見出しタグ（塾長ブログは h5、PLATZ STORY は h3）
HEADING_TAG = {"blog": "h5", "story": "h3"}

NOTE_STYLE = "border:2px dashed #d33;padding:1em;margin-top:2em;background:#fff6f6;"


def _lines(text: str) -> str:
    return "<br />\n".join(escape(line.strip()) for line in text.strip().split("\n") if line.strip())


def to_html(article: dict, kind: str, *, review_note: bool = True) -> str:
    h = HEADING_TAG[kind]
    parts = []
    for b in article["blocks"]:
        t = b["text"].strip()
        if not t:
            continue
        if b["type"] == "heading":
            parts.append(f"<{h}>{escape(t.lstrip('■ '))}</{h}>")
        elif b["type"] == "image":
            parts.append(f'<p style="color:#d33;">【ここに画像：{escape(t)}】</p>')
        else:
            parts.append(f"<p>{_lines(t)}</p>")
    if review_note:
        parts.append(review_html(article))
    return "\n".join(parts)


def review_html(article: dict) -> str:
    src = "".join(
        f'<li><a href="{escape(s["url"])}" target="_blank" rel="noopener">{escape(s["title"])}</a>'
        f'（{escape(s["used_for"])}）</li>'
        for s in article["sources"]
    )
    chk = "".join(f"<li>{escape(c)}</li>" for c in article["check_points"])
    return (
        f'<div style="{NOTE_STYLE}">'
        "<p><strong>【下書きメモ】公開する前に、この枠ごと削除してください。</strong></p>"
        f"<p>■ 確認してほしい点</p><ul>{chk}</ul>"
        f"<p>■ 参考にした情報源</p><ul>{src}</ul>"
        "</div>"
    )


def to_markdown(article: dict, notes: str = "") -> str:
    out = [f"# {article['title']}", "", f"> {article['excerpt']}", ""]
    for b in article["blocks"]:
        if b["type"] == "heading":
            out += [f"## {b['text']}", ""]
        elif b["type"] == "image":
            out += [f"*【画像：{b['text']}】*", ""]
        else:
            out += ["  \n".join(b["text"].split("\n")), ""]
    out += ["---", "## 確認してほしい点"] + [f"- {c}" for c in article["check_points"]]
    out += ["", "## 参考にした情報源"] + [f"- [{s['title']}]({s['url']}) — {s['used_for']}" for s in article["sources"]]
    if notes:
        out += ["", "<details><summary>調査メモ</summary>", "", notes, "", "</details>"]
    return "\n".join(out) + "\n"


def char_count(article: dict) -> int:
    return sum(len(b["text"].replace("\n", "")) for b in article["blocks"] if b["type"] != "image")
