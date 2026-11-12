"""記事を1本作って、WordPress に下書きとして登録する。

使い方:
    python -m blog_auto.run blog                    # 塾長ブログ（テーマは自動で決める）
    python -m blog_auto.run blog --topic "〇〇"      # テーマを指定
    python -m blog_auto.run story                   # PLATZ STORY（メモがあれば活動報告、なければ勉強のコツ）
    python -m blog_auto.run blog --dry-run          # WordPress には登録せず、ファイルに保存するだけ
    python -m blog_auto.run check                   # WordPress にログインできるか確認

テーマの指定は inputs/blog_topics.md / inputs/story_topics.md にも書けます（「- [ ] テーマ」の形式）。
活動報告のメモは inputs/story/ に .md で置きます（使ったメモは inputs/story/used/ に移動します）。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from . import wordpress
from .config import CATEGORIES, INPUT_DIR, KIND_LABEL, OUTPUT_DIR
from .generate import generate, today_jst
from .render import char_count, to_html, to_markdown

TOPIC_LINE = re.compile(r"^(\s*-\s*\[)\s(\]\s*)(.+)$")


def next_topic(kind: str) -> tuple[str | None, Path | None, int | None]:
    path = INPUT_DIR / f"{kind}_topics.md"
    if not path.exists():
        return None, None, None
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        m = TOPIC_LINE.match(line)
        if m:
            return m.group(3).strip(), path, i
    return None, None, None


def mark_topic_done(path: Path, index: int, note: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    m = TOPIC_LINE.match(lines[index])
    lines[index] = f"{m.group(1)}x{m.group(2)}{m.group(3)}（{note}）"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def next_memo() -> Path | None:
    memos = sorted(p for p in (INPUT_DIR / "story").glob("*.md") if not p.name.startswith("_"))
    return memos[0] if memos else None


def write_summary(text: str) -> None:
    """GitHub Actions の実行結果ページに表示する。"""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="PLATZ ブログ記事の自動作成")
    ap.add_argument("kind", choices=["blog", "story", "check"])
    ap.add_argument("--topic", default="", help="テーマを指定する")
    ap.add_argument("--dry-run", action="store_true", help="WordPress に登録しない")
    ap.add_argument("--no-review-note", action="store_true", help="下書きの末尾に確認メモを付けない")
    args = ap.parse_args(argv)

    if args.kind == "check":
        me = wordpress.check_login()
        print(f"ログインできました: {me.get('name')}（権限: {', '.join(me.get('roles', []))}）")
        return 0

    kind = args.kind
    topic = args.topic.strip() or None
    topic_file = topic_index = None
    if not topic:
        topic, topic_file, topic_index = next_topic(kind)

    memo_path = next_memo() if kind == "story" and not args.topic else None
    memo = memo_path.read_text(encoding="utf-8") if memo_path else None
    if memo:
        topic = None  # メモがあるときはメモの内容を優先

    print(f"■ {KIND_LABEL[kind]} を作成します")
    print(f"  テーマ: {topic or ('活動報告メモ ' + memo_path.name if memo else '自動で決める')}")

    article, notes = generate(kind, topic=topic, memo=memo)
    html = to_html(article, kind, review_note=not args.no_review_note)

    now = today_jst()
    stem = f"{now:%Y-%m-%d}_{kind}_{article['slug'][:40] or 'post'}"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / f"{stem}.md").write_text(to_markdown(article, notes), encoding="utf-8")
    (OUTPUT_DIR / f"{stem}.html").write_text(html, encoding="utf-8")
    (OUTPUT_DIR / f"{stem}.json").write_text(json.dumps(article, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"  タイトル: {article['title']}（本文 {char_count(article)} 字）")
    print(f"  保存先: {OUTPUT_DIR / stem}.md")

    record = {
        "date": now.isoformat(timespec="seconds"),
        "kind": kind,
        "title": article["title"],
        "topic": topic,
        "memo": memo_path.name if memo_path else None,
        "file": f"{stem}.md",
        "wp_id": None,
        "wp_edit_url": None,
    }

    if args.dry_run:
        print("  --dry-run のため WordPress には登録していません")
    else:
        post = wordpress.create_draft(
            title=article["title"],
            content=html,
            excerpt=article["excerpt"],
            slug=article["slug"],
            category_id=CATEGORIES[kind],
        )
        record["wp_id"] = post["id"]
        record["wp_edit_url"] = f"{wordpress.SITE_URL}/wp-admin/post.php?post={post['id']}&action=edit"
        print(f"  WordPress に下書きを登録しました: {record['wp_edit_url']}")

    # テーマとメモを「使用済み」にする
    note = f"{now:%Y-%m-%d} 作成"
    if topic_file is not None:
        mark_topic_done(topic_file, topic_index, note)
    if memo_path:
        used = memo_path.parent / "used"
        used.mkdir(exist_ok=True)
        memo_path.rename(used / memo_path.name)

    hist_path = OUTPUT_DIR / "history.json"
    history = json.loads(hist_path.read_text(encoding="utf-8")) if hist_path.exists() else []
    history.append(record)
    hist_path.write_text(json.dumps(history, ensure_ascii=False, indent=1), encoding="utf-8")

    write_summary(
        f"## {KIND_LABEL[kind]}: {article['title']}\n\n"
        + (f"- WordPress の下書き: {record['wp_edit_url']}\n" if record["wp_edit_url"] else "- WordPress には未登録（dry-run）\n")
        + f"- 本文 {char_count(article)} 字 / 保存先 `blog_auto/output/{stem}.md`\n\n### 確認してほしい点\n"
        + "\n".join(f"- {c}" for c in article["check_points"])
        + "\n\n### 参考にした情報源\n"
        + "\n".join(f"- [{s['title']}]({s['url']})" for s in article["sources"])
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
