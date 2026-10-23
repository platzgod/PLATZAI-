// お試しモード用の返事
// Claude を呼ばずに、決まった返事を「考え中 → 少しずつ表示」の流れで返します。
// 画面の動き・読み上げ・音声入力・10往復の上限・「次の問題へ」を、料金なしで確かめるためのものです。
// （写真の中身は読みません。どんな写真を送っても、同じ例題でヒントの流れを見せます）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1往復目, 2往復目, … の返事。{you} には生徒が送った言葉が入る
// mark は「サンプル問題」（public/sample-problem.png、1200×700）の上に出す枠
const MARK = {
  q1: "[[mark x=46 y=188 w=851 h=70]]",
  q1lhs: "[[mark x=341 y=193 w=227 h=57]]",
  q2: "[[mark x=46 y=368 w=750 h=146]]",
};
const SCRIPT = [
  {
    text: ({ hasImage, sample }) =>
      (sample ? "" : hasImage ? "写真ありがとう！お試しモードなので、例題で練習しよう。\n" : "お試しモードなので、例題で練習しよう。\n") +
      "二次方程式だね。まず、左の式を因数分解できないかな？",
    mark: MARK.q1lhs,
  },
  {
    text: () => "掛けて $-4$、足して $3$ になる2つの数は何かな？",
    mark: MARK.q1lhs,
  },
  {
    text: () => "そう、$4$ と $-1$！だから $(x + 4)(x - 1) = 0$。$x$ は何になる？",
    mark: MARK.q1,
  },
  {
    text: () => "かけて $0$ なら、どちらかが $0$ だよ。$x + 4 = 0$ と $x - 1 = 0$ を解いてみよう！",
    mark: MARK.q1,
  },
  {
    text: () => "正解、$x = -4,\\ 1$！次は(2)の頂点。平方完成、覚えてる？",
    mark: MARK.q2,
  },
];

const AFTER = [
  "「{you}」だね。お試しモードなので、ここから先は本物のモードで答えるよ。",
  "お試しモードでは決まった返事だけなんだ。声や動きのテストは続けられるよ。",
];

export async function streamDemoReply(messages, send, { sampleProblem = false } = {}) {
  const userMessages = messages.filter((m) => m.role === "user");
  const turn = userMessages.length;
  const last = userMessages.at(-1);
  const parts = Array.isArray(last.content) ? last.content : [{ type: "text", text: String(last.content) }];
  const you = (parts.find((p) => p.type === "text")?.text || "").split("\n")[0].slice(0, 40);
  const hasImage = parts.some((p) => p.type === "image");

  let text;
  if (turn <= SCRIPT.length) {
    const step = SCRIPT[turn - 1];
    text = step.text({ hasImage, sample: sampleProblem });
    if (sampleProblem) text += "\n" + step.mark; // 枠はサンプル問題のときだけ（ほかの写真では場所が分からないため）
  } else {
    text = AFTER[(turn - SCRIPT.length - 1) % AFTER.length];
  }
  text = text.replaceAll("{you}", you);

  await sleep(1200); // 考えているふり
  // 数式や目印の途中で区切らないように、ひとかたまりで送る
  for (const chunk of text.match(/\[\[[^\]]*\]\]|\$\$[\s\S]+?\$\$|\$[^$]+\$|[\s\S]{1,3}/g)) {
    send({ type: "text", text: chunk });
    await sleep(35);
  }
  send({ type: "done", content: [{ type: "text", text }] });
}
