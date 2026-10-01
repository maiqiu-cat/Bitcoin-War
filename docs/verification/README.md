# 验证手册

## 1. 自动化

| 命令 | 检查什么 | 通过标准 | 耗时 |
| --- | --- | --- | --- |
| `pnpm build` | 类型检查（tsc strict，`noUnusedLocals/Parameters`）和打包 | 没有报错 | <5s |
| `pnpm test` | 40 个单测（下面有清单） | 全部通过 | <1s |
| `pnpm verify:feeds [秒]` | 用 Node 连真实交易所跑 N 秒（默认 45），输出每家的连接次数、断线、消息数、成交数、盘口档数、价差、相对指数的偏差和权重，并做 6 项断言 | 6 项全部 PASS；报告写入 `verification/feeds-report.json` | N 秒 |
| `pnpm build && pnpm verify:screens` | 启动 vite preview，在无头 Chrome（1600×900）里跑 4 组场景并截图；收集 FPS、单位数、指数、回合、横幅、语言和报错 | 输出 `No runtime errors`（Binance 的 451 和 fstream 报错属于预期，已过滤），FPS 和单位数合理，**人工看过截图**；报告在 `verification/screens-report.json` | 约 2 分钟 |
| `pnpm capture:fixtures [秒]` | 抓真实消息到 `tests/fixtures/_capture/`（已加入 gitignore） | 各交易所都有样本 | N 秒 |

### `verify:feeds` 的 6 项断言

1. 至少 3 家现货交易所进入指数
2. 进入指数的每家，相对指数偏差都小于 30bp
3. 拿到了 USDT/USD 汇率（来自 Kraken）
4. 至少 3 家盘口在两侧都有超过 20 档
5. 整个过程中没有出现盘口交叉
6. ±1% 聚合深度每一侧都超过 $5M

### `verify:screens` 的场景

| 运行 | URL | 截图 |
| --- | --- | --- |
| `sim` | `?sim&light=golden&seed=11&lang=zh` | 1 电影镜头总览、2 前线近景、3 远景、4 夜晚、5 稍后 |
| `sim-rounds` | `?sim&range=0.06&seed=5&light=day&lang=zh` | 1 等到有一方获胜（`waitFn`）、2 等到下一回合开始 |
| `live` | `?light=golden&lang=en` | 1 总览、2 前线近景、3 白天远景、4 点击语言按钮后（应变成中文） |

截图存为 `verification/<运行>-<编号>.png`，不入库。要长期保留的，用 `sips -s format jpeg` 转成 JPG 放进 `docs/screens/`。

## 2. 单测清单（`tests/`）

| 文件 | 覆盖内容 |
| --- | --- |
| `parsers.test.ts`（15） | OKX：成交、盘口快照和增量（400 档）、ticker 成交额、爆仓过滤和换算（U 本位、币本位、posSide、net 模式）、订阅确认和 pong 被忽略。<br>Coinbase：主动方取反、跳过 last_match、ticker 成交额、level2 快照和增量。<br>Kraken：盘口、成交、两个 ticker（含 USDT/USD）。<br>Bybit：现货三个频道、allLiquidation 方向。<br>Bitstamp：type 0 是买、top100 快照。<br>Binance：aggTrade 的 m、depth20、forceOrder。<br>Deribit：权利金换算。 |
| `market.test.ts`（9） | OrderBook：快照和增量、截断、去交叉。<br>MarketHub：USDT 换算后按成交额加权、离群和过期剔除、大单合并、不同方向和隔太远的成交不合并、爆仓方向、深度分桶和过期盘口剔除。 |
| `battle.test.ts`（12） | BattleEngine：开局、牛方胜、间歇、下一局、熊方胜。<br>narrate：8 种情形。<br>FieldMap：映射和反解、刻度步长、波动有界。<br>layoutArmies：key 唯一、前线/场内/储备拆分、在本方一侧、结果确定、列顺序是排列、niceUsd。 |
| `i18n.test.ts`（4） | 两份字典的键集合一致、覆盖所有 StatusKey 和 FeedType、占位符一致、变量替换和切换语言。 |

解析器测试读取的是 `tests/fixtures/*.json` 里的真实消息，见 [tests/fixtures/README.md](../../tests/fixtures/README.md)。

## 3. 最新结果

| 日期 | 项目 | 结果 |
| --- | --- | --- |
| 2026-10-01 | `pnpm test` | 40/40 |
| 2026-10-01 | `pnpm build` | 通过。JS 677KB（gzip 178KB），CSS 11KB，Inter 字体各子集 10–48KB |
| 2026-10-01 | `verify:feeds 90` | 6/6 PASS。5 家进入指数，偏差 ±1bp；±1% 深度买 $52.9M、卖 $34.1M；90s 内 11 个大单事件（含 Deribit 期权权利金 $160K）；除 Binance 外 0 次断线 |
| 2026-10-01 | `verify:screens` | 0 个非预期错误。M4 上多数场景 60 FPS，回合切换约 49；实盘约 2,000 名士兵和 80 辆坦克；中英文切换生效 |
| 2026-10-01（发布前复核） | `pnpm build`、`pnpm test` | 构建通过，40/40 单测通过 |
| 2026-10-01（发布前复核） | `pnpm verify:feeds 60` | 6/6 PASS；5 家现货进入指数，Binance 451 属已知限制 |
| 2026-10-01（发布前复核） | `pnpm verify:screens` | 11 张截图已人工检查；模拟与实盘场景约 60 FPS，中英文切换正常，0 个非预期运行时错误 |

每次跑完有意义的验证，往这张表里加一行。

## 4. 已知的验证缺口

- **实盘 BTC 爆仓**：从没在窗口内观察到。下次遇到行情波动大时，跑 `pnpm verify:feeds 300`，看「BTC liquidations seen」和流水里有没有 `liqShort/liqLong`，并核对 Bybit 的 `S` 语义。
- **Binance**：只能在没有地区限制的网络下验证。
- **移动端和低配设备**：没测过。
- **模拟行情不能逐帧复现**：同一个 seed 下，价格路径还受定时器交错顺序影响。需要确定性测试的话，把 SimFeed 改成由外部按步驱动。

## 5. 人工验收清单（改画面或 HUD 时逐项看）

- [ ] 三套光照下都看一遍：战线清楚但不刺眼；夜晚不过曝；白天白墙不发光
- [ ] 前线两排士兵贴着战线，没有站到对方领土里（被击倒、阵亡的除外）
- [ ] 士兵行军时迈腿，静止时不迈腿；开枪时有后坐和曳光弹
- [ ] 炮击：炮弹有弧线，着地时有爆炸、碎块、焦痕和冲击环；附近的守方士兵被击倒后会爬起来
- [ ] 回合胜利：横幅颜色对、败方旗帜降下后换色再升起、有连环爆炸；6 秒后新回合开始，旗帜复原
- [ ] 中英文切换：所有面板、播报、流水、横幅、3D 标签都跟着变，刷新后还记得选择
- [ ] HUD 文字清楚，没有被价格的发光盖住；播报不来回闪
- [ ] 窗口缩到 860px 宽以下也不错乱
- [ ] 控制台没有新的报错
