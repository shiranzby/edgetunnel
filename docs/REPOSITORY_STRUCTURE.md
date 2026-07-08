# Repository Structure

This is the recommended public layout for ShyVPN EdgeTunnel.

## Public Layout

```text
.
├─ README.md
├─ LICENSE
├─ package.json
├─ wrangler.example.toml
├─ worker.js
├─ data/
│  └─ cfip.json                  # optional sanitized sample or generated candidate data
├─ docs/
│  ├─ MAINTENANCE.md
│  └─ REPOSITORY_STRUCTURE.md
├─ local-cfst-dashboard/
│  ├─ README.md
│  ├─ package.json
│  ├─ server.mjs
│  ├─ config.json.example        # recommended for public repos
│  ├─ run.bat
│  ├─ start.bat
│  └─ scan-once.bat
├─ scripts/
│  └─ update-cfip-data.mjs
├─ tests/
│  └─ worker-config.test.mjs
└─ .github/
   └─ workflows/
      ├─ update-cfip.yml
      └─ package-worker.yml
```

## File Roles

| Path | Purpose | Public? |
|---|---|---:|
| `worker.js` | Cloudflare Worker source and subscription generation logic. | Yes |
| `wrangler.example.toml` | Safe deployment template with placeholders. | Yes |
| `wrangler.toml` | Real local deployment config. | No |
| `tests/worker-config.test.mjs` | Regression tests for Worker behavior. | Yes |
| `scripts/update-cfip-data.mjs` | Optional candidate IP update script. | Yes, if sanitized |
| `data/cfip.json` | Candidate IP data or sample data. | Optional |
| `local-cfst-dashboard/` | Local dashboard for candidate IP results. | Yes, source only |
| `.github/workflows/` | Automation for tests, packaging, or data updates. | Yes, after review |
| `docs/` | Public documentation. | Yes |

## Do Not Publish

The following files are useful locally but should not be committed to a public repository:

```text
.wrangler/
.wrangler.*.toml
wrangler.toml
*.log
clash-*.yaml
remote-result.json
admin-config.json
mixed-live.txt
deploy-with-token.bat
*.zip
release/*/runtime/node.exe
SHYVPN_FULL_DOCS_*/
SHYVPN_LITE_DOCS_*/
```

## Suggested GitHub Repository Setup

Use a concise repository description:

```text
Cloudflare Worker VLESS/WebSocket proxy with Clash/Mihomo subscription generation and Cloudflare IP candidate management.
```

Suggested topics:

```text
cloudflare-workers
vless
websocket
clash
mihomo
subscription
edge
self-hosted
```

## Clean Clone Verification

After preparing the public repository, test from a clean clone:

```bash
npm install
node --check worker.js
npm test
cp wrangler.example.toml wrangler.toml
```

Then fill local `wrangler.toml` values and deploy with:

```bash
npm run deploy
```
