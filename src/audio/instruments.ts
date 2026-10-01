/**
 * Procedural instruments and sound effects (Web Audio, no samples).
 * Every function takes the context explicitly so the same code drives the live AudioContext
 * and an OfflineAudioContext (used to render the preview WAV in verification).
 */
import { midiToHz } from './mix';

export interface Out {
  dest: AudioNode;
  /** Reverb input (optional). */
  send?: AudioNode;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ctx: BaseAudioContext) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Stereo impulse response for a medium hall (exponential decay, slightly different per channel). */
export function impulseResponse(ctx: BaseAudioContext, seconds = 2.4, decay = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return ir;
}

/** gain → panner → out (+ reverb send). Returns the input gain node. */
function voice(ctx: BaseAudioContext, out: Out, pan: number, gain: number, sendAmt: number) {
  const g = ctx.createGain();
  g.gain.value = gain;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  p.connect(out.dest);
  if (out.send && sendAmt > 0) {
    const s = ctx.createGain();
    s.gain.value = sendAmt;
    p.connect(s);
    s.connect(out.send);
  }
  return g;
}

function env(param: AudioParam, t: number, peak: number, attack: number, decay: number) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noise(ctx: BaseAudioContext, t: number, dur: number) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
  return s;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, dur: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/* ------------------------------------------------------------------ drums */

export function taiko(ctx: BaseAudioContext, out: Out, t: number, vel: number, low = false) {
  const v = voice(ctx, out, 0, 1, 0.28);
  const decay = low ? 0.95 : 0.6;
  const o = osc(ctx, 'sine', low ? 78 : 108, t, decay + 0.1);
  o.frequency.exponentialRampToValueAtTime(low ? 40 : 52, t + 0.32);
  const g = ctx.createGain();
  env(g.gain, t, 0.95 * vel, 0.004, decay);
  o.connect(g).connect(v);
  const n = noise(ctx, t, 0.08);
  const nf = filter(ctx, 'lowpass', 900);
  const ng = ctx.createGain();
  env(ng.gain, t, 0.3 * vel, 0.002, 0.06);
  n.connect(nf).connect(ng).connect(v);
}

export function tom(ctx: BaseAudioContext, out: Out, t: number, vel: number) {
  const v = voice(ctx, out, -0.15, 1, 0.25);
  const o = osc(ctx, 'sine', 170, t, 0.4);
  o.frequency.exponentialRampToValueAtTime(92, t + 0.25);
  const g = ctx.createGain();
  env(g.gain, t, 0.6 * vel, 0.003, 0.35);
  o.connect(g).connect(v);
}

export function snare(ctx: BaseAudioContext, out: Out, t: number, vel: number, ghost = false) {
  const v = voice(ctx, out, 0.12, 1, ghost ? 0.08 : 0.2);
  const decay = ghost ? 0.07 : 0.17;
  const n = noise(ctx, t, decay + 0.05);
  const hp = filter(ctx, 'highpass', 900);
  const bp = filter(ctx, 'bandpass', 2300, 0.7);
  const ng = ctx.createGain();
  env(ng.gain, t, 0.55 * vel, 0.002, decay);
  n.connect(hp).connect(bp).connect(ng).connect(v);
  if (!ghost) {
    const o = osc(ctx, 'triangle', 195, t, 0.12);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = ctx.createGain();
    env(og.gain, t, 0.35 * vel, 0.002, 0.08);
    o.connect(og).connect(v);
  }
}

export function hat(ctx: BaseAudioContext, out: Out, t: number, vel: number) {
  const v = voice(ctx, out, 0.3, 1, 0.05);
  const n = noise(ctx, t, 0.06);
  const hp = filter(ctx, 'highpass', 7500);
  const g = ctx.createGain();
  env(g.gain, t, 0.18 * vel, 0.001, 0.04);
  n.connect(hp).connect(g).connect(v);
}

/* ------------------------------------------------------------------ tonal */

export function bass(ctx: BaseAudioContext, out: Out, t: number, note: number, dur: number, vel: number) {
  const v = voice(ctx, out, 0, 1, 0.05);
  const f = midiToHz(note);
  const lp = filter(ctx, 'lowpass', 600, 3);
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.012);
  g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.25);
  osc(ctx, 'sawtooth', f, t, dur).connect(lp);
  osc(ctx, 'square', f / 2, t, dur).connect(lp);
  lp.connect(g).connect(v);
}

