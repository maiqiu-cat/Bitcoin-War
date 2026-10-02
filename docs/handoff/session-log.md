# 会话日志

按时间倒序。每次会话结束时追加一条：做了什么、提交、验证结果、遗留问题。提交哈希以 `git log` 为准。

---

## 2026-10-03 · 会话 19：全面质量审查、二次清理与公开仓库重建

- **全面审查**（只读）：6 个子代理分块审查加本人复核，报告在本机 `~/Documents/CODE_REVIEW_2026-10-03-bitcoin-battle.md`（不入库）。8 条 P1、45 条 P2、约 60 条 P3，修复交给 Codex，顺序见报告第 6 节。
- **二次清理**：审查发现公开文档里仍有描述维护者本机网络环境的措辞（一份 ADR、会话日志、AGENTS.md、运行手册、发布文档、演练脚本注释，以及两条提交信息）。全部改为中性措辞，相关短语加入本机敏感词清单，再次用 git-filter-repo 重写全部历史并删库重建；提交时间统一为 UTC。**所有提交哈希再次变化**，新旧对照见本机 `private/backup/commit-map-2.txt`。
- **产品名**：用户定为「比特币战争」。页面标题（`app.title`）、manifest 的 `name`/`short_name` 与左上角品牌统一。
- **非官方声明**：README 和 AGENTS.md 写明本项目是独立的非官方实现，与 Newhedge 无关联、未获认可。站点上的可见声明和与原版相同的英文界面文案，交给 Codex 处理（见审查报告 L-3）。
- **仓库重建**：旧仓库 `Bitcoin-Battle` 由用户删除，新仓库改名为 `Bitcoin-War`（<https://github.com/maiqiu-cat/Bitcoin-War>，公开，关闭 Wiki）。文档里的当前链接和 `LICENSE.md` 的 Required Notice 已更新；旧链接失效。推送后给 `main` 开了分支保护（禁止强制推送和删除），打开 Dependabot 告警。从此提交时间统一为 UTC，`check:public` 会检查。
- **英文名**：用户随后决定英文名也改为 **Bitcoin War**：英文页面标题和品牌、`index.html` 标题、manifest、`favicon.svg` 的标题、`package.json` 的包名，以及 README、AGENTS.md 等文档里的产品名已统一。本地目录名 `Bitcoin Battle` 和 `deploy/` 里的注释没有改（改 Nginx 模板注释会让下次发布重载共用 Nginx，留给后续改模板时一起做）。`verify:mobile` 复跑 24/24。
- **没有做**：没有发布到生产；审查报告里的其余问题尚未修复。

---

## 2026-10-02 · 会话 18：作者 X 链接发布

- 用户授权按本机手册发布，并单独授权推送发布记录。发布前确认本地与 GitHub `main` 均为 `ce24627`，`deploy/` 自上版未改。由干净提交打包 `20261002-1153-c999c6c`，发布包 SHA-256 `d1383c47b6b5660a79839d6c0b984ae434ec96e73fa37594b053f3774de25569`；包内头像与仓库哈希一致，上版图标和 36 个音频保留。
- 发布前备份当前 Battle 站点和配置，并完成解包恢复检查。本机 `pnpm test` 58/58、`verify:mobile` 24/24、`verify:screens` 约 60 FPS 且无非预期运行时错误；重点截图已检查。Docker 演练 `REHEARSAL PASSED`。
- 生产配置与包内模板哈希一致；`preflight`、发布前后 `audit` 均通过。部署只切换 `current`，Nginx 未重载；审计差异仅为 `current / previous / releases`。公网首页 SHA-256 与发布包同为 `650dad055ef1bcc3d0c36309ddf393674763112725b143bd3554e466062ac9c4`。
- 线上 `x-avatar.jpg` 返回 `200 image/jpeg`，SHA-256 `fdc97f2a294476409f54a2ffbd2f8d2f27d406196c08c8fbb34183c6463d1dc1`，内容与发布包一致。线上布局抽查 8/8；正常页面 20 秒无网络误提示，价格持续更新。在 Chrome 点击 X 链接后，目标个人主页于新标签页加载，原页面保持不变；头像、昵称、悬停提示和读屏文字正确。手机真机的位置、样式及点击效果仍请用户确认。

---

## 2026-10-02 · 会话 17：作者 X 链接（未发布）

