import type { DepthBuckets, FeedItem, IndexResult, VenueState } from '../data/market';
import type { ExchangeId } from '../data/types';
import type { Round } from '../game/battle';
import type { LightingName } from '../render/lighting';
import { fmtPrice, fmtTime, fmtUsd } from './format';

const EX_LABEL: Record<ExchangeId, string> = {
  coinbase: 'Coinbase',
  kraken: 'Kraken',
  okx: 'OKX',
  bybit: 'Bybit',
  bitstamp: 'Bitstamp',
  binance: 'Binance',
  deribit: 'Deribit',
  sim: 'Simulator',
};

const EX_COLOR: Record<ExchangeId, string> = {
  coinbase: '#2f6bff',
  kraken: '#7b61ff',
  okx: '#e6e6e6',
  bybit: '#f7a600',
  bitstamp: '#3bb54a',
  binance: '#f0b90b',
  deribit: '#18c2b0',
  sim: '#999',
};

export interface HudCallbacks {
  onLighting(name: LightingName | 'auto'): void;
  onCinematic(): void;
  onSource(src: ExchangeId | 'all'): void;
  onFocus(): void;
}

const html = String.raw;

export class Hud {
  private el: Record<string, HTMLElement> = {};
  private depthCanvas: HTMLCanvasElement;
  private lastPrice = 0;
  private bannerTimer?: ReturnType<typeof setTimeout>;
  private feedIds = new Set<number>();

  constructor(root: HTMLElement, mode: 'live' | 'sim', cb: HudCallbacks) {
    root.innerHTML = html`
      <div class="panel tl">
        <div class="regime" data-k="regime">Connecting…</div>
        <div class="row">
          <span class="mode ${mode}">${mode === 'live' ? '● LIVE' : '● SIMULATION'}</span>
          <select data-k="lighting" aria-label="Lighting">
            <option value="auto">Auto light</option>
            <option value="golden">Golden hour</option>
            <option value="day">Daylight</option>
            <option value="night">Night</option>
          </select>
        </div>
        <div class="clock" data-k="clock"></div>
      </div>

      <div class="top-center">
        <div class="caption">BTC/USD · AGGREGATED SPOT</div>
        <div class="price" data-k="price">—</div>
        <div class="change" data-k="change"></div>
        <div class="warbar panel">
          <div class="ends">
            <span class="bear"><small>← BEARS WIN</small><b data-k="bearsAt">—</b></span>
            <span class="status" data-k="status">Waiting for data</span>
            <span class="bull"><small>BULLS WIN →</small><b data-k="bullsAt">—</b></span>
          </div>
          <div class="bar"><div class="fill" data-k="fill"></div><div class="marker" data-k="marker"></div></div>
          <div class="score" data-k="score"></div>
        </div>
      </div>

      <div class="panel side left"><small>BID LIQUIDITY ±1%</small><b data-k="bidLiq">—</b></div>
      <div class="panel side right"><small>ASK LIQUIDITY ±1%</small><b data-k="askLiq">—</b></div>

      <div class="panel tr">
        <div class="buttons">
          <button data-k="cine" title="Cinematic camera (C)">🎥 Cinematic</button>
          <button data-k="focus" title="Focus the front line">⌖ Front</button>
          <button data-k="full" title="Fullscreen">⛶</button>
        </div>
        <div class="venues" data-k="venues"></div>
      </div>

      <div class="panel bl">
        <div class="head"><span>ORDER BOOK DEPTH</span>
          <select data-k="source" aria-label="Depth source"><option value="all">Aggregated spot</option></select>
        </div>
        <canvas data-k="depth" width="600" height="220"></canvas>
        <div class="axis"><span data-k="dMin"></span><span data-k="dMid"></span><span data-k="dMax"></span></div>
        <div class="legend" data-k="legend"></div>
      </div>

      <div class="panel br">
        <div class="head"><span>MARKET FEED</span><span class="live">LIVE</span></div>
        <ul data-k="feed"></ul>
      </div>

      <div class="banner" data-k="banner"><h1 data-k="bTitle"></h1><p data-k="bSub"></p></div>
      <div class="hints">W A S D pan · drag rotate · scroll zoom · Q/E orbit · C cinematic</div>
    `;
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => (this.el[n.dataset.k!] = n));
    this.depthCanvas = this.el.depth as HTMLCanvasElement;

