// お試し版（platzkun-demo.html）を作るスクリプト
//   npm run build:demo
//
// 塾のパソコン版（public/ の画面 と demo.js の決まった返事）を、HTMLファイル1つにまとめます。
// サーバーがなくても動くように、サーバーへの問い合わせ（/api/...）はファイルの中でまねをします。
// ・Claude は使いません（料金なし）。VOICEVOX も使わず、ブラウザ標準の声で読み上げます。
// ・数式表示などの部品はインターネットから読み込みます。
// public/ や demo.js を直したら、このスクリプトを実行し直してください。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const dataUri = (p, type) => `data:${type};base64,${fs.readFileSync(path.join(root, p)).toString("base64")}`;
const version = (pkg) => JSON.parse(read(`node_modules/${pkg}/package.json`)).version;

const CDN = {
  katexCss: `https://cdn.jsdelivr.net/npm/katex@${version("katex")}/dist/katex.min.css`,
  katex: `https://cdn.jsdelivr.net/npm/katex@${version("katex")}/dist/katex.mjs`,
  marked: `https://cdn.jsdelivr.net/npm/marked@${version("marked")}/lib/marked.esm.js`,
  dompurify: `https://cdn.jsdelivr.net/npm/dompurify@${version("dompurify")}/dist/purify.es.mjs`,
};

// ES モジュールを1つにつなげるため、import 行と export を外す
const strip = (src) =>
  src
    .replace(/^import .*?;\s*$/gm, "")
    .replace(/^export (?=(async )?(function|class|const|let))/gm, "");

const render = read("public/render.js")
  .replace('"/lib/marked/marked.esm.js"', JSON.stringify(CDN.marked))
  .replace('"/lib/dompurify/purify.es.mjs"', JSON.stringify(CDN.dompurify))
  .replace('"/lib/katex/katex.mjs"', JSON.stringify(CDN.katex));
const renderImports = render.match(/^import .*?;\s*$/gm).join("\n");

const SAMPLE = dataUri("public/sample-problem.png", "image/png");

// サーバーのまね：/api/... への問い合わせを、このファイルの中で答える
const shim = `
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (url === "/api/config") return Response.json({ maxTurns: 10, demo: true });
  if (url === "/api/tts/status") return Response.json({ voicevox: false });
  if (url === "sample-problem.png") return realFetch(${JSON.stringify(SAMPLE)});
  if (url === "/api/chat") {
    const body = JSON.parse(init.body);
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctl) {
        await streamDemoReply(body.messages, (obj) => ctl.enqueue(enc.encode(JSON.stringify(obj) + "\\n")), {
          sampleProblem: body.sampleProblem === true,
        });
        ctl.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
  }
  return realFetch(input, init);
};
`;

const script = [
  renderImports,
  "// ---- demo.js（お試しの決まった返事） ----",
  strip(read("demo.js")),
  "// ---- サーバーのまね ----",
  shim,
  "// ---- public/render.js ----",
  strip(render),
  "// ---- public/voice.js ----",
  strip(read("public/voice.js")),
  "// ---- public/app.js ----",
  strip(read("public/app.js")),
].join("\n");

let html = read("public/index.html")
  .replace('<link rel="stylesheet" href="/lib/katex/katex.min.css">', `<link rel="stylesheet" href="${CDN.katexCss}">`)
  .replace('<link rel="stylesheet" href="style.css">', `<style>\n${read("public/style.css")}</style>`)
  .replace("<title>プラッツ君</title>", "<title>プラッツ君 お試し版</title>")
  .replace(
    "<head>",
    `<head>
<!--
  プラッツ君 お試し版（HTMLファイル1つで動く版）… このファイルは tools/build-demo.mjs で自動で作っています
  ・ダブルクリックして、Chrome か Edge で開くだけで動きます。
  ・Claude は使いません。決まった返事を返すので、料金はかかりません。
  ・「例題でためしてみる」を押すと、問題の写真の上に「いま話している場所」の枠が出ます。
  ・数式表示などの部品はインターネットから読み込みます。
-->`,
  )
  .replace('src="platz.png"', `src="${dataUri("public/platz.png", "image/png")}"`)
  .replace(/onerror="[^"]*"/, "")
  .replace('<script type="module" src="app.js"></script>', `<script type="module">\n${script}\n</script>`);

const out = path.join(root, "platzkun-demo.html");
fs.writeFileSync(out, html);
console.log(`作りました: ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);
