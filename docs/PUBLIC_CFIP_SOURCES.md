# 公开优选结果汇总

GitHub Actions 每小时同步以下两个公开源，不对候选 IP 连接、测速或查询地理位置。另有一份已经保存的 `test.shyvpn.cc.cd` 测速快照，只作为静态候选补充，Worker 和 Actions 都不会连接天翼云电脑。

- 微测网：`https://www.wetest.vip/page/cloudflare/address_v4.html`，完整读取移动、电信、联通各行，保留线路、IP、网络带宽、峰值速度、延迟、数据中心和原更新时间。兼容 HTML 正文和 JSON 编码的 HTML 正文。
- cfhub：`https://cfhub.1molchuan.top/api/v1/pools`，完整读取全国、移动、电信、联通、教育网、国内云厂商、其他等所有分类及 IPv4/IPv6；保存原 IP 项目、投票数、人数、池信息及发布时间。
- `data/sources/test-shyvpn-result.json`：保存当前测速站已返回的 166 条结果，其中 144 条下载阶段返回 HTTP 200；这 144 条进入订阅候选，其余记录保留在 `records` 供管理页查看。

两个源同时合并，顺序为微测网在前、cfhub 在后。单个源暂时不可读或无法解析时保留它最后一次成功的原始快照，状态中标注 `cached: true` 和原抓取时间；不会用本次生成时间冒充来源更新时间。两个源及快照都不可读时更新失败，保留已有导出。

## 文件

| 文件 | 内容 |
|---|---|
| `data/cfip.json` | `records` 保存所有来源记录，包括未发布和测试未通过条目；`nodes` 是已发布地址去重后的列表，`clientNodes` 是按线路/地区展开的订阅候选 |
| `data/cfip-all.txt` | 已发布地址全集，一行一个，含 IPv4 和 IPv6 |
| `data/cfip-ipv4.txt` | IPv4 地址全集 |
| `data/cfip-ipv6.txt` | IPv6 地址全集 |
| `data/cfip-mobile.txt` | 两源移动结果 |
| `data/cfip-telecom.txt` | 两源电信结果 |
| `data/cfip-unicom.txt` | 两源联通结果 |
| `data/sources/wetest-ipv4.json` | 微测网原始响应及抓取时间 |
| `data/sources/cfhub-pools.json` | cfhub 原始响应及抓取时间，保留所有池和未知字段 |
| `data/sources/test-shyvpn-result.json` | 已保存的测速站结果快照，不含访问者 IP 等探针字段 |

按 IP 和端口去重时，将每条线路的测量结果保存在 `measurements` 中，`lines`、`isps`、`sources` 记录全部归属，不会丢弃同一个地址的电信/移动/联通差异。按运营商导出的文本只使用该运营商的备注和数值。

文本格式为 `IP:443#来源 线路 数据中心 延迟 速度`；IPv6 使用 `[IPv6]:443#备注`。cfhub 的 ECH 握手测量标注为 ECH，未提供下载速度时留空，不把延迟填进速度字段。cfhub 标记 `published: false` 的记录保留在归档，且不会被改写成“已发布”优选项。

当前微测网接口为 IPv4 页面，IPv6 来自 cfhub。Worker 优先读取 `clientNodes`，订阅中同时支持 IPv4 与 IPv6；IPv6 节点会写成 `[IPv6]:443`。管理页的 `/admin/cfip.json` 返回完整记录，页面表格会把“可用于订阅”和“只保留归档”的记录分开显示。公开源记录代表其参与线路的结果，未对用户当前线路重新测速；静态测速快照也只表示保存时的结果，不能当作当前移动线路的保证。
