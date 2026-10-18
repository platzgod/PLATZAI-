const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, AlignmentType, HeightRule, VerticalAlign, PageBreak,
  Footer, PageNumber, LevelFormat,
} = require("docx");

const NAVY = "1F4E79", RED = "C00000", GRAY = "595959", LIGHT = "EAF1F8", PALE = "F7F7F7";
const MIN = "游明朝", GOT = "游ゴシック";
const W = 10206; // A4 幅 11906 - 余白 850×2

const t = (text, o = {}) => new TextRun({ text, font: o.font || MIN, size: o.size || 21, bold: o.bold, color: o.color, italics: o.italics });
const p = (runs, o = {}) => new Paragraph({
  children: Array.isArray(runs) ? runs : [typeof runs === "string" ? t(runs) : runs],
  spacing: { before: o.before || 0, after: o.after ?? 60, line: o.line || 320 },
  alignment: o.align, indent: o.indent, shading: o.shading, border: o.border, keepNext: o.keepNext,
});
const bullet = (runs, level = 0) => new Paragraph({
  children: Array.isArray(runs) ? runs : [t(runs)], numbering: { reference: "dot", level },
  spacing: { after: 40, line: 300 },
});

// 見出し（紺の帯）
const step = (label, title) => new Paragraph({
  children: [t(label + "　", { font: GOT, bold: true, color: "FFFFFF", size: 24 }), t(title, { font: GOT, bold: true, color: "FFFFFF", size: 24 })],
  shading: { type: ShadingType.CLEAR, fill: NAVY, color: "auto" },
  spacing: { before: 280, after: 120 }, indent: { left: 0 }, keepNext: true,
});
const sub = (title) => new Paragraph({
  children: [t(title, { font: GOT, bold: true, color: NAVY, size: 22 })],
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY, space: 2 } },
  spacing: { before: 200, after: 100 }, keepNext: true,
});
const howto = (text) => p([t("✎ ", { color: RED, bold: true }), t(text, { size: 19, color: GRAY })], { after: 80 });
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const DOT = { style: BorderStyle.DOTTED, size: 6, color: "999999" };
// 記入用の罫線（段落の罫線は隣どうしで結合されてしまうので、枠なしの表の行に下罫線を引く）
const lines = (n) => [new Table({
  width: { size: W, type: WidthType.DXA }, columnWidths: [W],
  borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
  rows: Array.from({ length: n }, () => new TableRow({
    height: { value: 560, rule: HeightRule.EXACT }, cantSplit: true,
    children: [new TableCell({ width: { size: W, type: WidthType.DXA }, children: [new Paragraph({ children: [t(" ")] })],
      borders: { top: NONE, left: NONE, right: NONE, bottom: DOT } })],
  })),
})];
const border = { style: BorderStyle.SINGLE, size: 4, color: NAVY };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (content, width, o = {}) => new TableCell({
  children: (Array.isArray(content) ? content : [content]).map(c => typeof c === "string" ? p(c, { after: 0, line: 300 }) : c),
  width: { size: width, type: WidthType.DXA }, borders,
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 }, verticalAlign: o.v || VerticalAlign.TOP,
  columnSpan: o.span,
});
const head = (text, width) => cell(p(t(text, { font: GOT, bold: true, color: "FFFFFF", size: 19 }), { after: 0, align: AlignmentType.CENTER }), width, { fill: NAVY, v: VerticalAlign.CENTER });
const table = (widths, rows) => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, rows });
const row = (cells, h) => new TableRow({ children: cells, height: h ? { value: h, rule: HeightRule.ATLEAST } : undefined, cantSplit: true });
const box = (children, fill = LIGHT) => table([W], [row([cell(children, W, { fill })])]);

const content = [];

