"""記事データ（JSON）を WordPress 用の HTML と、確認用の Markdown にする。"""
from __future__ import annotations

from html import escape

# 過去記事に合わせた見出しタグ（塾長ブログは h5、PLATZ STORY は h3）
HEADING_TAG = {"blog": "h5", "story": "h3"}


def _lines(text: str) -> str:
    return "<br />\n".join(escape(line.strip()) for line in text.strip().split("\n") if line.strip())


def to_html(article: dict, kind: str, images: dict | None = None) -> str:
    """WordPress に入れる本文。確認メモ・出典は入れない（GitHub 側にだけ残す）。

    images: {ブロック番号: {"id", "url"}} … アップロード済みの画像
    """
    images = images or {}
    h = HEADING_TAG[kind]
    parts = []
    for i, b in enumerate(article["blocks"]):
        t = b["text"].strip()
        if not t:
            continue
        if b["type"] == "heading":
            parts.append(f"<{h}>{escape(t.lstrip('■ '))}</{h}>")
        elif b["type"] == "image" and i in images:
            m = images[i]
            parts.append(
                f'<p><img loading="lazy" src="{escape(m["url"])}" alt="{escape(t)}" width="440" '
                f'class="alignnone wp-image-{m["id"]}" /></p>'
            )
        elif b["type"] == "image":
            parts.append(f'<p style="color:#d33;">【ここに画像：{escape(t)}】</p>')
        else:
            parts.append(f"<p>{_lines(t)}</p>")
    return "\n".join(parts)



def to_markdown(article: dict, notes: str = "", image_files: dict | None = None) -> str:
    """GitHub に残す確認用ファイル。image_files: {"featured": Path, "blocks": {番号: Path}}"""
    image_files = image_files or {"featured": None, "blocks": {}}
    out = [f"# {article['title']}", "", f"> {article['excerpt']}", ""]
    if image_files.get("featured"):
        out += [f"![アイキャッチ](images/{image_files['featured'].name})", ""]
    for i, b in enumerate(article["blocks"]):
        if b["type"] == "heading":
            out += [f"## {b['text']}", ""]
        elif b["type"] == "image" and i in image_files["blocks"]:
            out += [f"![{b['text']}](images/{image_files['blocks'][i].name})", ""]
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
