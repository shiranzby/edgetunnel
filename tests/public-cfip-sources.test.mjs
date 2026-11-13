import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  createDataset, mergePublishedNodes, parseCfHubPools, parseSavedCfstResult, parseWeTestTable, renderNodeList,
} from '../scripts/public-cfip-sources.mjs';

const html = `<table>
  <tr><td>移动</td><td>172.66.130.28</td><td>5 MB</td><td>647 kB/s</td><td>107 毫秒</td><td>HKG</td><td>2026-11-13 02:56:38</td></tr>
  <tr><td>联通</td><td><a>104.18.118.107</a></td><td>5 MB</td><td>645 kB/s</td><td>186 毫秒</td><td>LAX</td><td>2026-11-13 03:05:40</td></tr>
  <tr><td>电信</td><td>172.64.145.93</td><td>5 MB</td><td>646 kB/s</td><td>98 毫秒</td><td>SIN</td><td>2026-11-13 03:05:40</td></tr>
  <tr><td>移动</td><td>999.10.1.1</td><td>5 MB</td><td>647 kB/s</td><td>1 毫秒</td><td>HKG</td><td>2026-11-13</td></tr>
</table>`;
const payload = {
  updated_at: 1794511340, quorum: 2,
  pools: [
    { isp: 'cmcc', family: 4, published: true, probers: 27,
      ips: [{ ip: '172.66.130.28', median_ms: 328, users: 22, votes: 23 }] },
    { isp: 'unicom', family: 4, published: true,
      ips: [{ ip: '172.64.145.93', median_ms: 579 }] },
    { isp: 'chinanet', family: 4, published: true,
      ips: [{ ip: '172.64.145.93', median_ms: 218 }] },
    { isp: 'national', family: 6, published: true,
      ips: [{ ip: '2606:4700::1111', median_ms: 262, lines: ['cmcc', 'chinanet'] }] },
    { isp: 'cernet', family: 6, published: true,
      ips: [{ ip: '2606:4700:0:0:0:0:0:1111', median_ms: 193 }] },
    { isp: 'cloud', family: 4, published: true,
      ips: [{ ip: '172.64.154.211', median_ms: 225, future_metric: 7 }] },
    { isp: 'other', family: 4, published: false, reason: 'not published',
      ips: [{ ip: '104.18.5.250', median_ms: 73 }] },
  ],
};

test('records all WeTest carriers and preserves every source column without inventing geography', () => {
  const rows = parseWeTestTable(html, 'wetest');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.isp), ['cmcc', 'unicom', 'chinanet']);
  assert.equal(rows[0].bandwidth, '5 MB');
  assert.equal(rows[1].speed, '645 kB/s');
  assert.equal(rows[1].displayRegion, 'LAX');
  assert.equal(rows[1].country, undefined);
  assert.equal(rows[0].sourceCells.length, 7);
});

test('accepts the JSON-encoded HTML returned when the source negotiates JSON', () => {
  assert.deepEqual(parseWeTestTable(JSON.stringify(html)), parseWeTestTable(html));
});

