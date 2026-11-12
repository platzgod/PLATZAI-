"""記事の生成（調査 → 執筆）を Claude API で行う。

1. 調査: web_search / web_fetch でネットを調べ、テーマと事実メモ（出典つき）をまとめる。
2. 執筆: 文体ガイドと過去記事を手本に、調査メモだけを根拠として記事を書く（JSON で受け取る）。
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import anthropic

from .config import CORPUS_DIR, KIND_LABEL, MODEL, STYLE_DIR

JST = timezone(timedelta(hours=9))
BETAS = ["server-side-fallback-2026-07-01"]

WEB_TOOLS = [
    {
        "type": "web_search_20260209",
        "name": "web_search",
        "max_uses": 10,
        "user_location": {"type": "approximate", "country": "JP", "region": "Gunma", "timezone": "Asia/Tokyo"},
    },
    {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 10},
]

ARTICLE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "記事タイトル"},
        "slug": {"type": "string", "description": "URL用の短い英小文字とハイフン（例: entrance-exam-interview）"},
        "excerpt": {"type": "string", "description": "一覧に出る抜粋。80〜120字"},
        "featured_image": {"type": "string", "description": "アイキャッチ画像として画像生成AIに作らせる場面の説明"},
        "blocks": {
            "type": "array",
            "description": "本文。上から順に並べる",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["heading", "paragraph", "image"]},
                    "text": {
                        "type": "string",
                        "description": "heading: 見出し文 / paragraph: 段落（行内の改行は \\n） / image: 画像生成AIに作らせる場面の説明",
                    },
                },
                "required": ["type", "text"],
                "additionalProperties": False,
            },
        },
        "sources": {
            "type": "array",
            "description": "本文の事実の根拠にした情報源",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "url": {"type": "string"},
                    "used_for": {"type": "string", "description": "本文のどの事実に使ったか"},
                },
                "required": ["title", "url", "used_for"],
                "additionalProperties": False,
            },
        },
        "check_points": {
            "type": "array",
            "description": "公開前に塾長が確かめるべき点（数字・年度・固有名詞・言い切りの強い表現など）",
            "items": {"type": "string"},
        },
    },
    "required": ["title", "slug", "excerpt", "featured_image", "blocks", "sources", "check_points"],
    "additionalProperties": False,
}


def today_jst() -> datetime:
    return datetime.now(JST)


def load_corpus(kind: str) -> list[dict]:
    path = CORPUS_DIR / f"{kind}.json"
    if not path.exists():
        raise FileNotFoundError(f"{path} がありません。先に python -m blog_auto.collect を実行してください")
    return json.loads(path.read_text(encoding="utf-8"))


def pick_examples(posts: list[dict], n: int = 5, min_len: int = 500) -> list[dict]:
    """手本にする記事: 新しい順に、十分な長さのものを n 本。"""
    return [p for p in posts if len(p["text"]) >= min_len][:n]


def style_text(kind: str) -> str:
    return (STYLE_DIR / "common.md").read_text(encoding="utf-8") + "\n\n" + (
        STYLE_DIR / f"{kind}.md"
    ).read_text(encoding="utf-8")


def _final_text(msg) -> str:
    return "".join(b.text for b in msg.content if b.type == "text").strip()


def _run(client: anthropic.Anthropic, *, system: str, messages: list, tools=None, output_config=None, log=print):
    """ストリーミングで呼び出し、pause_turn なら続きを依頼する。"""
    messages = list(messages)
    kwargs = dict(
        model=MODEL,
        max_tokens=32000,
        system=system,
        betas=BETAS,
        fallbacks="default",
        output_config=output_config or {"effort": "high"},
    )
    if tools:
        kwargs["tools"] = tools
    for _ in range(6):
        with client.beta.messages.stream(messages=messages, **kwargs) as stream:
            msg = stream.get_final_message()
        log(f"  [api] stop_reason={msg.stop_reason} model={msg.model} "
            f"in={msg.usage.input_tokens} out={msg.usage.output_tokens}")
        if msg.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": msg.content})
            continue
        if msg.stop_reason == "refusal":
            raise RuntimeError(f"Claude が生成を断りました: {getattr(msg, 'stop_details', None)}")
        if msg.stop_reason == "max_tokens":
            raise RuntimeError("出力が長すぎて途中で切れました（max_tokens）")
        return msg
    raise RuntimeError("調査が終わりませんでした（pause_turn が続きました）")


# ---------------------------------------------------------------- 1. 調査

def research(client, *, kind: str, posts: list[dict], topic: str | None, memo: str | None, log=print) -> str:
    now = today_jst()
    past_titles = "\n".join(f"- {p['date'][:10]} {p['title']}" for p in posts[:80])
    if memo:
        task = f"""今回は「型A: 教室の活動報告」です。下の塾長メモが記事の唯一の事実情報です。
