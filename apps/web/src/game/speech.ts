/** Tap-and-hold on any icon says its name. Gentle reading readiness. */
export function speak(text: string, enabled: boolean) {
  if (!enabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  } catch {
    // Speech is a nicety; never let it break play.
  }
}