test('keeps the saved CFST result archive while publishing only successful download rows', () => {
  const rows = parseSavedCfstResult({
    generatedAt: '2026-11-12T20:32:42.565Z',
    nodes: [
      { ip: '172.64.1.1', lineName: '多线', regionName: '日本东京', downloadStatus: 200, speedText: '2.59m/s' },
      { ip: '172.64.1.2', lineName: '多线', regionName: '美国洛杉矶', downloadStatus: 500 },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].published, true);
  assert.equal(rows[1].published, false);
  const data = createDataset(rows, []);
  assert.equal(data.recordCount, 2);
  assert.equal(data.publishedRecordCount, 1);
  assert.equal(data.clientNodes.length, 1);
  assert.equal(data.clientNodes[0].regionName, '日本东京');
});

test('records every cfhub category and family, including unpublished data and unknown metrics', () => {
  const rows = parseCfHubPools(payload, 'cfhub');
  assert.equal(rows.length, 7);
  assert.equal(rows.filter((row) => row.family === 6).length, 2);
  assert.equal(rows.find((row) => row.isp === 'other').published, false);
  assert.equal(rows.find((row) => row.isp === 'other').pool.reason, 'not published');
  assert.equal(rows.find((row) => row.isp === 'cmcc').pool.probers, 27);
  assert.equal(rows.find((row) => row.isp === 'cloud').sourceItem.future_metric, 7);
});

test('merging one address retains separate carriers, sources, and their latency values', () => {
  const nodes = mergePublishedNodes(parseWeTestTable(html, 'wetest'), parseCfHubPools(payload, 'cfhub'));
  const shared = nodes.find((node) => node.ip === '172.64.145.93');
  assert.deepEqual(shared.lines, ['电信', '联通']);
  assert.deepEqual(shared.sources, ['wetest', 'cfhub']);
  assert.deepEqual(shared.measurements.map((item) => item.latency), ['98 毫秒', '579ms', '218ms']);
  assert.ok(!nodes.some((node) => node.ip === '104.18.5.250'));
});

test('normalizes IPv6 duplicates and renders bracketed endpoints once', () => {
  const nodes = mergePublishedNodes(parseCfHubPools(payload));
  const ipv6 = nodes.filter((node) => node.family === 6);
  assert.equal(ipv6.length, 1);
  assert.equal(ipv6[0].measurements.length, 2);
  assert.match(renderNodeList(ipv6), /^\[2606:4700::1111\]:443#/);
  assert.equal(renderNodeList(ipv6).trim().split('\n').length, 1);
});

test('per-carrier text excludes metrics belonging to another carrier on a shared IP', () => {
  const nodes = mergePublishedNodes(parseCfHubPools(payload));
  const unicom = renderNodeList(nodes, 'unicom');
  assert.match(unicom, /579ms/);
  assert.doesNotMatch(unicom, /218ms|电信/);
  assert.equal(renderNodeList(nodes, 'missing'), '');
});

test('full archive keeps unpublished records; active exports contain published endpoints only', () => {
  const data = createDataset(parseCfHubPools(payload), []);
  assert.equal(data.recordCount, 7);
  assert.equal(data.publishedRecordCount, 6);
  assert.equal(data.count, 4);
  assert.equal(data.records.find((row) => row.isp === 'other').published, false);
});

test('complete collection is not truncated to the former 50-row limit', () => {
  const ips = Array.from({ length: 60 }, (_, i) => ({ ip: `104.18.0.${i + 1}`, median_ms: i }));
  const data = createDataset(parseCfHubPools({ pools: [{ isp: 'cmcc', family: 4, published: true, ips }] }), []);
  assert.equal(data.count, 60);
});

test('updater only fetches the two public result pages and commits all data exports', async () => {
  const updater = await readFile(new URL('../scripts/update-cfip-data.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...updater.matchAll(/https:\/\/[^'\s]+/g)].map((match) => match[0]), [
    'https://www.wetest.vip/page/cloudflare/address_v4.html',
    'https://cfhub.1molchuan.top/api/v1/pools',
  ]);
  assert.doesNotMatch(updater, /cdn-cgi\/trace|speed\.cloudflare|ipwho\.is/);
  const workflow = await readFile(new URL('../.github/workflows/update-cfip.yml', import.meta.url), 'utf8');
  assert.match(workflow, /file_pattern: data\/\*\*/);
});

async function temporaryUpdater(run) {
  const root = await mkdtemp(join(tmpdir(), 'shycfip-test-'));
  try {
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'data', 'sources'), { recursive: true });
    for (const name of ['update-cfip-data.mjs', 'public-cfip-sources.mjs']) {
      await copyFile(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
    }
    const entry = join(root, 'scripts', 'update-cfip-data.mjs');
    const execute = () => promisify(execFile)(process.execPath, [
      '--input-type=module', '-e',
      'import {pathToFileURL} from "node:url"; globalThis.fetch = async () => {throw new Error("offline fixture")}; await import(pathToFileURL(process.argv[1]).href);',
      entry,
    ], { timeout: 5000 });
    await run(root, execute);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.includes('shycfip-test-'));
    await rm(root, { recursive: true, force: true });
  }
}

test('source failures retain both complete saved sources and their original fetch times', async () => {
  await temporaryUpdater(async (root, execute) => {
    const fetchedAt = '2026-11-12T19:00:00.000Z';
    await writeFile(join(root, 'data', 'sources', 'wetest-ipv4.json'), JSON.stringify({ fetchedAt, body: html }));
    await writeFile(join(root, 'data', 'sources', 'cfhub-pools.json'), JSON.stringify({ fetchedAt, body: JSON.stringify(payload) }));
    await execute();
    const result = JSON.parse(await readFile(join(root, 'data', 'cfip.json'), 'utf8'));
    assert.equal(result.recordCount, 10);
    assert.ok(result.sources.every((source) => source.cached && source.fetchedAt === fetchedAt));
    const unicom = await readFile(join(root, 'data', 'cfip-unicom.txt'), 'utf8');
    assert.match(unicom, /联通/);
    assert.doesNotMatch(unicom, /电信/);
    assert.match(await readFile(join(root, 'data', 'cfip-ipv6.txt'), 'utf8'), /^\[/);
  });
});

test('no live or saved sources leaves the existing export untouched', async () => {
  await temporaryUpdater(async (root, execute) => {
    const file = join(root, 'data', 'cfip.json');
    await writeFile(file, '{"existing":true}\n');
    await assert.rejects(execute);
    assert.equal(await readFile(file, 'utf8'), '{"existing":true}\n');
  });
});
