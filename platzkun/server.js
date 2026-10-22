// プラッツ君 デモ版サーバー
// ブラウザから届いた会話を Claude API に中継する小さなサーバーです。
// APIキーはこのサーバーの中（.env）だけで使い、ブラウザには渡しません。

import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEM_PROMPT } from "./prompt.js";
import { streamDemoReply } from "./demo.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// 考える深さ（low / medium / high）。高いほど丁寧だが遅く、料金も上がる
const EFFORT = process.env.CLAUDE_EFFORT || "medium";
// 1問あたりの最大往復数（生徒の発言の回数）
const MAX_TURNS = 10;

// お試しモード：APIキーが無いとき（または DEMO_MODE=true のとき）は Claude を呼ばず、
// 用意した返事を返す。料金はかからないので、画面の動き・音声・やり取りの実験に使える
const apiKey = process.env.ANTHROPIC_API_KEY || "";
const DEMO = process.env.DEMO_MODE === "true" || !/^sk-ant-[\w-]{20,}$/.test(apiKey.trim());

const client = DEMO ? null : new Anthropic();

// なめらかな声（VOICEVOX）：塾のパソコンで VOICEVOX を起動しておくと、その声で読み上げる。
// 起動していなければ、ブラウザ標準の声で読み上げる
const VOICEVOX_URL = (process.env.VOICEVOX_URL || "http://127.0.0.1:50021").replace(/\/$/, "");
const VOICEVOX_SPEAKER = Number(process.env.VOICEVOX_SPEAKER || 3); // 3 = ずんだもん（ノーマル）
const VOICEVOX_SPEED = Number(process.env.VOICEVOX_SPEED || 1.1); // 話す速さ
const VOICEVOX_PITCH = Number(process.env.VOICEVOX_PITCH || 0); // 声の高さ（-0.15〜0.15 くらい）
const app = express();

// 画像（base64）を含むので、受け取れるサイズを大きめにしておく
app.use(express.json({ limit: "20mb" }));

// 画面のファイル（HTML / JS / CSS / 画像）
app.use(express.static(path.join(here, "public")));
// 数式表示・Markdown 表示用のライブラリ（インターネットなしでも動くよう node_modules から配信）
app.use("/lib/katex", express.static(path.join(here, "node_modules/katex/dist")));
app.use("/lib/marked", express.static(path.join(here, "node_modules/marked/lib")));
app.use("/lib/dompurify", express.static(path.join(here, "node_modules/dompurify/dist")));

app.get("/api/config", (_req, res) => {
  res.json({ maxTurns: MAX_TURNS, demo: DEMO });
});

// VOICEVOX が使えるか、使う声の名前（画面にクレジット表記するため）
app.get("/api/tts/status", async (_req, res) => {
  try {
    const r = await fetch(`${VOICEVOX_URL}/speakers`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) throw new Error(String(r.status));
    const speakers = await r.json();
    const sp = speakers.find((s) => s.styles.some((st) => st.id === VOICEVOX_SPEAKER));
    res.json({ voicevox: true, name: sp ? sp.name : `ID ${VOICEVOX_SPEAKER}` });
  } catch {
    res.json({ voicevox: false });
  }
});

