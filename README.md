# ShyVPN EdgeTunnel

![Overview](/assets/images/Overview.png)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shiranzby/edgetunnel)
[![Stars](https://img.shields.io/github/stars/shiranzby/edgetunnel?style=flat-square&logo=github)](https://github.com/shiranzby/edgetunnel/stargazers)
[![Forks](https://img.shields.io/github/forks/shiranzby/edgetunnel?style=flat-square&logo=github)](https://github.com/shiranzby/edgetunnel/network/members)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Mihomo](https://img.shields.io/badge/Client-Mihomo%20%2F%20Clash-blue?style=flat-square)](https://github.com/MetaCubeX/mihomo)

基于 [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel) 的 Cloudflare Worker / EdgeTunnel 能力增强版。项目完整继承上游 VLESS、WebSocket、订阅生成、多客户端适配、管理面板等核心能力，并额外面向 Cloudflare IP 候选池、地区代理组、本地测速面板、Clash/Mihomo 使用体验和可维护部署流程做了整理。

它适合想要研究 Cloudflare Workers、EdgeTunnel、多客户端订阅生成、自建 Cloudflare IP 优选链路的个人用户和开发者。

## 项目简介

ShyVPN EdgeTunnel 做三件事：

1. 把 Cloudflare Worker 部署成 VLESS over WebSocket 代理入口。
2. 继承上游多客户端订阅能力，并重点优化 Clash/Mihomo/Sparkle 的 `/clash` 使用体验。
3. 结合 Cloudflare IP 候选数据和本机客户端测速，让用户更容易选择可用入口。

完整链路：

```text
本机或服务器测速 Cloudflare IP
  -> 输出 /api/result
  -> Worker 读取候选数据
  -> Worker 生成多格式订阅
  -> 客户端导入订阅
  -> 用户选择自动测速或指定地区
  -> VLESS over WebSocket 连接 Cloudflare Worker
```

本项目不是替代上游，而是在上游基础上补充一套更适合长期维护、公开发布和客户端导入的工程结构。

## Demo 演示站点

上游演示页面：

- EdgeTunnel Admin Demo: [https://EDT-Pages.github.io/admin](https://EDT-Pages.github.io/admin)

部署本项目后，你会得到自己的演示入口：

```text
https://vpn.example.com/admin       # Worker 管理面板
https://vpn.example.com/clash       # Clash/Mihomo/Sparkle 订阅入口
http://127.0.0.1:8789/              # 本地 Cloudflare IP 测速面板
http://127.0.0.1:8789/api/result    # 本地候选 IP API
```

如果你通过 Cloudflare Tunnel、cftunnelX、frp 等工具暴露测速面板，也可以得到公网测速入口：

```text
https://test.example.com/
https://test.example.com/api/result
```

## 核心特性

继承上游能力：

- Cloudflare Workers / Pages 生态部署能力。
- VLESS over WebSocket 核心代理能力。
- 多格式订阅生成和大量客户端适配基础。
- 管理面板、KV 配置、请求日志、Cloudflare 用量查询、订阅 token / UUID 等基础机制。
- ProxyIP、SOCKS5/HTTP 等高级转发能力。

本项目额外增强：

- `/clash` 订阅入口更清晰，面向 Clash/Mihomo/Sparkle 直接导入。
- Worker 内置 Clash YAML 生成兜底，降低外部订阅转换服务异常带来的影响。
- 新增 `节点选择` 作为第一层总入口，客户端操作逻辑更直观。
- 自动测速组使用客户端本机 `url-test`，最终选择更贴近用户当前网络。
- 地区组按国家/地区聚合，减少城市组堆叠和重复节点名。
- 固定香港候选池作为地区节点兜底，避免测速数据缺失时香港组为空。
- `local-cfst-dashboard` 提供本地 8789 测速面板和 `/api/result`。
- 配套 `wrangler.example.toml`、维护文档、发布目录和 AI Skill 文档，方便迁移与二次维护。

## 管理面板能力

上游 EdgeTunnel 的管理面板能力在本项目中继续保留，访问入口通常为：

```text
https://vpn.example.com/admin
```

当前 Worker 代码中可见的管理能力包括：

| 功能 | 路径 / 机制 | 说明 |
|---|---|---|
| 登录保护 | `/login`、`/admin` | 使用 `ADMIN` / `KEY` / `TOKEN` 等变量派生登录凭据，也支持 `DISABLE_LOGIN` 控制登录要求。 |
| 配置管理 | `/admin/config.json` | 读取和保存主配置，数据存入 Workers KV。 |
| Cloudflare 配置 | `/admin/cf.json` | 保存 Cloudflare 相关配置。 |
| Telegram 通知配置 | `/admin/tg.json` | 保存日志通知相关配置。 |
| 自定义优选 IP | `/admin/ADD.txt` | 管理自定义候选 IP 列表。 |
| 请求日志 | `/admin/log.json` | 从 KV 读取访问日志，包含类型、IP、ASN、地区、URL、UA、时间等。 |
| Cloudflare 用量查询 | `/admin/getCloudflareUsage` | 通过 Cloudflare Email、Global API Key、Account ID 或 API Token 查询请求量。 |
| 优选 API 检查 | `/admin/getADDAPI` | 验证外部优选 IP API 是否可用。 |
| 代理检查 | `/admin/check` | 检查 SOCKS5 / HTTP / HTTPS / TURN / SSTP 等链式代理可用性。 |

关于“流量统计”：当前项目可通过 Cloudflare API 查询请求量，并在订阅响应中写入 `Subscription-Userinfo` 头部，用于展示 upload/download/total 这类订阅用量信息。但这不等同于传统机场按用户精确统计真实转发字节的计费系统；如果后续要做完整流量面板，需要额外设计持久化统计、用户区分和 Workers 成本控制。

## 架构流程

![Architecture.png](/assets/images/Architecture.png)

## 快速部署系列

<details>
<summary><code><strong>方式一：Cloudflare Workers 一键部署</strong></code> - 适合快速体验</summary>
<br>

点击按钮后按 Cloudflare 页面提示完成部署：

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shiranzby/edgetunnel)

部署完成后仍需要补充：

- `UUID`
- `ADMIN` 或 `KEY`
- `HOST`
- `KV` namespace 绑定
- 自定义域名 route
- 可选的 `CFIP_DATA_URL`

</details>

<details>
<summary><code><strong>方式二：Wrangler CLI 部署</strong></code> - 适合长期维护和本地开发</summary>

<br>

使用 Wrangler 可以完整控制配置、KV 绑定和部署流程。

```bash
npm install
cp wrangler.example.toml wrangler.toml
npx wrangler kv namespace create KV
npx wrangler deploy
```

Windows PowerShell 生成 UUID：

```powershell
[guid]::NewGuid().ToString()
```

</details>

<details>
<summary><code><strong>方式三：Cloudflare Pages 上传部署</strong></code> - 适合不使用 GitHub 自动构建</summary>

<br>

上游 EdgeTunnel 支持 Pages 上传方式。本项目保留 Worker 入口能力，发布前请确认当前仓库入口文件和 Pages 构建方式一致。

通用流程：

1. 下载或打包仓库源码。
2. 进入 Cloudflare Dashboard。
3. 创建 Pages 项目并上传文件。
4. 在 Pages 项目设置中添加环境变量。
5. 绑定 KV namespace。
6. 重新部署。

</details>

<details>
<summary><code><strong>方式四：Cloudflare Pages + GitHub 部署</strong></code> - 适合公开仓库自动部署</summary>

<br>

将 GitHub 仓库连接到 Cloudflare Pages 后，可以通过推送代码触发部署。

通用流程：

1. Fork 或创建自己的 GitHub 仓库。
2. 在 Cloudflare Pages 中连接该仓库。
3. 设置环境变量。
4. 绑定 KV namespace。
5. 推送代码触发部署。

</details>

<details>
<summary><code><strong>方式五：本地测速面板部署</strong></code> - 可选，用于提供 Cloudflare IP 候选数据</summary>

<br>

测速面板不是必需项，但它能为 Worker 提供更贴近用户网络的 Cloudflare IP 候选数据。

```bash
cd local-cfst-dashboard
cp config.json.example config.json
node server.mjs
```

Windows 也可以直接运行：

```bat
local-cfst-dashboard\run.bat
```

默认地址：

```text
http://127.0.0.1:8789/
http://127.0.0.1:8789/api/result
```

</details>

## 环境变量说明

推荐从 `wrangler.example.toml` 复制配置：

```toml
name = "shyvpn-edgetunnel"
main = "worker.js"
compatibility_date = "2025-11-04"
keep_vars = false

[vars]
UUID = "<YOUR_UUID>"
ADMIN = "<YOUR_ADMIN_PASSWORD>"
HOST = "vpn.example.com"
SUB = "sub.cmliussss.workers.dev"
CFIP_DATA_URL = "https://test.example.com/api/result"
CFST_PANEL_URL = "https://test.example.com/"
DISABLE_LOGIN = "false"
DEBUG = "false"
SUBSCRIBE_ORIGIN = "https://vpn.example.com"

[[kv_namespaces]]
binding = "KV"
id = "<YOUR_KV_NAMESPACE_ID>"
```

常用变量：

| 变量名 | 必填 | 示例 | 说明 |
|---|---:|---|---|
| `UUID` | 是 | `<YOUR_UUID>` | VLESS UUID，也可固定订阅识别值。 |
| `ADMIN` | 是 | `<YOUR_ADMIN_PASSWORD>` | 管理页面密码。上游也支持 `KEY`、`TOKEN` 等兼容变量。 |
| `HOST` | 是 | `vpn.example.com` | Worker 自定义域名。 |
| `KV` | 是 | `KV` binding | Cloudflare KV namespace 绑定。 |
| `SUB` | 否 | `sub.cmliussss.workers.dev` | 外部订阅转换服务 host。 |
| `CFIP_DATA_URL` | 否 | `https://test.example.com/api/result` | Cloudflare IP 候选数据 API。 |
| `CFST_PANEL_URL` | 否 | `https://test.example.com/` | 测速面板地址。 |
| `SUBSCRIBE_ORIGIN` | 否 | `https://vpn.example.com` | 订阅入口规范 origin。 |
| `DISABLE_LOGIN` | 否 | `false` | 是否关闭管理页登录。 |
| `DEBUG` | 否 | `false` | 调试日志开关。 |
| `PROXYIP` | 否 | `proxy.example.com:443` | 上游反代/代理 IP 能力。 |
| `SOCKS5` / `GO2SOCKS5` | 否 | `user:pass@host:port` | 上游 SOCKS5/链式代理能力。 |
| `PATH` | 否 | `/your-path` | 自定义传输路径。 |
| `URL` | 否 | `https://example.com` | 伪装页或回落页面。 |

更多上游变量可参考 [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel) 的环境变量说明。本项目新增重点是 `CFIP_DATA_URL` 和 `CFST_PANEL_URL`。

## 高级使用技巧

### 1. 使用 Cloudflare IP 候选 API

将本地或服务器测速结果暴露为：

```text
https://test.example.com/api/result
```

然后设置：

```toml
CFIP_DATA_URL = "https://test.example.com/api/result"
```

Worker 会在生成订阅时读取该数据，并整理为可供客户端使用的节点；其中 Clash/Mihomo 类客户端会从 `/clash` 中获得更清晰的代理组结构。

### 2. 让客户端本机继续测速

远端测速结果只用于生成候选池，最终延迟仍由 Sparkle/Mihomo 在用户本机通过 `url-test` 判断。这比单纯依赖云服务器测速更接近真实体验。

### 3. 手动选择地区

订阅生成后，优先操作 `节点选择`：

```text
节点选择 -> 自动优选
节点选择 -> 香港节点
节点选择 -> 日本节点
节点选择 -> 新加坡节点
节点选择 -> 美国节点
节点选择 -> 故障切换
节点选择 -> DIRECT
```

如果你在地区组里选了节点但没有生效，先确认 `节点选择` 是否已经选中了该地区组。

![Client group design](/assets/images/client-groups.svg)

### 4. 固定 UUID 与订阅入口

设置 `UUID` 可以固定节点 UUID。设置 `ADMIN` 或 `KEY` 可以影响管理入口和订阅 token。公开部署时建议使用随机且不易猜测的值。

### 5. 使用 KV 保存配置

管理页面和订阅配置会用到 Workers KV。建议绑定名保持为：

```text
KV
```

### 6. 配合 AI Skill 维护项目

本仓库提供了 AI 迁移/维护 Skill 说明：[docs/AI_MIGRATION_SKILL.md](docs/AI_MIGRATION_SKILL.md)。

当你把项目交给 AI 工具继续部署、迁移、排错或生成文档时，可以让它先读取这个文件。它会告诉 AI：项目目标是什么、关键环境变量有哪些、代理组生成规则是什么、如何验证订阅、哪些文件不能公开。

## 客户端适配情况

本项目完整继承上游 EdgeTunnel 的多客户端适配思路。Clash/Mihomo/Sparkle 是本项目额外重点优化的订阅体验，但不是唯一支持方向；支持情况取决于客户端内核版本、订阅类型和转换配置。

| 平台 | 推荐客户端 |
|---|---|
| Windows | [v2rayN](https://github.com/2dust/v2rayN/releases)、[Hiddify](https://github.com/hiddify/hiddify-app/releases)、[FlClash](https://github.com/chen08209/FlClash/releases)、[mihomo-party](https://github.com/mihomo-party-org/clash-party/releases)、[Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev/releases)、[Clashmi](https://github.com/KaringX/clashmi/releases)、[FlyClash](https://github.com/GtxFury/FlyClash/releases)、[Karing](https://github.com/KaringX/karing/releases)、[Bettbox](https://github.com/appshubcc/Bettbox/releases) |
| Android | [v2rayNG](https://github.com/2dust/v2rayNG/releases)、[ClashMetaForAndroid](https://github.com/MetaCubeX/ClashMetaForAndroid/releases/)、[FlClash](https://github.com/chen08209/FlClash/releases)、[Clashmi](https://github.com/KaringX/clashmi/releases)、[Hiddify](https://github.com/hiddify/hiddify-app/releases)、[NekoBox](https://github.com/MatsuriDayo/NekoBoxForAndroid/releases)、[FlyClash](https://github.com/GtxFury/FlyClash/releases)、[Karing](https://github.com/KaringX/karing/releases)、[Bettbox](https://github.com/appshubcc/Bettbox/releases) |
| iOS | Surge、Shadowrocket、Stash、[Hiddify](https://github.com/hiddify/hiddify-app/releases)、Loon、Egern、[Clashmi](https://clashmi.app/download)、[Karing](https://karing.app/)、Quantumult X |
| macOS | [FlClash](https://github.com/chen08209/FlClash/releases)、[mihomo-party](https://github.com/mihomo-party-org/clash-party/releases)、[Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev/releases)、Surge、[Clashmi](https://clashmi.app/download)、[Karing](https://karing.app/)、[FlyClash](https://github.com/GtxFury/FlyClash/releases) |
| 鸿蒙 | [ClashBox](https://github.com/xiaobaigroup/ClashBox/releases) |

使用建议：

- Clash/Mihomo/Sparkle/FlClash/Clash Verge Rev/mihomo-party 等客户端优先使用 `/clash`。
- v2rayN、v2rayNG、NekoBox 等客户端可使用 VLESS 分享链接或上游通用订阅能力。
- Surge、Stash、Shadowrocket、Loon、Egern、Quantumult X 等客户端依赖对应订阅格式和转换配置。
- 旧版 Clash 内核可能不支持 VLESS，建议使用 Mihomo/Clash.Meta 生态内核。

如果你基于本项目创建自己的仓库，可以把上面的 `shiranzby/edgetunnel` 替换为你的仓库地址。

## 推荐仓库结构

```text
.
├─ README.md
├─ LICENSE
├─ package.json
├─ wrangler.example.toml
├─ worker.js
├─ assets/
│  └─ images/
├─ data/
├─ docs/
│  ├─ AI_MIGRATION_SKILL.md
│  ├─ MAINTENANCE.md
│  └─ REPOSITORY_STRUCTURE.md
├─ local-cfst-dashboard/
├─ scripts/
├─ tests/
└─ .github/workflows/
```

本地额外维护了 `github-release/` 目录，用作 GitHub 发布 staging 文件夹。发布时可以把该目录内容作为仓库根目录提交。

## 特别鸣谢

感谢以下项目提供基础能力、生态参考或实现思路：

- [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel)：Cloudflare Worker / EdgeTunnel 核心能力来源。
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)：Mihomo 内核与 Clash.Meta 生态。
- [tindy2013/subconverter](https://github.com/tindy2013/subconverter)：订阅转换思路参考。
- [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR)：Clash 规则组织参考。
- [gslege/CloudflareIP](https://github.com/gslege/CloudflareIP)：Cloudflare IP 候选来源参考。

## 开源代码引用

本项目基于 [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel) 修改和扩展。上游项目使用 GPL-2.0 许可证，二次分发时应保留上游许可证、署名和相应开源义务。

主要引用与扩展关系：

| 来源 | 用途 |
|---|---|
| `cmliu/edgetunnel` | Worker 核心代理、订阅和管理页面基础。 |
| `MetaCubeX/mihomo` | Clash/Mihomo 客户端兼容目标。 |
| `subconverter` | 订阅转换概念参考。 |
| `ACL4SSR` | Clash 规则配置参考。 |
| `CloudflareIP` 相关数据源 | Cloudflare IP 候选来源参考。 |
