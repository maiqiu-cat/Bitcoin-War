import { describe, expect, it } from 'vitest';
import {
  parseBinance,
  parseBitstamp,
  parseBybitLiq,
  parseBybitSpot,
  parseCoinbase,
  parseCoinbaseL2,
  parseDeribit,
  parseKraken,
  parseOkx,
} from '../src/data/feeds/exchanges';
import okx from './fixtures/okx.json';
import coinbase from './fixtures/coinbase.json';
import coinbaseAdv from './fixtures/coinbase-adv.json';
import kraken from './fixtures/kraken.json';
import bybitSpot from './fixtures/bybit-spot.json';
import bitstamp from './fixtures/bitstamp.json';

// Fixtures are real messages captured from the public feeds on 2026-10-01.
const f = (o: any, k: string) => o[k] as any[];

describe('OKX', () => {
  it('parses spot trades with taker side', () => {
    const msg = f(okx, 'trades:data')[0];
    const out = parseOkx(msg)!;
    expect(out.trades![0]).toMatchObject({ ex: 'okx', quote: 'USDT', market: 'spot' });
    expect(out.trades![0].price).toBeCloseTo(parseFloat(msg.data[0].px));
    expect(out.trades![0].side).toBe(msg.data[0].side);
  });

  it('parses book snapshot and updates with 400-level depth', () => {
    const snap = parseOkx(f(okx, 'books:snapshot')[0])!.books![0];
    expect(snap.snapshot).toBe(true);
    expect(snap.depth).toBe(400);
    expect(snap.bids.length).toBeGreaterThan(0);
    const upd = parseOkx(f(okx, 'books:update')[0])!.books![0];
    expect(upd.snapshot).toBe(false);
  });

  it('parses ticker volume in quote currency', () => {
    const t = parseOkx(f(okx, 'tickers:data')[0])!.tickers![0];
    expect(t.quoteVolume24h).toBeGreaterThan(1e6);
    expect(t.open24h).toBeGreaterThan(1000);
  });

  it('ignores non-BTC liquidations and sizes BTC swaps correctly', () => {
    expect(parseOkx(f(okx, 'liquidation-orders:data')[0])!.liquidations).toEqual([]);
    const linear = parseOkx({
      arg: { channel: 'liquidation-orders', instType: 'SWAP' },
      data: [
        {
          instId: 'BTC-USDT-SWAP',
          details: [{ bkPx: '80000', posSide: 'net', side: 'buy', sz: '50', ts: '1' }],
        },
        {
          instId: 'BTC-USD-SWAP',
          details: [{ bkPx: '80000', posSide: 'long', side: 'sell', sz: '10', ts: '2' }],
        },
      ],
    })!.liquidations!;
    expect(linear[0]).toMatchObject({ liquidated: 'short', usd: 50 * 0.01 * 80000 });
    expect(linear[1]).toMatchObject({ liquidated: 'long', usd: 1000 });
  });

  it('ignores subscribe acks and pong strings', () => {
    expect(parseOkx(f(okx, 'trades:subscribe')[0])).toBeNull();
    expect(parseOkx('pong')).toBeNull();
  });
});

describe('Coinbase', () => {
  it('inverts maker side for matches', () => {
    const m = f(coinbase, 'type:match')[0];
    const t = parseCoinbase(m)!.trades![0];
    expect(t.side).toBe(m.side === 'sell' ? 'buy' : 'sell');
    expect(t.quote).toBe('USD');
  });

  it('skips last_match replays', () => {
    expect(parseCoinbase(f(coinbase, 'type:last_match')[0])).toBeNull();
  });

  it('derives quote volume from the ticker', () => {
    const m = f(coinbase, 'type:ticker')[0];
    const t = parseCoinbase(m)!.tickers![0];
    expect(t.quoteVolume24h).toBeCloseTo(parseFloat(m.volume_24h) * parseFloat(m.price));
  });

  it('parses advanced-trade level2 snapshot and updates', () => {
    const snap = parseCoinbaseL2(f(coinbaseAdv, 'l2_data:snapshot')[0])!.books![0];
    expect(snap.snapshot).toBe(true);
    expect(snap.bids.length + snap.asks.length).toBeGreaterThan(0);
    const upd = parseCoinbaseL2(f(coinbaseAdv, 'l2_data:update')[0])!.books![0];
    expect(upd.snapshot).toBe(false);
    expect(parseCoinbaseL2(f(coinbaseAdv, 'heartbeats:')[0])).toBeNull();
  });
});

