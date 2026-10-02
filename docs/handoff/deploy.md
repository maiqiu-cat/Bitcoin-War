# 发布到 battle.ondream.ai

> **状态（2026-10-02）：作者 X 链接已发布。** `https://battle.ondream.ai/`，当前版本 `20261002-1153-c999c6c`，源码 `c999c6c`；上一版 `20261002-0800-918ee68` 保留，可通过 `rollback` 切回。这仍是浏览器直连交易所的原型；正式产品仍需服务端聚合和数据条款审查。生产验收及限制见 [session-log.md](session-log.md)。

## 服务器资料只在本机（`private/`，不入库）

| 文件 | 内容 |
| --- | --- |
| `private/deploy/site.env` | `DEPLOY_HOST`（SSH 别名）、`DEPLOY_ROOT`、`EXPECT_IP`。`push.sh` 和 `package.sh` 读取，模板是 [`deploy/examples/site.env`](../../deploy/examples/site.env) |
| `private/deploy/https-listen.conf` | HTTPS 模板里的 `listen` 行（服务器自己的地址）。`render-nginx.sh` 打包时填进模板，模板是 [`deploy/examples/https-listen.conf`](../../deploy/examples/https-listen.conf) |
| `private/docs/handoff/deploy.md` | 本文件在 2026-10-02 清理之前的完整版：目标环境、SSH 方式、首次发布前置条件、SSH 不通时的备选 |
| `private/docs/handoff/deploy-plan-2026-10-01.md` | 首次发布前的只读审计、影响分析、分阶段计划 |
| `private/docs/handoff/release-*.md` | Codex 发布手册（音频版、手机版）。新发布照着最近一份写，也放在这里 |
| `private/backup/` | 清理前的完整仓库备份（`git bundle`）和新旧提交哈希对照表 |

