import { describe, expect, it } from 'vitest';
import { initialLevel, MAX_LEVEL, MIN_LEVEL, QualityGovernor, qualityFor, sameQuality } from '../src/render/quality';

const desktop = { dpr: 1, touch: false };
const retina = { dpr: 2, touch: false };
const phone = { dpr: 3, touch: true };

describe('qualityFor', () => {
  it('gives desktops everything and caps the pixel ratio at 2', () => {
    expect(qualityFor(5, desktop)).toEqual({ pixelRatio: 1, samples: 4, shadowSize: 4096, shadowInterval: 1, bloom: true, tilt: true });
    expect(qualityFor(5, retina).pixelRatio).toBe(2);
    expect(qualityFor(5, retina).samples).toBe(2); // 4× MSAA on a 5 MP buffer is the Retina/tablet cost
  });

  it('never gives touch devices full MSAA, 4096² shadows or a pixel ratio above 1.5', () => {
    for (let l = MIN_LEVEL; l <= MAX_LEVEL; l++) {
      const q = qualityFor(l, phone);
      expect(q.pixelRatio).toBeLessThanOrEqual(1.5);
      expect(q.samples).toBeLessThanOrEqual(2);
      expect(q.shadowSize).toBeLessThanOrEqual(2048);
    }
  });

  it('gets monotonically cheaper down the tiers', () => {
    let prev = qualityFor(MAX_LEVEL, retina);
    for (let l = MAX_LEVEL - 1; l >= MIN_LEVEL; l--) {
      const q = qualityFor(l, retina);
      expect(q.pixelRatio).toBeLessThanOrEqual(prev.pixelRatio);
      expect(q.samples).toBeLessThanOrEqual(prev.samples);
      expect(q.shadowSize).toBeLessThanOrEqual(prev.shadowSize);
      expect(q.shadowInterval).toBeGreaterThanOrEqual(prev.shadowInterval);
      prev = q;
    }
    expect(qualityFor(MIN_LEVEL, retina)).toEqual({ pixelRatio: 1, samples: 0, shadowSize: 0, shadowInterval: 4, bloom: false, tilt: false });
  });

  it('clamps out-of-range tiers and starts touch devices one tier down', () => {
    expect(sameQuality(qualityFor(9, desktop), qualityFor(MAX_LEVEL, desktop))).toBe(true);
    expect(sameQuality(qualityFor(-3, desktop), qualityFor(MIN_LEVEL, desktop))).toBe(true);
    expect(initialLevel(desktop)).toBe(MAX_LEVEL);
    expect(initialLevel(phone)).toBe(MAX_LEVEL - 1);
  });
});

describe('QualityGovernor', () => {
  const feed = (g: QualityGovernor, ms: number, frames: number) => {
    const changes: number[] = [];
    for (let i = 0; i < frames; i++) {
      const c = g.sample(ms);
      if (c !== null) changes.push(c);
    }
    return changes;
  };

  it('drops one tier per slow window, with a cooldown in between', () => {
    const g = new QualityGovernor({ level: 5, window: 90, cooldownS: 4 });
    expect(feed(g, 30, 89)).toEqual([]);
    expect(feed(g, 30, 1)).toEqual([4]);
    // cooldown: 4 s of 30 ms frames = 134 frames are ignored, then a new window starts
    expect(feed(g, 30, 134)).toEqual([]);
    expect(feed(g, 30, 90)).toEqual([3]);
  });

  it('holds 60 fps frames without changing anything', () => {
    const g = new QualityGovernor({ level: 5 });
    expect(feed(g, 16.7, 2000)).toEqual([]);
    expect(g.level).toBe(5);
  });

  it('climbs back slowly and never above the starting tier', () => {
    const g = new QualityGovernor({ level: 4, maxLevel: 5, window: 10, fastWindows: 3, cooldownS: 0 });
    expect(feed(g, 30, 10)).toEqual([3]);
    expect(feed(g, 16, 29)).toEqual([]);
    expect(feed(g, 16, 1)).toEqual([4]);
    expect(feed(g, 16, 30)).toEqual([5]);
    expect(feed(g, 16, 300)).toEqual([]);
    expect(g.level).toBe(5);
  });

  it('stops retrying a tier that failed twice', () => {
    const g = new QualityGovernor({ level: 5, window: 10, fastWindows: 2, cooldownS: 0 });
    expect(feed(g, 30, 10)).toEqual([4]); // 5 failed once
    expect(feed(g, 16, 20)).toEqual([5]);
    expect(feed(g, 30, 10)).toEqual([4]); // 5 failed twice
    expect(feed(g, 16, 200)).toEqual([]); // no more attempts at 5
    expect(g.level).toBe(4);
  });

  it('ignores pauses (tab switches, breakpoints) and bottoms out at the minimum tier', () => {
    const g = new QualityGovernor({ level: 2, window: 10, cooldownS: 0 });
    expect(g.sample(5000)).toBeNull();
    expect(g.sample(0)).toBeNull();
    expect(feed(g, 40, 10)).toEqual([1]);
    expect(feed(g, 40, 100)).toEqual([]);
    expect(g.level).toBe(MIN_LEVEL);
  });
});
