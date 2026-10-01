import { describe, expect, it } from 'vitest';
import { readSoundPref } from '../src/audio/engine';
import {
  bassLine,
  chordForBar,
  drumPattern,
  layerGains,
  midiToHz,
  musicIntensity,
  smoothIntensity,
  spatial,
  VoiceLimiter,
} from '../src/audio/mix';

describe('spatial', () => {
  it('pans by screen position and attenuates with distance', () => {
    expect(spatial(-2, 0).pan).toBeCloseTo(-0.85);
    expect(spatial(0.5, 0).pan).toBeCloseTo(0.425);
    const near = spatial(0, 10).gain;
    const far = spatial(0, 200).gain;
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(1);
    expect(spatial(0, 1e6).gain).toBeGreaterThanOrEqual(0.05);
  });
});

describe('VoiceLimiter', () => {
  it('caps voices per window and frees them as the window slides', () => {
    const l = new VoiceLimiter({ rifle: { max: 3, windowMs: 1000 } });
    expect([0, 10, 20, 30].map((t) => l.allow('rifle', t))).toEqual([true, true, true, false]);
    expect(l.allow('rifle', 1005)).toBe(true); // first one expired
    expect(l.allow('unknown', 0)).toBe(true);
  });
});

describe('music intensity', () => {
  const calm = { flowPerSec: 500, progress: 0.5, storming: false, eventsPerMin: 0 };
  it('is low when calm and high when storming', () => {
    expect(musicIntensity(calm)).toBeLessThan(0.25);
    expect(musicIntensity({ ...calm, storming: true })).toBeGreaterThanOrEqual(0.85);
  });
  it('rises with flow, edge proximity and events, bounded to 0..1', () => {
    const a = musicIntensity({ ...calm, flowPerSec: 50_000 });
    const b = musicIntensity({ ...calm, flowPerSec: 2_000_000 });
    expect(b).toBeGreaterThan(a);
    expect(musicIntensity({ ...calm, progress: 0.95 })).toBeGreaterThan(musicIntensity(calm));
    expect(musicIntensity({ flowPerSec: 1e12, progress: 1, storming: true, eventsPerMin: 999 })).toBeLessThanOrEqual(1);
  });
  it('smooths with a faster attack than release', () => {
    const up = smoothIntensity(0, 1, 1);
    const down = 1 - smoothIntensity(1, 0, 1);
    expect(up).toBeGreaterThan(down);
  });
});

describe('arrangement', () => {
  it('layers fade in with intensity', () => {
    const lo = layerGains(0);
    const hi = layerGains(1);
    expect(lo.taiko).toBe(0);
    expect(lo.snare).toBe(0);
    expect(lo.brass).toBe(0);
    expect(lo.pad).toBeGreaterThan(0);
    expect(hi.taiko).toBe(1);
    expect(hi.snare).toBe(1);
    expect(hi.brass).toBe(1);
  });
  it('cycles Dm–Bb–Gm–A and maps MIDI to Hz', () => {
    expect([0, 1, 2, 3, 4, -1].map((b) => chordForBar(b).name)).toEqual(['Dm', 'Bb', 'Gm', 'A', 'Dm', 'A']);
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });
  it('drum patterns stay in the bar, are deterministic and denser when hot', () => {
    const calm = drumPattern(3, 0.3);
    const hot = drumPattern(3, 0.95);
    for (const e of [...calm, ...hot]) {
      expect(e.step).toBeGreaterThanOrEqual(0);
      expect(e.step).toBeLessThan(16);
      expect(e.vel).toBeGreaterThan(0);
      expect(e.vel).toBeLessThanOrEqual(1);
    }
    expect(hot.length).toBeGreaterThan(calm.length);
    expect(drumPattern(3, 0.95)).toEqual(hot);
  });
  it('bass follows the chord root on eighth notes', () => {
    const line = bassLine(1);
    expect(line).toHaveLength(8);
    expect(line.every((n) => n.note === chordForBar(1).root || n.note === chordForBar(1).root + 12)).toBe(true);
  });
});

describe('sound preference', () => {
  it('reads the URL override and defaults to on', () => {
    expect(readSoundPref('?sound=0')).toBe(false);
    expect(readSoundPref('?sound=off')).toBe(false);
    expect(readSoundPref('?sound=1')).toBe(true);
    expect(readSoundPref('')).toBe(true);
  });
});