- 用户要求在界面合适的位置加上 X 链接 `https://x.com/MagicPower21M`，用该账号的头像和昵称。昵称「MagicPower ⚡」、头像通过 fxtwitter 公开接口取得；头像 200×200 JPEG（15KB，无元数据）存为 `public/x-avatar.jpg`，不引用 X 的图片服务器（ADR 0008）。
- 样式是胶囊形：头像、昵称、X 标志。新标签页打开，悬停提示和读屏文字是「在 X 上关注 @MagicPower21M」。
- 位置：
  - 桌面端在左上角品牌右侧同一行（`.masthead` 包住品牌和链接）。
  - 平板和手机横屏在品牌下面一行。
  - 手机竖屏放在战况条下方左侧。高度 ≤640px 的矮屏在回合横幅或网络提示显示时，暂时隐藏链接。
- 检查：58/58；`verify:mobile` 24/24（修正 iPhone SE 横幅和网络提示重叠后）；`verify:screens` 60 FPS、无非预期错误；本地预览确认三种布局下链接可点并打开 X 主页。
- **没有做**：没有推送，没有发布。会话 16 的发布记录 `9b1de7a`（Codex 提交）也还在本地，等用户决定推送。

---

## 2026-10-02 · 会话 16：网站图标、品牌和网络提示发布

- 用户授权生产发布；发布前确认本地 `HEAD`、`origin/main` 和 GitHub 远端均为 `a9695cf`。本次没有再次推送 GitHub。
- 从干净提交打包 `20261002-0800-918ee68`，发布包 SHA-256 `4c192212b95d2f4a21ceb5b25d81e47ba21e243c30fa41f8f2326b738514a997`。包内网站与 `dist` 一致，7 个图标文件和 36 个音频文件齐全，渲染的 Nginx 配置与线上哈希一致。
- 发布前将现有 Battle 站点与配置备份到本机 `private/`，解包后核对当前版本链接、旧版首页和配置哈希。`pnpm test` 58/58、`verify:mobile` 24/24、`verify:screens` 60 FPS 且无非预期运行时错误；手机竖屏、横屏及桌面截图已检查。Docker 演练 `REHEARSAL PASSED`。
- 生产 `preflight` 和发布前后 `audit` 均通过；只切换 `current`，Nginx 未重载。发布后审计仅 `current / previous / releases` 三行变化。公网首页 SHA-256 与发布包同为 `0dcd06ed37fb01ee3a99ce4587d5e74ccb7dcadf53003f116f636420dd44eb3d`，7 个图标地址均为 200 且内容与发布包一致；线上移动布局抽查 6/6 通过。
- 线上浏览器：正常页面连续 20 秒无网络提示，价格与左上角 logo、中文品牌正常；仅启用 Binance 时约 12 秒出现「无法连接到交易所」，英文切换正确；断网后立即显示「网络已断开」。浏览器标签图标、iPhone 主屏图标及真机布局仍请用户核对。

---

## 2026-10-02 · 会话 15：左上角品牌与网络提示（未发布）

- **品牌**：用户要求网站和手机访问时左上角都显示网站 logo 和「比特币战争」。新增 `.brand`：logo 用 `/favicon.svg`，文字用 i18n 键 `brand`（中文「比特币战争」，英文 Bitcoin Battle）。
  - 桌面端：品牌 34px，状态面板下移到它下面。
  - 小屏：品牌缩到 26px，放在左上角，与菜单同高。手机竖屏第一行原来的标题保留行高但不显示，价格和战况条位置不变。
  - 页面标题和 manifest 仍是「比特币战场」，没有改。
- **网络提示**：用户要求连不上交易所时提示检查网络。新增纯函数 `src/data/connectivity.ts`（`netState`）和 HUD 的 `.net-alert`，只在实时模式生效：
  - 浏览器离线时立即显示「网络已断开」。
  - 启动 12 秒后仍没有现货成交，或运行中 20 秒没有新成交，显示「无法连接到交易所」，并提示检查网络、等待自动重连或刷新页面。
  - 数据恢复后自动消失。位置与回合横幅相同，3D 标签会在它后面淡出。
- **检查**：
  - 新增 `tests/connectivity.test.ts`（6 个），共 58/58 通过。
  - `verify:mobile` 把品牌纳入重叠检查，并新增一轮网络提示检查，结果 24/24 PASS；`verify:screens` 桌面截图 56–59 FPS、0 个非预期运行时错误；手机竖屏、横屏、桌面截图已人工检查。
  - 本地预览实时模式端到端：正常连接 16 秒不提示；断网 1.5 秒内提示，恢复后消失；只连 Binance（本机 451）第 14 秒提示；提示显示时切换语言，标题跟着变。
