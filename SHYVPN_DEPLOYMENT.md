# ShyVPN deployment notes

This fork tracks the latest `cmliu/edgetunnel` baseline and adds ShyVPN-specific subscription output.

## Subscription endpoints

- Recommended visible subscription URL: `http://shyvpn.cc.cd/`
- HTTPS subscription URL: `https://shyvpn.cc.cd/`

## ShyVPN additions

- Root path returns a subscription when requested by subscription clients such as Sparkle, Mihomo, Clash Meta, sing-box, and v2rayN.
- Clash/Mihomo output is simplified to `优选节点` plus carrier groups from `data/cfip.json`.
- `scripts/update-cfip-data.mjs` refreshes `data/cfip.json` from `https://v2rayssr.com/cfip/`.
- `.github/workflows/update-cfip.yml` refreshes CFIP data every 6 hours.
- `SUBSCRIBE_ORIGIN` is supported for stable subconverter callback URLs.

## Required Cloudflare bindings

- `UUID`
- `ADMIN`
- `HOST=shyvpn.cc.cd`
- `KV`
- optional `CFIP_DATA_URL=https://raw.githubusercontent.com/shiranzby/edgetunnel/main/data/cfip.json`
