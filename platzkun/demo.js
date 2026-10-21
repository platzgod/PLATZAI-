// お試しモード用の返事
// Claude を呼ばずに、決まった返事を「考え中 → 少しずつ表示」の流れで返します。
// 画面の動き・読み上げ・音声入力・10往復の上限・「次の問題へ」を、料金なしで確かめるためのものです。
// （写真の中身は読みません。どんな写真を送っても、同じ例題でヒントの流れを見せます）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1往復目, 2往復目, … の返事。{you} には生徒が送った言葉が入る
const SCRIPT = [
  ({ hasImage }) =>
    (hasImage ? "写真を受け取ったよ！" : "質問を受け取ったよ！") +
    "ぼくはいま**お試しモード**だから、問題の中身はまだ読めないんだ。かわりに例題で練習しよう。\n\n" +
    "$$x^2 + 3x - 4 = 0$$\n\nこの方程式、まず何をすればいいと思う？",
  () => "「{you}」って考えたんだね。ヒントを出すよ。左側を**因数分解**できないかな？掛けて $-4$、足して $3$ になる2つの数を探してみよう。",
  () => "いい調子！答えは $4$ と $-1$ だね。だから $$x^2 + 3x - 4 = (x + 4)(x - 1)$$ と書けるよ。じゃあ、$x$ はいくつになるかな？",
  () => "「{you}」だね。$(x + 4)(x - 1) = 0$ なら、$x + 4 = 0$ か $x - 1 = 0$ のどちらかが成り立つよ。それぞれ解いてみよう！",
  () => "よくがんばったね！答えは $x = -4,\\ 1$ だよ。自分の力でたどり着けたね。ほかにも気になるところはある？",
];

const AFTER = [
  "「{you}」だね。ぼくはお試しモードだから、くわしい答えはまだ出せないんだ。本物のモードなら、ここでもっと詳しく説明できるよ。",
  "なるほど、「{you}」かあ。いい質問だね！お試しモードでは決まった返事しかできないけど、声や動きのテストは続けられるよ。",
];

export async function streamDemoReply(messages, send) {
  const userMessages = messages.filter((m) => m.role === "user");
  const turn = userMessages.length;
  const last = userMessages.at(-1);
  const parts = Array.isArray(last.content) ? last.content : [{ type: "text", text: String(last.content) }];
  const you = (parts.find((p) => p.type === "text")?.text || "").slice(0, 40);
  const hasImage = parts.some((p) => p.type === "image");

  const template =
    turn <= SCRIPT.length ? SCRIPT[turn - 1]({ hasImage }) : AFTER[(turn - SCRIPT.length - 1) % AFTER.length];
  const text = template.replaceAll("{you}", you);

  await sleep(1200); // 考えているふり
  // 数式の途中で区切らないように、数式はひとかたまりで送る
  for (const chunk of text.match(/\$\$[\s\S]+?\$\$|\$[^$]+\$|[\s\S]{1,3}/g)) {
    send({ type: "text", text: chunk });
    await sleep(35);
  }
  send({ type: "done", content: [{ type: "text", text }] });
}