- **推送**：按用户要求，由 Claude 直接推送到 GitHub。这次推送包括许可证（`044e089`）、本提交，以及 README 开头的许可说明。
- **没有做**：没有发布到生产。生产发布交给 Codex，手册见本机 `private/docs/handoff/release-2026-10-02-icons-license.md`（推送后已更新为只做发布和记录）。

---

## 2026-10-02 · 会话 14：开源许可与下一次发布的执行手册

- 用户要求：可以复制、分发，但不可以商用。选用 **PolyForm Noncommercial License 1.0.0**（专为软件写的非商业许可：允许复制、分发、修改，仅限非商业用途，分发时须保留 `Required Notice`）。`LICENSE.md` 的正文与 PolyForm 官方仓库、SPDX 的原文逐字一致（两份原文只有换行不同），顶部是 `Required Notice: Copyright 2026 maiqiu-cat (…)`。
- README 增加「许可」一节（中文摘要，以英文原文为准）；CREDITS.md 注明第三方组件沿用各自许可；`package.json` 的 `license` 为 SPDX `PolyForm-Noncommercial-1.0.0`（保留 `private: true`，不发布到 npm）；AGENTS.md 写明许可。
- 给 Codex 写了下一次的执行手册（本机 `private/docs/handoff/release-2026-10-02-icons-license.md`）：A 推送本提交到 GitHub，B 发布网站图标（`d1ac3fc`；清理后的第一次发布，Docker 演练必须做，渲染的 HTTPS 配置须与线上 `9f5a4f3f…` 一致），C 只记录摘要并推送。A、B 分别需要用户授权。
- **没有做**：当时只提交到本地，后来在会话 15 由 Claude 推送到 GitHub；没有连接生产服务器。

---

## 2026-10-02 · 会话 13：把服务器和本机环境信息移出仓库（含历史），重建为公开仓库

- 用户要求：GitHub 私有仓库里也不保留敏感信息，只留在本机。
- 检查范围：全部文件、全部 19 个提交（含已删除的文件、提交信息、作者邮箱）。没有密钥、token、密码；要清理的是生产服务器信息（IP、SSH 方式、内网/VPN 地址、同机站点和容器、系统版本、云服务商和 DNS 服务商）、本机网络配置、作者邮箱里的本机主机名和个人邮箱，以及第三方参考帧。
- 新增本机专用目录 `private/`（已加入 `.gitignore`，说明见 `private/README.md`）：服务器参数 `private/deploy/`，首次发布审计和 Codex 发布手册 `private/docs/handoff/`，参考帧 `private/research/newhedge-frames/`，清理前的完整备份 `private/backup/`。
- 部署脚本参数化：`push.sh` 和 `package.sh` 读取 `private/deploy/site.env`；HTTPS 的 `listen` 行由新增的 `deploy/render-nginx.sh` 从 `private/deploy/https-listen.conf` 填进模板；`install.sh` 从发布包里的 `site.env` 读取 `EXPECT_IP`。示例和演练改用 `deploy/examples/` 里的 RFC 5737 文档专用地址。
- 文档删去服务器细节，`AGENTS.md` 增加「服务器和本机环境细节只写进 `private/`」的规则。`pre-commit` 和 `commit-msg` 钩子按本机 `private/deploy/forbidden-patterns.txt` 拦截；作者邮箱改为 GitHub noreply（仓库级 `user.email`）。
- 用 git-filter-repo 重写全部历史：删除首次发布审计、发布手册和参考帧；替换历史文件和提交信息里的敏感字符串；作者邮箱统一为 noreply。**所有提交哈希都变了**，新旧对照见 `private/backup/commit-map.txt`。文档里的提交哈希已换成新哈希；发布版本号（如 `20261002-0335-4f903d9`）是服务器上的目录名，保持原样。
- 验证：`pnpm test` 52/52；测试发布包与线上 `20261002-0335-4f903d9` 相比，网站文件和两份 Nginx 配置逐字节相同（渲染后的 HTTPS 配置 SHA-256 `9f5a4f3f…`，与线上一致，下次发布仍然不重载 Nginx）；`install.sh` 只有注释和 `EXPECT_IP` 的读取方式有变化；Docker 演练 `REHEARSAL PASSED`（35 项检查）；测试包已删除。重写后对全部历史做了敏感字符串扫描。
- 用户手动删除了原来的私有仓库，并决定改为公开：以 public 重建 `maiqiu-cat/Bitcoin-Battle`（沿用原描述，关闭 Wiki），推送清理后的 `main`，包括其他会话同时提交的网站图标（`Add the Bitcoin Battle logo as site icons`）。
- 新增推送闸门 `scripts/check-public.sh`（`pnpm check:public`，`--all` 查全部历史）：逐个提交检查改动、提交信息、新增二进制文件、作者和提交者邮箱，再查 HEAD 文件树；敏感清单只在本机，缺失时直接判失败。用旧历史 bundle 和人为植入的 IP、邮箱测试过，都能拦下。
- 钩子改为入库的 `scripts/git-hooks/`（`pre-commit`、`commit-msg`、`pre-push`；每个 clone 执行一次 `git config core.hooksPath scripts/git-hooks`）。`pre-push` 只允许推 `main`，并对推送范围运行闸门。
- 新增 Codex 操作手册 [release-and-publish.md](release-and-publish.md)：授权与红线、三道防线、推送步骤、生产发布步骤、停止条件、汇报模板。私有手册的用法写在本机 `private/docs/handoff/README.md`。
- **没有做**：没有连接或改动生产服务器。

