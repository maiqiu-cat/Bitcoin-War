# Bitcoin Battle（验证项目）

这是对 Newhedge「Bitcoin Battlefield」（<https://newhedge.io/bitcoin/battlefield>，推文 <https://x.com/newhedge_io/status/2104903265959760161>）的可行性验证。BTC 价格就是战线，盘口挂单就是兵力，主动成交、爆仓和期权成交会变成战场上的炮击。

结论和验证证据见 [FEASIBILITY.md](FEASIBILITY.md)。

## 运行

```bash
pnpm install
pnpm dev                 # http://localhost:5173 实时行情
                         # http://localhost:5173/?sim 离线模拟行情
pnpm test                # 单元测试（解析器使用真实抓取的交易所消息）
pnpm verify:feeds [秒]   # 在 Node 里跑真实交易所连接，输出指数/盘口/事件检查（默认 45 秒）
pnpm build && pnpm verify:screens   # 无头 Chrome 截图 + FPS/报错收集，输出到 verification/
```

### URL 参数

| 参数 | 说明 | 默认 |
| --- | --- | --- |
| `sim` | 使用离线模拟行情 | 关 |
| `seed`, `speed` | 模拟行情的随机种子和速度 | 7, 1 |
| `range` | 一回合的半宽（%），价格打到 ±range 即胜 | 0.25 |
| `big` | 大单阈值（USD，按同一主动单合并后计算） | 25000 |
| `sources` | 逗号分隔的数据源，如 `coinbase,kraken,okx` | 全部 |
| `light` | `auto` / `golden` / `day` / `night` | auto（按本地时间） |
| `q` | `low` 关闭阴影并使用 1x 像素比 | high |

### 操作

拖动旋转，滚轮缩放，W/A/S/D 平移，Q/E 环绕，C 切换电影镜头，F 回到前线。

## 结构

```
src/data/feeds/exchanges.ts  各交易所解析器（纯函数）+ 连接配置
src/data/feeds/wsFeed.ts     WebSocket：指数退避重连、心跳、看门狗
src/data/orderbook.ts        L2 订单簿（快照/增量、按深度截断、去交叉）
src/data/market.ts           MarketHub：USDT→USD、成交量加权指数、离群剔除、
                             主动单合并（大单）、爆仓/期权事件、深度分桶、流量
src/data/sim.ts              离线模拟行情（同一套事件接口）
src/game/battle.ts           回合/胜负、战况播报
src/game/field.ts            价格 → 战场坐标、前线波动函数（与着色器共用）
src/game/armies.ts           深度 → 前线士兵 / 方阵 / 坦克 / 基地储备
src/render/*                 Three.js：地形与领土着色器、实例化兵力、特效、
                             基地、光照预设、镜头导演
src/ui/*                     HUD（价格、战况条、深度图、流水、交易所状态）
```

### 映射规则

- **战线** = 聚合价格。价格低于战线的一侧（买盘）是牛方领土，高于战线的一侧（卖盘）是熊方领土。
- **回合**：开局时以当前价为中心，在 ±0.25% 处各设一个基地。价格打到熊方基地即牛方获胜，反之熊方获胜；6 秒后以新价格开下一局。
- **兵力**：总深度在场上约折合 1100 名士兵，1 名士兵对应的金额取 1/2/2.5/5 的整数档；1 辆坦克等于 25 名士兵的金额，由单桶挂单墙生成。
  - 前线 3 个分桶内的挂单组成贴着战线的士兵排。
  - 场内挂单按其价格位置排成方阵。
  - 基地以外、±1% 以内的挂单算作储备。
- **事件**：
  - 主动大单：己方坦克或士兵开炮。
  - 爆仓：从后方打来的重炮。空头爆仓时炮弹落在熊方阵地，多头爆仓时落在牛方阵地。
  - 期权大单：信号弹。
  - 金额很大的事件会让电影镜头切过去特写。
