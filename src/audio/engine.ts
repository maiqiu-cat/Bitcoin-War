import * as I from './instruments';
import { musicIntensity, smoothIntensity, spatial, VoiceLimiter, type IntensityInput } from './mix';
import { MusicDirector } from './music';

export type SoundState = 'off' | 'locked' | 'running';

const STORAGE_KEY = 'bb.sound';

interface Graph {
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  reverbIn: GainNode;
  out: I.Out;
  musicOut: I.Out;
}

/** master ← compressor; music bus, sfx bus, shared hall reverb. */
function buildGraph(ctx: BaseAudioContext): Graph {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  comp.connect(ctx.destination);
  // Remove inaudible sub-rumble (< 28 Hz) that only eats headroom on laptop speakers.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 28;
  hp.Q.value = 0.6;
  hp.connect(comp);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(hp);
  const reverb = ctx.createConvolver();
  reverb.buffer = I.impulseResponse(ctx);
  const reverbIn = ctx.createGain();
  reverbIn.gain.value = 1;
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.32;
  reverbIn.connect(reverb).connect(reverbOut).connect(master);
  const music = ctx.createGain();
  music.gain.value = 0.42;
  music.connect(master);
  const sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(master);
  return { master, music, sfx, reverbIn, out: { dest: sfx, send: reverbIn }, musicOut: { dest: music, send: reverbIn } };
}

export function readSoundPref(search = globalThis.location?.search ?? ''): boolean {
  const q = new URLSearchParams(search).get('sound');
  if (q === '0' || q === 'off') return false;
  if (q === '1' || q === 'on') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Battle audio: adaptive music + positional effects. Browsers only allow audio after a user
 * gesture, so the context is created/resumed in `unlock()` (wired to the first click/key).
 */
export class AudioEngine {
  enabled: boolean;
  onState?: (s: SoundState) => void;
  private ctx: AudioContext | null = null;
  private g: Graph | null = null;
  private music: MusicDirector | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private intensity = 0.2;
  private target = 0.2;
  private limiter = new VoiceLimiter({
    rifle: { max: 9, windowMs: 1000 },
    cannon: { max: 4, windowMs: 1000 },
    explosion: { max: 6, windowMs: 1000 },
    whistle: { max: 3, windowMs: 1000 },
    flare: { max: 2, windowMs: 1000 },
  });

  constructor(enabled = readSoundPref()) {
    this.enabled = enabled;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  get state(): SoundState {
    if (!this.enabled) return 'off';
    return this.ctx && this.ctx.state === 'running' ? 'running' : 'locked';
  }

  get debug() {
    return { state: this.state, ctxState: this.ctx?.state ?? 'none', intensity: +this.intensity.toFixed(3), sampleRate: this.ctx?.sampleRate };
  }

  /** Call from a user gesture (click / key / touch). Safe to call repeatedly. */
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.g = buildGraph(this.ctx);
      this.music = new MusicDirector(this.ctx, this.g.musicOut);
      this.music.start(this.ctx.currentTime + 0.15);
      this.music.setIntensity(this.intensity, this.ctx.currentTime);
      this.ctx.onstatechange = () => this.emit();
      this.timer = setInterval(() => this.pump(), 50);
    }
    if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume().then(() => this.emit(), () => this.emit());
    this.emit();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
    if (on) this.unlock();
    else this.ctx?.suspend().then(() => this.emit(), () => this.emit());
    this.emit();
  }

  toggle() {
    this.setEnabled(!this.enabled);
    if (this.enabled) this.play((ctx, out, t) => I.click(ctx, out, t));
  }

  /** Market activity → music intensity target (called from the logic tick). */
  setActivity(input: IntensityInput) {
    this.target = musicIntensity(input);
  }

  /** Per-frame smoothing of the music intensity. */
  frame(dt: number) {
    const next = smoothIntensity(this.intensity, this.target, dt);
    if (Math.abs(next - this.intensity) > 0.002 && this.ctx && this.music) this.music.setIntensity(next, this.ctx.currentTime);
    this.intensity = next;
  }

  /** Stop scheduling and release the audio device. */
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.music?.stop();
    this.ctx?.close();
    this.ctx = null;
    this.g = null;
    this.music = null;
    this.emit();
  }

  /* --------------------------------------------------------------- effects */

  rifle(screenX: number, dist: number) {
    if (!this.ready('rifle')) return;
    const { pan, gain } = spatial(screenX, dist);
    this.play((ctx, out, t) => I.rifle(ctx, out, t, pan, gain), Math.random() * 0.03);
  }

  cannon(screenX: number, dist: number, size: number) {
    if (!this.ready('cannon')) return;
    const { pan, gain } = spatial(screenX, dist);
    this.play((ctx, out, t) => I.cannon(ctx, out, t, pan, gain, size));
  }

  explosion(screenX: number, dist: number, size: number) {
    if (!this.ready('explosion')) return;
    const { pan, gain } = spatial(screenX, dist, 70);
    this.play((ctx, out, t) => I.explosion(ctx, out, t, pan, gain, size));
  }

  whistle(screenX: number, dist: number, dur: number) {
    if (!this.ready('whistle')) return;
    const { pan, gain } = spatial(screenX, dist, 80);
    this.play((ctx, out, t) => I.whistle(ctx, out, t, pan, gain, dur));
  }

  flare(screenX: number, dist: number) {
    if (!this.ready('flare')) return;
    const { pan, gain } = spatial(screenX, dist, 70);
    this.play((ctx, out, t) => I.flare(ctx, out, t, pan, gain));
  }

  horn() {
    if (this.state !== 'running') return;
    this.play((ctx, out, t) => I.horn(ctx, out, t));
  }

  fanfare(team: 'bulls' | 'bears') {
    if (this.state !== 'running' || !this.ctx || !this.g) return;
    // duck the score so the fanfare reads clearly
    const t = this.ctx.currentTime;
    const m = this.g.music.gain;
    m.cancelScheduledValues(t);
    m.setTargetAtTime(0.12, t, 0.15);
    m.setTargetAtTime(0.42, t + 2.6, 0.8);
    this.play((ctx, out, tt) => I.fanfare(ctx, out, tt, team));
  }

  /* -------------------------------------------------------------- internal */

  private ready(category: string) {
    return this.state === 'running' && this.limiter.allow(category, performance.now());
  }

  private play(fn: (ctx: BaseAudioContext, out: I.Out, t: number) => void, delay = 0) {
    if (!this.ctx || !this.g || this.ctx.state !== 'running') return;
    fn(this.ctx, this.g.out, this.ctx.currentTime + 0.01 + delay);
  }

  private pump() {
    if (this.ctx && this.music && this.ctx.state === 'running') this.music.schedule(this.ctx.currentTime + 0.25);
  }

  private onVisibility() {
    if (!this.ctx) return;
    if (document.hidden) this.ctx.suspend().then(() => this.emit(), () => this.emit());
    else if (this.enabled) this.ctx.resume().then(() => this.emit(), () => this.emit());
  }

  private emit() {
    this.onState?.(this.state);
  }
}

