"""ウイングネット講座ガイド（PDF）から「合格一貫カリキュラム」14パターンを読み取り、JSON にする。

    python3 -I builder/parse_guide.py <講座ガイド.pdf> builder/guide_patterns.json

PDF の文字・図形の座標から読み取る（PyMuPDF）。
  - 見開き（左ページ：冬期講習〜夏期Ⅱ期、右ページ：9月〜直前Ⅱ期＋共通テスト講座の一覧）
  - 科目の行ごとに、濃い帯＝講座、薄い延長＝※推奨受講期間、帯の下段＝ユニット（練成1 など）
"""
import json
import re
import sys

import pymupdf

SPREADS = [(20, 21), (22, 23), (24, 25), (26, 27), (28, 29), (30, 31), (32, 33), (34, 35), (36, 37),
           (38, 39), (40, 41), (42, 43), (44, 45), (46, 47)]
LEFT_PERIODS = ["冬期講習", "1月", "2月", "3月", "春期講習", "4月", "5月", "6月", "7月", "8月", "夏期Ⅰ期", "夏期Ⅱ期"]
RIGHT_PERIODS = ["9月", "10月", "11月", "12月", "直前Ⅰ期", "直前Ⅱ期"]
SUBJECT_ALIASES = {"英語": "英語", "数学": "数学", "現代文": "現代文", "古文": "古文", "漢文": "漢文", "日本史": "日本史",
                   "世界史": "世界史", "地理": "地理", "政治経済": "政治経済", "物理": "物理", "化学": "化学", "生物": "生物",
                   "国語": "国語", "小論文": "小論文"}


def words(page):
    return [(w[0], w[1], w[2], w[3], w[4]) for w in page.get_text("words")]


def header_rows(page, anchor):
    """見出し行（anchor を含む行）の y の一覧"""
    return sorted({round(w[1]) for w in words(page) if w[4] == anchor})


def period_centers(page, names, y):
    """y の見出し行にある各期間の中心 x"""
    ws = [w for w in words(page) if abs(w[1] - y) < 4]
    ws.sort(key=lambda w: w[0])
    out = {}
    i = 0
    while i < len(ws):
        t, x0, x1 = ws[i][4], ws[i][0], ws[i][2]
        if re.fullmatch(r"\d+", t) and i + 1 < len(ws) and ws[i + 1][4] == "月":
            t += "月"
            x1 = ws[i + 1][2]
            i += 1
        if t in names:
            out[t] = (x0 + x1) / 2
        i += 1
    return out


def labels(page, y0, y1):
    """左端の科目ラベル（色付きの四角）"""
    rows, seen = [], set()
    for g in page.get_drawings():
        r, f = g["rect"], g.get("fill")
        if not f or not (40 < r.x0 < 50 and 90 < r.x1 < 100) or not (y0 < r.y0 < y1) or r.height < 20:
            continue
        key = (round(r.y0), round(r.y1))
        if key in seen:
            continue
        seen.add(key)
        lab = "".join(w[4] for w in words(page) if 45 < (w[0] + w[2]) / 2 < 95 and r.y0 - 1 < (w[1] + w[3]) / 2 < r.y1 + 1)
        rows.append(dict(y0=r.y0, y1=r.y1, color=tuple(round(c, 3) for c in f), label=lab.replace("　", "").replace(" ", "")))
    return sorted(rows, key=lambda d: d["y0"])


def slots(page, y0, y1, xmin):
    """講座の帯が入る段（濃い帯の y 範囲）"""
    out = set()
    for g in page.get_drawings():
        r, f = g["rect"], g.get("fill")
        if f and r.x0 > xmin and y0 < r.y0 < y1 and 26 < r.height < 33 and r.width > 30 and sum(f) / 3 < 0.97:
            out.add((round(r.y0, 1), round(r.y1, 1)))
    merged = []
    for a, b in sorted(out):
        if merged and abs(a - merged[-1][0]) < 1.5:
            continue
        merged.append((a, b))
    return [dict(y0=a, y1=b) for a, b in merged]


def lighter(c):
    return sum(c) / 3


def bands_in_row(page, row, xmin):
    """行の中の濃い帯（講座）と薄い延長（※）"""
    full, light = [], []
    for g in page.get_drawings():
        r, f = g["rect"], g.get("fill")
        if not f or r.x0 < xmin or r.width < 12:
            continue
        if abs(r.y0 - row["y0"]) < 1.5 and abs(r.y1 - row["y1"]) < 1.5:
            full.append((r.x0, r.x1, tuple(round(c, 3) for c in f)))
        elif r.y0 > row["y0"] + 0.5 and r.y1 < row["y1"] - 0.5 and r.height > 20 and lighter(f) < 0.985:
            light.append((r.x0, r.x1, tuple(round(c, 3) for c in f)))
    dark = []
    for x0, x1, c in sorted(set(full)):
        if lighter(c) > 0.97:
            continue
        if any(abs(x0 - d[0]) < 1 and abs(x1 - d[1]) < 1 for d in dark):
            continue
        dark.append((x0, x1, c))
    return dark, light


