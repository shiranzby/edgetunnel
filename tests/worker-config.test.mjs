import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = await readFile(new URL('../_worker.js', import.meta.url), 'utf8');
const sanitizedSource = source
  .replace("import { connect } from 'cloudflare:sockets';", 'const connect = () => { throw new Error("socket unavailable in tests"); };')
  .replace('export default {', 'const workerDefault = {')
  .replace(/\n\tasync fetch\(request, env, ctx\) \{/, '\n\tasync fetch(request, env = {}, ctx = {}) {');

const modulePath = join(tmpdir(), `shycfvpn-worker-${Date.now()}.mjs`);
await writeFile(
  modulePath,
  `${sanitizedSource}\nexport { workerDefault, 简化Clash订阅配置 as simplifyClashConfig, 生成随机IP as generatePreferredIPs };\n`,
  'utf8',
);

const { simplifyClashConfig, generatePreferredIPs } = await import(`file:///${modulePath.replace(/\\/g, '/')}`);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const href = String(url);
  if (href.includes('cfip.json')) {
    return Response.json({
      nodes: [
        { rank: 1, line: '电信', ip: '172.64.33.18', port: 443, country: '美国', speed: '0.58m/s' },
        { rank: 2, line: '电信', ip: '104.18.32.235', port: 443, country: '美国', speed: '0.54m/s' },
        { rank: 11, line: '联通', ip: '172.64.168.13', port: 443, country: '美国', speed: '0.47m/s' },
      ],
    });
  }
  return new Response(`104.16.94.26#us 美国 US 18.27m/s
104.16.1.1#us 美国 US 10.00m/s
162.159.38.118#jp 日本 JP 24.18m/s
198.41.223.110#sg 新加坡 SG 22.24m/s
104.25.0.89#de 德国 DE 19.53m/s
188.114.97.3#nl 荷兰 NL 17.9m/s
`, { status: 200 });
};

const rawClashYaml = `mixed-port: 7890
proxies:
  - name: "CF优选 01 日本 24.18m/s"
    type: vless
    server: 162.159.38.118
    port: 443
    uuid: bd14d931-06ff-4ec6-9f02-33cec5bbb9f0
  - {name: "CF优选 02 美国 18.27m/s", type: vless, server: 104.16.94.26, port: 443, uuid: bd14d931-06ff-4ec6-9f02-33cec5bbb9f0}
proxy-groups:
  - name: "自动选择"
    type: url-test
    proxies:
      - "CF优选 01 日本 24.18m/s"
rules:
  - MATCH,自动选择
`;

const simplified = await simplifyClashConfig(rawClashYaml, {
  优选订阅生成: { CFIPDataURL: 'https://example.test/cfip.json' },
});
assert.match(simplified, /proxy-groups:\n  - name: "优选节点"\n    type: url-test/);
assert.match(simplified, /  - name: "电信"\n    type: url-test/);
assert.match(simplified, /  - name: "联通"\n    type: url-test/);
assert.match(simplified, /url: http:\/\/www\.gstatic\.com\/generate_204/);
assert.match(simplified, /name: "日本 \| 162\.159\.38\.118:443 \| 24\.18m\/s"/);
assert.match(simplified, /name: "美国 \| 104\.16\.94\.26:443 \| 18\.27m\/s"/);
assert.match(simplified, /name: "电信 \| 0\.58m\/s"/);
assert.match(simplified, /server: "?172\.64\.33\.18"?/);
assert.match(simplified, /rules:\n  - MATCH,优选节点/);
assert.doesNotMatch(simplified, /CF优选 0[12]/);
assert.doesNotMatch(simplified, /自动选择|故障转移|负载均衡|DIRECT/);

const [preferredNodes, preferredText] = await generatePreferredIPs(new Request('https://shyvpn.cc.cd/'), 5, -1);
globalThis.fetch = originalFetch;

assert.deepEqual(preferredNodes, [
  '104.16.94.26:443#美国 18.27m/s',
  '162.159.38.118:443#日本 24.18m/s',
  '198.41.223.110:443#新加坡 22.24m/s',
  '104.25.0.89:443#德国 19.53m/s',
  '188.114.97.3:443#荷兰 17.9m/s',
]);
assert.equal(preferredText, preferredNodes.join('\n'));

console.log('worker config tests passed');
