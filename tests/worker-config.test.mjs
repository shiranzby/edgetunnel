import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');

const md5md5Start = source.indexOf('async function MD5MD5');
const md5md5End = source.indexOf('\n}', md5md5Start);
assert.notEqual(md5md5Start, -1);
assert.notEqual(md5md5End, -1);
assert.doesNotMatch(source.slice(md5md5Start, md5md5End), /crypto\.subtle\.digest\(['"]MD5['"]/);
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
};

const request = new Request('https://shyvpn.cc.cd/version?uuid=bd14d931-06ff-4ec6-9f02-33cec5bbb9f0', {
  headers: { 'User-Agent': 'Mozilla/5.0' },
});
Object.defineProperty(request, 'cf', { value: { colo: 'HKG', asn: 0, asOrganization: 'Test' } });

const response = await workerDefault.fetch(request, env, { waitUntil() {} });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { Version: 20260617014121 });

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('104.16.0.0/30', { status: 200 });
const [preferredNodes, preferredText] = await generatePreferredIPs(
  new Request('https://shyvpn.cc.cd/?cnIspCode=cf'),
  3,
  443,
);
globalThis.fetch = originalFetch;

assert.equal(preferredNodes.length, 3);
assert.equal(preferredText, preferredNodes.join('\n'));
assert.match(preferredNodes[0], /^104\.16\.0\.\d:443#CF官方优选1$/);

console.log('worker config tests passed');
