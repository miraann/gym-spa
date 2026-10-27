import type { CheckinResult } from '@gym/core';

// A short sound for each check-in result, so reception hears it without looking: one high tone
// lets in, two rising ones let in with a note, one middle tone is "already in", two low ones
// refuse. Made with Web Audio (no sound files); a browser that can't play it stays silent.

const TONES: Readonly<Record<CheckinResult, readonly number[]>> = {
  allowed: [880],
  warning: [660, 880],
  already: [660],
  denied: [220, 220],
};

const TONE_SECONDS = 0.14;
const GAP_SECONDS = 0.06;

let context: AudioContext | null = null;

export function playCheckinSound(result: CheckinResult): void {
  try {
    context ??= new AudioContext();
    const audio = context;
    void audio.resume();
    TONES[result].forEach((frequency, index) => {
      const start = audio.currentTime + index * (TONE_SECONDS + GAP_SECONDS);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + TONE_SECONDS);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + TONE_SECONDS);
    });
  } catch {
    // No sound: the screen still shows the result.
  }
}
