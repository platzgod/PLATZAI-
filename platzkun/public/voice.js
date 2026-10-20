// 音声まわり（読み上げ と 音声入力）
//
// ■ 声を差し替えたいとき
//   今はブラウザ標準の音声合成（BrowserSpeaker）を使っています。
//   別の音声エンジン（VOICEVOX など）に替えるときは、
//   同じ形（speak(text, { onStart, onEnd }) と stop()）を持つクラスを作り、
//   いちばん下の createSpeaker() でそれを返すようにするだけで、ほかのファイルは変更不要です。

// ブラウザ標準の声の設定。好みに合わせて変更してください
export const VOICE_SETTINGS = {
  lang: "ja-JP",
  rate: 1.05, // 話す速さ（0.5〜2）
  pitch: 1.25, // 声の高さ（0〜2）。高めにしてキャラクターらしく
  // 使いたい声の名前（一部でOK）。上から順に探して、見つかったものを使う
  preferredVoices: ["Google 日本語", "Nanami", "Kyoko", "Haruka", "Ayumi", "Otoya"],
};

export class BrowserSpeaker {
  constructor(settings = VOICE_SETTINGS) {
    this.settings = settings;
    this.voice = null;
    this.session = 0;
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

  // 長い文をまとめて渡すと途中で止まるブラウザがあるので、文ごとに区切って順番に話す
  speak(text, { onStart, onEnd } = {}) {
    this.stop();
    if (!this.supported) return onEnd?.();
    const session = ++this.session;
    const sentences = text.match(/[^。！？!?\n]+[。！？!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
    if (sentences.length === 0) return onEnd?.();

    this.onEnd = onEnd;
    onStart?.();
    sentences.forEach((sentence, i) => {
      const u = new SpeechSynthesisUtterance(sentence);
      u.lang = this.settings.lang;
      u.rate = this.settings.rate;
      u.pitch = this.settings.pitch;
      if (this.voice) u.voice = this.voice;
      if (i === sentences.length - 1) {
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

export function createSpeaker() {
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
  constructor({ lang = "ja-JP", onText, onState } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(SR);
    this.listening = false;
    if (!SR) return;

    this.rec = new SR();
    this.rec.lang = lang;
    this.rec.interimResults = true;
    this.rec.continuous = false;

    this.rec.onresult = (e) => {
      let text = "";
      for (const r of e.results) text += r[0].transcript;
      onText?.(text, e.results[e.results.length - 1].isFinal);
    };
    this.rec.onstart = () => {
      this.listening = true;
      onState?.(true);
    };
    this.rec.onend = () => {
      this.listening = false;
      onState?.(false);
    };
    this.rec.onerror = (e) => {
      if (e.error === "not-allowed") alert("マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。");
    };
  }

  toggle() {
    if (!this.supported) return;
    if (this.listening) this.rec.stop();
    else this.rec.start();
  }

  stop() {
    if (this.listening) this.rec.stop();
  }
}