服务器 IP、主机名或 SSH 别名、SSH 用户和密钥、内网/VPN 地址、同机其他站点和容器、系统与软件版本、云服务商和 DNS 服务商、本机网络配置，都只写进 `private/`。入库的脚本和文档用 [RFC 5737](https://www.rfc-editor.org/rfc/rfc5737) 文档专用地址（`192.0.2.0/24`、`198.51.100.0/24`、`203.0.113.0/24`）举例。

## 为什么不用容器（用户问过）

用户的顾虑是「不要影响服务器上的其他站点」。分析：

- Bitcoin Battle 是**纯静态网站**，服务器上没有常驻进程。容器隔离的是进程，对静态文件几乎没有额外的隔离作用。
- 80/443 端口在宿主机的 Nginx 手里。不管用不用容器，都要在宿主机 Nginx 里加一个 `battle.ondream.ai` 站点并申请证书。**真正可能影响其他站点的，就是这个共用入口**。用容器还会多出镜像、端口和常驻进程这些环节。
- 所以保护其他站点要靠下面「安全设计」里的那套机制，2026-10-01 已在本机 Docker 里演练通过。
- **以后加服务端聚合服务**（backlog P0）时，那个后端**必须**放进独立容器：只监听 `127.0.0.1` 的某个端口，限制内存和 CPU，非 root，只读根文件系统。

如果用户仍然希望统一用容器管理，可以改成 `nginx:alpine` 容器，监听 `127.0.0.1:<端口>`，由宿主机 Nginx 反向代理过去。宿主机这一侧的配置和证书步骤不变。

## 安全设计（`deploy/server/install.sh`）

- **只碰这几处**：
  - `/var/www/battle.ondream.ai/`（`releases/<id>`、`current` 软链接、`.state/` 备份）
  - `/var/www/battle-acme/`
  - `/etc/nginx/conf.d/zz-battle.ondream.ai.conf`
  - certbot 的 `battle.ondream.ai` 证书
  - `DEPLOY_ROOT`（默认 `/root/battle-deploy/`：发布包和首次发布前的 Nginx 基线）
- **配置文件名用 `zz-` 前缀**，保证它最后加载，不会成为 80/443 的隐式默认站点。
- **HTTPS 只监听服务器上其他站点已经在用的显式套接字**（写在 `private/deploy/https-listen.conf`，打包时由 `deploy/render-nginx.sh` 填进模板），因为服务器上另有进程占着某个地址的 443。裸的 `listen 443` 会在任何改动之前被拒绝。
- **改动前记录基线**（`DEPLOY_ROOT/baseline/`）：`/etc/nginx` 打包、`nginx -T` 指纹、每个文件的哈希、站点返回码、默认证书、监听端口、容器列表。
- **重载后确认新配置真的生效**（探测文件，以及 HTTPS 出示的证书主题），防止重载失败后 Nginx 默默沿用旧配置。
- **每次改 Nginx 配置的流程**：
  1. 用 `nginx -T` 解析出所有其他站点。
  2. 通过本机回环地址记下它们在 HTTP 和 HTTPS 上的返回码（「改前快照」）。
  3. 备份旧配置，装上新配置，运行 `nginx -t`。
  4. 重载 Nginx，再记一次「改后快照」。
  5. **只要 `nginx -t` 失败，或者任何其他站点的返回码有变化，就自动恢复旧配置、重新加载，然后退出。**
- **部署顺序**：先放好新版本的文件，再更新 Nginx 配置（经过上面的验证），然后切换 `current`，最后校验首页 SHA 和静态资源的缓存头。校验失败就自动切回上一版。
- **内容更新不重载 Nginx**：若 Battle 站点配置与渲染后的 HTTPS 模板逐字节相同且探测证明配置正在生效，脚本只切换 `current`，不重载共用 Nginx；2026-10-02 的音频版和手机版发布都走了这条路径。渲染结果必须与线上配置逐字节一致（SHA-256 `9f5a4f3f…`，2026-10-02 核对），否则下次发布会重载共用 Nginx。
- **只读审计**：`deploy/push.sh <发布包> audit` 比对首次发布前的 Nginx 文件、其他站点 HTTP/HTTPS 返回码、默认证书、监听端口及容器状态；音频版发布前后均为 `AUDIT OK`，差异仅是 Battle 的版本指针和版本列表。
- **不覆盖已有版本**：同一个版本号不能重复部署。
- **申请证书前的检查**：先确认服务器上解析 `battle.ondream.ai` 得到的就是 `EXPECT_IP`（`package.sh` 从 `private/deploy/site.env` 写进发布包的 `site.env`），再通过 Nginx 自测 ACME 验证路径能访问，最后才调用 certbot。
- **证书续期**：复用服务器上已有的 certbot 续期定时器，以及全局 deploy hook（续期后重载 Nginx），不新增定时任务。

### 本机演练（Docker，Ubuntu 24.04 + nginx）

`deploy/test/rehearse.sh` 用 `deploy/examples/https-listen.conf` 里的文档专用地址渲染模板，不依赖 `private/`。依次覆盖：

1. 预检能识别其他站点（包括写成一行的 `server {}`）
2. 部署
3. 拒绝重复部署同一版本
4. 部署第二个版本，再回滚
5. **坏配置**：自动恢复旧配置，线上版本不变，坏版本不会被访问到
6. **我们会变成 443 隐式默认站点的情况**：自动撤回，网站继续用 HTTP 访问
7. 其他站点也有 443 时，切换到 HTTPS 成功
8. `purge` 后 Nginx 配置指纹与发布前一致，其他站点及默认证书不变

每一步都会检查其他站点是否正常。2026-10-01 结果：**REHEARSAL PASSED**。

## 发布步骤（获得授权后执行）

已有 HTTPS 证书的后续内容发布，按最近一份 Codex 发布手册（`private/docs/handoff/release-*.md`）核对干净提交、发布包、Docker 演练及生产前审计，再运行 `deploy/push.sh <发布包> deploy`，最后复查 `audit`、公网首页哈希、音频资源和浏览器行为。配置不变时不需要运行 `cert`。

以下命令保留首次发布时的流程（需要先准备好 `private/deploy/`）：

```bash
cd ~/Documents/Bitcoin\ Battle
deploy/package.sh                                   # 构建 + 生成发布包（工作区必须干净）
deploy/test/rehearse.sh                             # 本机演练（可选，但推荐）
deploy/push.sh deploy/out/battle-<id>.tar.gz preflight   # 上传并做只读预检，把结果给用户看
deploy/push.sh deploy/out/battle-<id>.tar.gz deploy      # 部署（HTTP）
# 用户在 DNS 服务商加了 A 记录、DNS 生效之后：
deploy/push.sh deploy/out/battle-<id>.tar.gz cert        # 申请证书并切到 HTTPS
deploy/push.sh deploy/out/battle-<id>.tar.gz status
```

核对 DNS 是否生效（本机解析结果可能不准确，用 DoH）：

```bash
curl -s "https://1.1.1.1/dns-query?name=battle.ondream.ai&type=A" -H 'accept: application/dns-json'
```

SSH 不通时的备选办法见 `private/docs/handoff/deploy.md`。

## 回滚与下线

| 目的 | 命令（在服务器上，在任意一个已解压的发布包目录里执行） |
| --- | --- |
| 回到上一版（第二次及以后发布） | `bash $DEPLOY_ROOT/battle-20261002-1153-c999c6c/install.sh rollback`；当前可切回 `20261002-0800-918ee68`，并自动校验首页与静态资源 |
| 完全回退到基线（带验证） | `bash battle-<id>/install.sh purge`：删除配置、验证 `nginx -T` 指纹与基线一致、比对每个站点、删除文件和证书（`KEEP_CERT=1` 时保留证书） |
| 应急（脚本不可用时） | `rm /etc/nginx/conf.d/zz-battle.ondream.ai.conf && nginx -t && systemctl reload nginx` |
| DNS | 在 DNS 服务商删除 `battle` 这条 A 记录 |