// ---------- タイトル ----------
content.push(
  p(t("拓殖大学　政経学部　法律政治学科", { font: GOT, bold: true, color: NAVY, size: 24 }), { align: AlignmentType.CENTER, after: 120 }),
  p(t("作文記入シート", { font: GOT, bold: true, color: NAVY, size: 40 }), { align: AlignmentType.CENTER, after: 80, line: 480 }),
  p(t("建学の理念とアドミッション・ポリシーを踏まえた「自己アピール」（1,000字以内）", { font: GOT, size: 22 }), { align: AlignmentType.CENTER, after: 200 }),
  p(t("スライド教材「小論文ワークシート」と併用する記入シート", { size: 18, color: GRAY }), { align: AlignmentType.CENTER, after: 120 }),
  p([t("氏名　＿＿＿＿＿＿＿＿＿＿＿＿＿＿　　記入日　　　年　　月　　日", { size: 22 })], { align: AlignmentType.RIGHT, after: 120 }),
);

// ---------- 課題の確認 ----------
content.push(step("STEP 0", "本番の課題を確認する"));
content.push(box([
  p(t("政経学部（募集要項「全体ガイダンス・作文について」より）", { font: GOT, bold: true, size: 19, color: NAVY }), { after: 40 }),
  p(t("大学には建学の理念があり、それに基づいて政経学部でも入学者受け入れの方針（アドミッション・ポリシー）を定めています。全体ガイダンス（20分）において、建学の理念およびアドミッション・ポリシーについて改めて確認した上で、皆さんにはそれらを踏まえた自己アピールを1,000字以内の文章にまとめてもらいます。"), { after: 0 }),
]));
content.push(p(" ", { after: 40 }));
content.push(table([2200, 8006], [
  row([head("時間", 2200), cell("全体ガイダンス 20分 → そのあと作文 60分", 8006)]),
  row([head("字数", 2200), cell([p([t("1,000字以内　→　"), t("目標は 900〜1,000字", { bold: true, color: RED }), t("（9割以上）")], { after: 0 })], 8006)]),
  row([head("テーマ", 2200), cell("建学の理念とアドミッション・ポリシーを踏まえた「自己アピール」", 8006)]),
]));
content.push(sub("この課題で求められていること"));
content.push(
  bullet([t("「自己アピール」", { bold: true }), t("＝自分の強みを、具体的な経験で証明すること。志望理由だけを書くと課題からずれる。")]),
  bullet([t("「踏まえた」", { bold: true }), t("＝建学の理念・アドミッション・ポリシーの言葉と、自分の経験を結びつけること。書き写したり並べたりするだけでは不十分。")]),
  bullet([t("「適合性」", { bold: true }), t("＝法律政治学科で何を学び、将来どう生かすかまで書くと、学科が求める人材だと伝わる。")]),
);