メモの出来事に関連して、保護者や生徒に役立つ一般的な背景（例: その時期の学習の意味、
入試の日程など）を補うと良い場合だけ、ネットで確認してください。調査は少なくて構いません。

<塾長メモ>
{memo}
</塾長メモ>"""
    elif topic:
        task = f"今回のテーマは「{topic}」です。このテーマについて調べてください。"
    else:
        task = f"""今回のテーマはあなたが決めてください。
- 今は {now:%Y年%m月} です。この時期の保護者・生徒の関心（定期テスト、入試、長期休み、進路選択、
  教育ニュースなど）に合うもの。
- 最近の教育ニュース（大学入試・高校入試の制度変更、群馬県の入試、文部科学省の発表、学習に関する調査や研究）
  をネットで探し、新しくて保護者に役立つ話題を優先する。
- 下の過去記事と同じ内容は避ける（切り口が違えば同じ分野でもよい）。"""

    system = f"""あなたは群馬県太田市の個人指導塾 PLATZ の「{KIND_LABEL[kind]}」のための調査担当です。
記事を書く前の調査メモを作ります。今日は {now:%Y年%m月%d日} です。

{style_text(kind)}"""

    user = f"""{task}

<過去記事のタイトル（新しい順）>
{past_titles}
</過去記事のタイトル>

調査では、公的機関・大学・報道機関・研究機関など信頼できる情報源を優先し、
日付が新しいかを確認してください。数字や年度は、実際にページを開いて確かめてください。

最後に、次の形式で調査メモを日本語で出力してください。
## テーマ
（記事のテーマを1行で）
## このテーマにした理由
## 記事の切り口と構成案
## 事実メモ
- 事実（数字・年度・固有名詞を正確に）［出典: ページ名 URL］
## 出典一覧
- ページ名 URL"""

    log("● 調査中（ネット検索）...")
    msg = _run(client, system=system, messages=[{"role": "user", "content": user}], tools=WEB_TOOLS, log=log)
    return _final_text(msg)


# ---------------------------------------------------------------- 2. 執筆

def write_article(client, *, kind: str, posts: list[dict], notes: str, memo: str | None, log=print) -> dict:
    examples = "\n\n".join(
        f"<手本 タイトル=\"{p['title']}\" 日付=\"{p['date'][:10]}\">\n{p['text']}\n</手本>"
        for p in pick_examples(posts)
    )
    system = f"""あなたは群馬県太田市の個人指導塾 PLATZ の「{KIND_LABEL[kind]}」を書くライターです。
塾長本人が書いたと感じられる文章を書きます。

{style_text(kind)}

## 過去の記事（文体の手本。本文中の「■」は見出し）
{examples}"""

    n_img = "1〜3" if kind == "blog" else "1〜2"
    memo_part = f"\n<塾長メモ>\n{memo}\n</塾長メモ>\n" if memo else ""
    user = f"""次の調査メモをもとに、記事を1本書いてください。
{memo_part}
<調査メモ>
{notes}
</調査メモ>

守ること:
- 事実（数字・年度・制度・固有名詞・出来事）は、調査メモ{'と塾長メモ' if memo else ''}にあるものだけを使う。
  わからないことは書かない。生徒の発言・人数・成績などを作らない。
- 情報源の文章を写さず、手本の口調・リズム・改行のしかたで、塾長の言葉に置き換える。
- 段落（paragraph）は1〜2文。行内の改行は \\n で表す。「」の声かけは1行に独立させる。
- 見出し（heading）には「■」を付けない。
- 画像は画像生成AIで作る。本文の画像を入れたい位置に image ブロックを置き（{n_img}枚）、
  featured_image にはアイキャッチ（記事一覧に出る横長の画像）を書く。どちらも
  「誰が・どこで・何をしている場面か」を具体的に1〜2文で書く。文字の入った画像、実在の学校・人物、
  記事にない出来事（例: 合格発表の掲示）は描かせない。活動報告の写真は塾長が撮るので、
  型Aでは本文の image は1枚までにし、残りは塾長の写真用に「（塾長の写真）〇〇の様子」と書く。
- sources には本文で使った事実の出典を、check_points には公開前に確かめてほしい点を入れる。"""

    log("● 執筆中...")
    msg = _run(
        client,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": ARTICLE_SCHEMA}},
        log=log,
    )
    return json.loads(_final_text(msg))


def generate(kind: str, *, topic: str | None = None, memo: str | None = None, log=print) -> tuple[dict, str]:
    client = anthropic.Anthropic()
    posts = load_corpus(kind)
    notes = research(client, kind=kind, posts=posts, topic=topic, memo=memo, log=log)
    article = write_article(client, kind=kind, posts=posts, notes=notes, memo=memo, log=log)
    return article, notes
