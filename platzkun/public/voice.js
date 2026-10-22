// 音声まわり（読み上げ と 音声入力）
//
// ■ 読み上げの声
//   塾のパソコンで VOICEVOX（無料の読み上げソフト）が起動していれば、その声（VoicevoxSpeaker）で、
//   起動していなければブラウザ標準の声（BrowserSpeaker）で読み上げます。
//   別の音声エンジンに替えるときは、同じ形（speak(text, { onStart, onEnd }) と stop()）を持つクラスを作り、
//   いちばん下の createSpeaker() でそれを返すようにするだけで、ほかのファイルは変更不要です。

// ブラウザ標準の声の設定。好みに合わせて変更してください
export const VOICE_SETTINGS = {
  lang: "ja-JP",
  rate: 1.05, // 話す速さ（0.5〜2）
  pitch: 1.15, // 声の高さ（0〜2）
  // 使いたい声の名前（一部でOK）。上から順に探して、見つかったものを使う。Edge の「Natural」の声がいちばん自然
  preferredVoices: ["Nanami Online (Natural)", "Natural", "Google 日本語", "Nanami", "Kyoko", "Haruka", "Ayumi", "Otoya"],
};

// 文に区切ってから、maxLen 字くらいまでまとめる（1文ずつだと、文の間が途切れて聞こえるため）
function splitForSpeech(text, maxLen) {
  const sentences = text.match(/[^。！？!?\n]+[。！？!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const parts = [];
  for (const s of sentences) {
    if (parts.length && (parts.at(-1) + s).length <= maxLen) parts[parts.length - 1] += s;
    else parts.push(s);
  }
  return parts;
}

export class BrowserSpeaker {
  constructor(settings = VOICE_SETTINGS) {
    this.settings = settings;
    this.voice = null;
    this.session = 0;
    this.label = "ブラウザ標準の声";
    if ("speechSynthesis" in window) {
      this.pickVoice();
      speechSynthesis.addEventListener("voiceschanged", () => this.pickVoice());
    }
  }

  get supported() {
    return "speechSynthesis" in window;
  }

  pickVoice() {
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith("ja"));
    for (const name of this.settings.preferredVoices) {
      const found = voices.find((v) => v.name.includes(name));
      if (found) return (this.voice = found);
    }
    this.voice = voices[0] || null;
  }

  // 長すぎる文をまとめて渡すと途中で止まるブラウザがあるので、100字くらいずつ順番に話す
  speak(text, { onStart, onEnd } = {}) {
    this.stop();
    if (!this.supported) return onEnd?.();
    const session = ++this.session;
    const parts = splitForSpeech(text, 100);
    if (parts.length === 0) return onEnd?.();

    this.onEnd = onEnd;
    onStart?.();
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = this.settings.lang;
      u.rate = this.settings.rate;
      u.pitch = this.settings.pitch;
      if (this.voice) u.voice = this.voice;
      if (i === parts.length - 1) {
        u.onend = u.onerror = () => {
          if (session === this.session) this.finish();
        };
      }
      speechSynthesis.speak(u);
    });
  }

  stop() {
    if (!this.supported) return;
    this.session++;
    speechSynthesis.cancel();
    this.finish();
  }

  // 話し終わりの合図は1回だけ出す
  finish() {
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }
}

// VOICEVOX の声（サーバーの /api/tts 経由）。
// 1つ目を話している間に次の文の音声を作っておくので、文と文の間が空きにくい
export class VoicevoxSpeaker {
  constructor(name) {
    this.label = `VOICEVOX:${name}`;
    this.session = 0;
    this.audio = new Audio();
    this.onEnd = null;
  }

  async synth(text) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("tts failed");
    return URL.createObjectURL(await res.blob());
  }

  async speak(text, { onStart, onEnd } = {}) {
    this.stop();
    const session = ++this.session;
    const parts = splitForSpeech(text, 60);
    if (parts.length === 0) return onEnd?.();
    this.onEnd = onEnd;

    let next = this.synth(parts[0]);
    let started = false;
    try {
      for (let i = 0; i < parts.length; i++) {
        const url = await next;
        if (session !== this.session) return URL.revokeObjectURL(url);
        if (i + 1 < parts.length) next = this.synth(parts[i + 1]); // 次の文を先に作っておく
        if (!started) {
          started = true;
          onStart?.();
        }
        await this.play(url);
        URL.revokeObjectURL(url);
        if (session !== this.session) return;
      }
    } catch {
      // VOICEVOX が途中で止まったときは、残りをあきらめて終わる
    }
    if (session === this.session) this.finish();
  }

  play(url) {
    return new Promise((resolve) => {
      this.audio.onended = this.audio.onerror = this.audio.onpause = () => resolve();
      this.audio.src = url;
      this.audio.play().catch(resolve);
    });
  }

  stop() {
    this.session++;
    this.audio.pause();
    this.finish();
  }

  finish() {
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }
}

// VOICEVOX が使えればその声、だめならブラウザ標準の声
export async function createSpeaker() {
  try {
    const res = await fetch("/api/tts/status");
    const status = await res.json();
    if (status.voicevox) return new VoicevoxSpeaker(status.name);
  } catch {
    // サーバーに聞けないときはブラウザの声
  }
  return new BrowserSpeaker();
}