// ---------- STEP 1 ----------
content.push(step("STEP 1", "建学の理念とアドミッション・ポリシーを押さえる"));
content.push(sub("1-1　建学の理念"));
content.push(box([
  bullet([t("1900年、桂太郎が「台湾協会学校」として創立。受け継がれてきた「"), t("開拓の精神", { bold: true }), t("」")]),
  bullet([t("「"), t("積極進取の気概", { bold: true, color: RED }), t("と"), t("あらゆる民族から敬慕されるに値する教養と品格", { bold: true, color: RED }), t("を具えた有為な人材の育成」")]),
  bullet([t("現在の言い方：「"), t("国際的な視野", { bold: true }), t("を持ち、"), t("何事にも積極的にチャレンジ", { bold: true }), t("し、"), t("国内外の人と協働して問題を解決", { bold: true }), t("できるタフな人間力を持った人材（＝"), t("拓殖人材", { bold: true }), t("）」")]),
]));
content.push(sub("1-2　政経学部のアドミッション・ポリシー（要点）"));
content.push(box([
  bullet([t("法律学・政治学・経済学という社会科学の考え方を土台に、"), t("他者と協働しながら現場で課題に対処する意欲", { bold: true }), t("のある人材を広く受け入れる。")]),
  bullet([t("高校で身につけるべき基礎知識に加え、"), t("グローバリゼーションへの関心", { bold: true }), t("・"), t("論理的思考力", { bold: true }), t("・"), t("国内外の社会現象への関心と行動力", { bold: true }), t("を求める。")]),
  bullet([t("高校時代の"), t("留学・ボランティア活動や、文化・芸術活動", { bold: true }), t("などを評価の対象とする入試区分を設ける。")]),
  bullet([t("学部内に"), t("多様な民族・文化への対応力", { bold: true }), t("を実践する場を設けるため、国籍を問わず広く留学生に門戸を開く。")]),
], "FFFFFF"));
content.push(sub("1-3　法律政治学科のアドミッション・ポリシー（要点）"));
content.push(table([2200, 8006], [
  row([head("学科の目的", 2200), cell([
    p("法律学・政治学の理論的・実践的知識を身につけ、グローバル化時代の実社会の諸問題を的確に指摘し、解決できる能力を修得する。", { after: 40, line: 300 }),
    p([t("活躍の場：", { bold: true }), t("海外のほか、国内の政界・法曹界・国家公務員・地方公務員・出版やマスコミ等の民間部門")], { after: 0, line: 300 }),
  ], 8006)]),
  row([head("(1) 学習歴", 2200), cell("高等学校等で国語、英語、政治・経済や世界史等の社会科系科目を学習している。", 8006)]),
  row([head("(2) 学力水準", 2200), cell("法律学や政治学の学問領域を学修するために必要となる基礎的な学力や技能を身につけている。", 8006)]),
  row([head("(3) 能力", 2200), cell([
    bullet("高校までに身につけるべき基礎的な知識"),
    bullet([t("グローバル化への関心", { bold: true }), t("と"), t("論理的思考力", { bold: true })]),
    bullet([t("国内外の社会現象への関心", { bold: true }), t("と"), t("行動力", { bold: true })]),
    bullet([t("地域社会やグローバル社会を支える志", { bold: true })]),
  ], 8006)]),
]));
content.push(p(t("※ 拓殖大学 受験生サイト・政経学部サイトの掲載をもとにした要約です（2026年度入学者用）。最新の募集要項・拓殖大学受験生サイトで原文を確認しましょう。", { size: 17, color: GRAY }), { before: 60 }));