---

## 2026-10-02 · 会话 12：手机布局独立复核、生产发布与 GitHub 同步

- 用户明确授权复核 Opus 的手机适配、发布到 `battle.ondream.ai`，并推送 GitHub 私有仓库。
- 首轮 `verify:mobile` 为 23/24：iPhone SE 375×553 中文界面的市场动态在新消息滑入时，列表横向多出 14px、面板多出 6px。定点复现确认静止时无溢出，原因是 `.br li.fresh` 的 `translateX(14px)` 动画。给动态列表设置 `overflow-x: clip` 后，动画仍在列表内播放，面板溢出归零。
- 修复后 `pnpm build`、`pnpm test`（52/52）、`pnpm verify:mobile`（24/24）、`pnpm verify:audio`（全部 PASS）及 `pnpm verify:screens`（11 张、59–60 FPS、0 个非预期运行时错误）通过。人工看过手机竖屏、横屏、iPad 和全部 11 张桌面场景截图；音频按钮的首次解锁、静音与恢复也由浏览器脚本验证。
- 由干净提交 `3a1ae48` 打包 `20261002-0335-4f903d9`：`dirty=false`、归档文件均为 `root:root`、36 个 `.m4a`、包内网站与 `dist` 一致；归档 SHA-256 `a7ab7d079cc5210e540580da26a3f4feb78dba34aadadc894f36bbbfc1b0afb9`。Docker 演练完整通过（HTTPS 内容更新不重载、资源校验、回滚、其他站点保护）。
- 发布前：Nginx 站点配置与模板 SHA-256 均为 `9f5a4f3f2f6d7c07af8f6d14f6de43cccf9d3cbde971cd112c142e66d159516a`；旧版 `current` 为 `20261001-1541-de01e82`，公网首页 SHA-256 为 `ed984fdff674b1d8660c2491ab1677a4835990b8cb4879d95cfe0d895881a781`；上传校验、`preflight` 和发布前 `audit` 均通过。
- 部署仅切换 Battle 的 `current` 至 `20261002-0335-4f903d9`，上一版保留；部署日志明确 `nginx config unchanged … no reload`，HTTPS 首页、不可变缓存和音频资源校验通过。发布后 `audit` 仅 `current / previous / releases` 三行有预期变化；其他站点、默认证书、监听端口及容器与基线一致。公网首页与发布包 SHA-256 同为 `04133e472f2da091da46afbfb002bbe5ab7bd1af285c67899911682e8c61697a`，音频资源 HTTP/2 200 且一年不可变缓存。
- 线上 `MOBILE_CHECK_URL=https://battle.ondream.ai pnpm verify:mobile` 24/24 PASS；线上中文竖屏、横屏截图已复看。GitHub 私有仓库 `main` 已推送并读回确认源码 `3a1ae48`。真机 iPhone Safari、Android Chrome 的性能、触控和发热仍待验收。

---

## 2026-10-02 · 会话 11：手机布局（未发布）

