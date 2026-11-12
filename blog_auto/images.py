"""記事の画像（アイキャッチ・本文）を OpenAI の画像生成 AI で作る。

OPENAI_API_KEY が設定されていないときは画像を作らず、本文には「【ここに画像】」の目印を残す。
"""
from __future__ import annotations

import base64
import os
from pathlib import Path

IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2")
IMAGE_SIZE = os.environ.get("OPENAI_IMAGE_SIZE", "1536x1024")   # 横長（ブログのアイキャッチ向き）
IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "medium")  # low / medium / high

STYLE = (
    "日本の学習塾ブログに載せる、フリー素材のような自然な写真。"
    "群馬県の地方都市の、明るく清潔な教室や家庭の雰囲気。やわらかい自然光。"
    "画像の中に文字・ロゴ・看板・透かしを入れない。"
    "人物は日本人。顔がはっきり写りすぎない構図（後ろ姿・手元・横顔・ぼかし）にする。"
)


def enabled() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def generate_image(description: str, out_path: Path) -> Path:
    from openai import OpenAI

    client = OpenAI()
    result = client.images.generate(
        model=IMAGE_MODEL,
        prompt=f"{description}\n\n{STYLE}",
        size=IMAGE_SIZE,
        quality=IMAGE_QUALITY,
        output_format="jpeg",
        output_compression=85,
        n=1,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(result.data[0].b64_json))
    return out_path


def generate_all(article: dict, out_dir: Path, stem: str, log=print) -> dict:
    """アイキャッチと本文の画像を作る。

    戻り値: {"featured": Path | None, "blocks": {ブロック番号: Path}}
    """
    made = {"featured": None, "blocks": {}}
    if not enabled():
        log("  OPENAI_API_KEY がないため、画像は作りません（本文に目印を残します）")
        return made
    jobs = [("featured", article.get("featured_image", ""))] + [
        (i, b["text"]) for i, b in enumerate(article["blocks"]) if b["type"] == "image"
    ]
    for key, desc in jobs:
        if not desc.strip() or desc.strip().startswith("（塾長の写真）"):
            continue  # 活動報告の実際の写真は AI で作らない
        name = "eyecatch" if key == "featured" else f"img{key:02d}"
        path = out_dir / f"{stem}_{name}.jpg"
        try:
            generate_image(desc, path)
        except Exception as e:  # 画像が1枚失敗しても記事は登録する
            log(f"  画像の生成に失敗しました（{name}）: {e}")
            continue
        log(f"  画像を作りました: {path.name}")
        if key == "featured":
            made["featured"] = path
        else:
            made["blocks"][key] = path
    return made
