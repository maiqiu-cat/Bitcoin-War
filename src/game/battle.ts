export type Team = 'bulls' | 'bears';

export interface Round {
  id: number;
  startPrice: number;
  /** Bears capture the bull base when price falls to this level. */
  bearsWinAt: number;
  /** Bulls capture the bear base when price rises to this level. */
  bullsWinAt: number;
  startedAt: number;
  endedAt?: number;
  winner?: Team;
}

export type BattleEvent = { type: 'start'; round: Round } | { type: 'win'; round: Round; winner: Team };

export interface BattleOptions {
  /** Half-width of a round as a fraction of price (0.0025 = ±0.25%). */
  halfRange: number;
  /** Pause after a win before the next round starts. */
  intermissionMs: number;
}

export class BattleEngine {
  round: Round | null = null;
  readonly history: Round[] = [];
  private seq = 0;
  readonly opts: BattleOptions;

  constructor(opts: Partial<BattleOptions> = {}) {
    this.opts = { halfRange: 0.0025, intermissionMs: 6_000, ...opts };
  }

  update(price: number, now: number): BattleEvent[] {
    if (!(price > 0)) return [];
    const r = this.round;
    if (!r || (r.winner && now - (r.endedAt ?? now) >= this.opts.intermissionMs)) {
      return [{ type: 'start', round: this.startRound(price, now) }];
    }
    if (r.winner) return [];
    let winner: Team | undefined;
    if (price >= r.bullsWinAt) winner = 'bulls';
    else if (price <= r.bearsWinAt) winner = 'bears';
    if (!winner) return [];
    r.winner = winner;
    r.endedAt = now;
    this.history.unshift(r);
    if (this.history.length > 20) this.history.length = 20;
    return [{ type: 'win', round: r, winner }];
  }

  /** 0 = at the bull base (bears win), 1 = at the bear base (bulls win). */
  progress(price: number) {
    const r = this.round;
    if (!r) return 0.5;
    return Math.min(1, Math.max(0, (price - r.bearsWinAt) / (r.bullsWinAt - r.bearsWinAt)));
  }

  score() {
    let bulls = 0;
    let bears = 0;
    for (const r of this.history) r.winner === 'bulls' ? bulls++ : bears++;
    return { bulls, bears };
  }

  private startRound(price: number, now: number): Round {
    const h = this.opts.halfRange;
    const round: Round = {
      id: ++this.seq,
      startPrice: price,
      bearsWinAt: roundTo(price * (1 - h), 0.01),
      bullsWinAt: roundTo(price * (1 + h), 0.01),
      startedAt: now,
    };
    this.round = round;
    return round;
  }
}

function roundTo(v: number, step: number) {
  return Math.round(v / step) * step;
}

export interface NarrationInput {
  /** Progress now and ~20s ago (0..1). */
  progress: number;
  progressBefore: number;
  /** Taker buy / sell USD over the window. */
  buyFlow: number;
  sellFlow: number;
  /** USD resting near the front now and ~10s ago. */
  bidNear: number;
  bidNearBefore: number;
  askNear: number;
  askNearBefore: number;
  secondsSinceStart: number;
}

/** One-line war report derived from price progress, taker flow and book changes. */
export function narrate(i: NarrationInput): string {
  if (i.secondsSinceStart < 8) return 'Armies deploying to the front';
  if (i.progress > 0.85) return 'Bulls storming the bear base';
  if (i.progress < 0.15) return 'Bears storming the bull base';

  const moved = i.progress - i.progressBefore;
  const total = i.buyFlow + i.sellFlow;
  const flowImb = total > 0 ? (i.buyFlow - i.sellFlow) / total : 0;
  const askChange = i.askNearBefore > 0 ? i.askNear / i.askNearBefore - 1 : 0;
  const bidChange = i.bidNearBefore > 0 ? i.bidNear / i.bidNearBefore - 1 : 0;

  if (moved > 0.04 && askChange < -0.2) return 'Ask liquidity absorbed';
  if (moved < -0.04 && bidChange < -0.2) return 'Bid liquidity absorbed';
  if (moved > 0.04) return flowImb > 0.3 ? 'Bulls charging' : 'Armies advancing';
  if (moved < -0.04) return flowImb < -0.3 ? 'Bears charging' : 'Bears advancing';
  if (askChange > 0.25) return 'Ask resistance reinforced';
  if (bidChange > 0.25) return 'Bid support reinforced';
  if (flowImb > 0.4) return 'Bulls probing the line';
  if (flowImb < -0.4) return 'Bears probing the line';
  return 'Skirmishes along the front';
}
