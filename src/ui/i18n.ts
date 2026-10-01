export type Lang = 'zh' | 'en';

type Dict = Record<string, string>;

const en: Dict = {
  'app.title': 'Bitcoin Battle',
  caption: 'BTC/USD · AGGREGATED SPOT',
  change24h: '{v} 24h',
  bearsWin: '← BEARS WIN',
  bullsWin: 'BULLS WIN →',
  waiting: 'Waiting for data',
  score: 'Round {id} · Bulls {b} — {r} Bears',
  bidLiq: 'BID LIQUIDITY ±1%',
  askLiq: 'ASK LIQUIDITY ±1%',
  cinematic: 'Cinematic',
  'cinematic.title': 'Cinematic camera (C)',
  front: 'Front',
  'front.title': 'Focus the front line (F)',
  'full.title': 'Fullscreen',
  'sound.title': 'Battle sound on/off (M)',
  'sound.hint': 'Click anywhere to turn on battle sound',
  'lang.button': '中文',
  'lang.title': '切换到中文',
  depthTitle: 'ORDER BOOK DEPTH',
  aggregated: 'Aggregated spot',
  feedTitle: 'MARKET FEED',
  live: 'LIVE',
  'mode.live': '● LIVE',
  'mode.sim': '● SIMULATION',
  'light.auto': 'Auto light',
  'light.golden': 'Golden hour',
  'light.day': 'Daylight',
  'light.night': 'Night',
  hints: 'W A S D pan · drag rotate · scroll zoom · Q/E orbit · C cinematic · F front · M sound',
  'regime.connecting': 'Connecting…',
  'regime.warming': 'Warming up',
  'regime.quiet': 'Quiet market',
  'regime.active': 'Active market',
  'regime.volatile': 'Volatile market',
  legend: '1 soldier ≈ {s} · 1 tank ≈ {t} · on field {n} troops, {k} tanks',
  bidWall: 'BID WALL',
  askWall: 'ASK WALL',
  offline: 'offline',
  options: 'options',
  'ex.sim': 'Simulator',
  'feed.bigBuy': 'Large buy trade',
  'feed.bigSell': 'Large sell trade',
  'feed.optBuy': 'Large option buy',
  'feed.optSell': 'Large option sell',
  'feed.liqShort': 'Shorts liquidated',
  'feed.liqLong': 'Longs liquidated',
  'ev.buy': 'Buy',
  'ev.sell': 'Sell',
  'banner.begin': 'BATTLE BEGINS',
  'banner.beginSub': '<span class="b">Bulls</span> win at ${bulls} · <span class="r">Bears</span> win at ${bears}',
  'banner.bulls': 'BULLS WIN',
  'banner.bears': 'BEARS WIN',
  'banner.winSub': 'Round {id} — base captured at ${price}',
  'reserve.bulls': 'BID RESERVES',
  'reserve.bears': 'ASK RESERVES',
  'reserve.units': '{n} troops · {k} tanks',
  'status.deploying': 'Armies deploying to the front',
  'status.bullsStorm': 'Bulls storming the bear base',
  'status.bearsStorm': 'Bears storming the bull base',
  'status.askAbsorbed': 'Ask liquidity absorbed',
  'status.bidAbsorbed': 'Bid liquidity absorbed',
  'status.bullsCharging': 'Bulls charging',
  'status.bullsAdvancing': 'Bulls advancing',
  'status.bearsCharging': 'Bears charging',
  'status.bearsAdvancing': 'Bears advancing',
  'status.askReinforced': 'Ask resistance reinforced',
  'status.bidReinforced': 'Bid support reinforced',
  'status.bullsProbing': 'Bulls probing the line',
  'status.bearsProbing': 'Bears probing the line',
  'status.skirmishes': 'Skirmishes along the front',
};

