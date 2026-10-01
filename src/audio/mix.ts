/** Pure helpers for the audio system (no Web Audio here, so they can be unit-tested). */

/** Stereo pan and gain for a sound at normalized screen x (-1..1) and camera distance. */
export function spatial(screenX: number, distance: number, ref = 55): { pan: number; gain: number } {
  const pan = Math.max(-1, Math.min(1, screenX)) * 0.85;
  const gain = Math.max(0.05, Math.min(1, ref / (ref + Math.max(0, distance))) ** 1.1);
  return { pan, gain };
}

/**
 * Caps how many sounds of one category may start within a sliding window, so a burst of
 * events (26 rifle shots per second per side) never turns into noise or overloads the graph.
 */
export class VoiceLimiter {
  private recent = new Map<string, number[]>();
  constructor(private readonly limits: Record<string, { max: number; windowMs: number }>) {}

  allow(category: string, nowMs: number): boolean {
    const lim = this.limits[category];
    if (!lim) return true;
    const arr = this.recent.get(category) ?? [];
    while (arr.length && nowMs - arr[0] >= lim.windowMs) arr.shift();
    if (arr.length >= lim.max) {
      this.recent.set(category, arr);
      return false;
    }
    arr.push(nowMs);
    this.recent.set(category, arr);
    return true;
  }
}

export interface IntensityInput {
  /** Taker flow, USD per second (both sides). */
  flowPerSec: number;
  /** Round progress 0..1 (0.5 = centre). */
  progress: number;
  /** True while a side is storming a base. */
  storming: boolean;
  /** Recent large events per minute (big trades + liquidations). */
  eventsPerMin: number;
}

/** Target music intensity 0..1 from market activity. */
export function musicIntensity(i: IntensityInput): number {
  const flow = Math.min(1, Math.max(0, (Math.log10(1 + i.flowPerSec) - 3) / 3)); // $1K/s → 0, $1M/s → 1
  const edge = Math.min(1, Math.abs(i.progress - 0.5) * 2); // distance from the centre
  const events = Math.min(1, i.eventsPerMin / 12);
  let v = 0.15 + flow * 0.35 + edge * 0.25 + events * 0.25;
  if (i.storming) v = Math.max(v, 0.85);
  return Math.max(0, Math.min(1, v));
}

/** Smooth towards a target: fast attack, slow release (seconds). */
export function smoothIntensity(current: number, target: number, dt: number, attack = 3, release = 9) {
  const tau = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/** Layer gains for the music at a given intensity. */
export function layerGains(intensity: number) {
  const ramp = (from: number, to: number) => Math.max(0, Math.min(1, (intensity - from) / (to - from)));
  return {
    pad: 0.55 + 0.45 * ramp(0, 0.6),
    drone: 1,
    taiko: ramp(0.2, 0.45),
    bass: ramp(0.25, 0.5),
    snare: ramp(0.45, 0.7),
    brass: ramp(0.7, 0.9),
  };
}

/** D minor, i–VI–iv–V: Dm, Bb, Gm, A. MIDI note numbers (root position, mid register). */
export const PROGRESSION: { name: string; root: number; triad: [number, number, number] }[] = [
  { name: 'Dm', root: 38, triad: [62, 65, 69] },
  { name: 'Bb', root: 34, triad: [58, 62, 65] },
  { name: 'Gm', root: 31, triad: [55, 58, 62] },
  { name: 'A', root: 33, triad: [57, 61, 64] },
];

export const chordForBar = (bar: number) => PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export type DrumInst = 'taiko' | 'taikoLow' | 'snare' | 'ghost' | 'hat' | 'tom';

/** 16-step drum events for one bar at a given intensity (deterministic per bar). */
export function drumPattern(bar: number, intensity: number): { step: number; inst: DrumInst; vel: number }[] {
  const ev: { step: number; inst: DrumInst; vel: number }[] = [];
  // Taiko: heartbeat on 1 and 3, pickup at higher intensity.
  ev.push({ step: 0, inst: 'taikoLow', vel: 1 }, { step: 8, inst: 'taiko', vel: 0.8 });
  if (intensity > 0.55) ev.push({ step: 6, inst: 'taiko', vel: 0.55 }, { step: 14, inst: 'taiko', vel: 0.6 });
  // Military snare: accents on 2 and 4, ghost-note drags.
  ev.push({ step: 4, inst: 'snare', vel: 0.9 }, { step: 12, inst: 'snare', vel: 0.9 });
  for (const s of [2, 3, 10, 11]) ev.push({ step: s, inst: 'ghost', vel: 0.35 });
  if (intensity > 0.75) for (const s of [13, 14, 15]) ev.push({ step: s, inst: 'ghost', vel: 0.5 + (s - 13) * 0.15 });
  // Hats: 8ths, 16ths when hot.
  const hatEvery = intensity > 0.8 ? 1 : 2;
  for (let s = 0; s < 16; s += hatEvery) ev.push({ step: s, inst: 'hat', vel: s % 4 === 0 ? 0.5 : 0.3 });
  // Tom fill every 4th bar.
  if (bar % 4 === 3 && intensity > 0.6) for (const s of [12, 13, 14, 15]) ev.push({ step: s, inst: 'tom', vel: 0.5 + (s - 12) * 0.12 });
  return ev;
}

/** Bass ostinato: root on 8ths with an octave pop (MIDI notes per 16-step bar). */
export function bassLine(bar: number): { step: number; note: number; len: number }[] {
  const r = chordForBar(bar).root;
  const out: { step: number; note: number; len: number }[] = [];
  for (let s = 0; s < 16; s += 2) out.push({ step: s, note: s === 6 || s === 14 ? r + 12 : r, len: 1.6 });
  return out;
}
