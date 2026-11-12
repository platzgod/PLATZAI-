"""WordPress REST API とのやりとり。

platz2017.com では /wp-json/ が 403 でブロックされているが、
?rest_route=/wp/v2/... の形式なら届くので、両方を順に試す。
投稿にはアプリケーションパスワード（Basic 認証）を使う。
"""
from __future__ import annotations

import requests

from .config import SITE_URL, WP_APP_PASSWORD, WP_USER

TIMEOUT = 60
HEADERS = {"User-Agent": "platz-blog-auto/1.0"}


def _urls(route: str) -> list[tuple[str, dict]]:
    return [
        (f"{SITE_URL}/wp-json{route}", {}),
        (f"{SITE_URL}/", {"rest_route": route}),
    ]


def _request(method: str, route: str, *, params=None, json=None, auth=None, files=None, headers=None):
    last = None
    for url, extra in _urls(route):
        r = requests.request(
            method,
            url,
            params={**extra, **(params or {})},
            json=json,
            auth=auth,
            data=files,
            headers={**HEADERS, **(headers or {})},
            timeout=TIMEOUT,
        )
        # 403/404 がサイト側のブロック（HTML のエラーページ）なら次の形式を試す
        is_json = r.headers.get("content-type", "").startswith("application/json")
        if r.status_code in (403, 404) and not is_json:
            last = r
            continue
        return r
    return last


def public_get(route: str, params: dict) -> tuple[list, int]:
    r = _request("GET", route, params=params)
    r.raise_for_status()
    return r.json(), int(r.headers.get("X-WP-TotalPages", "1"))


def _auth():
    if not (WP_USER and WP_APP_PASSWORD):
        raise RuntimeError("WP_USER / WP_APP_PASSWORD が設定されていません（GitHub の Secrets に登録してください）")
    return (WP_USER, WP_APP_PASSWORD.replace(" ", ""))


def _check(r, what: str):
    if r.status_code >= 400:
        raise RuntimeError(f"{what} に失敗しました: HTTP {r.status_code}\n{r.text[:800]}")
    return r.json()


def check_login() -> dict:
    """アプリケーションパスワードで認証できるか確認する。"""
    r = _request("GET", "/wp/v2/users/me", params={"context": "edit"}, auth=_auth())
    return _check(r, "WordPress へのログイン確認")


def create_draft(*, title: str, content: str, category_id: int, excerpt: str = "", slug: str = "") -> dict:
    """記事を『下書き』として登録する（公開はしない）。"""
    body = {
        "title": title,
        "content": content,
        "excerpt": excerpt,
        "status": "draft",
        "categories": [category_id],
    }
    if slug:
        body["slug"] = slug
    r = _request("POST", "/wp/v2/posts", json=body, auth=_auth())
    return _check(r, "下書きの登録")
