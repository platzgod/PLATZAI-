// プラッツ君 画面の動き
import { renderRich } from "./render.js";
import { createSpeaker, toSpeechText, Listener } from "./voice.js";

const $ = (id) => document.getElementById(id);
const els = {
  title: $("title"),
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
  talkToggle: $("talkToggle"),
  sampleBtn: $("sampleBtn"),
  platz: $("platz"),
  status: $("statusBubble"),
  turnCounter: $("turnCounter"),
  chat: document.querySelector(".chat"),
  left: $("left"),
  board: $("board"),
  boardView: $("boardView"),
  frame: $("frame"),
  boardImg: $("boardImg"),
  zoomBtn: $("zoomBtn"),
  clearMarkBtn: $("clearMarkBtn"),
  voiceCredit: $("voiceCredit"),
};

// ---------- 状態 ----------
let maxTurns = 10;
let messages = []; // Claude API に送る会話の履歴
let pendingImage = null; // まだ送っていない画像 { mediaType, data, url, w, h, sample }
let problemImage = null; // いま大きく表示している問題の画像 { url, w, h }
let sampleProblem = false; // 例題（sample-problem.png）で試しているか
let busy = false;
let controller = null; // 通信を途中で止めるため
let lastSpoken = "";

// 読み上げ：VOICEVOX が使えればその声、だめならブラウザ標準の声（準備ができるまでは null）
let speaker = null;
createSpeaker().then((s) => {
  speaker = s;
  // VOICEVOX の声は、利用規約でクレジット表記が必要
  els.voiceCredit.textContent = s.label.startsWith("VOICEVOX") ? s.label : "";
});

// ---------- プラッツ君の様子 ----------
function setMood(mood, text) {
  els.platz.classList.toggle("talking", mood === "talking");
  els.platz.classList.toggle("thinking", mood === "thinking");
  if (text) els.status.textContent = text;
}

function speak(text) {
  lastSpoken = text;
  els.replayBtn.disabled = !text;
  if (!els.voiceToggle.checked || !text || !speaker) {
    setMood("idle", turnsLeft() > 0 ? "考えたことを教えてね！" : "よくがんばったね！");
    return listenIfTalking();
  }
  speaker.speak(toSpeechText(text), {
    onStart: () => {
      setMood("talking", "おはなし中…");
      els.stopBtn.disabled = false;
    },
    onEnd: () => {
      setMood("idle", turnsLeft() > 0 ? "考えたことを教えてね！" : "よくがんばったね！");
      els.stopBtn.disabled = true;
      listenIfTalking();
    },
  });
}
const stopSpeaking = () => speaker?.stop();

// ---------- 往復数 ----------
const userTurns = () => messages.filter((m) => m.role === "user").length;
const turnsLeft = () => maxTurns - userTurns();

