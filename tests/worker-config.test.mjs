import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = await readFile(new URL('../_worker.js', import.meta.url), 'utf8');

const md5md5Start = source.indexOf('async function MD5MD5');
const md5md5End = source.indexOf('\n}', md5md5Start);
assert.notEqual(md5md5Start, -1);
assert.notEqual(md5md5End, -1);
assert.doesNotMatch(source.slice(md5md5Start, md5md5End), /crypto\.subtle\.digest\(['"]MD5['"]\)/);
assert.match(source, /function MD5十六进制/);

const sanitizedSource = source
  .replace("import { connect } from 'cloudflare:sockets';", 'const connect = () => { throw new Error("socket unavailable in tests"); };')
  .replace('export default {', 'const workerDefault = {')
  .replace(/\n\tasync fetch\(request, env, ctx\) \{/, '\n\tasync fetch(request, env = {}, ctx = {}) {');

const modulePath = join(tmpdir(), `shycfvpn-worker-${Date.now()}.mjs`);
await writeFile(
  modulePath,
  `${sanitizedSource}\nexport { workerDefault, 生成随机IP as generatePreferredIPs };\n`,
  'utf8',
);

const { workerDefault, generatePreferredIPs } = await import(`file:///${modulePath.replace(/\\/g, '/')}`);

const env = {
  UUID: 'bd14d931-06ff-4ec6-9f02-33cec5bbb9f0',
  ADMIN: 'bd14d931-06ff-4ec6-9f02-33cec5bbb9f0',
  HOST: 'shyvpn.cc.cd',
  CFIP_DATA_URL: 'https://example.com/cfip.json',
  KV: {
    store: new Map(),
    async get(key) {
      return this.store.get(key) ?? null;
    },
    async put(key, value) {
      this.store.set(key, value);
    },
  },
};

const request = new Request('https://shyvpn.cc.cd/version?uuid=bd14d931-06ff-4ec6-9f02-33cec5bbb9f0', {
  headers: { 'User-Agent': 'Mozilla/5.0' },
});
Object.defineProperty(request, 'cf', { value: { colo: 'HKG', asn: 0, asOrganization: 'Test' } });

const response = await workerDefault.fetch(request, env, { waitUntil() {} });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { Version: 20260617014121 });

const originalFetchForClash = globalThis.fetch;
globalThis.fetch = async (input) => {
  const requestUrl = String(input?.url ?? input);
  if (requestUrl.includes('/api/result')) {
    return new Response(JSON.stringify({
      nodes: [
        { ip: '108.162.194.106', regionName: '美国圣何塞', colo: 'SJC' },
        { ip: '104.18.1.1', regionName: '日本东京', colo: 'NRT' },
      ],
    }), { status: 200 });
  }
  if (requestUrl.includes('/sub?target=clash')) {
    return new Response(`proxies:
  - {name: 电信 | 美国 | 63.59m/s, server: 108.162.194.106, port: 443, type: vless}
  - {name: 联通 | 日本 | 40.00m/s, server: 104.18.1.1, port: 443, type: vless}
proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - 电信 | 美国 | 63.59m/s
      - 联通 | 日本 | 40.00m/s
  - name: 🛑 全球拦截
    type: select
    proxies:
      - REJECT
rules:
  - DOMAIN-SUFFIX,example.com,🚀 节点选择
  - DOMAIN-SUFFIX,ads.example.com,🛑 全球拦截
  - MATCH,🐟 漏网之鱼
`, { status: 200 });
  }
  return new Response('ok', { status: 200 });
};

const clashRequest = new Request('https://shyvpn.cc.cd/clash', {
  headers: { 'User-Agent': 'Sparkle/1.26 mihomo/1.19.20' },
});
Object.defineProperty(clashRequest, 'cf', { value: { colo: 'HKG', asn: 0, asOrganization: 'Test' } });
const clashResponse = await workerDefault.fetch(clashRequest, env, { waitUntil() {} });
const clashBody = await clashResponse.text();
globalThis.fetch = originalFetchForClash;

assert.equal(clashResponse.status, 200);
assert.match(clashResponse.headers.get('content-type'), /application\/x-yaml/);
assert.doesNotMatch(clashBody, /<!DOCTYPE html>/i);
assert.match(clashBody, /name: 节点选择/);
assert.match(clashBody, /name: 自动优选/);
assert.match(clashBody, /name: 🇭🇰 \| 香港节点/);
assert.match(clashBody, /name: 🇯🇵 \| 日本节点/);
assert.match(clashBody, /name: 🇺🇸 \| 美国节点/);
assert.match(clashBody, /name: 故障切换/);
assert.match(clashBody, /name: 节点选择\n    type: select/);
assert.match(clashBody, /name: 自动优选\n    type: url-test/);
assert.doesNotMatch(clashBody, /name: 优选节点/);
assert.doesNotMatch(clashBody, /美国圣何塞|美国丹佛|日本东京\n/);
assert.doesNotMatch(clashBody, /🚀 节点选择|🛑 全球拦截|🐟 漏网之鱼/);
assert.match(clashBody, /DOMAIN-SUFFIX,shyvpn\.cc\.cd,节点选择/);
assert.match(clashBody, /DOMAIN-SUFFIX,ads\.shyvpn\.cc\.cd,REJECT/);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const requestUrl = String(input?.url ?? input);
  if (requestUrl.includes('cfip.json')) {
    return new Response(JSON.stringify({
      nodes: [
        { line: '电信', country: '美国', speed: '63.59m/s', ip: '108.162.194.106', port: 443 },
        { line: '联通', country: '日本', speed: '40.00m/s', ip: '104.18.1.1', port: 443 },
        { line: '移动', country: '新加坡', speed: '30.00m/s', ip: '104.18.1.2', port: 443 },
      ],
    }), { status: 200 });
  }
  return new Response('104.16.0.0/30', { status: 200 });
};
const [preferredNodes, preferredText] = await generatePreferredIPs(
  new Request('https://shyvpn.cc.cd/?cnIspCode=cf'),
  3,
  443,
  { CFIP_DATA_URL: 'https://example.com/cfip.json' },
);
globalThis.fetch = originalFetch;

assert.equal(preferredNodes.length, 3);
assert.equal(preferredText, preferredNodes.join('\n'));
assert.equal(preferredNodes[0], '108.162.194.106:443#电信 | 美国 | 63.59m/s');
assert.equal(preferredNodes[1], '104.18.1.1:443#联通 | 日本 | 40.00m/s');
assert.doesNotMatch(preferredText, /CF官方优选/);

console.log('worker config tests passed');


