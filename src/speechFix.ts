// iPhone / iPad Safari で speechSynthesis.cancel() の直後に speak() すると
// 発話が開始されないことがあるため、アプリ全体の Web Speech API を安定化します。
// App.tsx を巨大なまま直接編集せず、既存の発音コードすべてに適用します。

let installed = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let requestId = 0;

export function installStableSpeechPatch() {
  if (installed || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  installed = true;

  const synth = window.speechSynthesis;
  const nativeSpeak = synth.speak.bind(synth);
  const nativeCancel = synth.cancel.bind(synth);
  const nativeResume = synth.resume.bind(synth);

  // 既存コードの cancel() はそのまま尊重しつつ、待機中の発話も確実に破棄します。
  synth.cancel = (() => {
    requestId += 1;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    nativeCancel();
  }) as typeof synth.cancel;

  // 既存の全 speak() をここで受け、cancel() と同一タイミングで発話しないようにします。
  synth.speak = ((utterance: SpeechSynthesisUtterance) => {
    const id = ++requestId;
    if (pendingTimer) clearTimeout(pendingTimer);

    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      if (id !== requestId) return;

      // iOS Safari が paused 状態を保持している場合に復帰させます。
      nativeResume();
      nativeSpeak(utterance);

      // 稀に queued/paused のまま止まるケースへの保険。
      setTimeout(() => {
        if (id !== requestId) return;
        if (synth.paused) nativeResume();
      }, 350);
    }, 120);
  }) as typeof synth.speak;
}

installStableSpeechPatch();