- **用户反馈**（附 iPhone Chrome 截图，可用区域约 393×671）：顶部被遮住；下面两个说明区域、顶部说明文字和菜单的字号都可以再小。截图里右上角 318px 宽的菜单面板整块盖住标题和价格；深度图买墙、卖墙文字叠在一起，三个价格坐标连成一串；市场动态的类型文字被挤没；「卖方储备」3D 标签压在战况条上、被屏幕边缘切掉一半。
- **新检查** `scripts/mobile-check.mjs`（`pnpm verify:mobile`）：12 种视口 × 中英文，塞满 8 条动态、6 家交易所并弹出开场横幅后，检查 HUD 块是否重叠、出界、文字溢出，动态标签宽度和深度轴间距。修改前（与线上 `20261001-1541-de01e82` 相同）24 个组合 19 个失败，详见 [验证手册](../verification/README.md)。
- **修改**：
  - `styles.css` 末尾改成三段媒体查询（宽 ≤1100 或高 ≤500 的紧凑布局、≤600 的手机竖屏、高 ≤500 的手机横屏），详见 [HUD 文档](../ui/hud-and-i18n.md)「小屏布局」一节：菜单只留图标、和标题同排；价格与涨跌并排；战况条、底部面板、横幅、3D 标签字号整体缩小；声音提示不再压住底部面板。桌面 1101–1271px 宽时收窄上中区；Deribit 的 options 列加宽到 42px；`text-size-adjust: 100%`。
  - `hud.ts`：动态和深度标题同时渲染全称和简称（手机显示简称）；深度图买卖墙放不下时分两行；新增 `obstacles()`。
  - `world.ts`：储备标签被屏幕边缘切掉或落在 HUD 面板下时淡出；落在屏幕左右边缘的爆炸飘字不显示。
  - `i18n.ts`：`feedShort.*`、`depthTitleShort`；`main.ts`：`world.labelObstacles`，调试入口 `__bb.hud`。
- **验证**：`verify:mobile` 24/24 PASS；`pnpm test` 52/52；`pnpm build` 通过；`verify:audio` 全部 PASS；`verify:screens` 11 张 60 FPS、0 个非预期错误，桌面布局与修改前一致。人工看过 iPhone 中文、iPhone SE 英文、手机横屏带横幅、iPad 竖屏和桌面实盘截图。
- **发布**：未发布。由 Codex 按本地发布手册 `private/docs/handoff/release-2026-10-02-mobile.md` 执行。
- **遗留**：发布后请用户在手机上复看；竖屏镜头取景（只看得到战场中段）记入 backlog，待用户决定。

---

## 2026-10-02 · 会话 10：音频版发布与 GitHub 同步

- 用户明确授权发布到 `battle.ondream.ai` 并将最新代码推送到 GitHub 私有仓库。服务器写入限于 Bitcoin Battle 的发布包、版本目录及状态指针；没有修改其他站点或重载 Nginx。
- 独立核查发现浏览器拦截自动播放时首次点喇叭按钮会立即静音；在 `src/main.ts` 修复，`verify:audio` 增加 B0/B0a/B0b 浏览器回归检查。修复提交 `00d9bba`；合并远端用户更新的 README 后，发布源码为 `477d0b0`。
- 本地 `pnpm build`、52/52 单测、`verify:audio` 全部通过。36 个音频资源均加载；离线混音峰值 0.8282，爆炸比配乐底层高 16.2 dB。`verify:screens` 的 11 张图已检查，模拟与实盘约 59–60 FPS，无非预期运行时错误；Docker 仿生产演练 `REHEARSAL PASSED`，包括 HTTPS 内容发布不重载 Nginx、音频文件校验和回滚。
- 由干净提交打包 `20261001-1541-de01e82`（`dirty=false`，归档 55 项均为 `root:root`，站点含 36 个 `.m4a`，包内站点与 `dist` 一致）。发布包 SHA-256 为 `c201a7b1e38977bffe6863ca4148c53dbb2e6a8a2813395628e17cec0b388f14`。
- 发布前：线上配置与 HTTPS 模板 SHA-256 均为 `9f5a4f3f2f6d7c07af8f6d14f6de43cccf9d3cbde971cd112c142e66d159516a`；`current` 仍为 `20261001-1225-6ea3766`，公网首页 SHA-256 为 `72dc8cf55e200fdc65c9d5f53b3d74eff310cc62239b6d230d20afba521088e5`；上传校验、`preflight` 与发布前 `audit` 全部通过。
- 部署：`current` 原子切到 `20261001-1541-de01e82`，上一版保留；脚本报告 `nginx config unchanged … no reload`，HTTPS 首页、不可变缓存及音频文件逐字节校验通过。发布后 `audit` 为 `AUDIT OK`，与发布前只差 Battle 的 `current / previous / releases` 三行。公网首页 SHA-256 与发布包同为 `ed984fdff674b1d8660c2491ab1677a4835990b8cb4879d95cfe0d895881a781`；一个 `.m4a` 返回 HTTP/2 200 和一年不可变缓存。
- 线上原版 `verify:audio` 的 A、B2、B3 三项未通过：本机访问公网较慢，模拟行情在资源加载期间已进入激战或胜利，而脚本仍断言必须处于平静。报告保留在 `verification/audio-report-production.json`。随后对同一线上版本使用低速、宽回合模拟参数，受控验证 36 个资源、喇叭按钮解锁、平静→激战→胜利、M 键静音/恢复、3D 画面均通过，0 个运行时错误；结果见 `verification/audio-report-production-controlled.json`。这属于验收脚本的时间依赖，需单独改进。
- GitHub 私有仓库的 `main` 已推送并读回确认发布源码 `477d0b0`。真实浏览器中的音色和整体音量仍待用户主观试听；移动端布局和浏览器直连行情的原型限制仍在。

