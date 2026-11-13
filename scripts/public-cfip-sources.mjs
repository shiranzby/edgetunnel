import { isIP } from 'node:net';

const LINE_NAMES = {
  cmcc: '移动', chinanet: '电信', unicom: '联通', national: '全国',
  cernet: '教育网', cloud: '国内云厂商', other: '其他',
};
const LINE_CODES = {
  移动: 'cmcc', 中国移动: 'cmcc', CMCC: 'cmcc', CM: 'cmcc',
  电信: 'chinanet', 中国电信: 'chinanet', CT: 'chinanet',
  联通: 'unicom', 中国联通: 'unicom', CU: 'unicom',
};
const COLO_NAMES = {
  HKG: '中国香港', NRT: '日本东京', KIX: '日本大阪', SIN: '新加坡',
  LAX: '美国洛杉矶', SJC: '美国圣何塞', SEA: '美国西雅图',
  DEN: '美国丹佛', IAD: '美国阿什本', FRA: '德国法兰克福',
  AMS: '荷兰阿姆斯特丹',
};

const htmlDecode = (value) => String(value || '')
  .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const stripHtml = (value) => clean(htmlDecode(value.replace(/<[^>]+>/g, ' ')));
const normalizedIP = (ip) => isIP(ip) === 6
  ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip;
const nodeKey = (node) => `${normalizedIP(node.ip)}|${node.port || 443}`;

export function parseWeTestTable(html, source = 'https://www.wetest.vip/page/cloudflare/address_v4.html') {
  let table = String(html || '');
  if (table.trimStart().startsWith('"')) {
    const decoded = JSON.parse(table);
    if (typeof decoded === 'string') table = decoded;
  }
  const records = [];
  for (const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => stripHtml(cell[1]));
    const isp = LINE_CODES[cells[0]];
    if (cells.length < 7 || !isp || isIP(cells[1]) !== 4) continue;
    records.push({
      rank: records.length + 1,
      ip: cells[1], port: 443, family: 4, isp, line: LINE_NAMES[isp],
      sourceLine: cells[0], bandwidth: cells[2], speed: cells[3],
      latency: cells[4], colo: cells[5], sourceUpdated: cells[6],
      source, sourceName: '微测网', published: true,
      sourceType: 'public-measurement', measurementKind: 'download-test',
      displayRegion: cells[5], regionName: COLO_NAMES[cells[5]] || cells[5],
      sourceCells: cells,
    });
  }
  return records;
}

export function parseSavedCfstResult(payload, source = 'test-shyvpn-snapshot') {
  return (Array.isArray(payload?.nodes) ? payload.nodes : []).flatMap((item, index) => {
    if (isIP(String(item?.ip || '')) !== 4) return [];
    const line = String(item.lineName || item.line || '多线');
    return [{
      ...item,
      rank: index + 1,
      ip: String(item.ip),
      port: Number(item.port || 443),
      family: 4,
      isp: LINE_CODES[line] || (line === '多线' ? 'multi' : line.toLowerCase()),
      line,
      source,
      sourceName: '当前测速快照',
      sourceType: 'saved-public-cfst-result',
      measurementKind: 'tls-trace-download',
      sourceUpdated: payload.generatedAt || '',
      published: item.downloadStatus === 200,
      regionName: item.regionName || COLO_NAMES[item.colo] || item.colo || '',
      displayRegion: item.regionName || COLO_NAMES[item.colo] || item.colo || '',
      speed: item.speedText || item.sourceSpeedText || '',
      latency: Number.isFinite(Number(item.latencyMs)) ? `${item.latencyMs}ms` : '',
    }];
  });
}

export function parseCfHubPools(payload, source = 'https://cfhub.1molchuan.top/api/v1/pools') {
  const timestamp = typeof payload?.updated_at === 'number'
    ? new Date(payload.updated_at * 1000) : null;
  const sourceUpdated = timestamp && Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
  return (Array.isArray(payload?.pools) ? payload.pools : []).flatMap((pool) => {
    const { ips, ...poolMetadata } = pool;
    if (![4, 6].includes(pool.family) || !Array.isArray(ips)) return [];
    return ips.flatMap((item, index) => {
      if (isIP(String(item?.ip || '')) !== pool.family) return [];
      return [{
        rank: index + 1,
        ip: item.ip, port: 443, family: pool.family,
        isp: pool.isp, line: LINE_NAMES[pool.isp] || pool.name || pool.isp,
        source, sourceName: 'cfhub', sourceUpdated,
        sourceType: 'public-measurement', measurementKind: 'ech-tls-trace',
        published: pool.published === true,
        latency: typeof item.median_ms === 'number' ? `${item.median_ms}ms` : '',
        medianMs: item.median_ms ?? null, votes: item.votes ?? null, users: item.users ?? null,
        sourceItem: { ...item }, pool: poolMetadata,
      }];
    });
  });
}

export function mergePublishedNodes(...groups) {
  const merged = new Map();
  for (const record of groups.flat()) {
    if (!record || record.published === false || !isIP(record.ip)) continue;
    const key = nodeKey(record);
    if (!merged.has(key)) {
      merged.set(key, {
        ...record, ip: normalizedIP(record.ip),
        measurements: [], lines: [], isps: [], sources: [],
      });
    }
    const node = merged.get(key);
    node.measurements.push(record);
    if (!node.lines.includes(record.line)) node.lines.push(record.line);
    if (!node.isps.includes(record.isp)) node.isps.push(record.isp);
    if (!node.sources.includes(record.source)) node.sources.push(record.source);
    node.line = node.lines.join(' / ');
  }
  return [...merged.values()];
}

export function renderNodeList(nodes, isp = null) {
  const lines = nodes.flatMap((node) => {
    const measurements = node.measurements.filter((item) => !isp || item.isp === isp);
    if (!measurements.length) return [];
    const host = isIP(node.ip) === 6 ? `[${node.ip}]` : node.ip;
    const labels = measurements.map((item) => clean([
      item.sourceName, item.line, item.colo,
      item.measurementKind === 'ech-tls-trace' ? 'ECH' : '',
      item.latency, item.speed,
    ].filter(Boolean).join(' ')));
    return [`${host}:${node.port}#${labels.join(' | ')}`];
  });
  return lines.length ? lines.join('\n') + '\n' : '';
}

export function createDataset(records, sourceStatus, generatedAt = new Date().toISOString()) {
  const nodes = mergePublishedNodes(records);
  const clientNodes = [];
  const clientKeys = new Set();
  for (const record of records) {
    if (!record.published || !isIP(record.ip)) continue;
    const key = `${normalizedIP(record.ip)}|${record.port || 443}|${record.isp}|${record.regionName || record.displayRegion || record.colo || ''}`;
    if (clientKeys.has(key)) continue;
    clientKeys.add(key);
    clientNodes.push({
      ...record,
      ip: normalizedIP(record.ip),
      port: record.port || 443,
      lineName: record.line,
      regionName: record.regionName || record.displayRegion || record.colo || '',
      displayRegion: record.displayRegion || record.regionName || record.colo || '',
      sourceName: record.sourceName || record.source || '',
      speedText: record.speedText || record.speed || record.sourceSpeedText || '',
    });
  }
  return {
    version: 4, generatedAt,
    source: [...new Set(records.map((record) => record.source))].join(','),
    count: nodes.length, recordCount: records.length,
    publishedRecordCount: records.filter((record) => record.published).length,
    lines: [...new Set(records.map((record) => record.line))],
    sources: sourceStatus, records, nodes, clientNodes,
  };
}
