// 解説文（Markdown + 数式）を画面用の HTML に変える
import { marked } from "/lib/marked/marked.esm.js";
import DOMPurify from "/lib/dompurify/purify.es.mjs";
import katex from "/lib/katex/katex.mjs";

marked.setOptions({ breaks: true });

// 数式を一度「目印」に置きかえてから Markdown を処理し、最後に KaTeX で描き戻す
// （先に Markdown を通すと、数式の _ や \ がこわれてしまうため）
export function renderRich(el, source) {
  const maths = [];
  const keep = (tex, display) => {
    maths.push({ tex, display });
    return `@@MATH${maths.length - 1}@@`;
  };

  const text = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => keep(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => keep(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => keep(t, false))
    .replace(/\$([^$\n]+?)\$/g, (_, t) => keep(t, false));

  const html = DOMPurify.sanitize(marked.parse(text)).replace(/@@MATH(\d+)@@/g, (_, i) => {
    const m = maths[Number(i)];
    return katex.renderToString(m.tex, { displayMode: m.display, throwOnError: false });
  });

  el.innerHTML = html;
}