content.push(new Paragraph({ children: [new PageBreak()] }));
content.push(step("STEP 2", "アドミッション・ポリシーの項目ごとに自己PRの材料を書く"));
content.push(howto("本番は「建学の理念とAPを踏まえた自己アピール」。項目ごとに自分の経験・考えを書いておけば、当日どの言葉が強調されても使えます。書けたら右上の欄に◎○△を付け、◎を2つ選びます。"));
const items = [
  ["A", "建学の理念", "積極進取の気概／あらゆる民族から敬慕される教養と品格／国内外の人と協働して問題を解決", [
    "自分から進んで挑戦したことは？　何が壁で、どう乗り越えた？",
    "立場や文化の違う人と協力して、問題を解決した経験は？",
  ]],
  ["B", "政経学部の方針", "他者と協働しながら現場で課題に対処する意欲／留学・ボランティア・文化・芸術活動／多様な民族・文化への対応力", [
    "仲間と協力し、現場で課題に向き合った経験は？（部活・委員会・ボランティア・留学など）",
    "文化や考え方の違う人と関わった経験は？　そこで何を学んだ？",
  ]],
  ["C", "学科の目的", "法律学・政治学の知識で、実社会の諸問題を指摘し解決する／活躍の場：政界・法曹界・公務員・マスコミ等", [
    "法律や政治に関心を持ったきっかけは？（ニュース・授業・身近な出来事）",
    "法律・政治の力で解決したい社会の問題は？　将来どの分野で活躍したい？",
  ]],
  ["D", "(1) 学習歴", "国語、英語、政治・経済や世界史等の社会科系科目を学習している", [
    "これらの科目で印象に残った学びは？（単元・調べたこと・考えたこと）",
    "その学びは、法律・政治への関心にどうつながっている？",
  ]],
  ["E", "(2) 学力水準", "法律学や政治学を学ぶために必要な基礎的な学力や技能を身につけている", [
    "基礎学力を示せるものは？（得意科目・検定・資格・続けている学習）",
    "入学までに伸ばしたい力と、そのためにしていることは？",
  ]],
  ["F", "(3) 能力：グローバル化への関心と論理的思考力", "国際的な問題に関心を持ち、筋道立てて考えられる", [
    "関心のある国際的な問題は？　なぜ関心を持った？",
    "根拠を集めて筋道立てて考えた経験は？（探究学習・ディベート・レポート）",
  ]],
  ["G", "(3) 能力：社会現象への関心と行動力", "国内外の社会の出来事に関心を持ち、行動に移せる", [
    "社会の出来事に関心を持ち、実際に行動した経験は？（状況 → 課題 → 自分の行動 → 結果）",
  ]],
  ["H", "(3) 能力：地域社会・グローバル社会を支える志", "地域や国際社会のために力を尽くそうとする志がある", [
    "どんな地域・社会を支えたい？　そのために大学で何を身につけたい？",
  ]],
];
items.forEach(([key, name, want, qs]) => {
  content.push(table([1100, 7906, 1200], [row([
    cell(p(t(key, { font: GOT, bold: true, color: "FFFFFF", size: 32 }), { after: 0, align: AlignmentType.CENTER }), 1100, { fill: NAVY, v: VerticalAlign.CENTER }),
    cell([p(t(name, { font: GOT, bold: true, color: NAVY, size: 22 }), { after: 20 }), p(t("求められていること：" + want, { size: 17, color: GRAY }), { after: 0, line: 260 })], 7906, { fill: LIGHT, v: VerticalAlign.CENTER }),
    cell([p(t("使う度", { size: 15, color: GRAY }), { after: 0, align: AlignmentType.CENTER }), p(t("◎ ○ △", { size: 22 }), { after: 0, align: AlignmentType.CENTER })], 1200, { v: VerticalAlign.CENTER }),
  ])]));
  qs.forEach(q => { content.push(p(t("Q　" + q, { bold: true, size: 19 }), { before: 80, after: 0, keepNext: true }), ...lines(qs.length > 1 ? 3 : 5)); });
  content.push(p(" ", { after: 60 }));
});
content.push(p([t("◎を付けた2項目：　", { font: GOT, bold: true, color: NAVY }), t("＿＿＿＿＿＿＿＿　と　＿＿＿＿＿＿＿＿", { size: 22 })], { before: 120 }));
content.push(p(t("→ この2つが作文の柱。1つ目を本論①（経験）、2つ目を本論②（理念・APとの結びつき）の中心にする。", { size: 19, color: GRAY }), { after: 0 }));


// ---------- STEP 3 ----------
content.push(step("STEP 3", "アピールの核を一文にする"));
content.push(howto("STEP 2 で◎を付けた2項目をつなげて、作文全体の軸になる一文を作ります。〔　〕を自分の言葉で埋めましょう。"));
content.push(box([
  p(t("型", { font: GOT, bold: true, color: NAVY }), { after: 40 }),
  p("私の強みは〔　　　　　　〕である。〔どんな経験〕を通して、この力を培ってきた。この力を、貴学科で〔何を学ぶこと〕によってさらに高め、将来は〔進路〕として〔社会にどう貢献するか〕に生かしたい。", { after: 0, line: 360 }),
]));
content.push(p(t("自分の一文", { font: GOT, bold: true, color: NAVY }), { before: 160, after: 0, keepNext: true }), ...lines(4));
content.push(p([t("チェック：", { bold: true, size: 19 }), t("強みは STEP 2 の◎の項目と一致していますか？　強みは一つに絞れていますか？", { size: 19, color: GRAY })], { before: 80 }));

