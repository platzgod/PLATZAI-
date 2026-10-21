// プラッツ君 画面の動き
import { renderRich } from "./render.js";
import { createSpeaker, toSpeechText, Listener } from "./voice.js";

const $ = (id) => document.getElementById(id);
const els = {
  log: $("log"),
  emptyHint: $("emptyHint"),
  form: $("form"),
  input: $("input"),
  fileInput: $("fileInput"),
  preview: $("preview"),
  previewImg: $("previewImg"),
  removeImg: $("removeImg"),
  micBtn: $("micBtn"),
  sendBtn: $("sendBtn"),
  nextBtn: $("nextBtn"),
  replayBtn: $("replayBtn"),
  stopBtn: $("stopBtn"),
  voiceToggle: $("voiceToggle"),
  platz: $("platz"),
  status: $("statusBubble"),
  turnCounter: $("turnCounter"),
  chat: document.querySelector(".chat"),
};

// ---------- 状態 ----------
let maxTurns = 10;
let messages = []; // Claude API に送る会話の履歴
let pendingImage = null; // まだ送っていない画像 { mediaType, data, url }
let busy = false;
let controller = null; // 通信を途中で止めるため
let lastSpoken = "";

const speaker = createSpeaker();

// ---------- プラッツ君の様子 ----------
function setMood(mood, text) {
  els.platz.classList.toggle("talking", mood === "talking");
  els.platz.classList.toggle("thinking", mood === "thinking");
  if (text) els.status.textContent = text;
}

function speak(text) {
  lastSpoken = text;
  els.replayBtn.disabled = !text;
  if (!els.voiceToggle.checked || !text) return setMood("idle");
  speaker.speak(toSpeechText(text), {
    onStart: () => {
      setMood("talking", "おはなし中…");
      els.stopBtn.disabled = false;
    },
    onEnd: () => {
      setMood("idle", turnsLeft() > 0 ? "考えたことを教えてね！" : "よくがんばったね！");
      els.stopBtn.disabled = true;
    },
  });
}

// ---------- 往復数 ----------
const userTurns = () => messages.filter((m) => m.role === "user").length;
const turnsLeft = () => maxTurns - userTurns();

function updateTurns() {
  els.turnCounter.textContent = `この問題であと ${turnsLeft()} 回 質問できるよ`;
  const locked = busy || turnsLeft() <= 0;
  els.sendBtn.disabled = locked;
  els.input.disabled = turnsLeft() <= 0;
  els.micBtn.disabled = locked || !listener.supported;
}

// ---------- 会話の表示 ----------
function addBubble(kind, { text = "", imageUrl = null } = {}) {
  els.emptyHint.hidden = true;
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  if (kind === "platz-msg") {
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = "プラッツ君";
    div.append(who);
  }
  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = imageUrl;
    img.alt = "送った問題の画像";
    div.append(img);
  }
  const body = document.createElement("div");
  body.className = "body";
  body.textContent = text;
  div.append(body);
  els.log.append(div);
  els.log.scrollTop = els.log.scrollHeight;
  return body;
}

// ---------- 画像の読み込み ----------
// 大きすぎる写真は送る前に縮小する（通信量と料金を抑えるため）
const MAX_SIDE = 1568;

async function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();

  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // 透明な背景（スクショ等）は白にする
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  pendingImage = { mediaType: "image/jpeg", data: dataUrl.split(",")[1], url: dataUrl };
  els.previewImg.src = dataUrl;
  els.preview.hidden = false;
  setMood("idle", "写真を受け取ったよ！どこが分からないか教えてね。");
  els.input.focus();
}

function clearImage() {
  pendingImage = null;
  els.preview.hidden = true;
  els.previewImg.removeAttribute("src");
  els.fileInput.value = "";
}

els.fileInput.addEventListener("change", () => loadImage(els.fileInput.files[0]));
els.removeImg.addEventListener("click", clearImage);

// スクリーンショットの貼り付け（Ctrl + V）
document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) {
    e.preventDefault();
    loadImage(item.getAsFile());
  }
});

// ドラッグ＆ドロップ
els.chat.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.chat.classList.add("dragover");
});
els.chat.addEventListener("dragleave", () => els.chat.classList.remove("dragover"));
els.chat.addEventListener("drop", (e) => {
  e.preventDefault();
  els.chat.classList.remove("dragover");
  loadImage(e.dataTransfer.files[0]);
});

// ---------- 音声入力 ----------
let textBeforeMic = "";
const listener = new Listener({
  onText: (text) => {
    els.input.value = (textBeforeMic ? textBeforeMic + " " : "") + text;
  },
  onState: (on) => {
    els.micBtn.classList.toggle("listening", on);
    els.micBtn.textContent = on ? "■" : "🎤";
    if (on) setMood("idle", "聞いてるよ…話し終わったら、もう一度ボタンを押してね");
    else if (!busy) setMood("idle", "送るボタンを押してね！");
  },
});