describe('Kraken', () => {
  it('parses book, trades and both tickers', () => {
    const book = parseKraken(f(kraken, 'book:snapshot')[0])!.books![0];
    expect(book).toMatchObject({ ex: 'kraken', snapshot: true, depth: 500 });
    expect(book.bids[0][0]).toBeGreaterThan(1000);
    const trade = parseKraken(f(kraken, 'trade:update')[0])!.trades![0];
    expect(['buy', 'sell']).toContain(trade.side);
    const snaps = f(kraken, 'ticker:snapshot').map((m) => parseKraken(m)!);
    const usdt = snaps.find((s) => s.usdtUsd);
    const btc = snaps.find((s) => s.tickers?.length);
    expect(usdt!.usdtUsd).toBeGreaterThan(0.95);
    expect(btc!.tickers![0].quoteVolume24h).toBeGreaterThan(1e6);
    expect(parseKraken(f(kraken, 'heartbeat:')[0])).toBeNull();
  });
});

describe('Bybit', () => {
  it('parses spot trades, book and ticker', () => {
    const t = parseBybitSpot(f(bybitSpot, 'publicTrade:snapshot')[0])!.trades![0];
    expect(t).toMatchObject({ ex: 'bybit', quote: 'USDT' });
    const b = parseBybitSpot(f(bybitSpot, 'orderbook:snapshot')[0])!.books![0];
    expect(b).toMatchObject({ snapshot: true, depth: 200 });
    const d = parseBybitSpot(f(bybitSpot, 'orderbook:delta')[0])!.books![0];
    expect(d.snapshot).toBe(false);
    expect(d.bids.some(([, s]) => s === 0) || d.asks.some(([, s]) => s === 0)).toBe(true);
    const tk = parseBybitSpot(f(bybitSpot, 'tickers:snapshot')[0])!.tickers![0];
    expect(tk.quoteVolume24h).toBeGreaterThan(1e6);
  });

  it('maps allLiquidation position side', () => {
    const out = parseBybitLiq({
      topic: 'allLiquidation.BTCUSDT',
      data: [
        { T: 1, s: 'BTCUSDT', S: 'Buy', v: '0.5', p: '80000' },
        { T: 2, s: 'BTCUSDT', S: 'Sell', v: '1', p: '81000' },
      ],
    })!.liquidations!;
    expect(out[0]).toMatchObject({ liquidated: 'long', usd: 40000 });
    expect(out[1]).toMatchObject({ liquidated: 'short', usd: 81000 });
  });
});

describe('Bitstamp', () => {
  it('parses trades (type 0 = buy) and top-100 snapshots', () => {
    const t = parseBitstamp(f(bitstamp, 'live_trades_btcusd:')[1])!.trades![0];
    expect(t.side).toBe('buy');
    const b = parseBitstamp(f(bitstamp, 'order_book_btcusd:')[1])!.books![0];
    expect(b.snapshot).toBe(true);
    expect(parseBitstamp(f(bitstamp, 'live_trades_btcusd:')[0])).toBeNull();
  });
});

describe('Binance', () => {
  it('parses aggTrade (buyer maker = taker sell), depth20 and forceOrder', () => {
    const t = parseBinance({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', p: '80000', q: '1', m: true, T: 1 } })!;
    expect(t.trades![0].side).toBe('sell');
    const b = parseBinance({ stream: 'btcusdt@depth20@100ms', data: { bids: [['1', '2']], asks: [['3', '4']] } })!;
    expect(b.books![0]).toMatchObject({ snapshot: true, bids: [[1, 2]] });
    const l = parseBinance({
      stream: 'btcusdt@forceOrder',
      data: { e: 'forceOrder', o: { s: 'BTCUSDT', S: 'SELL', q: '0.5', p: '79000', ap: '79100', T: 3 } },
    })!;
    expect(l.liquidations![0]).toMatchObject({ liquidated: 'long', usd: 0.5 * 79100 });
  });
});

describe('Deribit', () => {
  it('computes option premium in USD', () => {
    const out = parseDeribit({
      jsonrpc: '2.0',
      method: 'subscription',
      params: {
        channel: 'trades.option.BTC.100ms',
        data: [
          { instrument_name: 'BTC-2OCT26-84000-C', price: 0.01, amount: 2, direction: 'buy', index_price: 84000, timestamp: 5 },
        ],
      },
    })!;
    expect(out.trades![0]).toMatchObject({ market: 'option', side: 'buy', premiumUsd: 0.01 * 2 * 84000 });
  });
});