// ---------- STEP 4 ----------
content.push(new Paragraph({ children: [new PageBreak()] }));
content.push(step("STEP 4", "構成メモを作る（1,000字）"));
content.push(howto("本番でも最初の約10分でこのメモを作ってから書き始めます。字数の目安を意識しましょう。"));
const cw = [1500, 1100, 3500, 4106];
const plan = [
  ["① 序論", "約150字", "結論から書く。自分の強み（＝建学の理念・アドミッション・ポリシーと重なる点）と、志望の一言。"],
  ["② 本論1", "約350字", "強みを証明する経験。状況 → 課題 → 自分の行動 → 結果 → 学び の順に。数字や固有名詞で具体的に。"],
  ["③ 本論2", "約300字", "建学の理念・アドミッション・ポリシーのどの言葉に共感し、自分の何と重なるか。法律政治学科で何を学びたいか。"],
  ["④ 結論", "約200字", "将来像。学んだことを社会でどう生かすか。「拓殖人材」として何をしたいか。冒頭の強みにもう一度触れて締める。"],
];
content.push(table(cw, [
  row([head("段落", cw[0]), head("字数", cw[1]), head("書くこと", cw[2]), head("自分のメモ", cw[3])]),
  ...plan.map(([a, b, c]) => row([
    cell(p(t(a, { font: GOT, bold: true, color: NAVY }), { after: 0 }), cw[0], { fill: LIGHT, v: VerticalAlign.CENTER }),
    cell(p(t(b, { size: 19 }), { after: 0, align: AlignmentType.CENTER }), cw[1], { v: VerticalAlign.CENTER }),
    cell(p(t(c, { size: 19 }), { after: 0, line: 290 }), cw[2]),
    cell("", cw[3]),
  ], 2300)),
]));

// ---------- STEP 5 ----------
content.push(new Paragraph({ children: [new PageBreak()] }));
content.push(step("STEP 5", "本番に備える"));
content.push(sub("5-1　時間配分（ガイダンス 20分のあと、作文 60分）"));
const tw = [2550, 2550, 2550, 2556];
content.push(table(tw, [
  row([head("読む　5分", tw[0]), head("構成　10分", tw[1]), head("書く　37分", tw[2]), head("見直す　8分", tw[3])]),
  row([
    cell(p(t("課題文と、ガイダンスで書き留めたメモを見直す。使う言葉を1〜2個決める。", { size: 19 }), { after: 0 }), tw[0]),
    cell(p(t("STEP 4 の構成メモを作る。強み・経験・理念とAP・学び・将来を段落に割り振る。", { size: 19 }), { after: 0 }), tw[1]),
    cell(p(t("1分あたり約27字。メモどおりに一気に書き、途中で大きく直さない。", { size: 19 }), { after: 0 }), tw[2]),
    cell(p(t("誤字脱字・文体・字数（900字以上）を確認する。", { size: 19 }), { after: 0 }), tw[3]),
  ]),
]));
content.push(p(t("※ ガイダンスの20分は、建学の理念・APで強調された言葉を必ずメモする時間にする。", { size: 17, color: GRAY }), { before: 60 }));

content.push(sub("5-2　書き出しの例"));
content.push(table([1300, 8906], [
  row([cell(p(t("良い例", { font: GOT, bold: true, color: NAVY }), { after: 0, align: AlignmentType.CENTER }), 1300, { fill: LIGHT, v: VerticalAlign.CENTER }),
    cell("私の強みは、立場の違う人の意見をまとめ、問題を解決へ導く力である。", 8906)]),
  row([cell(p(t("避けたい例", { font: GOT, bold: true, color: RED }), { after: 0, align: AlignmentType.CENTER }), 1300, { fill: "FBEAEA", v: VerticalAlign.CENTER }),
    cell([
      p([t("「私が貴学を志望した理由は〜」"), t("　→ 志望理由書になり、自己アピールが弱くなる", { size: 19, color: GRAY })], { after: 20 }),
      p([t("「拓殖大学の建学の理念は〜である。」"), t("　→ 説明から始めると、自分のことが後回しになる", { size: 19, color: GRAY })], { after: 0 }),
    ], 8906)]),
]));

content.push(sub("5-3　よくある失敗"));
content.push(
  bullet("建学の理念やアドミッション・ポリシーの文を書き写す・並べるだけで、自分の経験と結びついていない"),
  bullet("経験が「頑張った」「成長した」など抽象的で、場面が浮かばない"),
  bullet("強みを3つも4つも挙げて、どれも浅くなる"),
  bullet("字数が9割に届かない／「です・ます」と「だ・である」が混ざる"),
);

