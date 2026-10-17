"""大学名・テーマを入れると、小論文ワークシート（.pptx）を作る。

    python3 tools/generate.py --university 早稲田大学 --faculty 人間科学部 \\
        --theme "少子高齢化と地域医療" --theme "AIと教育"

流れ: ①ウェブ検索で試験条件・過去問を調べる → ②Claude が内容 JSON を書く
      → ③字数・項目をチェックし、ずれていれば直させる → ④render.py でスライド化
出力: ワークシート/<大学>_<学部>/ に .pptx・内容 JSON・リサーチメモ を保存する。
JSON を手で直したら `python3 tools/render.py <json> <pptx>` で作り直せる。
"""
import argparse
import json
import re
import sys
from pathlib import Path

import anthropic

sys.path.insert(0, str(Path(__file__).parent))
import prompts  # noqa: E402
from render import render  # noqa: E402
from schema import WORKSHEET_SCHEMA, ContentError, char_report, validate  # noqa: E402

MODEL = "claude-opus-5-5"
BETAS = ["server-side-fallback-2026-07-01"]  # 安全分類器が断ったときは別モデルで再実行


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description="小論文ワークシート（.pptx）を作る")
    ap.add_argument("--university", required=True, help="大学名（例: 東洋大学）")
    ap.add_argument("--faculty", default="", help="学部（例: 食環境科学部）")
    ap.add_argument("--department", default="", help="学科（任意）")
    ap.add_argument("--admission", default="", help="入試方式（例: 総合型選抜）")
    ap.add_argument("--theme", action="append", default=[], help="テーマ（複数可。1つ目がお手本になる）")
    ap.add_argument("--count", type=int, default=4, help="テーマ数（既定 4。足りない分は AI が選ぶ）")
    ap.add_argument("--minutes", type=int, help="試験時間（分）。分かっていれば指定")
    ap.add_argument("--chars", help="字数（例: 600-800 / 800）。分かっていれば指定")
    ap.add_argument("--past-exam", action="append", default=[], help="過去問のテキストファイル（複数可）")
    ap.add_argument("--org", default="個人指導塾PLATZ", help="教材の発行元")
    ap.add_argument("--no-research", action="store_true", help="ウェブ検索をしない")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "ワークシート"),
                    help="出力先フォルダ（既定: このフォルダの ワークシート/）")
    ap.add_argument("--effort", default="high", choices=["low", "medium", "high", "xhigh", "max"])
    args = ap.parse_args(argv)
    args.count = max(args.count, len(args.theme), 1)
    return args


def check_refusal(resp):
    if resp.stop_reason == "refusal":
        raise SystemExit(f"Claude が生成を断りました: {resp.stop_details}")


def research(client, args):
    """web_search で試験条件と過去問を調べ、Markdown のメモを返す。"""
    messages = [{"role": "user", "content": prompts.research_request(
        args.university, args.faculty, args.department, args.admission)}]
    for _ in range(5):  # サーバー側ツールのループが pause_turn で止まったら続ける
        with client.beta.messages.stream(
            model=MODEL, max_tokens=32000, betas=BETAS, fallbacks="default",
            thinking={"type": "adaptive"}, output_config={"effort": "medium"},
            system=prompts.RESEARCH_SYSTEM, messages=messages,
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 8}],
        ) as stream:
            resp = stream.get_final_message()
        check_refusal(resp)
        if resp.stop_reason != "pause_turn":
            break
        messages.append({"role": "assistant", "content": resp.content})
    return "".join(b.text for b in resp.content if b.type == "text").strip()


def compose(client, messages, args):
    with client.beta.messages.stream(
        model=MODEL, max_tokens=64000, betas=BETAS, fallbacks="default",
        thinking={"type": "adaptive"},
        output_config={"effort": args.effort, "format": {"type": "json_schema", "schema": WORKSHEET_SCHEMA}},
        system=[{"type": "text", "text": prompts.compose_system(), "cache_control": {"type": "ephemeral"}}],
        messages=messages,
    ) as stream:
        resp = stream.get_final_message()
    check_refusal(resp)
    if resp.stop_reason == "max_tokens":
        raise SystemExit("出力が上限で切れました。--count を減らして再実行してください。")
    text = next(b.text for b in resp.content if b.type == "text")
    return resp, json.loads(text)


def problems_in(data, args):
    """作り直しを頼むべき点を列挙する（字数・ラベル・テーマ数）。"""
    probs = []
    try:
        validate(data)
    except ContentError as e:
        probs += str(e).splitlines()
    ex = data["exam"]
    lo = max(ex["chars_min"] or 0, int(ex["chars_max"] * 0.9))
    for r in char_report(data):
        if not r["ok"]:
            probs.append(f"テーマ{r['theme']}の模範解答が{r['total']}字です。{lo}〜{ex['chars_max']}字に収めてください"
                         f"（段落別: {r['counts']}）。字数は空白を除いた文字数で数えます。")
    if len(data["themes"]) != args.count:
        probs.append(f"themes を {args.count} 個にしてください（今は {len(data['themes'])} 個）。")
    return probs


def slug(s):
    return re.sub(r"[\\/:*?\"<>|\s]+", "_", s).strip("_")


def main(argv=None):
    args = parse_args(argv)
    client = anthropic.Anthropic()
    outdir = Path(args.out) / slug("_".join(x for x in (args.university, args.faculty) if x))
    outdir.mkdir(parents=True, exist_ok=True)

    notes = ""
    if not args.no_research:
        print("① 試験条件と過去問を調べています…", file=sys.stderr)
        notes = research(client, args)
        (outdir / "research.md").write_text(notes, encoding="utf-8")

    past = [(Path(p).name, Path(p).read_text(encoding="utf-8")) for p in args.past_exam]
    messages = [{"role": "user", "content": prompts.compose_request(args, notes, past)}]

    print("② 内容を書いています…", file=sys.stderr)
    for attempt in range(3):
        resp, data = compose(client, messages, args)
        probs = problems_in(data, args)
        if not probs:
            break
        print("③ 直してもらう点:\n  " + "\n  ".join(probs), file=sys.stderr)
        # 思考ブロックごと返して会話を続ける（履歴は追記のみ）
        messages += [{"role": "assistant", "content": resp.content},
                     {"role": "user", "content": prompts.revise_request(probs)}]
    else:
        print("※ 3回直しても残った点があります。JSON を確認してください。", file=sys.stderr)

    json_path = outdir / "content.json"
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    pptx_path = outdir / f"{slug(args.university)}_{slug(args.faculty)}_小論文ワークシート.pptx".replace("__", "_")
    try:
        render(data, pptx_path)
    except ContentError as e:
        raise SystemExit(f"内容 JSON に問題があり、スライドにできません:\n{e}\n→ {json_path} を直して render.py を実行")
    for r in char_report(data):
        print(f"  テーマ{r['theme']} {r['title']}: {r['total']}字 {'OK' if r['ok'] else '要確認'}", file=sys.stderr)
    print(pptx_path)


if __name__ == "__main__":
    main()
