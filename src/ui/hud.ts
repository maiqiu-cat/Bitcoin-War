import type { DepthBuckets, FeedItem, IndexResult, VenueState } from '../data/market';
import type { ExchangeId } from '../data/types';
import type { Round, StatusKey } from '../game/battle';
import type { LightingName } from '../render/lighting';
import { fmtPrice, fmtTime, fmtUsd } from './format';
import { getLang, onLangChange, setLang, t } from './i18n';

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

const exLabel = (ex: ExchangeId) => (ex === 'sim' ? t('ex.sim') : EX_LABEL[ex]);

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

const ICONS = {
  camera: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3z"/></svg>`,
  target: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  full: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
};

export interface HudCallbacks {
  onLighting(name: LightingName | 'auto'): void;
  onCinematic(): void;
  onSource(src: ExchangeId | 'all'): void;
  onFocus(): void;
}

export interface BannerSpec {
  title: string;
  sub: string;
  vars: Record<string, string | number>;
  team?: 'bulls' | 'bears';
}

const html = String.raw;

/** Exponential approach used for number tweens. */
const approach = (cur: number, target: number, dt: number, rate = 10) =>
  !Number.isFinite(cur) || Math.abs(target - cur) < 1e-9 ? target : cur + (target - cur) * (1 - Math.exp(-dt * rate));

export class Hud {
  private el: Record<string, HTMLElement> = {};
  private depthCanvas: HTMLCanvasElement;
  private bannerTimer?: ReturnType<typeof setTimeout>;
  private feedItems: FeedItem[] = [];
  private feedIds = new Set<number>();
  private statusKey: StatusKey | 'waiting' = 'waiting';
  /** Debounce: a new status must persist ~1s and the current one stays ≥2.5s. */
  private pendingStatus: { key: StatusKey; since: number } | null = null;
  private statusShownAt = 0;
  private regimeKey = 'regime.connecting';
  private lastScore: { id: number; b: number; r: number } | null = null;
  private legendArgs: [number, number, number, number] | null = null;
  private banner?: BannerSpec;
  private lastIdx: IndexResult | null = null;
  // tweened numbers
  private price = { shown: NaN, target: NaN };
  private liq = { bid: NaN, ask: NaN, tBid: NaN, tAsk: NaN };
  private progress = { shown: 0.5, target: 0.5 };