const zh: Dict = {
  'app.title': '比特币战场',
  caption: 'BTC/USD · 跨交易所聚合现货',
  change24h: '24小时 {v}',
  bearsWin: '← 熊方胜利线',
  bullsWin: '牛方胜利线 →',
  waiting: '等待行情数据…',
  score: '第 {id} 回合 · 牛 {b} : {r} 熊',
  bidLiq: '买盘流动性 ±1%',
  askLiq: '卖盘流动性 ±1%',
  cinematic: '电影镜头',
  'cinematic.title': '电影镜头（C）',
  front: '前线',
  'front.title': '聚焦前线（F）',
  'full.title': '全屏',
  'sound.title': '战场声音开关（M）',
  'sound.hint': '点击画面任意位置，开启战场音效',
  'lang.button': 'EN',
  'lang.title': 'Switch to English',
  depthTitle: '订单簿深度',
  aggregated: '聚合现货',
  feedTitle: '市场动态',
  live: '实时',
  'mode.live': '● 实时行情',
  'mode.sim': '● 模拟行情',
  'light.auto': '自动光照',
  'light.golden': '黄昏',
  'light.day': '白天',
  'light.night': '夜晚',
  hints: 'WASD 平移 · 拖动旋转 · 滚轮缩放 · Q/E 环绕 · C 电影镜头 · F 前线 · M 声音',
  'regime.connecting': '连接中…',
  'regime.warming': '数据预热中',
  'regime.quiet': '市场平静',
  'regime.active': '市场活跃',
  'regime.volatile': '市场剧烈波动',
  legend: '1 名士兵 ≈ {s} · 1 辆坦克 ≈ {t} · 场上 {n} 名士兵、{k} 辆坦克',
  bidWall: '买墙',
  askWall: '卖墙',
  offline: '离线',
  options: '期权',
  'ex.sim': '模拟器',
  'feed.bigBuy': '大额买入',
  'feed.bigSell': '大额卖出',
  'feed.optBuy': '期权大额买入',
  'feed.optSell': '期权大额卖出',
  'feed.liqShort': '空头爆仓',
  'feed.liqLong': '多头爆仓',
  'ev.buy': '买入',
  'ev.sell': '卖出',
  'banner.begin': '战斗开始',
  'banner.beginSub': '<span class="b">牛方</span>攻至 ${bulls} 获胜 · <span class="r">熊方</span>攻至 ${bears} 获胜',
  'banner.bulls': '牛方胜利',
  'banner.bears': '熊方胜利',
  'banner.winSub': '第 {id} 回合 · 于 ${price} 攻陷敌方基地',
  'reserve.bulls': '买方储备',
  'reserve.bears': '卖方储备',
  'reserve.units': '{n} 名士兵 · {k} 辆坦克',
  'status.deploying': '大军正开赴前线',
  'status.bullsStorm': '牛军猛攻熊方大本营',
  'status.bearsStorm': '熊军猛攻牛方大本营',
  'status.askAbsorbed': '卖方防线被击穿',
  'status.bidAbsorbed': '买方防线被击穿',
  'status.bullsCharging': '牛军发起冲锋',
  'status.bullsAdvancing': '牛军稳步推进',
  'status.bearsCharging': '熊军发起冲锋',
  'status.bearsAdvancing': '熊军稳步推进',
  'status.askReinforced': '卖方阵地获得增援',
  'status.bidReinforced': '买方阵地获得增援',
  'status.bullsProbing': '牛军试探防线',
  'status.bearsProbing': '熊军试探防线',
  'status.skirmishes': '前线零星交火',
};

const DICTS: Record<Lang, Dict> = { en, zh };
const STORAGE_KEY = 'bb.lang';
const listeners = new Set<(l: Lang) => void>();

function detect(): Lang {
  const q = new URLSearchParams(globalThis.location?.search ?? '').get('lang');
  if (q === 'zh' || q === 'en') return q;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'zh' || s === 'en') return s;
  } catch {
    /* storage unavailable */
  }
  return (globalThis.navigator?.language ?? 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let current: Lang = detect();

export function getLang() {
  return current;
}

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((fn) => fn(l));
}

export function onLangChange(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate `key`, substituting `{name}` placeholders. Falls back to English, then the key. */
export function t(key: string, vars?: Record<string, string | number>) {
  let s = DICTS[current][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const DICTIONARIES = DICTS;
