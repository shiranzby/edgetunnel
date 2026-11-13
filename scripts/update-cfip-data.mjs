import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  createDataset,
  parseCfHubPools,
  parseSavedCfstResult,
  parseWeTestTable,
  renderNodeList,
} from './public-cfip-sources.mjs';

const DATA = new URL('../data/', import.meta.url);
const SOURCES = [
  {
    name: 'test-shyvpn-snapshot',
    snapshot: 'sources/test-shyvpn-result.json',
    localOnly: true,
    parse: (text, url) => parseSavedCfstResult(JSON.parse(text), url),
  },
  {
    name: 'wetest',
    url: 'https://www.wetest.vip/page/cloudflare/address_v4.html',
    snapshot: 'sources/wetest-ipv4.json',
    parse: parseWeTestTable,
  },
  {
    name: 'cfhub',
    url: 'https://cfhub.1molchuan.top/api/v1/pools',
    snapshot: 'sources/cfhub-pools.json',
    parse: (text, url) => parseCfHubPools(JSON.parse(text), url),
  },
];

await mkdir(new URL('sources/', DATA), { recursive: true });
const results = await Promise.all(SOURCES.map(async (source) => {
  const snapshotFile = new URL(source.snapshot, DATA);
  if (source.localOnly) {
    let snapshot;
    try {
      snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
    } catch {
      return {
        records: [],
        status: null,
      };
    }
    const records = source.parse(JSON.stringify(snapshot), source.name);
    return {
      records,
      status: {
        name: source.name, url: 'local:data/sources/test-shyvpn-result.json',
        fetchedAt: snapshot.generatedAt, cached: true, localOnly: true, count: records.length,
      },
    };
  }
  try {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShyVPN-PublicData/1.0)',
        accept: 'text/html,application/json',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    const records = source.parse(body, source.url);
    if (!records.length) throw new Error('No source records parsed');
    const snapshot = { url: source.url, fetchedAt: new Date().toISOString(), body };
    await writeFile(snapshotFile, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    return {
      records,
      status: { name: source.name, url: source.url, fetchedAt: snapshot.fetchedAt, cached: false, count: records.length },
    };
  } catch (error) {
    console.warn(`${source.name}: ${error.message}; using the last saved source snapshot if available`);
    try {
      const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
      const records = source.parse(snapshot.body, source.url);
      if (!records.length) throw new Error('Empty saved source');
      return {
        records,
        status: { name: source.name, url: source.url, fetchedAt: snapshot.fetchedAt, cached: true, count: records.length, error: error.message },
      };
    } catch {
      return { records: [], status: { name: source.name, url: source.url, cached: false, count: 0, error: error.message } };
    }
  }
}));

const records = results.flatMap((result) => result.records);
if (!records.length) throw new Error('No public source data available; existing exports were left untouched');
const payload = createDataset(records, results.map((result) => result.status).filter(Boolean));
const outputs = [
  ['cfip.json', JSON.stringify(payload, null, 2) + '\n'],
  ['cfip-all.txt', renderNodeList(payload.nodes)],
  ['cfip-ipv4.txt', renderNodeList(payload.nodes.filter((node) => node.family === 4))],
  ['cfip-ipv6.txt', renderNodeList(payload.nodes.filter((node) => node.family === 6))],
  ['cfip-mobile.txt', renderNodeList(payload.nodes, 'cmcc')],
  ['cfip-telecom.txt', renderNodeList(payload.nodes, 'chinanet')],
  ['cfip-unicom.txt', renderNodeList(payload.nodes, 'unicom')],
];
for (const [file, body] of outputs) {
  await writeFile(new URL(file, DATA), body, 'utf8');
}
console.log(JSON.stringify({
  records: payload.recordCount, uniquePublishedNodes: payload.count,
  ipv4: payload.nodes.filter((node) => node.family === 4).length,
  ipv6: payload.nodes.filter((node) => node.family === 6).length,
  sources: payload.sources,
}));
