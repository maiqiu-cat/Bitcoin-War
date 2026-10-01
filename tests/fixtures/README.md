# 测试夹具：真实交易所消息

2026-10-01 从公开 WebSocket 抓取，供 `tests/parsers.test.ts` 使用。

- **格式**：`{ "<消息类别>": [最多 3 条样本] }`。消息里超过 12 项的数组会被截断，例如盘口快照。
- **类别名**：由抓取脚本里的 `kindOf()` 生成，例如 `books:snapshot`、`type:match`、`live_trades_btcusd:`。

| 文件 | 连接 | 备注 |
| --- | --- | --- |
| `okx.json` | OKX public | 有成交、盘口、ticker、爆仓（窗口内只有非 BTC 币种的爆仓，用来测试过滤） |
| `coinbase.json` | Coinbase Exchange matches + ticker | — |
| `coinbase-adv.json` | Coinbase Advanced Trade level2 + heartbeats | — |
| `kraken.json` | Kraken v2 book + trade + ticker（BTC/USD、USDT/USD） | — |
| `bitstamp.json` | Bitstamp 成交 + order_book | 测试用了 `live_trades_btcusd:` 的第 [1] 条（第 [0] 条是订阅确认） |
| `bybit-spot.json` | Bybit spot | — |
| `bybit-linear.json` | Bybit linear allLiquidation | 只有订阅确认（窗口内没有爆仓），测试改用合成消息 |
| `deribit.json` | Deribit | 当时误订了需要鉴权的 `.raw` 频道，所以只有一条报错；测试用合成消息。现在的抓取脚本已改用 `100ms` |

## 刷新

```bash
pnpm capture:fixtures 90       # 输出到 tests/fixtures/_capture/（不入库）
diff <(jq -S . tests/fixtures/okx.json) <(jq -S . tests/fixtures/_capture/okx.json) | head
```

1. 确认测试用到的类别名在新文件里还存在。
2. 再把新文件复制过来，跑 `pnpm test`。

如果交易所改了格式，**先改解析器、再换夹具**，并在 [docs/data-sources/exchanges.md](../../docs/data-sources/exchanges.md) 里记一笔。
