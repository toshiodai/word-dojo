// iOS / iPadOS Safari で Web Speech API の cancel() 直後に speak() すると
// 発話が開始されないことがあるため、発音処理をここで直列化します。
let speechTimer: ReturnType<typeof setTimeout> | null = null;
let speechToken = 0;

export type StableSpeakOptions = {
  lang?: string;
  rate?: number;
  onBoundary?: (event: SpeechSynthesisEvent) => void;
  onEnd?: () => void;
};

export function stopSpeech() {
  speechToken += 1;
  if (speechTimer) {
    clearTimeout(speechTimer);
    speechTimer = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function stableSpeak(text: string, options: StableSpeakOptions = {}) {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) {
    options.onEnd?.();
    return;
  }

  const synth = window.speechSynthesis;
  const token = ++speechToken;

  if (speechTimer) clearTimeout(speechTimer);
  synth.cancel();

  // cancel() と speak() を同一イベントループで続けない。
  // iOS Safari ではこの短い待ち時間が発話抜けを大幅に減らす。
  speechTimer = setTimeout(() => {
    if (token !== speechToken) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang ?? "en-US";
    utterance.rate = options.rate ?? 0.9;
    if (options.onBoundary) utterance.onboundary = options.onBoundary;

    let ended = false;
    const finish = () => {
      if (ended || token !== speechToken) return;
      ended = true;
      options.onEnd?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    synth.resume();
    synth.speak(utterance);

    // Safari が稀に queued のまま止まった場合の復帰。
    setTimeout(() => {
      if (token !== speechToken || ended) return;
      if (synth.paused) synth.resume();
    }, 350);
  }, 120);
}
