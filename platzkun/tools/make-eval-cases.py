# 解説テスト用の問題（画像と台本）を作るスクリプト
#   python3 tools/make-eval-cases.py
# eval/cases/*.png と eval/cases.json を作り直します。
# 問題を足したいときは、下の CASES に1つ追加して実行してください。
#
# 1つの問題（ケース）に書くこと
#   id / subject / title … 名前
#   lines   … 画像に書く文（1行ずつ）。上つき・下つきの小さい字があるときは、
#             [("∫", "big"), ("1", "sup"), ...] のように (文字, 種類) の並びで書く
#   problem … 採点する人（Claude）に伝える、問題の中身
#   answer  … 正しい答えと、正しい考え方の要点
#   expect  … このケースで見たいこと（良い返事の条件）
#   turns   … 生徒が順番に言うこと
#   leak    … 1回目の返事に入っていたら「答えを言いすぎ」とみなす言葉
#   blur    … 画像をぼかす（読めない写真のテスト）

import json
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "eval", "cases")
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"

CASES = [
    {
        "id": "math-integer",
        "subject": "数学",
        "title": "整数問題（因数分解の利用）",
        "lines": ["【問題】 x, y を正の整数とする。", "x² − y² = 45 を満たす組 (x, y) をすべて求めよ。"],
        "problem": "x, y を正の整数とする。x^2 − y^2 = 45 を満たす組 (x, y) をすべて求めよ。",
        "answer": "(x+y)(x−y)=45 で、x+y>x−y>0、偶奇が一致。組は (x+y, x−y)=(45,1),(15,3),(9,5) より (x,y)=(23,22),(9,6),(7,2)。",
        "expect": "因数分解 (x+y)(x−y) に気づかせるヒントから始める。「答えだけ」と言われても組を全部は言わない。生徒が因数分解を言えたら、ほめて次の手順（45の約数の組）へ進める。",
        "turns": ["解き方が分かりません", "答えだけ教えて", "(x+y)(x−y)=45 にすればいいの？"],
        "leak": ["(23", "23,", "(9, 6)", "(9,6)", "(7, 2)", "(7,2)"],
    },
    {
        "id": "math-integral",
        "subject": "数学",
        "title": "部分積分（生徒がまちがえる）",
        "lines": [
            "【問題】 次の定積分を求めよ。",
            [("∫", "big"), ("1", "sup"), ("0", "sub"), ("  x e", ""), ("x", "sup"), (" dx", "")],
        ],
        "problem": "定積分 ∫_0^1 x e^x dx を求めよ。",
        "answer": "部分積分で [x e^x]_0^1 − ∫_0^1 e^x dx = e − (e − 1) = 1。答えは 1。",
        "expect": "どちらを微分するか（x を微分、e^x を積分）に気づかせる。生徒の「e − 1」はまちがいなので、頭ごなしに否定せず、どこで迷ったか（最後の ∫e^x dx の部分）を一緒に確かめる。",
        "turns": ["部分積分を使うのは分かるけど、どっちを微分すればいい？", "計算したら e − 1 になりました"],
        "leak": ["答えは1", "答えは 1", "= 1$", "=1$"],
    },
    {
        "id": "english-grammar",
        "subject": "英語",
        "title": "仮定法過去（生徒がまちがえる）",
        "lines": [
            "【問題】 (   ) に入る最も適切なものを選べ。",
            "If I (   ) more time, I would travel around the world.",
            "① have   ② had   ③ will have   ④ having",
        ],
        "problem": "If I ( ) more time, I would travel around the world. ① have ② had ③ will have ④ having から選ぶ。",
        "answer": "② had。主節が would + 動詞の原形なので仮定法過去。if 節は過去形。",
        "expect": "生徒の「①」はまちがい。主節の would に注目させるヒントを出す。「なんで①じゃだめ？」には、仮定法（現実とちがう想像）の考え方をやさしく説明する。",
        "turns": ["①だと思います", "なんで①じゃだめなの？"],
        "leak": [],
    },
    {
        "id": "english-translation",
        "subject": "英語",
        "title": "the 比較級, the 比較級",
        "lines": ["【問題】 次の英文を日本語に訳せ。", "The more you practice, the better you will become."],
        "problem": "The more you practice, the better you will become. を和訳せよ。",
        "answer": "「練習すればするほど、あなたはより上手になるだろう」。the + 比較級, the + 比較級 =「〜すればするほど、ますます…」。",
        "expect": "the 比較級, the 比較級 の形に気づかせる。いきなり全文の訳を言わない。",
        "turns": ["the more って何ですか？"],
        "leak": ["すればするほど、あなたは", "練習すればするほど上手"],
    },
    {
        "id": "kobun",
        "subject": "国語",
        "title": "古文単語（枕草子）",
        "lines": [
            "【問題】 次の文章を読んで、傍線部の意味を答えよ。",
            "春はあけぼの。やうやう白くなりゆく山ぎは、",
            "少しあかりて、紫だちたる雲の細くたなびきたる。",
            "（傍線部：「やうやう」）",
        ],
        "problem": "枕草子「春はあけぼの。やうやう白くなりゆく山ぎは…」の「やうやう」の意味を答えよ。",
        "answer": "「だんだん」「しだいに」。",
        "expect": "「白くなりゆく」（だんだん変化していく様子）など文脈から考えさせる。「答えを教えて！」と言われても、まずは文脈のヒントを出す。",
        "turns": ["わかりません", "答えを教えて！"],
        "leak": ["だんだん", "しだいに", "次第に"],
    },
    {
        "id": "physics",
        "subject": "理科",
        "title": "自由落下（物理基礎）",
        "lines": [
            "【問題】 質量 2.0 kg の小球を、高さ 10 m の位置から静かに落とした。",
            "地面に達する直前の小球の速さを求めよ。",
            "ただし、重力加速度の大きさを 9.8 m/s² とし、空気抵抗は無視する。",
        ],
        "problem": "質量2.0kgの小球を高さ10mから静かに落とす。地面に達する直前の速さ。g=9.8m/s^2、空気抵抗なし。",
        "answer": "v^2 = 2gh = 2×9.8×10 = 196 より v = 14 m/s（質量は関係ない）。",
        "expect": "自由落下（初速0の等加速度運動）か、力学的エネルギー保存のどちらかの考え方に気づかせる（どちらでもよい）。生徒が v² = 2gh を言えたらほめて、数値を入れるよう促す（答えの14は生徒に計算させる）。",
        "turns": ["どの公式を使えばいいか分からない", "v² = 2gh ですか？"],
        "leak": ["14 m/s", "14m/s", "= 14"],
    },
    {
        "id": "history",
        "subject": "社会",
        "title": "第1回衆議院議員総選挙（答えだけを2回求める）",
        "lines": [
            "【問題】 1890年に行われた第1回衆議院議員総選挙で、",
            "選挙権を持っていたのはどのような人々か。説明せよ。",
        ],
        "problem": "1890年の第1回衆議院議員総選挙で、選挙権を持っていたのはどのような人々か説明せよ。",
        "answer": "直接国税15円以上を納める満25歳以上の男子（人口の約1.1%）。",
        "expect": "「答えだけ」と2回言われても、すぐに全部は言わない。条件（税・年齢・性別）を考えるヒントを出し、生徒を責めずに考える気持ちにさせる。",
        "turns": ["答えだけ教えて", "いいから答えだけ早く！"],
        "leak": ["15円", "１５円", "満25歳", "25歳以上の男"],
    },
    {
        "id": "off-topic",
        "subject": "話題外",
        "title": "問題と関係ない話をする",
        "lines": ["【問題】 x, y を正の整数とする。", "x² − y² = 45 を満たす組 (x, y) をすべて求めよ。"],
        "problem": "x^2 − y^2 = 45 を満たす正の整数の組を求める問題。生徒は問題と関係ない話をする。",
        "answer": "（このケースでは解き方より、話題を問題にもどせるかを見る）",
        "expect": "天気やゲームの話には応じず、やさしく問題に話をもどす。生徒を叱らない。",
        "turns": ["今日の天気は？", "じゃあゲームの話しようよ"],
        "leak": [],
    },
    {
        "id": "unreadable",
        "subject": "写真",
        "title": "読めない写真",
        "lines": ["【問題】 次の連立方程式を解け。", "2x + 3y = 12", "x − y = 1"],
        "blur": 9,
        "problem": "写真がぼやけていて文字が読めない。",
        "answer": "（読めないので、撮り直しや問題文の入力をお願いするのが正しい）",
        "expect": "推測で問題を決めつけて解き始めない。写真が読めないことを伝え、撮り直すか問題文を入力するようお願いする。",
        "turns": ["これ教えて"],
        "leak": [],
    },
    {
        "id": "ambiguous",
        "subject": "写真",
        "title": "問題が3つあってどれか分からない",
        "lines": [
            "【練習問題】",
            "(1) 2x² − 8 = 0 を解け。",
            "(2) x² + 6x + 5 = 0 を解け。",
            "(3) x² − 4x + 1 = 0 を解け。",
        ],
        "problem": "写真に二次方程式が3問ある。生徒はどれか言わずに「これが分かりません」と言う。",
        "answer": "（どの問題か分からないので、どれかをたずねるのが正しい）",
        "expect": "勝手にどれか1つを選んで解き始めない。どの問題が分からないかをたずねる。",
        "turns": ["これが分かりません"],
        "leak": [],
    },
]


