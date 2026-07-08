# ShyVPN 本机 Cloudflare 优选测速面板

这个小服务在你的 Windows 设备上跑，使用你的大陆网络出口对 Cloudflare 候选 IP 做实际测速，并提供类似 `v2rayssr` 的 Web 表格。

## 原理

- 候选来源：`v2rayssr.com/cfip`、`gslege/CloudflareIP` 的 `country.txt`、`JP.txt`、`SG.txt`。
- 实际地区：通过 `SNI/Host = vpn.example.com` 访问候选 IP 的 `/cdn-cgi/trace`，读取 `colo=HKG/NRT/...`。
- 排序：优先 `preferredColos`，再结合延迟和下载速度评分。
- 定时：默认每 `30` 分钟跑一次。

## 启动

```bat
cd /d F:\WorkSpace\Myproject\Workbuddy\Github项目分析部署\shycfvpn\local-cfst-dashboard
start.bat
```

打开：

```text
http://127.0.0.1:8789
```

如果要映射到局域网或公网，服务默认监听 `0.0.0.0:8789`。

开机自启：

```bat
install-startup-task.bat
```

## API

- `GET /api/result`：完整 JSON。
- `GET /api/csv`：CSV 表格。
- `GET /api/plain`：`IP:443#名称` 列表，可接入 Worker。
- `POST /api/scan`：立即触发一次测速。

## 配置

编辑 `config.json`：

- `intervalMinutes`：定时间隔，默认 `30`。
- `concurrency`：并发 trace 数，默认 `40`。
- `maxCandidates`：候选数量，默认 `220`。
- `maxDownloadTests`：下载测速数量，默认 `48`。
- `preferredColos`：优先地区，默认 `HKG/NRT/KIX/ICN/SIN/TPE/LAX/SJC/SEA`。

不要把并发调得过高；过高会让本机出口和 Cloudflare 限流，排序反而失真。