---

## 2026-10-01 · 会话 9：配乐和音效第二版（未发布）

- **用户反馈**：背景音乐太闷、太单调；枪炮声太单一，听不出来；希望默认开启声音。要求先出试听，再改代码。
- **试听**（`audio-demos/2026-10-01/index.html`，不入库）：
  - 用 MuseScore_General 音色库（MIT）渲染 4 首管弦配乐。
  - 7 段多层合成音效，加上两段实战混音。
  - 客观对比：旧版 77% 的能量在 250Hz 以下、频谱重心 237Hz；新曲重心 800–1574Hz，段落起伏是旧版的 2–4 倍。实战混音里爆炸比配乐高约 12 dB。
- **用户选定**：平静 M2、激战 M1、胜利 M3。音效和混音比例没有提意见，按试听版接入。
- **实现**：
  - 新增 `tools/audio/`：`compose.py`、`sfx.py`、`build_assets.py` 和 README（含 Python 3.9 补丁、音色库下载地址和 sha256）。
  - 新增 `src/audio/assets/`：36 个 m4a 加 `manifest.json`，共 3.7 MB。
  - 重写 `engine.ts`：预加载资源；平静和激战带滞后的交叉淡变；胜利段；变体轮换；距离越远越闷；大爆炸时配乐避让。
  - **默认开启**：页面加载时就 `boot()`，浏览器允许就直接出声，否则点击画面任意位置后出声。
  - 删除 `music.ts`，把程序合成乐器精简为只保留点击音。
  - 新增 `CREDITS.md`。
- **验证**：
  - 52/52 测试通过。
  - `verify:audio` 全部 PASS：自动播放、点击解锁、激战和胜利切换、M 键都正常，爆炸比配乐高 16.2 dB，没有爆音。
  - 循环接缝偏移为 0。
  - `verify:screens` 全部 60 FPS，没有非预期错误。
- **没有做**：没有发布，没有推送。

---

## 2026-10-01 · 会话 8：生产只读验收 + 背景音乐和战斗音效（未发布）

- **只读验收**（Codex 已发布 `20261001-1225-6ea3766`）：
  - 公网：301 跳转 HTTPS，证书校验通过，HTTP/2，静态资源 gzip 加 immutable 缓存。
  - 服务器：文件和发布包一致；Nginx 与基线相比只多了我们的配置文件；其他站点、默认证书、监听端口、容器都和基线一致。
  - 无头 Chrome：60 FPS。
  - 发现网站文件属主是 uid 501：`package.sh` 改为用 root 属主打包，`push.sh` 解压时加 `--no-same-owner`，`install.sh` 安装后 `chown root:root`，演练脚本也加了断言。**线上这一版没有改动**，下次发布时会纠正。
- **音频**：新增 `src/audio/`，用 Web Audio 程序化合成：
  - 随行情加码的配乐（D 小调、92 BPM，6 个声部）
  - 音效：步枪、坦克炮、爆炸、爆仓炮弹呼啸、信号弹、开战号角、胜利号曲，都按画面位置做立体声，并有限流
  - HUD：喇叭按钮、M 键、「点击开启声音」提示条，中英文文案
  - 新增 `tests/audio.test.ts`（10 个）和 `pnpm verify:audio`（离线渲染试听 WAV 并检查响度）
- **调过的地方**：频谱图显示平静段低频偏重，于是把低音长音调低约 30%，总线加了 28Hz 高通；右上角面板加宽，放下第 5 个按钮。
- **验证**：50/50 测试通过、构建通过；`verify:audio` 全部 PASS；`verify:screens` 无非预期错误，多数场景 60 FPS。
- **没有做**：没有发布音频版本，没有推送 GitHub，没有改动生产服务器。

---

## 2026-10-01 · 会话 7：公开演示版上线（`271d99b`）

