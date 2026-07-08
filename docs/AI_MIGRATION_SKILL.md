# AI Migration Skill for ShyVPN EdgeTunnel

Use this file as the first document for an AI assistant when it needs to deploy, migrate, maintain, or troubleshoot this project.

## Project Goal

ShyVPN EdgeTunnel is a Cloudflare Worker based EdgeTunnel deployment that should provide:

- VLESS over WebSocket proxy capability.
- Inherited multi-client subscription capability from upstream EdgeTunnel.
- Clash/Mihomo/Sparkle compatible `/clash` subscription as an enhanced path.
- A clear top-level node selector named `节点选择`.
- A client-side `url-test` group named `自动优选`.
- Region groups such as Hong Kong, Japan, Singapore, United States, Germany, and Netherlands.
- Optional Cloudflare IP candidate data from `CFIP_DATA_URL`.
- Optional local dashboard at `local-cfst-dashboard/`.
- Public-release-safe documentation and examples.

## Important Files

```text
worker.js                         # Cloudflare Worker entry
wrangler.example.toml              # public config template
README.md                          # public GitHub README
docs/MAINTENANCE.md                # maintainer checklist
docs/REPOSITORY_STRUCTURE.md       # public repository layout
local-cfst-dashboard/server.mjs    # local Cloudflare IP dashboard
tests/worker-config.test.mjs       # regression tests
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

Do not publish real tokens, passwords, account IDs, or private deployment configs.

## Subscription Rules

When changing Worker subscription generation, keep these expectations:

- `/clash` returns valid YAML.
- YAML contains `proxies`, `proxy-groups`, and `rules`.
- The first user-facing selector is `节点选择`.
- `自动优选` is a `url-test` group.
- `故障切换` is a `fallback` group.
- Rules should ultimately point to `节点选择` for unmatched traffic.
- Region groups should not explode into many city-level groups.
- Duplicate proxy names should be avoided.

## Local Dashboard

The dashboard should remain optional.

Default local endpoints:

```text
http://127.0.0.1:8789/
http://127.0.0.1:8789/api/result
```

If Worker needs to read the result, expose `/api/result` publicly and set `CFIP_DATA_URL`.

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
worker.js
wrangler.example.toml
package.json
docs/
assets/
tests/
scripts/
local-cfst-dashboard/ source files
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
```
