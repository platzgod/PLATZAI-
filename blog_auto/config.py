"""設定値。秘密情報（パスワード・APIキー）は環境変数から読み、ここには書かない。"""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CORPUS_DIR = BASE_DIR / "corpus"          # 過去記事
STYLE_DIR = BASE_DIR / "style"            # 文体ガイド
INPUT_DIR = BASE_DIR / "inputs"           # 塾長のメモ・テーマ候補
OUTPUT_DIR = BASE_DIR / "output"          # 生成した記事（履歴）

SITE_URL = os.environ.get("WP_URL", "https://platz2017.com").rstrip("/")
WP_USER = os.environ.get("WP_USER", "")
WP_APP_PASSWORD = os.environ.get("WP_APP_PASSWORD", "")

# WordPress のカテゴリID（/wp/v2/categories で確認済み）
CATEGORIES = {
    "blog": 10,   # 塾長ブログ
    "story": 11,  # PLATZ STORY
}
KIND_LABEL = {"blog": "塾長ブログ", "story": "PLATZ STORY"}

MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