    (this.el.lighting as HTMLSelectElement).addEventListener('change', (e) => cb.onLighting((e.target as HTMLSelectElement).value as never));
    (this.el.source as HTMLSelectElement).addEventListener('change', (e) => cb.onSource((e.target as HTMLSelectElement).value as never));
    this.el.cine.addEventListener('click', () => cb.onCinematic());
    this.el.focus.addEventListener('click', () => cb.onFocus());
    this.el.full.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    });
    setInterval(() => (this.el.clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false })), 1000);
  }

  setLightingValue(v: string) {
    (this.el.lighting as HTMLSelectElement).value = v;
  }

  setSources(ids: ExchangeId[]) {
    const sel = this.el.source as HTMLSelectElement;
    for (const id of ids) {
      if (sel.querySelector(`option[value="${id}"]`)) continue;
      const o = document.createElement('option');
      o.value = id;
      o.textContent = EX_LABEL[id];
      sel.appendChild(o);
    }
  }

  setCinematic(on: boolean) {
    this.el.cine.classList.toggle('on', on);
  }

  setPrice(idx: IndexResult) {
    const p = idx.price;
    const el = this.el.price;
    el.textContent = `$${fmtPrice(p)}`;
    if (this.lastPrice && p !== this.lastPrice) {
      el.classList.remove('up', 'down');
      void el.offsetWidth;
      el.classList.add(p > this.lastPrice ? 'up' : 'down');
    }
    this.lastPrice = p;
    if (Number.isFinite(idx.open24h)) {
      const ch = (p / idx.open24h - 1) * 100;
      this.el.change.textContent = `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}% 24h`;
      this.el.change.className = `change ${ch >= 0 ? 'pos' : 'neg'}`;
    }
  }

  setRound(round: Round | null, progress: number, status: string, score: { bulls: number; bears: number }) {
    if (!round) return;
    this.el.bearsAt.textContent = `$${fmtPrice(round.bearsWinAt)}`;
    this.el.bullsAt.textContent = `$${fmtPrice(round.bullsWinAt)}`;
    this.el.status.textContent = status;
    this.el.fill.style.width = `${(progress * 100).toFixed(2)}%`;
    this.el.marker.style.left = `${(progress * 100).toFixed(2)}%`;
    this.el.score.textContent = `Round ${round.id} · Bulls ${score.bulls} — ${score.bears} Bears`;
  }

  setRegime(text: string) {
    this.el.regime.textContent = text;
  }

  setLiquidity(bid: number, ask: number) {
    this.el.bidLiq.textContent = fmtUsd(bid);
    this.el.askLiq.textContent = fmtUsd(ask);
  }

  setLegend(usdPerSoldier: number, usdPerTank: number, soldiers: number, tanks: number) {
    this.el.legend.textContent = `1 soldier ≈ ${fmtUsd(usdPerSoldier)} · 1 tank ≈ ${fmtUsd(usdPerTank)} · on field ${soldiers.toLocaleString()} troops, ${tanks} tanks`;
  }

  setVenues(venues: Map<ExchangeId, VenueState>, idx: IndexResult | null) {
    const included = idx?.venues.filter((v) => v.included) ?? [];
    const totalW = included.reduce((a, v) => a + v.weight, 0);
    const rows: string[] = [];
    for (const v of venues.values()) {
      const st = Object.values(v.channels);
      const ok = st.length > 0 && st.every((s) => s === 'open');
      const some = st.some((s) => s === 'open');
      const iv = idx?.venues.find((r) => r.ex === v.ex);
      const bps = iv && idx ? (iv.priceUsd / idx.price - 1) * 1e4 : NaN;
      const w = iv?.included && totalW ? (iv.weight / totalW) * 100 : NaN;
      const cls = ok ? 'ok' : some ? 'warn' : 'bad';
      rows.push(
        `<div class="venue ${cls}"><i style="background:${EX_COLOR[v.ex]}"></i><span>${EX_LABEL[v.ex]}</span>` +
          `<em>${v.ex === 'deribit' ? 'options' : Number.isFinite(w) ? `${w.toFixed(0)}%` : ok ? '' : 'offline'}</em>` +
          `<em>${Number.isFinite(bps) ? `${bps >= 0 ? '+' : ''}${bps.toFixed(1)}bp` : ''}</em></div>`,
      );
    }
    this.el.venues.innerHTML = rows.join('');
  }

  addFeed(items: FeedItem[]) {
    const ul = this.el.feed;
    for (const it of [...items].reverse()) {
      if (this.feedIds.has(it.id)) continue;
      this.feedIds.add(it.id);
      const li = document.createElement('li');
      li.className = `${it.bull ? 'bull' : 'bear'} ${it.kind}`;
      li.innerHTML =
        `<time>${fmtTime(it.ts)}</time><i style="background:${EX_COLOR[it.ex]}" title="${EX_LABEL[it.ex]}">${EX_LABEL[it.ex][0]}</i>` +
        `<span title="${it.detail ?? ''}">${it.label}</span><b>${fmtUsd(it.usd)}</b>`;
      ul.prepend(li);
    }
    while (ul.children.length > 8) ul.lastElementChild!.remove();
  }

  banner(title: string, sub: string, team?: 'bulls' | 'bears') {
    const b = this.el.banner;
    this.el.bTitle.textContent = title;
    this.el.bSub.innerHTML = sub;
    b.className = `banner show ${team ?? ''}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => (b.className = 'banner'), 4200);
  }

  drawDepth(d: DepthBuckets, price: number, halfRangeUsd: number) {
    const c = this.depthCanvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth * dpr;
    const h = c.clientHeight * dpr;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const lo = price - halfRangeUsd;
    const hi = price + halfRangeUsd;
    const X = (p: number) => ((p - lo) / (hi - lo)) * w;
    const bids = [...d.bids.entries()].map(([k, v]) => [(k + 0.5) * d.bucket, v] as const).filter(([p]) => p <= price && p >= lo).sort((a, b) => b[0] - a[0]);
    const asks = [...d.asks.entries()].map(([k, v]) => [(k + 0.5) * d.bucket, v] as const).filter(([p]) => p >= price && p <= hi).sort((a, b) => a[0] - b[0]);
    let cb = 0;
    const cumB = bids.map(([p, v]) => [p, (cb += v)] as const);
    let ca = 0;
    const cumA = asks.map(([p, v]) => [p, (ca += v)] as const);
    const maxY = Math.max(cb, ca, 1);
    const Y = (v: number) => h - 4 - (v / maxY) * (h - 18);
    const area = (pts: readonly (readonly [number, number])[], stroke: string, fill: string) => {
      if (!pts.length) return;
      g.beginPath();
      g.moveTo(X(price), h);
      let prevY = Y(0);
      g.lineTo(X(price), prevY);
      for (const [p, v] of pts) {
        g.lineTo(X(p), prevY);
        prevY = Y(v);
        g.lineTo(X(p), prevY);
      }
      const end = pts[pts.length - 1][0] < price ? 0 : w;
      g.lineTo(end, prevY);
      g.lineTo(end, h);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = stroke;
      g.lineWidth = 1.5 * dpr;
      g.stroke();
    };
    area(cumB, '#41d877', 'rgba(65,216,119,0.28)');
    area(cumA, '#ff5a5a', 'rgba(255,90,90,0.26)');
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.setLineDash([3 * dpr, 3 * dpr]);
    g.beginPath();
    g.moveTo(X(price), 0);
    g.lineTo(X(price), h);
    g.stroke();
    g.setLineDash([]);
    // biggest walls
    g.font = `${10 * dpr}px Inter, sans-serif`;
    const wall = (pts: (readonly [number, number])[], color: string, label: string, right: boolean) => {
      const top = pts.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0] as readonly [number, number]);
      if (!top[1]) return;
      g.fillStyle = color;
      g.textAlign = right ? 'right' : 'left';
      g.fillText(`${label} ${fmtUsd(top[1])} @ ${Math.round(top[0]).toLocaleString('en-US')}`, right ? w - 4 * dpr : 4 * dpr, 12 * dpr);
    };
    wall(bids, '#41d877', 'BID WALL', false);
    wall(asks, '#ff5a5a', 'ASK WALL', true);
    this.el.dMin.textContent = fmtPrice(lo);
    this.el.dMid.textContent = fmtPrice(price);
    this.el.dMax.textContent = fmtPrice(hi);
  }
}
