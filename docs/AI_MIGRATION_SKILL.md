# AI Migration Skill for ShyVPN EdgeTunnel

Use this file as the first document for an AI assistant or maintainer when deploying, migrating, maintaining, or troubleshooting this project.

## Project Goal

ShyVPN EdgeTunnel is a Cloudflare Worker based EdgeTunnel deployment that provides:

- VLESS over WebSocket proxy capability.
- Inherited multi-client subscription capability from upstream EdgeTunnel.
- Enhanced `/clash` subscription output for Clash/Mihomo/Sparkle compatible clients.
- A clear top-level node selector named `节点选择`.
- A client-side `url-test` group named `自动优选`.
- A fallback group named `故障切换`.
- Region groups such as `香港节点`, `日本节点`, `新加坡节点`, `美国节点`, `德国节点`, and `荷兰节点`.
- Optional Cloudflare IP candidate data from `CFIP_DATA_URL`.
- Optional local dashboard at `local-cfst-dashboard/`.
- Public-release-safe documentation, examples, and workflows.

Mainland China optimization is a first-class goal. Cloudflare anycast出口和候选 IP 数据可能不会稳定落到香港节点，因此订阅生成逻辑应保留固定香港分组，避免香港组因为测速数据缺失而为空。`自动优选` 可以继续由客户端 `url-test` 决策，但用户也应该能手动选择 `香港节点` 作为明确、低延迟、可预期的地区入口。

## Important Files

```text
worker.js                         # Cloudflare Worker entry, proxy, subscription, and admin logic
wrangler.example.toml              # public Cloudflare Workers config template
README.md                          # public GitHub README
docs/AI_MIGRATION_SKILL.md         # AI/maintainer migration and maintenance guide
local-cfst-dashboard/server.mjs    # optional local Cloudflare IP dashboard
tests/worker-config.test.mjs       # regression tests
scripts/update-cfip-data.mjs       # candidate IP data update helper
data/cfip.json                     # candidate Cloudflare IP data or sanitized sample data
```

## Repository Layout

The public repository root is the release layout. Do not document or require a separate `github-release/` staging directory in the public README.

```text
.
├─ README.md                    # public entry, features, deployment, subscriptions, clients
├─ LICENSE                      # upstream-compatible license and attribution obligations
├─ CHANGELOG                    # project or upstream change history
├─ package.json                 # Node/Wrangler scripts and dependencies
├─ wrangler.example.toml        # public Cloudflare Workers config template
├─ worker.js                    # Worker entry, proxy, subscription, admin panel logic
├─ assets/images/               # README diagrams and visual assets
├─ data/cfip.json               # candidate Cloudflare IP data or sanitized sample data
├─ docs/AI_MIGRATION_SKILL.md   # this guide
├─ local-cfst-dashboard/        # optional local CF IP dashboard source
├─ scripts/                     # helper scripts
├─ tests/                       # regression tests
└─ .github/workflows/           # reviewed GitHub Actions only
```

## Deployment Variables

Required or commonly used:

```text
UUID
ADMIN or KEY
HOST
KV
SUB
CFIP_DATA_URL
CFST_PANEL_URL
DISABLE_LOGIN
DEBUG
SUBSCRIBE_ORIGIN
```

Do not publish real tokens, passwords, account IDs, private deployment configs, or personal UUID values if they are used as access credentials.

## Subscription Rules

When changing Worker subscription generation, keep these expectations:

- `/clash` returns valid YAML.
- YAML contains `proxies`, `proxy-groups`, and `rules`.
- The first user-facing selector is `节点选择`.
- `自动优选` is a `url-test` group.
- `故障切换` is a `fallback` group.
- Rules should ultimately point to `节点选择` for unmatched traffic.
- `香港节点` should remain stable and should include fixed Hong Kong candidates when dynamic data is missing or ambiguous.
- Region groups should not explode into many city-level groups.
- Duplicate proxy names should be avoided.

## Local Dashboard

The dashboard should remain optional. A user should be able to deploy the Worker and import `/clash` without running the dashboard, then improve results later by adding `CFIP_DATA_URL`.

Default local endpoints:

```text
http://127.0.0.1:8789/
http://127.0.0.1:8789/api/result
```

If Worker needs to read the result, expose `/api/result` publicly and set `CFIP_DATA_URL`.

## Maintenance Checklist

Before publishing or after larger changes:

- Keep `worker.js` as the single Worker entry and make sure `wrangler.example.toml`, workflows, and tests all refer to it.
- Keep `wrangler.example.toml` placeholder-only; never commit real `wrangler.toml`.
- Run a secret scan before pushing public changes.
- Keep generated YAML, logs, zip files, release runtime binaries, and private document bundles out of the repo.
- Verify that README images use paths that exist in `assets/images/` with exact case.
- Keep the local dashboard optional and source-only.
- Preserve upstream license and attribution notices.
- Prefer user-facing docs over private development retrospectives or temporary experiment names.

Suggested secret scan:

```bash
rg -n "cfk_|cfut_|Bearer|CLOUDFLARE_API_KEY|CLOUDFLARE_API_TOKEN|github_pat|ghp_|Global API Key|api_token|account_id|ADMIN|UUID" .
```

## Verification

Use these checks after edits:

```bash
node --check worker.js
npm test
```

If deployed, inspect:

```bash
curl -L -o clash.yaml https://vpn.example.com/clash
```

## Public Release Rules

Keep in public repositories:

```text
README.md
LICENSE
CHANGELOG
worker.js
wrangler.example.toml
package.json
docs/AI_MIGRATION_SKILL.md
assets/images/
data/cfip.json if sanitized
tests/
scripts/
local-cfst-dashboard/ source files
.github/workflows/ reviewed workflows only
```

Do not publish:

```text
wrangler.toml
.wrangler/
.wrangler.*.toml
*.log
clash-*.yaml
remote-result.json
admin-config.json
deploy-with-token.bat
release runtime binaries
private document bundles
github-release/ staging directories
```

## Versioning Notes

Use simple public tags when release quality is stable:

```text
v0.1.0  first public source release
v0.2.0  dashboard improvements
v0.3.0  subscription generation changes
```

For each release, note Worker changes, subscription compatibility changes, dashboard changes, and migration notes if config variables changed.

## Known Technical Debt

- `worker.js` is large and may eventually need to be split if the deployment toolchain allows it.
- Candidate IP data is operational data; the Worker must tolerate stale, empty, or unreachable `CFIP_DATA_URL`.
- Public workflows should remain aligned with the real file layout.
- Security scanning should stay part of the release process, even for personal deployments.