// ---------------------------------------------------------------
// 読み上げ用に、Markdown の記号や数式を「話し言葉」に直す
// ---------------------------------------------------------------
export function toSpeechText(markdown) {
  return markdown
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => ` ${mathToSpeech(t)} `)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => ` ${mathToSpeech(t)} `)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => ` ${mathToSpeech(t)} `)
    .replace(/\$([^$\n]+?)\$/g, (_, t) => ` ${mathToSpeech(t)} `)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`#>|]/g, "")
    .replace(/^\s*[-・]\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const WORDS = {
  "\\times": " かける ", "\\div": " わる ", "\\cdot": " かける ", "\\pm": " プラスマイナス ",
  "\\leqq": " 小なりイコール ", "\\geqq": " 大なりイコール ", "\\leq": " 小なりイコール ",
  "\\geq": " 大なりイコール ", "\\le": " 小なりイコール ", "\\ge": " 大なりイコール ",
  "\\neq": " ノットイコール ", "\\fallingdotseq": " ニアリーイコール ", "\\approx": " ニアリーイコール ",
  "\\infty": "無限大", "\\pi": "パイ", "\\theta": "シータ", "\\alpha": "アルファ", "\\beta": "ベータ",
  "\\gamma": "ガンマ", "\\omega": "オメガ", "\\lambda": "ラムダ", "\\mu": "ミュー", "\\sigma": "シグマ",
  "\\Delta": "デルタ", "\\sin": "サイン", "\\cos": "コサイン", "\\tan": "タンジェント",
  "\\log": "ログ", "\\lim": "リミット", "\\sum": "シグマ", "\\int": "インテグラル",
  "\\angle": "角", "\\triangle": "三角形", "\\perp": " 垂直 ", "\\parallel": " 平行 ",
  "\\to": " から ", "\\rightarrow": " ならば ", "\\Rightarrow": " ならば ", "\\therefore": "よって",
  "\\circ": "度", "\\%": "パーセント",
};

export function mathToSpeech(tex) {
  let s = tex;
  // 分数・ルートは中から順にほどく（入れ子に対応）
  for (let i = 0; i < 5; i++) {
    s = s
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, " $2 分の $1 ")
      .replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, " $1 乗根 $2 ")
      .replace(/\\sqrt\{([^{}]*)\}/g, " ルート $1 ")
      .replace(/\^\{?\\circ\}?/g, "度")
      .replace(/\\(int|sum)_\{?([^{}^\s]+)\}?\^\{?([^{}\s]+)\}?/g, " \\$1 $2 から $3 まで ")
      .replace(/\^\{2\}|\^2/g, " の2乗 ")
      .replace(/\^\{3\}|\^3/g, " の3乗 ")
      .replace(/\^\{([^{}]*)\}/g, " の $1 乗 ")
      .replace(/\^(\w)/g, " の $1 乗 ")
      .replace(/\\(?:text|mathrm|mathbf|vec|overline|boldsymbol)\{([^{}]*)\}/g, " $1 ");
  }
  const keys = Object.keys(WORDS).sort((a, b) => b.length - a.length);
  for (const k of keys) s = s.split(k).join(WORDS[k]);
  return s
    .replace(/\\left|\\right|\\,|\\;|\\!|\\quad|\\qquad/g, " ")
    .replace(/_\{([^{}]*)\}|_(\w)/g, " $1$2 ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/<=|≦/g, " 小なりイコール ")
    .replace(/>=|≧/g, " 大なりイコール ")
    .replace(/</g, " 小なり ")
    .replace(/>/g, " 大なり ")
    .replace(/=/g, " イコール ")
    .replace(/\+/g, " プラス ")
    .replace(/[-−]/g, " マイナス ")
    .replace(/\//g, " 割る ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------
// 音声入力（Web Speech API の SpeechRecognition）
// Chrome / Edge で使えます。Safari・Firefox では使えないことがあります。
// ---------------------------------------------------------------
export class Listener {
  // onText(text)  … 聞き取り中の文字（途中も含む）
  // onFinal(text) … 話し終わって確定した文字
  // onState(on, heard) … 聞き取りの開始/終了。終了時の heard は、何か聞き取れたかどうか
  constructor({ lang = "ja-JP", onText, onFinal, onState, onDenied } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(SR);
    this.listening = false;
    if (!SR) return;

    this.rec = new SR();
    this.rec.lang = lang;
    this.rec.interimResults = true;
    this.rec.continuous = false;
    this.heard = "";

    this.rec.onresult = (e) => {
      let text = "";
      for (const r of e.results) text += r[0].transcript;
      this.heard = text;
      onText?.(text);
      if (e.results[e.results.length - 1].isFinal) onFinal?.(text);
    };
    this.rec.onstart = () => {
      this.listening = true;
      this.heard = "";
      onState?.(true, false);
    };
    this.rec.onend = () => {
      this.listening = false;
      onState?.(false, Boolean(this.heard.trim()));
    };
    this.rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") onDenied?.();
    };
  }

  start() {
    if (!this.supported || this.listening) return;
    try {
      this.rec.start();
    } catch {
      // すでに聞き取り中
    }
  }

  toggle() {
    if (this.listening) this.rec.stop();
    else this.start();
  }

  stop() {
    if (this.listening) this.rec.stop();
  }
}