function updateTurns() {
  els.turnCounter.textContent = `この問題であと ${turnsLeft()} 回 質問できるよ`;
  const locked = busy || turnsLeft() <= 0;
  els.sendBtn.disabled = locked;
  els.input.disabled = turnsLeft() <= 0;
  els.micBtn.disabled = locked || !listener.supported;
  els.talkToggle.disabled = !listener.supported;
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
// Claude が縮めずにそのまま見る大きさ（約115万画素・長い辺1568px以内）にしておき、
// その大きさを、枠の座標の基準にする
const MAX_PIXELS = 1150000;
const MAX_SIDE = 1568;

async function loadImage(file, { sample = false } = {}) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();

  const scale = Math.min(
    1,
    MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight),
    Math.sqrt(MAX_PIXELS / (img.naturalWidth * img.naturalHeight)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // 透明な背景（スクショ等）は白にする
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  pendingImage = {
    mediaType: "image/jpeg",
    data: dataUrl.split(",")[1],
    url: dataUrl,
    w: canvas.width,
    h: canvas.height,
    sample,
  };
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

// 例題でためす：用意した問題の画像を読みこんで、そのまま質問する
els.sampleBtn.addEventListener("click", async () => {
  const blob = await (await fetch("sample-problem.png")).blob();
  await loadImage(new File([blob], "sample-problem.png", { type: blob.type }), { sample: true });
  els.input.value = "(1)が分かりません";
  els.form.requestSubmit();
});

// ---------- 問題の写真（大きく表示して、話している場所に枠） ----------
let currentMarks = []; // [{x, y, w, h}]（写真のピクセル）
let zoomed = false;
let fitScale = 1;

function showProblem(img) {
  problemImage = img;
  els.boardImg.src = img.url;
  els.board.hidden = false;
  els.left.classList.add("has-problem");
  currentMarks = [];
  zoomed = false;
  fitBoard();
  drawMarks();
}

function hideProblem() {
  problemImage = null;
  els.board.hidden = true;
  els.left.classList.remove("has-problem");
  els.boardImg.removeAttribute("src");
  currentMarks = [];
  zoomed = false;
  drawMarks();
}

// 写真を、枠の中いっぱいに収める
function fitBoard() {
  if (!problemImage || els.board.hidden) return;
  const vw = Math.max(40, els.boardView.clientWidth - 20);
  const vh = Math.max(40, els.boardView.clientHeight - 20);
  fitScale = Math.min(vw / problemImage.w, vh / problemImage.h);
  els.frame.style.width = `${problemImage.w * fitScale}px`;
  els.frame.style.height = `${problemImage.h * fitScale}px`;
  applyZoom();
}
new ResizeObserver(fitBoard).observe(els.boardView);

function drawMarks() {
  els.frame.querySelectorAll(".mark").forEach((m) => m.remove());
  if (problemImage) {
    currentMarks.forEach((m, i) => {
      const box = document.createElement("div");
      box.className = "mark";
      box.style.left = `${(m.x / problemImage.w) * 100}%`;
      box.style.top = `${(m.y / problemImage.h) * 100}%`;
      box.style.width = `${(m.w / problemImage.w) * 100}%`;
      box.style.height = `${(m.h / problemImage.h) * 100}%`;
      const label = document.createElement("span");
      label.textContent = currentMarks.length > 1 ? `ここ ${i + 1}` : "ここ！";
      box.append(label);
      els.frame.append(box);
    });
  }
  els.zoomBtn.disabled = !currentMarks.length;
  els.clearMarkBtn.disabled = !currentMarks.length;
  if (!currentMarks.length) zoomed = false;
  applyZoom();
}

// 枠の所を拡大：枠の真ん中が表示の真ん中に来るように、写真を拡大してずらす
function applyZoom() {
  els.zoomBtn.textContent = zoomed ? "全体を見る" : "枠の所を拡大";
  if (!zoomed || !currentMarks.length || !problemImage) {
    els.frame.style.transform = "";
    return;
  }
  const x1 = Math.min(...currentMarks.map((m) => m.x));
  const y1 = Math.min(...currentMarks.map((m) => m.y));
  const x2 = Math.max(...currentMarks.map((m) => m.x + m.w));
  const y2 = Math.max(...currentMarks.map((m) => m.y + m.h));
  const vw = els.boardView.clientWidth - 20;
  const vh = els.boardView.clientHeight - 20;
  const z = Math.max(1, Math.min(3, 0.8 * Math.min(vw / ((x2 - x1) * fitScale), vh / ((y2 - y1) * fitScale))));
  const dx = ((x1 + x2) / 2 - problemImage.w / 2) * fitScale;
  const dy = ((y1 + y2) / 2 - problemImage.h / 2) * fitScale;
  els.frame.style.transform = `translate(${-z * dx}px, ${-z * dy}px) scale(${z})`;
}

els.zoomBtn.addEventListener("click", () => {
  zoomed = !zoomed;
  applyZoom();
});
els.clearMarkBtn.addEventListener("click", () => {
  currentMarks = [];
  drawMarks();
});

// 返事の最後の [[mark x=.. y=.. w=.. h=..]] を読み取る（写真の外にはみ出した分は切る）
function parseMarks(text) {
  if (!problemImage) return [];
  const marks = [];
  for (const [, body] of text.matchAll(/\[\[mark([^\]]*)\]\]/g)) {
    const v = {};
    for (const [, k, n] of body.matchAll(/\b(x|y|w|h)\s*[=:]\s*(-?\d+(?:\.\d+)?)/g)) v[k] = Number(n);
    if (!["x", "y", "w", "h"].every((k) => Number.isFinite(v[k]))) continue;
    const x = Math.max(0, Math.min(problemImage.w, v.x));
    const y = Math.max(0, Math.min(problemImage.h, v.y));
    const w = Math.min(problemImage.w - x, v.w);
    const h = Math.min(problemImage.h - y, v.h);
    if (w > 4 && h > 4) marks.push({ x, y, w, h });
  }
  return marks.slice(0, 2);
}

// 生徒に見せる文・読み上げる文から、目印の行を取りのぞく（書きかけの途中も隠す）
const cleanText = (text) => text.replace(/\[\[[^\]]*\]\]/g, "").replace(/\[\[?[^\]]*$/, "").trimEnd();

// ---------- 音声入力 と 会話モード ----------
let textBeforeMic = "";
const listener = new Listener({
  onText: (text) => {
    els.input.value = (textBeforeMic ? textBeforeMic + " " : "") + text;
  },
  // 会話モードでは、話し終わったら自動で送る
  onFinal: () => {
    if (els.talkToggle.checked) els.form.requestSubmit();
  },
  onState: (on, heard) => {
    els.micBtn.classList.toggle("listening", on);
    els.micBtn.textContent = on ? "■" : "🎤";
    if (on) {
      setMood("idle", els.talkToggle.checked ? "聞いてるよ…話しかけてね" : "聞いてるよ…話し終わったら、もう一度ボタンを押してね");
    } else if (!busy) {
      if (els.talkToggle.checked && !heard) setMood("idle", "聞こえなかったよ。🎤を押して、もう一度話してね");
      else if (!els.talkToggle.checked) setMood("idle", "送るボタンを押してね！");
    }
  },
  onDenied: () => {
    els.talkToggle.checked = false;
    addBubble("error", { text: "マイクの使用が許可されていません。ブラウザのアドレスバーのマイクのマークから許可してください。" });
  },
});

function startListening() {
  if (!listener.supported || busy || turnsLeft() <= 0) return;
  stopSpeaking(); // プラッツ君の声を拾わないように、読み上げを止める
  textBeforeMic = els.input.value.trim();
  listener.start();
}

// 会話モードのとき、プラッツ君が話し終わったら聞き取りを始める
function listenIfTalking() {
  if (els.talkToggle.checked) setTimeout(startListening, 300);
}

if (!listener.supported) {
  els.micBtn.title = "このブラウザは音声入力に対応していません（Chrome か Edge を使ってください）";
  els.talkToggle.title = els.micBtn.title;
}

els.micBtn.addEventListener("click", () => {
  if (listener.listening) listener.stop();
  else startListening();
});

els.talkToggle.addEventListener("change", () => {
  if (els.talkToggle.checked) {
    setMood("idle", "会話モードだよ。話しかけてね！");
    startListening();
  } else {
    listener.stop();
  }
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
  stopSpeaking();

  // 送る内容を組み立てる（画像 → 文字 の順）。画像の大きさは、枠の座標のために伝える
  const question = text || "この問題が分かりません。教えてください。";
  const content = [];
  if (pendingImage) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: pendingImage.mediaType, data: pendingImage.data },
    });
    content.push({ type: "text", text: `${question}\n（写真の大きさ：幅${pendingImage.w}×高さ${pendingImage.h}ピクセル）` });
  } else {
    content.push({ type: "text", text: question });
  }

  const sentImage = pendingImage;
  const before = { problemImage, sampleProblem };
  if (sentImage) {
    sampleProblem = sentImage.sample;
    showProblem(sentImage);
  }
  messages.push({ role: "user", content });
  addBubble("me", { text: text || "この問題を教えて！", imageUrl: sentImage?.url });
  els.input.value = "";
  clearImage();

  await askPlatz({ restore: { text, image: sentImage, ...before } });
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
      renderRich(body, cleanText(full));
      els.log.scrollTop = els.log.scrollHeight;
    });
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, sampleProblem }),
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
      sampleProblem = restore.sampleProblem;
      if (restore.problemImage) showProblem(restore.problemImage);
      else hideProblem();
    }
    setMood("idle", "ごめんね、うまくいかなかったみたい。");
    updateTurns();
    return;
  }

  // 返事はそのままの形で履歴に残す（中身を書きかえると次の質問でエラーになる）
  messages.push({ role: "assistant", content: finalContent });
  const raw = finalContent
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const answer = cleanText(raw);
  renderRich(body, answer);

  const marks = parseMarks(raw);
  if (marks.length) {
    currentMarks = marks;
    zoomed = false;
    drawMarks();
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "btn pin";
    pin.textContent = "この場所を見る";
    pin.addEventListener("click", () => {
      currentMarks = marks;
      zoomed = false;
      drawMarks();
    });
    body.closest(".msg").append(pin);
  }
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
  stopSpeaking();
  listener.stop();
  messages = [];
  busy = false;
  lastSpoken = "";
  sampleProblem = false;
  clearImage();
  hideProblem();
  els.input.value = "";
  els.log.querySelectorAll(".msg").forEach((m) => m.remove());
  els.emptyHint.hidden = false;
  els.replayBtn.disabled = true;
  setMood("idle", "次の問題の写真を見せてね！");
  updateTurns();
  listenIfTalking();
});

els.replayBtn.addEventListener("click", () => speak(lastSpoken));
els.stopBtn.addEventListener("click", () => stopSpeaking());
els.voiceToggle.addEventListener("change", () => {
  if (!els.voiceToggle.checked) stopSpeaking();
});

// ---------- はじめに ----------
fetch("/api/config")
  .then((r) => r.json())
  .then((c) => {
    maxTurns = c.maxTurns;
    if (c.demo) els.title.textContent += "（お試しモード）";
  })
  .catch(() => {})
  .finally(updateTurns);
updateTurns();
