import { bass, brass, drone, hat, pad, snare, taiko, tom, type Out } from './instruments';
import { bassLine, chordForBar, drumPattern, layerGains } from './mix';

type Layer = 'pad' | 'drone' | 'taiko' | 'bass' | 'snare' | 'brass';

/**
 * Adaptive battle score: D minor, 92 BPM, 16 steps per bar, scheduled with a short look-ahead.
 * Intensity (0..1, from market activity) fades layers in and out:
 *   strings pad + drone (always) → taiko + bass → military snare + hats → brass stabs.
 */
export class MusicDirector {
  readonly bpm = 92;
  readonly stepDur = 60 / 92 / 4;
  intensity = 0.2;
  private layers = {} as Record<Layer, GainNode>;
  private nextStep = 0;
  private step = 0;
  private bar = 0;
  private running = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: Out,
  ) {
    for (const name of ['pad', 'drone', 'taiko', 'bass', 'snare', 'brass'] as Layer[]) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out.dest);
      this.layers[name] = g;
    }
    this.out = (layer: Layer): Out => ({ dest: this.layers[layer], send: out.send });
  }

  private out: (layer: Layer) => Out;

  start(at: number) {
    this.running = true;
    this.nextStep = at;
    this.step = 0;
    this.bar = 0;
    this.applyGains(at, 0.01);
  }

  stop() {
    this.running = false;
  }

  setIntensity(v: number, at: number) {
    this.intensity = Math.max(0, Math.min(1, v));
    this.applyGains(at, 1.2);
  }

  private applyGains(at: number, tau: number) {
    const g = layerGains(this.intensity);
    for (const k of Object.keys(g) as Layer[]) this.layers[k].gain.setTargetAtTime(g[k], at, tau);
  }

  /** Schedule every step that starts before `until` (seconds, context time). */
  schedule(until: number) {
    if (!this.running) return;
    while (this.nextStep < until) {
      this.scheduleStep(this.step, this.nextStep);
      this.nextStep += this.stepDur;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private scheduleStep(s: number, t: number) {
    const ctx = this.ctx;
    const I = this.intensity;
    const g = layerGains(I);
    const barDur = this.stepDur * 16;
    if (s === 0) {
      const chord = chordForBar(this.bar);
      pad(ctx, this.out('pad'), t, chord.triad, barDur, 0.9);
      if (this.bar % 4 === 0) drone(ctx, this.out('drone'), t, 38, barDur * 4, 0.9);
    }
    if (g.brass > 0.02 && (s === 0 || (s === 10 && this.bar % 2 === 1))) {
      const chord = chordForBar(this.bar);
      const len = s === 0 ? this.stepDur * 3 : this.stepDur * 2;
      chord.triad.forEach((n, i) => brass(ctx, this.out('brass'), t, n - 12, len, 0.8, (i - 1) * 0.3));
    }
    if (g.taiko > 0.02 || g.snare > 0.02) {
      for (const e of drumPattern(this.bar, I)) {
        if (e.step !== s) continue;
        if ((e.inst === 'taiko' || e.inst === 'taikoLow' || e.inst === 'tom') && g.taiko <= 0.02) continue;
        if ((e.inst === 'snare' || e.inst === 'ghost' || e.inst === 'hat') && g.snare <= 0.02) continue;
        if (e.inst === 'taiko' || e.inst === 'taikoLow') taiko(ctx, this.out('taiko'), t, e.vel, e.inst === 'taikoLow');
        else if (e.inst === 'tom') tom(ctx, this.out('taiko'), t, e.vel);
        else if (e.inst === 'snare') snare(ctx, this.out('snare'), t, e.vel);
        else if (e.inst === 'ghost') snare(ctx, this.out('snare'), t, e.vel, true);
        else hat(ctx, this.out('snare'), t, e.vel);
      }
    }
    if (g.bass > 0.02) for (const b of bassLine(this.bar)) if (b.step === s) bass(ctx, this.out('bass'), t, b.note, b.len * this.stepDur, 0.9);
  }
}