if (!listener.supported) {
  els.micBtn.disabled = true;
  els.micBtn.title = "このブラウザは音声入力に対応していません（Chrome か Edge を使ってください）";
}

els.micBtn.addEventListener("click", () => {
  if (!listener.listening) {
    speaker.stop(); // プラッツ君の声を拾わないように、読み上げを止める
    textBeforeMic = els.input.value.trim();
  }
  listener.toggle();
});

// ---------- 送信 ----------
els.input.addEventListener("keydown", (e) => {
  // Enter で送信、Shift + Enter で改行（日本語変換中の Enter は無視）
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    els.form.requestSubmit();
  }
});

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy || turnsLeft() <= 0) return;

  const text = els.input.value.trim();
  if (!text && !pendingImage) {
    setMood("idle", "問題の写真か、質問を入れてね！");
    return;
  }

  listener.stop();
  speaker.stop();

  // 送る内容を組み立てる（画像 → 文字 の順）
  const content = [];
  if (pendingImage) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: pendingImage.mediaType, data: pendingImage.data },
    });
  }
  content.push({ type: "text", text: text || "この問題が分かりません。教えてください。" });

  const sentImage = pendingImage;
  messages.push({ role: "user", content });
  addBubble("me", { text: text || "この問題を教えて！", imageUrl: sentImage?.url });
  els.input.value = "";
  clearImage();

  await askPlatz({ restore: { text, image: sentImage } });
});

async function askPlatz({ restore }) {
  busy = true;
  updateTurns();
  setMood("thinking", "うーん、考え中…");

  const body = addBubble("platz-msg");
  body.classList.add("typing");
  let full = "";
  let finalContent = null;
  let errorMessage = null;
  controller = new AbortController();

  // 描きかえは画面の更新に合わせてまとめて行う（数式の描画が重いため）
  let scheduled = false;
  const redraw = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      renderRich(body, full);
      els.log.scrollTop = els.log.scrollHeight;
    });
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `サーバーエラー (${res.status})`);
    }

    // 届いた分から1行ずつ読む
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "text") {
          if (!full) setMood("thinking", "書いてるよ…");
          full += ev.text;
          redraw();
        } else if (ev.type === "done") {
          finalContent = ev.content;
        } else if (ev.type === "error") {
          errorMessage = ev.message;
        }
      }
    }
    if (!finalContent && !errorMessage) errorMessage = "返事が途中で切れてしまいました。もう一度送ってみてね。";
  } catch (err) {
    if (err.name === "AbortError") return; // 「次の問題へ」で止めたとき
    errorMessage = err.message.startsWith("Failed to fetch")
      ? "サーバーにつながりません。サーバーが起動しているか確認してください。"
      : err.message;
  } finally {
    body.classList.remove("typing");
    controller = null;
    busy = false;
  }

  if (errorMessage) {
    // 失敗した質問は履歴から外し、入力欄に戻してやり直せるようにする
    body.closest(".msg").remove();
    messages.pop();
    els.log.lastElementChild?.remove(); // 自分の吹き出しも消す
    if (!els.log.querySelector(".msg")) els.emptyHint.hidden = false;
    addBubble("error", { text: errorMessage });
    els.input.value = restore.text;
    if (restore.image) {
      pendingImage = restore.image;
      els.previewImg.src = restore.image.url;
      els.preview.hidden = false;
    }
    setMood("idle", "ごめんね、うまくいかなかったみたい。");
    updateTurns();
    return;
  }

  // 返事はそのままの形で履歴に残す（中身を書きかえると次の質問でエラーになる）
  messages.push({ role: "assistant", content: finalContent });
  const answer = finalContent
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  renderRich(body, answer);
  updateTurns();

  if (turnsLeft() <= 0) {
    addBubble("info", { text: `この問題のやり取りは${maxTurns}回までだよ。「次の問題へ」を押してね。` });
  }
  speak(answer);
}

// ---------- ボタン ----------
els.nextBtn.addEventListener("click", () => {
  if (messages.length && !confirm("今の問題の会話を消して、次の問題に進みますか？")) return;
  controller?.abort();
  speaker.stop();
  listener.stop();
  messages = [];
  busy = false;
  lastSpoken = "";
  clearImage();
  els.input.value = "";
  els.log.querySelectorAll(".msg").forEach((m) => m.remove());
  els.emptyHint.hidden = false;
  els.replayBtn.disabled = true;
  setMood("idle", "次の問題の写真を見せてね！");
  updateTurns();
});

els.replayBtn.addEventListener("click", () => speak(lastSpoken));
els.stopBtn.addEventListener("click", () => speaker.stop());
els.voiceToggle.addEventListener("change", () => {
  if (!els.voiceToggle.checked) speaker.stop();
});

// ---------- はじめに ----------
fetch("/api/config")
  .then((r) => r.json())
  .then((c) => {
    maxTurns = c.maxTurns;
    if (c.demo) document.querySelector(".topbar h1").textContent += "（お試しモード）";
  })
  .catch(() => {})
  .finally(updateTurns);
updateTurns();