- 用户明确要求通过 SSH 发布 **Bitcoin Battle** 到 `battle.ondream.ai`，并确认先按现有纯前端架构上线公开演示版。
- 本机通过 SSH 连接生产服务器；生产预检显示 Nginx 配置正常、目标站点配置/文件/证书均不存在。
- `pnpm build`、`pnpm test`（40/40）、`pnpm verify:feeds 60`（6/6）通过；`pnpm verify:screens` 的 11 张截图已人工检查，0 个非预期运行时错误；当前部署脚本的 Docker 演练显示 `REHEARSAL PASSED`。
- 用户在 DNS 服务商添加 `battle` 的 A 记录后，Cloudflare、Google DNS 和服务器解析结果一致。由干净提交 `271d99b` 构建不可变发布包 `20261001-1225-6ea3766`，本机与服务器 SHA-256 校验通过。
- 首次改动前记录 `/etc/nginx` 基线及其他站点/监听/容器快照；基线与发布包复制到本机和外置盘，11 个文件逐一核对 SHA-256，Nginx 归档完整读取通过。HTTP 部署及独立 Let's Encrypt 证书申请成功；`https://battle.ondream.ai/` 返回 200，证书有效至 2026-12-30，HTTP 返回 301。公网首页 SHA 与本地 `dist/index.html` 一致。
- 公网桌面 Chrome：3D 正常，4 家现货交易所进入指数，约 60 FPS，英语切中文成功，只有预期内 Binance 451。生产其他主机名的 HTTP/HTTPS 返回码和无 SNI 默认证书均与发布前相同；Nginx 监听及容器状态与基线一致，`certbot-renew.timer` 活跃。
- **限制**：390px Chrome 移动视口的顶部控件和部分文字重叠，未做 iPhone Safari/Android 真机验收；本版建议桌面浏览器使用。浏览器直连行情受访客网络影响，Binance 在当前网络下返回 451；服务端聚合及数据条款审查留待正式版。没有修改同机其他项目的代码、配置或数据，也没有推送 GitHub（本地 `main` 暂领先 `origin/main`）。

## 2026-10-01 · 会话 6：发布准备（未发布）

- **需求**：发布到 battle.ondream.ai，SSH 信息在同机其他项目的资料里，DNS 由用户自己操作。会话中途用户明确要求：**先不要更改任何生产配置和文件，也不要发布**。
- **调查结论**：
  - 生产服务器上还跑着其他项目的多个站点（服务器细节只在本地 `private/docs/handoff/`）。
  - `battle` 子域名不存在，没有 CAA 记录。
  - SSH 握手前被关闭的原因：本机网络对 22 端口的出口有限制。
- **做了**（全部在本机）：
  - 按用户要求调整了本机网络设置（有备份）；用户重新应用设置后，只读测试 `ssh <生产主机> 'date; hostname'` 成功（2026-10-01 11:59 UTC）。
  - 新增 `deploy/`：`package.sh`、`push.sh`、`server/install.sh`（preflight、deploy、cert、rollback、uninstall、status；改动前后核对其他站点，有变化自动撤回）、两份 Nginx 模板、`test/rehearse.sh`。
  - 本机 Docker 演练抓到并修复了两个问题：① 写成一行的 `server {}` 解析不出来，导致「其他站点保护」形同虚设；② 坏配置的发布包会残留 `current` 指针。另外确认了「我们的站点成为 443 隐式默认站点」这种情况能被检测并自动撤回。最终 REHEARSAL PASSED。
  - 回答了用户「要不要用容器」的问题：现阶段是静态网站，不需要；以后的后端服务必须用容器。理由见 `docs/handoff/deploy.md`。
- **没有做**：没有修改服务器上任何文件，没有执行 preflight，没有发布，没有动 DNS，也没有推送到 GitHub。

---

## 2026-10-01 · 会话 5：交接文档

- **需求**：「在本地目录中创建详细的项目开发说明以及各类相关资料的子目录，方便未来其他编程 agent 接手工作」。
- **做了**：
  - 新增 `AGENTS.md`（统一入口）和 `CLAUDE.md`（引用 AGENTS.md）。
  - 新增 `docs/` 下的各个子目录：architecture、data-sources、game-design、rendering、ui、verification、decisions（8 条 ADR）、roadmap、handoff、research。
  - `FEASIBILITY.md` 移到 `docs/research/feasibility.md`。原版视频的 10 张参考帧收进 `docs/research/newhedge-frames/`（2026-10-02 起只保存在本地 `private/research/newhedge-frames/`）。
  - 新增 `scripts/capture-fixtures.mjs` 和 `pnpm capture:fixtures`，输出到 `tests/fixtures/_capture/`（已加入 gitignore）。之前用的抓取脚本放在临时目录，这次正式纳入仓库。
  - 新增 `tests/fixtures/README.md` 和 `verification/README.md`。