  constructor(root: HTMLElement, mode: 'live' | 'sim', cb: HudCallbacks) {
    root.innerHTML = html`
      <div class="panel tl enter" style="--d:0">
        <div class="regime" data-k="regime"></div>
        <div class="row">
          <span class="mode ${mode}" data-i18n="mode.${mode}"></span>
          <select data-k="lighting" aria-label="Lighting">
            <option value="auto" data-i18n="light.auto"></option>
            <option value="golden" data-i18n="light.golden"></option>
            <option value="day" data-i18n="light.day"></option>
            <option value="night" data-i18n="light.night"></option>
          </select>
        </div>
        <div class="clock" data-k="clock"></div>
      </div>

      <div class="top-center enter" style="--d:1">
        <div class="caption" data-i18n="caption"></div>
        <div class="price-row"><span class="arrow" data-k="arrow"></span><div class="price" data-k="price">—</div></div>
        <div class="change" data-k="change"></div>
        <div class="warbar panel">
          <div class="ends">
            <span class="bear"><small data-i18n="bearsWin"></small><b data-k="bearsAt">—</b></span>
            <span class="status" data-k="status"></span>
            <span class="bull"><small data-i18n="bullsWin"></small><b data-k="bullsAt">—</b></span>
          </div>
          <div class="bar"><div class="fill" data-k="fill"></div><div class="marker" data-k="marker"></div></div>
          <div class="score" data-k="score"></div>
        </div>
      </div>

      <div class="panel side left enter" style="--d:2"><small data-i18n="bidLiq"></small><b data-k="bidLiq">—</b></div>
      <div class="panel side right enter" style="--d:2"><small data-i18n="askLiq"></small><b data-k="askLiq">—</b></div>

      <div class="panel tr enter" style="--d:1">
        <div class="buttons">
          <button data-k="cine" data-i18n-title="cinematic.title">${ICONS.camera}<span data-i18n="cinematic"></span></button>
          <button data-k="focus" data-i18n-title="front.title">${ICONS.target}<span data-i18n="front"></span></button>
          <button data-k="full" data-i18n-title="full.title">${ICONS.full}</button>
          <button data-k="lang" class="lang" data-i18n-title="lang.title" data-i18n="lang.button"></button>
        </div>
        <div class="venues" data-k="venues"></div>
      </div>

      <div class="panel bl enter" style="--d:3">
        <div class="head"><span data-i18n="depthTitle"></span>
          <select data-k="source" aria-label="Depth source"><option value="all" data-i18n="aggregated"></option></select>
        </div>
        <canvas data-k="depth" width="600" height="220"></canvas>
        <div class="axis"><span data-k="dMin"></span><span data-k="dMid"></span><span data-k="dMax"></span></div>
        <div class="legend" data-k="legend"></div>
      </div>

      <div class="panel br enter" style="--d:3">
        <div class="head"><span data-i18n="feedTitle"></span><span class="live"><i></i><span data-i18n="live"></span></span></div>
        <ul data-k="feed"></ul>
      </div>

      <div class="banner" data-k="banner">
        <div class="b-rule"><i></i><em></em><i></i></div>
        <h1 data-k="bTitle"></h1>
        <p data-k="bSub"></p>
      </div>
      <div class="hints" data-i18n="hints"></div>
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
    this.el.lang.addEventListener('click', () => setLang(getLang() === 'zh' ? 'en' : 'zh'));
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'l' && !(e.target instanceof HTMLSelectElement)) setLang(getLang() === 'zh' ? 'en' : 'zh');
    });
    const tickClock = () =>
      (this.el.clock.textContent = new Date().toLocaleTimeString(getLang() === 'zh' ? 'zh-CN' : 'en-GB', { hour12: false }));
    setInterval(tickClock, 1000);
    onLangChange(() => this.applyLang());
    this.applyLang();
    tickClock();
  }

  /** Re-render every translated string (static labels and the last dynamic values). */
  private applyLang() {
    const root = this.el.price.closest('#hud') ?? document;
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((n) => (n.textContent = t(n.dataset.i18n!)));
    root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((n) => (n.title = t(n.dataset.i18nTitle!)));
    document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
    document.title = t('app.title');
    this.renderStatus(false);
    this.el.regime.textContent = t(this.regimeKey);
    if (this.lastScore) this.el.score.textContent = t('score', this.lastScore);
    if (this.legendArgs) this.setLegend(...this.legendArgs);
    if (this.lastIdx) this.renderChange(this.lastIdx);
    const sel = this.el.source as HTMLSelectElement;
    for (const o of sel.options) if (o.value !== 'all') o.textContent = exLabel(o.value as ExchangeId);
    this.renderFeed();
    if (this.banner && this.el.banner.classList.contains('show')) this.renderBanner(this.banner);
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
      o.textContent = exLabel(id);
      sel.appendChild(o);
    }
  }

  setCinematic(on: boolean) {
    this.el.cine.classList.toggle('on', on);
  }

  setPrice(idx: IndexResult) {
    const p = idx.price;
    if (Number.isFinite(this.price.target) && p !== this.price.target) {
      const up = p > this.price.target;
      const el = this.el.price;
      el.classList.remove('up', 'down');
      void el.offsetWidth;
      el.classList.add(up ? 'up' : 'down');
      this.el.arrow.textContent = up ? '▲' : '▼';
      this.el.arrow.className = `arrow ${up ? 'up' : 'down'}`;
    }
    if (!Number.isFinite(this.price.shown)) this.price.shown = p;
    this.price.target = p;
    this.lastIdx = idx;
    this.renderChange(idx);
  }

  private renderChange(idx: IndexResult) {
    if (!Number.isFinite(idx.open24h)) return;
    const ch = (idx.price / idx.open24h - 1) * 100;
    this.el.change.textContent = t('change24h', { v: `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%` });
    this.el.change.className = `change ${ch >= 0 ? 'pos' : 'neg'}`;
  }

  setRound(round: Round | null, progress: number, status: StatusKey, score: { bulls: number; bears: number }) {
    if (!round) return;
    this.el.bearsAt.textContent = `$${fmtPrice(round.bearsWinAt)}`;
    this.el.bullsAt.textContent = `$${fmtPrice(round.bullsWinAt)}`;
    const now = performance.now();
    if (status === this.statusKey) this.pendingStatus = null;
    else {
      if (!this.pendingStatus || this.pendingStatus.key !== status) this.pendingStatus = { key: status, since: now };
      const urgent = this.statusKey === 'waiting' || status === 'deploying' || /Storm$/.test(status);
      if (urgent || (now - this.pendingStatus.since >= 1000 && now - this.statusShownAt >= 2500)) {
        this.statusKey = status;
        this.statusShownAt = now;
        this.pendingStatus = null;
        this.renderStatus(true);
      }
    }
    this.progress.target = progress;
    this.lastScore = { id: round.id, b: score.bulls, r: score.bears };
    this.el.score.textContent = t('score', this.lastScore);
  }

  private renderStatus(animate: boolean) {
    const el = this.el.status;
    const k = this.statusKey;
    el.textContent = t(k === 'waiting' ? 'waiting' : `status.${k}`);
    el.dataset.tone = /^bulls|^ask/.test(k) ? 'bull' : /^bears|^bid/.test(k) ? 'bear' : '';
    if (animate) {
      el.classList.remove('swap');
      void el.offsetWidth;
      el.classList.add('swap');
    }
  }

  setRegime(key: string) {
    this.regimeKey = key;
    this.el.regime.textContent = t(key);
  }

  setLiquidity(bid: number, ask: number) {
    if (!Number.isFinite(this.liq.bid)) {
      this.liq.bid = bid;
      this.liq.ask = ask;
    }
    this.liq.tBid = bid;
    this.liq.tAsk = ask;
  }

  setLegend(usdPerSoldier: number, usdPerTank: number, soldiers: number, tanks: number) {
    this.legendArgs = [usdPerSoldier, usdPerTank, soldiers, tanks];
    this.el.legend.textContent = t('legend', { s: fmtUsd(usdPerSoldier), t: fmtUsd(usdPerTank), n: soldiers.toLocaleString(), k: tanks });
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
      const share = v.ex === 'deribit' ? t('options') : Number.isFinite(w) ? `${w.toFixed(0)}%` : ok ? '' : t('offline');
      rows.push(
        `<div class="venue ${cls}"><i style="--c:${EX_COLOR[v.ex]}"></i><span>${exLabel(v.ex)}</span>` +
          `<em class="wbar"><u style="width:${Number.isFinite(w) ? Math.min(100, w) : 0}%;background:${EX_COLOR[v.ex]}"></u></em>` +
          `<em>${share}</em><em>${Number.isFinite(bps) ? `${bps >= 0 ? '+' : ''}${bps.toFixed(1)}bp` : ''}</em></div>`,
      );
    }
    this.el.venues.innerHTML = rows.join('');
  }

  addFeed(items: FeedItem[]) {
    let added = false;
    for (const it of items) {
      if (this.feedIds.has(it.id)) continue;
      this.feedIds.add(it.id);
      this.feedItems.unshift(it);
      added = true;
    }
    if (this.feedItems.length > 30) this.feedItems.length = 30;
    if (added) this.renderFeed(items.map((i) => i.id));
  }

  private renderFeed(fresh: number[] = []) {
    const ul = this.el.feed;
    ul.innerHTML = '';
    for (const it of this.feedItems.slice(0, 8)) {
      const li = document.createElement('li');
      const big = it.kind === 'liq' ? it.usd >= 100_000 : it.usd >= 250_000;
      li.className = `${it.bull ? 'bull' : 'bear'} ${it.kind}${big ? ' big' : ''}${fresh.includes(it.id) ? ' fresh' : ''}`;
      li.innerHTML =
        `<time>${fmtTime(it.ts)}</time><i style="background:${EX_COLOR[it.ex]}" title="${exLabel(it.ex)}">${exLabel(it.ex)[0]}</i>` +
        `<span title="${it.detail ?? ''}">${t(`feed.${it.type}`)}</span><b>${fmtUsd(it.usd)}</b>`;
      ul.appendChild(li);
    }
  }

  showBanner(spec: BannerSpec) {
    this.banner = spec;
    this.renderBanner(spec);
    const b = this.el.banner;
    b.className = `banner ${spec.team ?? 'neutral'}`;
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hide'), 4200);
  }

  private renderBanner(spec: BannerSpec) {
    this.el.bTitle.textContent = t(spec.title, spec.vars);
    this.el.bSub.innerHTML = t(spec.sub, spec.vars);
  }

  /** Per-frame tweens for numbers and the war bar. */
  frame(dt: number) {
    const p = this.price;
    if (Number.isFinite(p.target)) {
      const before = p.shown;
      p.shown = approach(p.shown, p.target, dt, 8);
      if (Math.abs(p.shown - p.target) < 0.005) p.shown = p.target;
      if (p.shown !== before || this.el.price.textContent === '—') this.el.price.textContent = `$${fmtPrice(p.shown)}`;
    }
    const l = this.liq;
    if (Number.isFinite(l.tBid)) {
      l.bid = approach(l.bid, l.tBid, dt, 4);
      l.ask = approach(l.ask, l.tAsk, dt, 4);
      this.el.bidLiq.textContent = fmtUsd(l.bid);
      this.el.askLiq.textContent = fmtUsd(l.ask);
    }
    const g = this.progress;
    g.shown = approach(g.shown, g.target, dt, 5);
    const pct = `${(g.shown * 100).toFixed(2)}%`;
    this.el.fill.style.width = pct;
    this.el.marker.style.left = pct;
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
    const Y = (v: number) => h - 4 - (v / maxY) * (h - 22 * dpr);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (h / 4) * i);
      g.lineTo(w, (h / 4) * i);
      g.stroke();
    }
    const area = (pts: readonly (readonly [number, number])[], stroke: string, top: string) => {
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
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, top);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = stroke;
      g.lineWidth = 1.5 * dpr;
      g.shadowColor = stroke;
      g.shadowBlur = 6 * dpr;
      g.stroke();
      g.shadowBlur = 0;
    };
    area(cumB, '#41d877', 'rgba(65,216,119,0.42)');
    area(cumA, '#ff5a5a', 'rgba(255,90,90,0.40)');
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.setLineDash([3 * dpr, 3 * dpr]);
    g.beginPath();
    g.moveTo(X(price), 0);
    g.lineTo(X(price), h);
    g.stroke();
    g.setLineDash([]);
    g.font = `600 ${10 * dpr}px "Inter Variable", Inter, "PingFang SC", sans-serif`;
    const wall = (pts: (readonly [number, number])[], color: string, label: string, right: boolean) => {
      const top = pts.reduce((a, b) => (b[1] > a[1] ? b : a), [0, 0] as readonly [number, number]);
      if (!top[1]) return;
      g.fillStyle = color;
      g.textAlign = right ? 'right' : 'left';
      g.fillText(`${label} ${fmtUsd(top[1])} @ ${Math.round(top[0]).toLocaleString('en-US')}`, right ? w - 4 * dpr : 4 * dpr, 12 * dpr);
    };
    wall(bids, '#41d877', t('bidWall'), false);
    wall(asks, '#ff5a5a', t('askWall'), true);
    this.el.dMin.textContent = fmtPrice(lo);
    this.el.dMid.textContent = fmtPrice(price);
    this.el.dMax.textContent = fmtPrice(hi);
  }
}