content.push(sub("5-4　提出前チェックリスト"));
const checks = [
  "建学の理念（積極進取・教養と品格・開拓の精神 など）に触れている",
  "政経学部・学科のアドミッション・ポリシーの言葉と、自分の経験を結びつけている",
  "強みが一つに絞れていて、最初と最後で一致している",
  "経験に具体的な場面・数字・固有名詞がある",
  "法律政治学科で学びたいことが書けている",
  "将来像（進路と、社会への貢献）が書けている",
  "900〜1,000字に収まっている",
  "文体が「だ・である」にそろっている",
  "段落の頭が一字下げになっている（原稿用紙の使い方）",
  "誤字脱字がない",
];
content.push(table([600, 9606], checks.map(c => row([
  cell(p(t("□", { size: 24 }), { after: 0, align: AlignmentType.CENTER }), 600, { v: VerticalAlign.CENTER }),
  cell(p(t(c, { size: 20 }), { after: 0 }), 9606, { v: VerticalAlign.CENTER }),
], 440))));

content.push(p(t("出典：拓殖大学 受験生サイト「入学者受け入れの方針（アドミッション・ポリシー）」、同 政経学部募集要項「全体ガイダンス・作文について」、拓殖大学 政経学部概要 ほか。", { size: 16, color: GRAY }), { before: 200 }));

// ---------- STEP 6：原稿用紙 ----------
const GW = 490, GN = 20, LABW = W - GW * GN;
const GB = { style: BorderStyle.SINGLE, size: 4, color: "C9A27E" };
const GNONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const sheet = (no) => {
  const out = [];
  out.push(new Paragraph({ children: [new PageBreak()] }));
  if (no === 1) {
    out.push(step("STEP 6", "本番形式で書く（60分・1,000字以内）"));
    out.push(howto("時間を計って書きます。横書き・1行20字。900字（9割）以上をめざし、1,000字を超えないこと。書き終えたら撮影して添削に出しましょう。"));
  }
  out.push(p([t(`原稿用紙 ${no}／3`, { font: GOT, bold: true, color: NAVY }), t(`　　氏名＿＿＿＿＿＿＿＿　　開始　　：　　終了　　：　　字数　　　　字`, { size: 19 })], { after: 80 }));
  const rows = [];
  for (let r = 1; r <= GN; r++) {
    const total = ((no - 1) * GN + r) * GN;
    const mark = total === 1000 ? "1000字" : total === 900 ? "900字" : (r % 5 === 0 ? `${total}` : "");
    const red = total === 1000 || total === 900;
    rows.push(new TableRow({ height: { value: GW, rule: HeightRule.EXACT }, cantSplit: true, children: [
      ...Array.from({ length: GN }, () => new TableCell({ width: { size: GW, type: WidthType.DXA }, borders: { top: GB, bottom: GB, left: GB, right: GB },
        children: [new Paragraph({ children: [] })] })),
      new TableCell({ width: { size: LABW, type: WidthType.DXA }, borders: { top: GNONE, bottom: GNONE, left: GNONE, right: GNONE }, verticalAlign: VerticalAlign.BOTTOM,
        children: [new Paragraph({ children: [t(mark, { size: 13, color: red ? RED : GRAY, bold: red })], spacing: { after: 0 } })] }),
    ] }));
    if (r < GN) rows.push(new TableRow({ height: { value: 110, rule: HeightRule.EXACT }, children: [
      new TableCell({ columnSpan: GN + 1, width: { size: W, type: WidthType.DXA }, borders: { top: GNONE, bottom: GNONE, left: GNONE, right: GNONE }, children: [new Paragraph({ children: [] })] }),
    ] }));
  }
  out.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [...Array(GN).fill(GW), LABW], rows }));
  return out;
};
[1, 2, 3].forEach(n => content.push(...sheet(n)));

const doc = new Document({
  styles: { default: { document: { run: { font: MIN, size: 21 } } } },
  numbering: { config: [{ reference: "dot", levels: [{ level: 0, format: LevelFormat.BULLET, text: "・", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 850, bottom: 850, left: 850, right: 850 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "拓殖大学 政経学部 法律政治学科　作文記入シート　", font: GOT, size: 16, color: GRAY }),
      new TextRun({ children: [PageNumber.CURRENT], font: GOT, size: 16, color: GRAY }),
    ] })] }) },
    children: content,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(process.argv[2], b); console.log("ok"); });
