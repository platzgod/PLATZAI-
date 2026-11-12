"""過去記事を WordPress の公開 REST API から集めて corpus/ に保存する。

使い方:
    python -m blog_auto.collect

/wp-json/ は 403 でブロックされているため、?rest_route= 形式で取得する。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

from .config import CATEGORIES, CORPUS_DIR, SITE_URL
from .wordpress import public_get


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    lines = []
    for el in soup.find_all(["p", "h2", "h3", "h4", "h5", "h6", "li"]):
        t = el.get_text().strip()
        if not t:
            continue
        if el.name.startswith("h"):
            t = f"■ {t}"
        lines.append(t)
    return "\n".join(lines)


def collect_category(kind: str) -> list[dict]:
    cat_id = CATEGORIES[kind]
    posts: list[dict] = []
    page = 1
    while True:
        items, total_pages = public_get(
            "/wp/v2/posts",
            {"categories": cat_id, "per_page": 100, "page": page, "orderby": "date", "order": "desc"},
        )
        for p in items:
            html = p["content"]["rendered"]
            posts.append(
                {
                    "id": p["id"],
                    "date": p["date"],
                    "title": BeautifulSoup(p["title"]["rendered"], "lxml").get_text().strip(),
                    "link": p["link"],
                    "categories": p["categories"],
                    "html": html,
                    "text": html_to_text(html),
                    "images": len(re.findall(r"<img ", html)),
                }
            )
        if page >= total_pages:
            break
        page += 1
    return posts


def main() -> None:
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    for kind in CATEGORIES:
        posts = collect_category(kind)
        out = CORPUS_DIR / f"{kind}.json"
        out.write_text(json.dumps(posts, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{kind}: {len(posts)} 件 → {out}  ({SITE_URL})")


if __name__ == "__main__":
    main()