- **验证**：`pnpm build`、`pnpm test` 通过；抓取脚本试跑 12 秒，各交易所都有样本，Binance 失败（预期），脚本能正常退出；文档里的相对链接都检查过。

## 2026-10-01 · 会话 4：推送到 GitHub

- 用 `gh repo create Bitcoin-Battle --private --source . --push` 创建了 <https://github.com/maiqiu-cat/Bitcoin-Battle>（私有）。GitHub 仓库名不能带空格，所以用了连字符。
- 推送前检查过：53 个文件，没有密钥，最大的文件约 350KB。
- 远端 `main` = 本地 `824939b`。

## 2026-10-01 · 会话 3：中英文切换 + 动画升级（`a93a39b`、`824939b`）

- **需求**：「效果很好，提供中英文界面切换，整体动画效果可以再精美一些」。
- **多语言**：
  - 新增 `src/ui/i18n.ts`。`narrate()` 改为返回 `StatusKey`，`FeedItem` 加上 `type`。
  - HUD、横幅、3D 标签全部接入 `t()`。
  - 切换方式：按钮、L 键、`?lang=`，选择记在 localStorage。
  - 新增 `tests/i18n.test.ts`。
- **画面**：
  - 后期管线 `post.ts`：Bloom、移轴、暗角、调色、MSAA。
  - 士兵摆腿、开枪后坐，坦克炮管后坐（`aPart` / `aAnim` 着色器方案）。
  - 前线对射加曳光弹；爆炸加碎块、焦痕、震屏。
  - 环境：硝烟、云影、树木风摆、战线流光和价格变动闪光。
  - 攻陷时的夺旗动画。
  - HUD：补间、播报防抖、新横幅、依次入场。
- **调参过程**：第一版夜晚的战线过曝，硝烟太浓，价格的发光盖住了涨跌文字。之后降低了发光，硝烟减半，加了播报防抖和涨跌底衬。
- **字体**：Inter 改为本地打包（`@fontsource-variable/inter`），移除 Google Fonts，因为截图验证时出现过一次 `ERR_CONNECTION_CLOSED`。
- **验证**：40/40 测试通过；`verify:screens` 0 个非预期错误；M4 上多数场景 60 FPS，回合切换约 49；点击语言按钮后从英文切到中文，验证通过。

## 2026-10-01 · 会话 2：运行

- `vite --port 5173 --host 127.0.0.1` 在后台运行，用 `open` 打开了浏览器。
- 用无头 Chrome 检查开发服务器：60 FPS，5 家交易所进入指数，约 1,375 名士兵，没有报错。

## 2026-10-01 · 会话 1：可行性评估 + 原型（`a16248f`）

- **需求**：评估 Newhedge「Bitcoin Battlefield」（推文 2104903265959760161）好不好实现，验证代码放在 `~/Documents/Bitcoin Battle`。
- **做了**：
  - 用 fxtwitter API 拿到推文和视频，ffmpeg 每 2 秒抽一帧，逐帧拆解。Newhedge 的页面被 Cloudflare 拦截，看不到源码。
  - 探测各交易所的连通性：Binance 451，Bybit REST 403 但 WS 正常，其余都正常。
  - 写好数据层、逻辑层、渲染层、HUD；用真实消息作为夹具写单测；写了 `verify:feeds` 和 `verify:screens`。
  - 修过的问题：
    - 底座顶面从地形低洼处穿出来，形成黑斑，改成裙边结构。
    - 夜晚过暗。
    - 树过大。
    - 标签重叠。
    - 大单门槛从 $50K 降到 $25K。
    - Bitstamp 权重为 0，改成 10 分钟滚动成交额估算。
    - 回合结束后战线越出棋盘，加了限制。
- **验证**：
  - 36/36 测试通过。
  - `verify:feeds 90` 6/6 PASS：5 家进入指数，偏差 ±1bp，±1% 深度买 $52.9M、卖 $34.1M，11 个大单事件。
  - 截图 60 FPS，回合流转正常。
- **结论**：好实现。难点在美术打磨和生产级的服务端聚合，详见 `docs/research/feasibility.md`。

---

## 当前状态快照（交接时先看这里）

- 分支 `main`，工作区干净，和 `origin/main` 同步（以 `git status -sb` 为准）。
- 开发服务器可能还在后台运行，端口 5173：`lsof -nP -iTCP:5173 -sTCP:LISTEN`。
- 下一步候选见 [backlog](../roadmap/backlog.md)。**Q1–Q4 需要用户决定**，P1 的验证缺口可以直接做。