def parse_half(page, row, centers, xmin):
    """1ページ分の1行 → {期間: (帯の文言 or None, ユニット)}"""
    cells = {}
    dark, light = bands_in_row(page, row, xmin)
    ws = words(page)
    mid = row["y0"] + (row["y1"] - row["y0"]) * 0.58
    names = sorted(centers.items(), key=lambda kv: kv[1])
    for x0, x1, _ in dark:
        top = [w for w in ws if x0 - 1 < (w[0] + w[2]) / 2 < x1 + 1 and row["y0"] - 1 < (w[1] + w[3]) / 2 < mid]
        top.sort(key=lambda w: (round(w[1]), w[0]))
        text = " ".join(w[4] for w in top)
        code = top[0][4] if top else ""
        title = "".join(w[4] for w in top[1:]) if len(top) > 1 else ""
        covered = [n for n, cx in names if x0 - 2 < cx < x1 + 2]
        units = {}
        for w in ws:
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            if x0 - 1 < cx < x1 + 1 and mid <= cy < row["y1"] + 1 and w[4] not in ("※",):
                near = min(names, key=lambda kv: abs(kv[1] - cx))[0]
                units.setdefault(near, []).append((cx, w[4]))
        cells_band = dict(code=code, title=title, text=text, periods=covered,
                          units={k: " ".join(t for _, t in sorted(v)) for k, v in units.items()})
        cells.setdefault("bands", []).append(cells_band)
    # ※ の延長（濃い帯の右側に続く薄い部分）
    star = []
    for lx0, lx1, _ in light:
        inside_dark = [d for d in dark if d[0] - 2 <= lx0 and lx1 <= d[1] + 2]
        if inside_dark:
            continue
        star += [n for n, cx in names if lx0 - 2 < cx < lx1 + 2]
    # 濃い帯の内側の薄い背景が帯より右に長い場合（例：帯 101-176、薄い 102-443）
    for lx0, lx1, _ in light:
        for d in dark:
            if abs(lx0 - d[0]) < 3 and lx1 > d[1] + 5:
                star += [n for n, cx in names if d[1] < cx < lx1 + 2]
    covered_all = set(p for b in cells.get("bands", []) for p in b["periods"])
    cells["star"] = sorted(set(star) - covered_all, key=lambda n: [k for k, _ in names].index(n))
    return cells


def kyote_list(page, y0, y1):
    """右ページの共通テスト対策講座の一覧（講座コード）"""
    codes = []
    for w in words(page):
        if w[0] > 340 and y0 < w[1] < y1:
            m = re.match(r"^(G?3[A-Z0-9]+Q)", w[4])
            if m:
                codes.append((w[1], m.group(1)))
    return [c for _, c in sorted(set(codes))]


def section_end(page, y_start):
    """講座説明の表（スーパーウイング 等のラベル）が始まる y"""
    ys = [w[1] for w in words(page) if w[0] < 140 and w[1] > y_start + 20 and
          any(k in w[4] for k in ("スーパーウイング", "学研プライムゼミ", "アドバンスウイング"))]
    return min(ys) if ys else 800


def main(pdf, out):
    d = pymupdf.open(pdf)
    patterns = []
    for lp, rp in SPREADS:
        L, R = d[lp - 1], d[rp - 1]
        lys, rys = header_rows(L, "冬期講習"), header_rows(R, "直前Ⅰ期")
        assert len(lys) == len(rys), (lp, lys, rys)
        for k, (ly, ry) in enumerate(zip(lys, rys)):
            top = lys[k - 1] + 30 if k else 0
            end = min(section_end(L, ly), lys[k + 1] - 60 if k + 1 < len(lys) else 800)
            # 見出し（パターン名・志望大学）
            title_ws = [w for w in words(L) if top <= w[1] < ly - 20 and 150 < w[0] < 330]
            title = "".join(w[4] for w in sorted(title_ws, key=lambda w: (round(w[1]), w[0])))
            title = title.replace("高３", "").replace("高3", "").replace("　", "")
            uni_ws = [w for w in words(L) if top <= w[1] < ly - 20 and w[0] >= 330] + \
                     [w for w in words(R) if (rys[k - 1] + 30 if k else 0) <= w[1] < ry - 20 and w[0] < 330]
            univ = "".join(w[4] for w in sorted(uni_ws, key=lambda w: (round(w[1]), w[0])))
            lc = period_centers(L, LEFT_PERIODS + ["夏期Ⅲ期"], ly)
            rc = period_centers(R, RIGHT_PERIODS, ry)
            subs = []
            for lab in labels(L, ly, end):
                alts = []
                for sl in slots(L, lab["y0"] - 1, lab["y1"] + 1, 100):
                    row = dict(y0=sl["y0"], y1=sl["y1"])
                    alts.append(dict(left=parse_half(L, row, lc, 100), right=parse_half(R, row, rc, 5)))
                subs.append(dict(label=lab["label"], alternatives=alts))
            rend = section_end(R, ry) if k + 1 == len(rys) else rys[k + 1] - 60
            patterns.append(dict(pages=[lp, rp], name=title, universities=univ,
                                 periods_left=sorted(lc, key=lc.get), periods_right=sorted(rc, key=rc.get),
                                 subjects=subs, kyote=kyote_list(R, ry - 40, rend)))
    json.dump(patterns, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for p in patterns:
        print(p["pages"], p["name"], "|", [(s["label"], len(s["alternatives"])) for s in p["subjects"]],
              "| 共テ", len(p["kyote"]), "| 期間", len(p["periods_left"]), len(p["periods_right"]))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