// 文章を VOICEVOX で音声（wav）にする
app.post("/api/tts", async (req, res) => {
  const text = String(req.body?.text || "").slice(0, 300);
  if (!text.trim()) return res.status(400).end();
  try {
    const q = await fetch(
      `${VOICEVOX_URL}/audio_query?speaker=${VOICEVOX_SPEAKER}&text=${encodeURIComponent(text)}`,
      { method: "POST", signal: AbortSignal.timeout(10000) },
    );
    if (!q.ok) throw new Error(`audio_query ${q.status}`);
    const query = await q.json();
    query.speedScale = VOICEVOX_SPEED;
    query.pitchScale = VOICEVOX_PITCH;
    query.prePhonemeLength = 0.05; // 文と文のつなぎ目を短くして、なめらかに
    query.postPhonemeLength = 0.05;
    const w = await fetch(`${VOICEVOX_URL}/synthesis?speaker=${VOICEVOX_SPEAKER}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(20000),
    });
    if (!w.ok) throw new Error(`synthesis ${w.status}`);
    res.setHeader("Content-Type", "audio/wav");
    res.send(Buffer.from(await w.arrayBuffer()));
  } catch (error) {
    console.error("[VOICEVOX]", error.message);
    res.status(502).end();
  }
});

// 会話の受け口。返事は1行ずつの JSON（NDJSON）で少しずつ送り返す
//   {"type":"text","text":"..."}      … 解説の文字（届いた分から順に）
//   {"type":"done","content":[...]}    … 返事の全体（ブラウザはこれを履歴に保存する）
//   {"type":"error","message":"..."}   … エラー
app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;

  if (!Array.isArray(messages) || messages.length === 0 || messages.at(-1).role !== "user") {
    return res.status(400).json({ error: "会話の形式が正しくありません。" });
  }
  const userTurns = messages.filter((m) => m.role === "user").length;
  if (userTurns > MAX_TURNS) {
    return res
      .status(400)
      .json({ error: `この問題のやり取りは${MAX_TURNS}回までです。「次の問題へ」を押してください。` });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  if (DEMO) {
    await streamDemoReply(messages, send, { sampleProblem: req.body?.sampleProblem === true });
    return res.end();
  }

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages,
      output_config: { effort: EFFORT },
      // 同じ問題画像を毎回送るので、キャッシュを使って料金を抑える
      cache_control: { type: "ephemeral" },
      // 安全フィルターで断られたときは、サーバー側で別モデルに自動で切り替えて答える
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    stream.on("text", (text) => send({ type: "text", text }));

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      send({ type: "error", message: "ごめんね、この内容にはお答えできません。問題について聞いてみてね。" });
    } else {
      // 返事の中身（思考ブロックなども含む）はそのまま履歴に残す必要がある
      send({ type: "done", content: message.content });
    }
    console.log(
      `[${new Date().toLocaleTimeString()}] ${userTurns}往復目 入力${message.usage.input_tokens}` +
        ` / キャッシュ読込${message.usage.cache_read_input_tokens ?? 0} / 出力${message.usage.output_tokens} トークン`,
    );
  } catch (error) {
    console.error(error);
    let msg = "エラーが起きました。少し待ってからもう一度ためしてください。";
    if (error instanceof Anthropic.AuthenticationError) {
      msg = "APIキーが正しくありません。.env を確認してください。";
    } else if (error instanceof Anthropic.RateLimitError) {
      msg = "混み合っています。1分ほど待ってからもう一度ためしてください。";
    } else if (error instanceof Anthropic.BadRequestError) {
      msg = "送った内容に問題がありました（画像が大きすぎる等）。別の画像でためしてください。";
    } else if (error instanceof Anthropic.APIConnectionError) {
      msg = "インターネットにつながりません。接続を確認してください。";
    }
    send({ type: "error", message: msg });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\nプラッツ君が起動しました！ ブラウザで http://localhost:${PORT} を開いてください。`);
  if (DEMO) {
    console.log("いまは【お試しモード】です。Claude は使わず、用意した返事を返します（料金はかかりません）。");
    console.log("本物の解説を使うときは、.env に APIキーを書いて DEMO_MODE=false にし、再起動してください。");
  } else {
    console.log(`Claude（${MODEL}）につないで解説します。`);
  }
  fetch(`${VOICEVOX_URL}/version`, { signal: AbortSignal.timeout(1500) })
    .then((r) => r.ok && console.log("VOICEVOX が見つかりました。なめらかな声で読み上げます。"))
    .catch(() => console.log("VOICEVOX が起動していないので、ブラウザ標準の声で読み上げます。"))
    .finally(() => console.log("（終わるときは、この画面で Ctrl + C を押します）\n"));
});
