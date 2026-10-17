/**
 * Render quality tiers and the adaptive governor that moves between them.
 *
 * Pure logic (no three, no DOM) so it can be unit-tested. `World.applyQuality()` turns a
 * `QualitySettings` into renderer state; `main.ts` feeds frame intervals to the governor.
 */

export interface DeviceInfo {
  /** `window.devicePixelRatio`. */
  dpr: number;
  /** Coarse pointer / touch screen: phones and tablets. */
  touch: boolean;
}

export interface QualitySettings {
  /** Renderer pixel ratio (capped device pixel ratio). */
  pixelRatio: number;
  /** MSAA samples of the HDR scene target (0 = off). */
  samples: 0 | 2 | 4;
  /** Sun shadow map edge in texels; 0 = shadows off. */
  shadowSize: 0 | 1024 | 2048 | 4096;
  /** Re-render the shadow map every N frames (the sun never moves between presets). */
  shadowInterval: number;
  /** Bloom pass on. */
  bloom: boolean;
  /** Tilt-shift blur on (the grade/vignette/tonemap pass always runs). */
  tilt: boolean;
}

/** Highest tier is 5; 1 is the cheapest tier the governor may pick. */
export const MAX_LEVEL = 5;
export const MIN_LEVEL = 1;

/** Settings of a tier for a device. Touch devices never run full MSAA or a 4096² shadow map. */
export function qualityFor(level: number, d: DeviceInfo): QualitySettings {
  const dpr = Math.max(1, d.dpr || 1);
  switch (Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)))) {
    case 5:
      return {
        pixelRatio: Math.min(dpr, d.touch ? 1.5 : 2),
        samples: d.touch || dpr >= 2 ? 2 : 4,
        shadowSize: d.touch ? 2048 : 4096,
        shadowInterval: d.touch ? 2 : 1,
        bloom: true,
        tilt: true,
      };
    case 4:
      return { pixelRatio: Math.min(dpr, 1.5), samples: 2, shadowSize: 2048, shadowInterval: 2, bloom: true, tilt: true };
    case 3:
      return { pixelRatio: Math.min(dpr, 1.25), samples: 2, shadowSize: 2048, shadowInterval: 3, bloom: true, tilt: true };
    case 2:
      return { pixelRatio: 1, samples: 0, shadowSize: 1024, shadowInterval: 3, bloom: true, tilt: false };
    default:
      return { pixelRatio: 1, samples: 0, shadowSize: 0, shadowInterval: 4, bloom: false, tilt: false };
  }
}

/** Tier to start at: desktops get everything, touch devices start one tier down. */
export function initialLevel(d: DeviceInfo) {
  return d.touch ? 4 : MAX_LEVEL;
}

export function sameQuality(a: QualitySettings, b: QualitySettings) {
  return (
    a.pixelRatio === b.pixelRatio &&
    a.samples === b.samples &&
    a.shadowSize === b.shadowSize &&
    a.shadowInterval === b.shadowInterval &&
    a.bloom === b.bloom &&
    a.tilt === b.tilt
  );
}

export interface GovernorOptions {
  /** Starting tier. */
  level: number;
  /** Never go above this tier (the tier the page started at). */
  maxLevel?: number;
  /** Frames per decision window. */
  window?: number;
  /** Median frame interval (ms) above which the tier drops. */
  slowMs?: number;
  /** Median frame interval (ms) at or below which the tier may climb back. */
  fastMs?: number;
  /** Consecutive fast windows needed before climbing. */
  fastWindows?: number;
  /** Seconds to wait after any change before deciding again. */
  cooldownS?: number;
}

/**
 * Adaptive quality: watch the median rAF interval over a window of frames; drop a tier when the
 * page cannot hold ~50 fps, climb back slowly when it has held ~60 fps for a while. A tier that
 * had to be dropped twice is never climbed back to (prevents oscillation on borderline devices).
 */
export class QualityGovernor {
  level: number;
  readonly maxLevel: number;
  private readonly window: number;
  private readonly slowMs: number;
  private readonly fastMs: number;
  private readonly fastWindows: number;
  private readonly cooldownS: number;
  private samples: number[] = [];
  private fastRun = 0;
  private cooldown = 0;
  private drops = new Map<number, number>();

  constructor(o: GovernorOptions) {
    this.level = o.level;
    this.maxLevel = o.maxLevel ?? o.level;
    this.window = o.window ?? 90;
    this.slowMs = o.slowMs ?? 20;
    this.fastMs = o.fastMs ?? 17.5;
    this.fastWindows = o.fastWindows ?? 10;
    this.cooldownS = o.cooldownS ?? 4;
  }

  /** Feed one frame interval in ms. Returns the new tier when it changes, otherwise null. */
  sample(dtMs: number): number | null {
    if (!(dtMs > 0) || dtMs > 250) return null; // tab switch / breakpoint: not a render cost
    if (this.cooldown > 0) {
      this.cooldown -= dtMs / 1000;
      return null;
    }
    this.samples.push(dtMs);
    if (this.samples.length < this.window) return null;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.samples.length = 0;
    if (median > this.slowMs && this.level > MIN_LEVEL) {
      const from = this.level;
      this.level -= 1;
      this.drops.set(from, (this.drops.get(from) ?? 0) + 1);
      this.fastRun = 0;
      this.cooldown = this.cooldownS;
      return this.level;
    }
    if (median <= this.fastMs && this.level < this.maxLevel) {
      const up = this.level + 1;
      if ((this.drops.get(up) ?? 0) >= 2) return null; // that tier already failed twice: stay
      this.fastRun += 1;
      if (this.fastRun >= this.fastWindows) {
        this.level = up;
        this.fastRun = 0;
        this.cooldown = this.cooldownS;
        return this.level;
      }
    } else {
      this.fastRun = 0;
    }
    return null;
  }
}
