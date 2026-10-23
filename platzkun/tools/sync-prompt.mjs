// prompt.js の解説ルールを、claude.ai 版（artifact/）とテストページ（eval/）に書きこむ
//   npm run sync:prompt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEM_PROMPT, PROMPT_VERSION } from "../prompt.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["artifact/platzkun-artifact.html", "eval/platzkun-eval.html"];
const block =
  `// <<SYSTEM_PROMPT\n` +
  `const PROMPT_VERSION = ${PROMPT_VERSION};\n` +
  `const SYSTEM_PROMPT = ${JSON.stringify(SYSTEM_PROMPT)};\n` +
  `// SYSTEM_PROMPT>>`;

for (const t of targets) {
  const file = path.join(root, t);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  const out = src.replace(/\/\/ <<SYSTEM_PROMPT[\s\S]*?\/\/ SYSTEM_PROMPT>>/, block);
  if (out === src && !src.includes(block)) throw new Error(`${t} に // <<SYSTEM_PROMPT の目印がありません`);
  fs.writeFileSync(file, out);
  console.log(`反映しました: ${t}（ルール v${PROMPT_VERSION}）`);
}