/* ----------------------------------------------------------- offline preview */

export interface PreviewResult {
  seconds: number;
  sampleRate: number;
  peak: number;
  rmsDb: number;
  /** RMS (dBFS) per 2-second window, to show the music building up. */
  windowsDb: number[];
  wavBase64: string;
}

/**
 * Render a deterministic-length demo (score rising from calm to storming, plus every effect)
 * with an OfflineAudioContext, measure levels and return a 16-bit WAV.
 */
export async function renderPreview(seconds = 32, sampleRate = 44100): Promise<PreviewResult> {
  const ctx = new OfflineAudioContext(2, Math.floor(seconds * sampleRate), sampleRate);
  const g = buildGraph(ctx);
  const music = new MusicDirector(ctx, g.musicOut);
  music.start(0.05);
  // intensity curve: calm → active → storming → calm
  const curve = (t: number) => (t < 8 ? 0.2 : t < 16 ? 0.5 : t < 24 ? 0.9 : 0.35);
  for (let t = 0; t < seconds; t += 0.5) {
    music.setIntensity(curve(t), t);
    music.schedule(t + 0.5);
  }
  const out = g.out;
  I.horn(ctx, out, 0.3);
  for (let i = 0; i < 40; i++) I.rifle(ctx, out, 2 + Math.random() * 26, (Math.random() - 0.5) * 1.4, 0.3 + Math.random() * 0.6);
  I.cannon(ctx, out, 6, -0.4, 0.9, 1.5);
  I.explosion(ctx, out, 7.1, 0.3, 0.9, 1.4);
  I.whistle(ctx, out, 10, 0.5, 0.8, 1.6);
  I.explosion(ctx, out, 11.6, 0.5, 1, 3.4);
  I.flare(ctx, out, 14, -0.6, 0.8);
  for (const [t, p, s] of [[18, -0.3, 2], [18.6, 0.4, 1], [19.5, 0, 2.8], [21, -0.5, 1.2]] as const) I.explosion(ctx, out, t, p, 0.9, s);
  I.fanfare(ctx, out, 25, 'bulls');
  const buf = await ctx.startRendering();

  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  let sum = 0;
  const win = 2 * sampleRate;
  const windowsDb: number[] = [];
  let wsum = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a > peak) peak = a;
    const e = (L[i] * L[i] + R[i] * R[i]) / 2;
    sum += e;
    wsum += e;
    if ((i + 1) % win === 0) {
      windowsDb.push(+(10 * Math.log10(wsum / win + 1e-12)).toFixed(1));
      wsum = 0;
    }
  }
  return {
    seconds,
    sampleRate,
    peak: +peak.toFixed(4),
    rmsDb: +(10 * Math.log10(sum / L.length + 1e-12)).toFixed(1),
    windowsDb,
    wavBase64: toWavBase64(L, R, sampleRate),
  };
}

function toWavBase64(L: Float32Array, R: Float32Array, sr: number) {
  const n = L.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
