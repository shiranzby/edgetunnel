import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SHYVPN_UUID = '11111111-1111-4111-8111-111111111111';
process.env.SHYVPN_WORKER_HOST = 'shyvpn.cc.cd';
process.env.SHYVPN_DATA_DIR = join(tmpdir(), `shyvpn-local-test-${process.pid}`);

await mkdir(process.env.SHYVPN_DATA_DIR, { recursive: true });

const result = {
  generatedAt: '2026-07-25T00:00:00.000Z',
  targetHost: process.env.SHYVPN_WORKER_HOST,
  nodes: [
    { ip: '172.66.0.2', ok: true, line: 'telecom', colo: 'HKG', downloadMbps: 1.23 },
    { ip: '104.18.1.1', ok: true, line: 'unicom', colo: 'NRT', downloadMbps: 2.34 },
    { ip: '104.18.1.3', ok: true, line: 'mobile', colo: 'SIN', downloadMbps: 3.45 },
    { ip: '104.18.1.4', ok: true, line: 'unicom', colo: 'LAX', downloadMbps: 4.56 },
    { ip: '2001:db8::1', ok: true, line: 'mobile', colo: 'SIN', downloadMbps: 5.67 },
    { ip: '104.18.1.2', ok: false, line: 'unicom', colo: 'SJC', downloadMbps: 6.78 },
  ],
};

await writeFile(join(process.env.SHYVPN_DATA_DIR, 'result.json'), JSON.stringify(result, null, 2), 'utf8');

const { buildLocalSubscription, handleRequest } = await import('../server.mjs');

const subscription = {
  name: 'ShyVPN',
  uuid: process.env.SHYVPN_UUID,
  workerHost: process.env.SHYVPN_WORKER_HOST,
  hosts: [process.env.SHYVPN_WORKER_HOST],
  path: '/',
  transport: 'ws',
  fingerprint: 'chrome',
  maxNodes: 20,
};

const clash = buildLocalSubscription({ format: 'clash', result, subscription });
assert.equal(clash.contentType, 'application/x-yaml; charset=utf-8');
assert.match(clash.body, /^proxies:/m);
assert.match(clash.body, /^proxy-groups:/m);
assert.match(clash.body, /name: 节点选择/);
assert.match(clash.body, /name: 自动优选/);
assert.match(clash.body, /name: 故障切换/);
assert.match(clash.body, /name: 🇭🇰 \| 香港节点/);
assert.match(clash.body, /name: 🇯🇵 \| 日本节点/);
assert.match(clash.body, /name: 🇸🇬 \| 新加坡节点/);
assert.match(clash.body, /name: 🇺🇸 \| 美国节点/);
assert.match(clash.body, /name: 备用节点/);
assert.match(clash.body, /name: "🇭🇰 \| 中国香港 \| 01"/);
assert.match(clash.body, /server: 104\.21\.88\.204/);
assert.match(clash.body, /server: 172\.66\.0\.2/);
assert.match(clash.body, /server: 104\.18\.1\.1/);
assert.match(clash.body, /server: 104\.18\.1\.3/);
assert.match(clash.body, /server: 104\.18\.1\.4/);
assert.match(clash.body, /servername: "shyvpn\.cc\.cd"/);
assert.match(clash.body, /headers: \{Host: "shyvpn\.cc\.cd"\}/);
assert.doesNotMatch(clash.body, /2001:db8::1/);
assert.doesNotMatch(clash.body, /104\.18\.1\.2/);
assert.doesNotMatch(clash.body, /<!DOCTYPE html>|Welcome to nginx/i);

const vless = buildLocalSubscription({ format: 'vless', result, subscription });
assert.equal(vless.contentType, 'text/plain; charset=utf-8');
assert.match(vless.body, /^vless:\/\/11111111-1111-4111-8111-111111111111@172\.66\.0\.2:443\?/m);
assert.match(vless.body, /sni=shyvpn\.cc\.cd/);
assert.match(vless.body, /host=shyvpn\.cc\.cd/);

const singbox = buildLocalSubscription({ format: 'singbox', result, subscription });
assert.equal(singbox.contentType, 'application/json; charset=utf-8');
const singboxJson = JSON.parse(singbox.body);
assert.equal(singboxJson.outbounds[0].type, 'vless');
assert.equal(singboxJson.outbounds[0].tls.server_name, 'shyvpn.cc.cd');
assert.equal(singboxJson.outbounds[0].transport.headers.Host, 'shyvpn.cc.cd');
assert.equal(singboxJson.route.final, '节点选择');

assert.throws(
  () => buildLocalSubscription({ format: 'clash', result: { nodes: [] }, subscription }),
  /no available nodes/,
);

function createMockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body += chunk;
    },
  };
}

const clashResponse = createMockResponse();
await handleRequest({ url: '/clash', headers: { host: 'sub.shyvpn.cc.cd', 'user-agent': 'mihomo/1.19.20' } }, clashResponse);
assert.equal(clashResponse.statusCode, 200);
assert.match(clashResponse.headers['content-type'], /application\/x-yaml/);
assert.match(clashResponse.body, /^proxies:/m);
assert.match(clashResponse.body, /name: 🇭🇰 \| 香港节点/);
assert.match(clashResponse.body, /servername: "shyvpn\.cc\.cd"/);
assert.doesNotMatch(clashResponse.body, /sub\.shyvpn\.cc\.cd/);

const singboxResponse = createMockResponse();
await handleRequest({ url: '/sub?target=singbox', headers: { host: 'sub.shyvpn.cc.cd', 'user-agent': 'sing-box' } }, singboxResponse);
assert.equal(singboxResponse.statusCode, 200);
assert.match(singboxResponse.headers['content-type'], /application\/json/);
assert.equal(JSON.parse(singboxResponse.body).route.final, '节点选择');

const rootClashResponse = createMockResponse();
await handleRequest({ url: '/', headers: { host: 'sub.shyvpn.cc.cd', 'user-agent': 'mihomo/1.19.20' } }, rootClashResponse);
assert.equal(rootClashResponse.statusCode, 200);
assert.match(rootClashResponse.headers['content-type'], /application\/x-yaml/);
assert.match(rootClashResponse.body, /^proxies:/m);
assert.match(rootClashResponse.body, /name: 🇭🇰 \| 香港节点/);
assert.doesNotMatch(rootClashResponse.body, /<!DOCTYPE html>|ShyVPN Cloudflare/i);

const dashboardResponse = createMockResponse();
await handleRequest({ url: '/', headers: { host: 'test.shyvpn.cc.cd', 'user-agent': 'Mozilla/5.0' } }, dashboardResponse);
assert.equal(dashboardResponse.statusCode, 200);
assert.match(dashboardResponse.headers['content-type'], /text\/html/);
assert.match(dashboardResponse.body, /ShyVPN/);

console.log('local subscription tests passed');