/** Strings-like pad: detuned saws, slow attack, gentle lowpass. */
export function pad(ctx: BaseAudioContext, out: Out, t: number, notes: number[], dur: number, vel: number) {
  const lp = filter(ctx, 'lowpass', 1150, 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16 * vel, t + Math.min(0.9, dur * 0.4));
  g.gain.setValueAtTime(0.16 * vel, t + dur - 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.0);
  lp.connect(g);
  notes.forEach((n, i) => {
    const pan = (i - (notes.length - 1) / 2) * 0.45;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    for (const det of [-8, 7]) osc(ctx, 'sawtooth', midiToHz(n), t, dur + 1.0, det).connect(p);
    p.connect(lp);
  });
  const v = voice(ctx, out, 0, 1, 0.45);
  g.connect(v);
}

export function drone(ctx: BaseAudioContext, out: Out, t: number, note: number, dur: number, vel: number) {
  const v = voice(ctx, out, 0, 1, 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.15 * vel, t + 1.5);
  g.gain.setValueAtTime(0.15 * vel, t + dur - 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.5);
  const lp = filter(ctx, 'lowpass', 320, 0.4);
  osc(ctx, 'triangle', midiToHz(note), t, dur + 1.5).connect(lp);
  osc(ctx, 'sine', midiToHz(note + 7), t, dur + 1.5, 4).connect(lp);
  lp.connect(g).connect(v);
}

/** Brass: saws through a filter that opens on the attack (swell). */
export function brass(ctx: BaseAudioContext, out: Out, t: number, note: number, dur: number, vel: number, pan = 0) {
  const v = voice(ctx, out, pan, 1, 0.5);
  const f = midiToHz(note);
  const lp = filter(ctx, 'lowpass', 400, 1.6);
  lp.frequency.setValueAtTime(380, t);
  lp.frequency.exponentialRampToValueAtTime(2600, t + 0.09);
  lp.frequency.exponentialRampToValueAtTime(1300, t + Math.max(0.2, dur));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.06);
  g.gain.setValueAtTime(0.17 * vel, t + Math.max(0.08, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
  for (const det of [-6, 5]) osc(ctx, 'sawtooth', f, t, dur + 0.4, det).connect(lp);
  osc(ctx, 'square', f / 2, t, dur + 0.4).connect(lp);
  lp.connect(g).connect(v);
}

/* -------------------------------------------------------------- effects */

export function rifle(ctx: BaseAudioContext, out: Out, t: number, pan: number, gain: number) {
  const v = voice(ctx, out, pan, gain * 0.32, 0.18);
  const n = noise(ctx, t, 0.12);
  const bp = filter(ctx, 'bandpass', 1500 + Math.random() * 1400, 0.9);
  const g = ctx.createGain();
  env(g.gain, t, 1, 0.001, 0.07 + Math.random() * 0.03);
  n.connect(bp).connect(g).connect(v);
  const o = osc(ctx, 'sine', 150, t, 0.08);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.06);
  const og = ctx.createGain();
  env(og.gain, t, 0.45, 0.001, 0.06);
  o.connect(og).connect(v);
}

export function cannon(ctx: BaseAudioContext, out: Out, t: number, pan: number, gain: number, size: number) {
  const s = Math.max(0.4, Math.min(1, size / 2.5));
  const v = voice(ctx, out, pan, gain * (0.5 + 0.5 * s), 0.45);
  const o = osc(ctx, 'sine', 95, t, 1.0);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
  const og = ctx.createGain();
  env(og.gain, t, 0.9, 0.003, 0.85);
  o.connect(og).connect(v);
  const n = noise(ctx, t, 0.9);
  const lp = filter(ctx, 'lowpass', 2600, 0.8);
  lp.frequency.setValueAtTime(2600, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + 0.7);
  const ng = ctx.createGain();
  env(ng.gain, t, 0.7, 0.002, 0.8);
  n.connect(lp).connect(ng).connect(v);
}