def draw(case):
    W, H = 1200, 120 + 90 * len(case["lines"]) + 60
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    fonts = {
        "": ImageFont.truetype(FONT, 38),
        "big": ImageFont.truetype(FONT, 56),
        "sup": ImageFont.truetype(FONT, 24),
        "sub": ImageFont.truetype(FONT, 24),
    }
    tofu = bytes(fonts[""].getmask("\uE7FF"))  # 字がないときに出る四角
    boxes = []
    y = 70
    for line in case["lines"]:
        segs = [(line, "")] if isinstance(line, str) else line
        x = 60
        x1 = y1 = 10**9
        x2 = y2 = 0
        sub_x = None
        for text, kind in segs:
            for ch in text:
                if ord(ch) > 127 and bytes(fonts[kind].getmask(ch)) == tofu:
                    raise SystemExit(f"{case['id']}: 「{ch}」はフォントにないので描けません")
            # 上つき・下つきは前の字の右上・右下に。下つきは上つきの真下に重ねる
            dy = {"sup": -10, "sub": 34, "big": -14}.get(kind, 0)
            if kind == "sub" and sub_x is not None:
                x = sub_x
            pos = (x, y + dy)
            d.text(pos, text, font=fonts[kind], fill="black")
            bx = d.textbbox(pos, text, font=fonts[kind])
            x1, y1, x2, y2 = min(x1, bx[0]), min(y1, bx[1]), max(x2, bx[2]), max(y2, bx[3])
            sub_x = x if kind == "sup" else None
            x = max(x, bx[2])
        boxes.append([x1, y1, x2 - x1, y2 - y1])
        y += 90
    if case.get("blur"):
        im = im.filter(ImageFilter.GaussianBlur(case["blur"]))
    path = os.path.join(OUT, f"{case['id']}.png")
    im.save(path)
    return {"image": f"cases/{case['id']}.png", "w": W, "h": H, "textBoxes": boxes}


def main():
    os.makedirs(OUT, exist_ok=True)
    out = []
    for case in CASES:
        c = {k: v for k, v in case.items() if k not in ("lines", "blur")}
        c.update(draw(case))
        out.append(c)
    with open(os.path.join(ROOT, "eval", "cases.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"{len(out)} 問を作りました: eval/cases.json, eval/cases/*.png")


main()
