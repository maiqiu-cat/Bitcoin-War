# 验证手册

## 1. 自动化

| 命令 | 检查什么 | 通过标准 | 耗时 |
| --- | --- | --- | --- |
| `pnpm build` | 类型检查（tsc strict，`noUnusedLocals/Parameters`）和打包 | 没有报错 | <5s |
| `pnpm test` | 52 个单测（下面有清单） | 全部通过 | <1s |
| `pnpm verify:feeds [秒]` | 用 Node 连真实交易所跑 N 秒（默认 45），输出每家的连接次数、断线、消息数、成交数、盘口档数、价差、相对指数的偏差和权重，并做 6 项断言 | 6 项全部 PASS；报告写入 `verification/feeds-report.json` | N 秒 |
| `pnpm build && pnpm verify:screens` | 启动 vite preview，在无头 Chrome（1600×900）里跑 4 组场景并截图；收集 FPS、单位数、指数、回合、横幅、语言和报错 | 输出 `No runtime errors`（Binance 的 451 和 fstream 报错属于预期，已过滤），FPS 和单位数合理，**人工看过截图**；报告在 `verification/screens-report.json` | 约 2 分钟 |
| `pnpm build && pnpm verify:audio` | 无头 Chrome，分三部分：A 允许自动播放时不用点击就出声；B0 喇叭按钮首次解锁、静音与恢复；B1–B7 拦截时提示、点击后出声、激战与胜利切换、M 键、无错误；C 用真实资源离线渲染 36 秒场景（`verification/audio-preview.wav`，不入库），要求不爆音、爆炸比配乐底层高 ≥8 dB | 全部 PASS，并且人工听一遍；公网较慢时还须排除模拟行情状态变化造成的假阴性 | 约 1 分钟 |
| `pnpm build && pnpm verify:mobile` | 无头 Chrome，12 种视口（手机竖屏 5 种含浏览器地址栏后的实际可用高度、手机横屏 3 种、iPad 竖横、1280 笔记本、1440 桌面）× 中英文；先塞满 8 条市场动态和 6 家交易所、再弹出开场横幅，测最拥挤的情况。`MOBILE_CHECK_URL=https://battle.ondream.ai` 可直接查线上，`MOBILE_CHECK_ONLY=iphone,landscape` 只跑部分视口（不写报告） | 输出 `MOBILE LAYOUT CHECKS PASSED (24)`：各 HUD 块互不重叠、都在屏幕内、页面不能横向滚动、没有文字溢出、动态标签宽度 ≥24px、深度轴三个价格间距 ≥4px、无运行时错误；**人工看过** `verification/mobile/*.jpg`；报告在 `verification/mobile-report.json` | 约 2 分钟 |
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
| `audio.test.ts`（12） | 空间化（距离和闷度）、限流、变体不重复、强度和平滑、平静/激战切换滞后、爆炸分级、呼啸对齐、避让深度、资源清单（文件存在、循环参数、变体数）、声音偏好读取。 |

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
| 2026-10-01（生产验收） | `https://battle.ondream.ai/` | HTTPS 200、HTTP 301、首页 SHA 与本地构建一致；桌面 Chrome 4 家交易所进入指数、约 60 FPS、中英切换正常，0 个非预期错误；390px Chrome 模拟视口有文字重叠 |