export function explosion(ctx: BaseAudioContext, out: Out, t: number, pan: number, gain: number, size: number) {
  const s = Math.max(0.15, Math.min(1, size / 3.6));
  const dur = 1.1 + s * 2.4;
  const v = voice(ctx, out, pan, gain * (0.55 + 0.45 * s), 0.55);
  // sub boom
  const o = osc(ctx, 'sine', 72, t, dur);
  o.frequency.exponentialRampToValueAtTime(24, t + dur * 0.6);
  const og = ctx.createGain();
  env(og.gain, t, 1, 0.004, dur * 0.8);
  o.connect(og).connect(v);
  // body: noise with a closing lowpass
  const n = noise(ctx, t, dur);
  const lp = filter(ctx, 'lowpass', 3000, 0.6);
  lp.frequency.setValueAtTime(1800 + 2600 * s, t);
  lp.frequency.exponentialRampToValueAtTime(130, t + dur);
  const ng = ctx.createGain();
  env(ng.gain, t, 0.85, 0.006, dur);
  n.connect(lp).connect(ng).connect(v);
  // crackle for bigger blasts
  const crackles = Math.round(6 + 26 * s);
  for (let i = 0; i < crackles; i++) {
    const ct = t + 0.08 + Math.random() * dur * 0.6;
    const cn = noise(ctx, ct, 0.03);
    const hp = filter(ctx, 'highpass', 2200 + Math.random() * 2000);
    const cg = ctx.createGain();
    env(cg.gain, ct, 0.12 + Math.random() * 0.18, 0.001, 0.015 + Math.random() * 0.02);
    cn.connect(hp).connect(cg).connect(v);
  }
}

/** Incoming-shell whistle (liquidation artillery). */
export function whistle(ctx: BaseAudioContext, out: Out, t: number, pan: number, gain: number, dur: number) {
  const v = voice(ctx, out, pan, gain * 0.16, 0.3);
  const o = osc(ctx, 'sine', 1700, t, dur);
  o.frequency.exponentialRampToValueAtTime(520, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.8, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(v);
}

export function flare(ctx: BaseAudioContext, out: Out, t: number, pan: number, gain: number) {
  const v = voice(ctx, out, pan, gain * 0.4, 0.4);
  const n = noise(ctx, t, 0.8);
  const bp = filter(ctx, 'bandpass', 500, 1.2);
  bp.frequency.setValueAtTime(450, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.6, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  n.connect(bp).connect(g).connect(v);
  const p = osc(ctx, 'triangle', 1100, t + 0.68, 0.1);
  const pg = ctx.createGain();
  env(pg.gain, t + 0.68, 0.35, 0.002, 0.08);
  p.connect(pg).connect(v);
}

/** Round start: two-note brass call. */
export function horn(ctx: BaseAudioContext, out: Out, t: number) {
  brass(ctx, out, t, 62, 0.45, 1.1, -0.1);
  brass(ctx, out, t + 0.5, 69, 1.1, 1.2, 0.1);
  brass(ctx, out, t + 0.5, 57, 1.1, 0.8, -0.1);
}

/** Victory fanfare: major and heroic for bulls, minor and heavy for bears. */
export function fanfare(ctx: BaseAudioContext, out: Out, t: number, team: 'bulls' | 'bears') {
  const third = team === 'bulls' ? 66 : 65;
  const seq = [62, third, 69, 74];
  seq.forEach((n, i) => brass(ctx, out, t + i * 0.16, n, 0.22, 1.1, (i - 1.5) * 0.15));
  const ct = t + seq.length * 0.16;
  for (const n of [62, third, 69, 74]) brass(ctx, out, ct, n, 1.6, 0.9, (n - 68) / 20);
  taiko(ctx, out, ct, 1, true);
  taiko(ctx, out, ct + 0.32, 0.8);
}

export function click(ctx: BaseAudioContext, out: Out, t: number) {
  const v = voice(ctx, out, 0, 0.15, 0);
  const o = osc(ctx, 'sine', 880, t, 0.06);
  const g = ctx.createGain();
  env(g.gain, t, 1, 0.002, 0.05);
  o.connect(g).connect(v);
}
