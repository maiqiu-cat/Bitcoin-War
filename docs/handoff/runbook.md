# 运行手册

## 环境

| 项 | 版本 / 位置 | 备注 |
| --- | --- | --- |
| macOS | Darwin 27（Apple M4） | 没有 `timeout` 命令，用 `perl -e 'alarm N; exec @ARGV' cmd` 代替 |
| Node | 22.x | 原生支持全局 `WebSocket`，`verify:feeds` 依赖它 |
| pnpm | 11.x | `pnpm-workspace.yaml` 里必须保留 `allowBuilds: { esbuild: true }` |
| Chrome | `/Applications/Google Chrome.app` | `verify:screens` 用它，可以通过 `CHROME=` 覆盖 |
| ffmpeg | `/opt/homebrew/bin/ffmpeg` | 只用来分析参考视频 |
| gh | 已登录 `maiqiu-cat`，有 `repo` 权限 | — |
| 网络 | — | Binance 在本机网络返回 451，见 AGENTS.md 第 7 节 |

## 从零开始

```bash
git clone https://github.com/maiqiu-cat/Bitcoin-Battle.git "Bitcoin Battle"
cd "Bitcoin Battle"
pnpm install          # 如果提示 Ignored build scripts: esbuild，检查 pnpm-workspace.yaml，然后 pnpm rebuild esbuild
pnpm test && pnpm build
pnpm dev              # http://localhost:5173
```

## 运行方式

| 场景 | 命令或 URL |
| --- | --- |
| 开发（热更新） | `pnpm dev`，然后打开 `http://localhost:5173/` |
| 指定主机和端口，后台运行 | `./node_modules/.bin/vite --port 5173 --strictPort --host 127.0.0.1` |
| 生产预览 | `pnpm build && pnpm preview`（端口 4173） |
| 离线演示 | `/?sim`，或 `/?sim&range=0.06`（几十秒就分出胜负） |
| 低配设备 | `/?q=low`（关闭阴影和后期，像素比 1） |
| 只用部分交易所 | `/?sources=coinbase,kraken,okx` |
| 指定语言或光照 | `/?lang=en&light=night` |

关闭后台运行的开发服务器：`lsof -nP -iTCP:5173 -sTCP:LISTEN`，找到 PID 后 `kill <PID>`。

## Git 和 GitHub

- 远端：`origin = https://github.com/maiqiu-cat/Bitcoin-Battle.git`（**公开**），只有 `main` 分支。2026-10-02 删库重建、历史已重写，更早的 clone 和 `private/backup/` 里的 bundle 都是旧历史，不要从它们 pull 或 push。
- 提交信息用英文祈使句做标题，正文可以写中文要点，末尾带 agent 的 `Co-Authored-By`。
- **不要提交**：`node_modules`、`dist`、`verification/*.png`、`tests/fixtures/_capture/`（都已加入 `.gitignore`）。
- 新 clone 先执行 `git config core.hooksPath scripts/git-hooks`，并把 `user.email` 设成 GitHub noreply 地址。
- 推送前 `pnpm check:public`；不要 force push。是否推送，按会话里用户的授权决定（见 AGENTS.md 第 8 节和 [release-and-publish.md](release-and-publish.md)）。

## 排障

| 现象 | 处理 |
| --- | --- |
| `tsx` 没有输出、一直卡住 | esbuild 没装好：确认 `pnpm-workspace.yaml` 里是 `allowBuilds: { esbuild: true }`，然后 `pnpm rebuild esbuild` |
| 页面一片黑、没有战场 | 看控制台：WebGL 是否可用？交易所是否全连不上？先用 `?sim` 排除网络问题 |
| 指数不动 | `__bb.hub.venues` 里看各家的 `lastTradeAt`。超过 120s 没有成交的交易所会被剔除 |
| 某家交易所一直显示 offline | 跑 `pnpm verify:feeds 30`，看 `sockets` 列和 disconnects 日志。451 或 403 多半是地区封锁 |
| 战线位置和士兵对不上 | 检查 `frontWave` 和 `FRONT_WAVE_GLSL` 是否一致 |
| 改了 HUD 文案，切换语言后没变 | 用 `data-i18n` 标记，或者在 `applyLang()` 里重新渲染 |
| 新加的东西泛光过强或不发光 | 按 AGENTS.md 第 5 条：调 HDR 颜色，不要改阈值；三套光照都要截图看 |
| 无头截图里 FPS 低 | 先关掉其他占用 GPU 的浏览器标签页再测 |
| `verify:screens` 报 preview 服务器没起来 | 4173 端口被占用了：`lsof -nP -iTCP:4173` |