| 2026-10-01 | 生产环境只读验收（Claude） | 公网：301 跳转 HTTPS、证书校验通过、HTTP/2；静态资源 gzip 加 immutable 缓存，字体 MIME 正确。服务器：版本 `20261001-1225-6ea3766` 的文件与发布包一致；Nginx 与基线相比只多了 `zz-battle.ondream.ai.conf`；其他站点返回码、默认证书、监听端口、容器全部和基线一致；无错误日志。无头 Chrome：60 FPS，4 家交易所，无非预期错误。问题：网站文件属主是 uid 501（脚本已修，下次发布生效） |
| 2026-10-01 | `verify:audio`（第一版程序合成） | 全部 PASS：峰值 0.875，−16.1 dBFS，平静段 −23.1 dB，激战段 −14.4 dB（之后被第二版替换） |
| 2026-10-01 | `verify:audio`（第二版 M2/M1/M3 + 采样音效） | A、B1–B7、C1–C3 全部 PASS：允许自动播放时不用点击就出声；36 个资源全部预加载；平静 → 激战 → 胜利切换正常；峰值 0.83，爆炸比配乐底层高 16.2 dB；循环接缝偏移 0，相关度 0.995 / 0.980 |
| 2026-10-02（音频版发布前） | `pnpm build`、`pnpm test`、`pnpm verify:audio`、`pnpm verify:screens` | 构建通过，52/52 单测通过；音频 A、B0/B0a/B0b、B1–B7、C1–C3 全部 PASS，36 个资源加载、峰值 0.8282，爆炸高于配乐 16.2 dB；11 张截图已检查，约 59–60 FPS，0 个非预期运行时错误 |
| 2026-10-02（生产音频版） | `battle.ondream.ai` 与 `verify:audio` | 版本 `20261001-1541-de01e82`；HTTPS 首页哈希与发布包一致，音频资源 200 + immutable，发布前后 `audit` 均通过。原版线上脚本 A/B2/B3 因模拟行情在资源加载期间进入激战/胜利而失败，其余项通过，0 个运行时错误；低速宽回合的线上受控复核通过 36 个资源、首次点喇叭、平静→激战→胜利、M 键和画面，见 `verification/audio-report-production-controlled.json`。主观听感待用户真机验收 |

| 2026-10-02（手机布局） | `pnpm verify:mobile`（修改前，即线上 `20261001-1541-de01e82` 的样式） | 24 个组合 19 个失败：手机竖屏菜单盖住标题、价格和涨跌幅，声音提示压住两个底部面板，动态类型文字被挤到 2px，深度轴价格连成一串；手机横屏几乎全部互相重叠；iPad 竖屏菜单盖住价格；iPad 横屏英文左上面板压到战况条 |
| 2026-10-02（手机布局） | `pnpm verify:mobile`、`pnpm test`、`pnpm build`、`verify:audio`、`verify:screens` | 24/24 PASS；手机竖屏、横屏、iPad 截图已人工检查；52/52 单测；音频全部 PASS（B0 在 800×600 紧凑布局下点喇叭仍正常）；桌面 11 张截图 60 FPS、0 个非预期错误，布局与修改前一致 |
| 2026-10-02（独立复核） | `pnpm build`、`pnpm test`、`pnpm verify:mobile`、`pnpm verify:audio`、`pnpm verify:screens` | 发现并修复 375×553 中文动态滑入时的横向溢出；定点浏览器复现由面板 +6px 变为 0；复跑 24/24、52/52、音频全部 PASS、桌面 11 张 59–60 FPS 且无非预期运行时错误；已看手机、iPad 和桌面截图 |

每次跑完有意义的验证，往这张表里加一行。

## 4. 已知的验证缺口

- **实盘 BTC 爆仓**：从没在窗口内观察到。下次遇到行情波动大时，跑 `pnpm verify:feeds 300`，看「BTC liquidations seen」和流水里有没有 `liqShort/liqLong`，并核对 Bybit 的 `S` 语义。
- **Binance**：只能在没有地区限制的网络下验证。
- **移动端和低配设备**：布局已由 `verify:mobile` 覆盖（2026-10-02 起全部通过），但真机只有用户 iPhone Chrome 的一张截图（修改前）；iPhone Safari、Android Chrome 真机的性能、触控和发热，以及低配设备均未测。
- **模拟行情不能逐帧复现**：同一个 seed 下，价格路径还受定时器交错顺序影响。需要确定性测试的话，把 SimFeed 改成由外部按步驱动。
- **线上 `verify:audio` 的时间依赖**：A/B2/B3 目前要求恰好处于平静或激战；公网资源加载慢时，模拟回合可能已经切到胜利。固定行情状态后再做断言，避免产品正常却报告失败。

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
