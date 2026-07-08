# Maintenance Guide

This document tracks the work that should be done before and after publishing ShyVPN EdgeTunnel as a maintainable GitHub project.

The goal is to keep the public repository clean, reproducible, and easy for other users to understand without exposing private deployment history.

## Immediate Priorities

### 1. Clean the public repository

Do not publish the current working directory as-is. It contains local deployment files, generated subscription files, logs, zip packages, and runtime binaries.

Recommended public set:

```text
worker.js
package.json
tests/
scripts/
data/README.md or sanitized sample data
local-cfst-dashboard/ source files only
docs/
.github/workflows/ reviewed workflows only
wrangler.example.toml
README.md
LICENSE
.gitignore
```

Keep out of GitHub:

```text
wrangler.toml
.wrangler/
.wrangler.*.toml
*.log
clash-*.yaml
remote-result.json
admin-config.json
release/*/runtime/node.exe
*.zip
SHYVPN_FULL_DOCS_*
SHYVPN_LITE_DOCS_*
deploy-with-token.bat
```

### 2. Standardize the Worker entry file

The current code uses `worker.js`, while one workflow still watches `_worker.js`.

Choose one convention before publishing:

- Recommended: keep `worker.js` as the only Worker entry.
- Update `.github/workflows/package-worker.yml` to watch and package `worker.js`.
- Make sure `wrangler.example.toml` points to the same file.

### 3. Remove private values from configs

Before publishing, make sure no real value appears in committed files:

- Cloudflare Account ID.
- Cloudflare API Token or Global API Key.
- GitHub token.
- Worker AI key.
- Real admin password.
- Personal UUID if it is used as an access credential.
- Personal domain routes if you do not want them public.

Suggested scan:

```bash
rg -n "cfk_|cfut_|Bearer|CLOUDFLARE_API_KEY|CLOUDFLARE_API_TOKEN|github_pat|ghp_|Global API Key|api_token|account_id|ADMIN|UUID" .
```

### 4. Add a license file

The README credits upstream projects. The repository should also include a `LICENSE` file that is compatible with the upstream project license. Keep all upstream attribution notices required by the original project.

### 5. Review GitHub Actions

Current workflows should be checked before publishing:

- `package-worker.yml`: align the watched path and packaged file with `worker.js`.
- `update-cfip.yml`: ensure generated data is sanitized and does not create noisy commits.
- Add a basic CI workflow that runs `npm test` on pull requests and pushes.

## Release Readiness Checklist

Before creating the first public release:

- [ ] `README.md` contains no private deployment details.
- [ ] `wrangler.example.toml` uses placeholders only.
- [ ] `wrangler.toml` is ignored or removed from the public tree.
- [ ] `npm test` passes.
- [ ] `node --check worker.js` passes.
- [ ] GitHub Actions refer to the correct Worker entry file.
- [ ] A `LICENSE` file exists.
- [ ] Generated YAML and logs are not tracked.
- [ ] The local dashboard can start from a clean clone.
- [ ] The `/clash` subscription can be imported by at least one Mihomo-compatible client.

## Ongoing Maintenance

### Worker subscription behavior

Keep tests focused on the generated Clash structure:

- `proxies`, `proxy-groups`, and `rules` exist.
- Top-level manual selector exists.
- Auto test group exists.
- Region groups are stable and readable.
- Rules point to the expected top-level group.
- Duplicate proxy names are rejected by tests.

### Cloudflare IP data

The IP candidate source is operational data, not core source code. Keep the code tolerant of stale, empty, or unreachable data.

Recommended behavior:

- If `CFIP_DATA_URL` is unreachable, still generate a valid subscription.
- If a region cannot be detected, place the node in a fallback group.
- Keep candidate count reasonable so clients do not spend too long testing nodes.

### Local dashboard

The dashboard should remain optional. A user should be able to deploy the Worker and import `/clash` without running the dashboard, then improve results later by adding `CFIP_DATA_URL`.

Maintenance targets:

- Clear `README.md` inside `local-cfst-dashboard/`.
- Stable JSON schema for `/api/result`.
- Basic health endpoint or status field.
- No bundled private data in public releases.

### Documentation

Keep public documentation user-focused. Avoid publishing internal development labels, temporary experiments, one-off debugging logs, or private deployment names.

Recommended docs:

```text
README.md                         # public entry point
docs/REPOSITORY_STRUCTURE.md       # file layout
docs/MAINTENANCE.md                # maintainer checklist
local-cfst-dashboard/README.md     # dashboard usage
wrangler.example.toml              # deployment template
```

Move long development retrospectives to a private archive unless they are fully sanitized and useful to external contributors.

## Versioning Suggestions

Use simple tags once public:

```text
v0.1.0  first public source release
v0.2.0  dashboard improvements
v0.3.0  subscription generation changes
```

For each release, include:

- Worker changes.
- Subscription compatibility changes.
- Dashboard changes.
- Migration notes if config variables changed.

## Known Technical Debt

- The Worker source is large and should eventually be split into smaller modules if the deployment toolchain allows it.
- Some scripts and generated artifacts were created during local debugging and should be removed or archived privately.
- Public workflows should be made consistent with the actual file layout.
- The README currently assumes `worker.js`; any future rename must be reflected in Wrangler config, workflows, tests, and docs together.
- Security scanning should be part of the release process, even for a personal project.
