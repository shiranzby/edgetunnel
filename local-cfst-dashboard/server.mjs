import http from 'node:http';
import https from 'node:https';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(rootDir, 'data');
const resultFile = join(dataDir, 'result.json');
const config = JSON.parse((await readFile(join(rootDir, 'config.json'), 'utf8')).replace(/^\uFEFF/, ''));

let state = {
  running: false,
  lastRunAt: null,
  lastError: null,
  result: existsSync(resultFile) ? JSON.parse((await readFile(resultFile, 'utf8')).replace(/^\uFEFF/, '')) : emptyResult(),
};

function emptyResult() {
  return {
    generatedAt: null,
    targetHost: config.targetHost,
    count: 0,
    nodes: [],
    stats: {},
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeSpeed(value) {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/([\d.]+)\s*(m|mb|mb\/s|m\/s)/i);
  return match ? Number(match[1]) : 0;
}

const LINE_LABELS = {
  dx: '电信', dianxin: '电信', telecom: '电信', ct: '电信', '电信': '电信',
  yd: '移动', yidong: '移动', mobile: '移动', cm: '移动', '移动': '移动',
  lt: '联通', liantong: '联通', unicom: '联通', cu: '联通', '联通': '联通',
  bgp: '多线', multi: '多线', all: '多线', anycast: '多线', bd: '多线', jp: '多线', sg: '多线', hk: '多线', kr: '多线', '多线': '多线'
};

const COLO_REGIONS = {
  HKG: '中国香港', TPE: '中国台湾台北', NRT: '日本东京', KIX: '日本大阪', ICN: '韩国首尔', SIN: '新加坡',
  LAX: '美国洛杉矶', SJC: '美国圣何塞', SEA: '美国西雅图', SFO: '美国旧金山', LHR: '英国伦敦', FRA: '德国法兰克福',
  AMS: '荷兰阿姆斯特丹', CDG: '法国巴黎', YYZ: '加拿大多伦多', YVR: '加拿大温哥华', SYD: '澳大利亚悉尼',
  DEN: '美国丹佛', IAD: '美国阿什本', DFW: '美国达拉斯', ORD: '美国芝加哥', EWR: '美国纽瓦克',
  ATL: '美国亚特兰大', MIA: '美国迈阿密', PHX: '美国凤凰城', LAS: '美国拉斯维加斯', BOS: '美国波士顿',
  YUL: '加拿大蒙特利尔', MEX: '墨西哥城', MAD: '西班牙马德里', MXP: '意大利米兰', FCO: '意大利罗马'
};

const BUILTIN_CANDIDATES = [
  '104.18.39.116:443#hk 中国香港 HKG builtin',
  '172.64.229.77:443#hk 中国香港 HKG builtin',
  '104.18.40.201:443#hk 中国香港 HKG builtin',
  '104.17.178.221:443#hk 中国香港 HKG builtin',
  '104.19.153.229:443#hk 中国香港 HKG builtin',
  '104.17.118.15:443#hk 中国香港 HKG builtin',
  '172.64.154.190:443#hk 中国香港 HKG builtin',
  '172.64.154.83:443#hk 中国香港 HKG builtin',
  '104.17.186.112:443#hk 中国香港 HKG builtin',
  '104.19.62.158:443#hk 中国香港 HKG builtin',
  '172.64.146.77:443#hk 中国香港 HKG builtin',
  '104.21.88.204:443#hk 中国香港 HKG builtin',
  '104.18.38.205:443#hk 中国香港 HKG builtin',
  '104.18.38.254:443#hk 中国香港 HKG builtin',
  '104.18.35.29:443#hk 中国香港 HKG builtin',
  '172.64.229.156:443#hk 中国香港 HKG builtin',
  '172.64.158.118:443#hk 中国香港 HKG builtin',
  '172.64.153.30:443#hk 中国香港 HKG builtin'
];

const COUNTRY_NAMES = {
  HK: '中国香港', TW: '中国台湾', JP: '日本', KR: '韩国', SG: '新加坡', US: '美国', CA: '加拿大', DE: '德国',
  NL: '荷兰', FR: '法国', GB: '英国', UK: '英国', AU: '澳大利亚', CN: '中国'
};

function normalizeLineName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '多线';
  const lower = raw.toLowerCase();
  for (const [key, label] of Object.entries(LINE_LABELS)) {
    if (lower === key || lower.includes(key) || raw.includes(key)) return label;
  }
  if (/电信|telecom|dianxin|\bct\b/i.test(raw)) return '电信';
  if (/移动|mobile|yidong|\bcm\b/i.test(raw)) return '移动';
  if (/联通|unicom|liantong|\bcu\b/i.test(raw)) return '联通';
  return raw.length <= 8 ? raw : '多线';
}

function regionNameFrom(node) {
  const colo = String(node?.colo || '').toUpperCase();
  if (COLO_REGIONS[colo]) return COLO_REGIONS[colo];
  if (colo) return `${colo} 机房`;
  const loc = String(node?.loc || '').toUpperCase();
  if (COUNTRY_NAMES[loc]) return COUNTRY_NAMES[loc];
  return loc || '未知地区';
}

function formatSpeed(node) {
  if (node.downloadMbps) return `${node.downloadMbps}m/s`;
  if (node.sourceSpeedText) return node.sourceSpeedText;
  if (node.latencyMs && node.latencyMs < 999999) return `${node.latencyMs}ms`;
  return '待测速';
}

function buildNodeName(node) {
  return `${normalizeLineName(node.line || node.source)} | ${regionNameFrom(node)} | ${formatSpeed(node)}`;
}
function parseTrace(text) {
  const data = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) data[line.slice(0, index)] = line.slice(index + 1);
  }
  return data;
}

function requestText(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    signal: controller.signal,
    headers: {
      'user-agent': 'ShyVPN-Local-CFST/1.0',
      accept: 'text/html,text/plain,application/json,*/*',
      ...(options.headers || {}),
    },
  }).then(async response => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  }).finally(() => clearTimeout(timeout));
}

function fetchThroughIp(ip, host, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const request = https.request({
      host: ip,
      servername: host,
      path,
      method: 'GET',
      timeout: timeoutMs,
      rejectUnauthorized: false,
      headers: {
        host,
        'user-agent': 'ShyVPN-Local-CFST/1.0',
        accept: '*/*',
      },
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes <= config.downloadBytes) chunks.push(chunk);
        if (bytes >= config.downloadBytes) response.destroy();
      });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        ms: performance.now() - started,
        bytes,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('close', () => resolve({
        statusCode: response.statusCode,
        ms: performance.now() - started,
        bytes,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', reject);
    request.end();
  });
}

function parseV2raySsr(html, sourceName) {
  const rows = [];
  const regex = /<tr>\s*<td>(?<rank>\d+)<\/td>\s*<td><span class="cfip-line-(?<line>[^"]+)">[^<]+<\/span><\/td>\s*<td[^>]*>(?<ip>(?:\d{1,3}\.){3}\d{1,3})<div[\s\S]*?<\/td>\s*<td>(?<loss>[^<]+)<\/td>\s*<td>(?<latency>[^<]+)<\/td>\s*<td>(?<speed>[^<]+)<\/td>/g;
  for (const match of html.matchAll(regex)) {
    rows.push({
      ip: match.groups.ip,
      source: sourceName,
      line: normalizeLineName(decodeHtml(match.groups.line)),
      sourceRank: Number(match.groups.rank),
      sourceLoss: decodeHtml(match.groups.loss),
      sourceLatency: decodeHtml(match.groups.latency),
      sourceSpeedText: decodeHtml(match.groups.speed).replace(/mb\/s/i, 'm/s'),
      sourceSpeedMbps: normalizeSpeed(match.groups.speed),
    });
  }
  return rows;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseTextCandidates(text, sourceName) {
  return String(text || '').split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => parseCandidateLine(line, sourceName, index + 1))
    .filter(Boolean);
}

function parseCandidateLine(line, sourceName, rank = 1) {
  const [left, remark = ''] = String(line || '').split('#');
  const ip = (left.match(/(?:\d{1,3}\.){3}\d{1,3}/) || [])[0];
  if (!ip) return null;
  const raw = `${remark} ${sourceName}`;
  const code = (raw.match(/\b(HKG|HK|香港|JP|NRT|KIX|SG|SIN|KR|ICN|TW|TPE|US|SJC|LAX|SEA|DE|FRA|NL|AMS)\b/i) || [])[0]?.toUpperCase() || '';
  return {
    ip,
    source: sourceName,
    line: normalizeLineName(code || sourceName),
    sourceRank: rank,
    sourceSpeedText: (remark.match(/[\d.]+\s*m\/s/i) || [])[0] || '',
    sourceSpeedMbps: normalizeSpeed(remark),
  };
}

async function collectCandidates() {
  const all = [];
  const sourceErrors = [];
  for (const [index, line] of BUILTIN_CANDIDATES.entries()) {
    const item = parseCandidateLine(line, 'builtin-hkg', index + 1);
    if (item) all.push(item);
  }
  for (const source of config.candidateSources) {
    try {
      const text = await requestText(source.url, { timeoutMs: 20000 });
      const parsed = source.type === 'v2rayssr'
        ? parseV2raySsr(text, source.name)
        : parseTextCandidates(text, source.name);
      all.push(...parsed);
    } catch (error) {
      sourceErrors.push({ source: source.name, url: source.url, error: error.message });
    }
  }

  const byIp = new Map();
  for (const item of all) {
    if (!item.ip) continue;
    const existing = byIp.get(item.ip);
    if (!existing || item.sourceSpeedMbps > existing.sourceSpeedMbps) byIp.set(item.ip, item);
  }

  const candidates = [...byIp.values()]
    .sort((a, b) => (b.sourceSpeedMbps - a.sourceSpeedMbps) || (a.sourceRank - b.sourceRank))
    .slice(0, config.maxCandidates);
  candidates.sourceErrors = sourceErrors;
  return candidates;
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, run));
  return output;
}

async function traceCandidate(candidate) {
  const traceSamples = [];
  const started = performance.now();
  try {
    const response = await fetchThroughIp(candidate.ip, config.targetHost, config.tracePath, config.traceTimeoutMs);
    const trace = parseTrace(response.body);
    const colo = trace.colo || '';
    const loc = trace.loc || '';
    return {
      ...candidate,
      ok: Boolean(colo),
      latencyMs: Math.round(response.ms),
      colo,
      loc,
      traceIp: trace.ip || '',
      traceMs: Math.round(performance.now() - started),
      traceSamples,
    };
  } catch (error) {
    return {
      ...candidate,
      ok: false,
      error: error.message,
      latencyMs: 999999,
      colo: '',
      loc: '',
    };
  }
}

async function downloadTest(candidate) {
  const started = performance.now();
  try {
    const response = await fetchThroughIp(candidate.ip, config.downloadHost || config.targetHost, config.downloadPath, config.downloadTimeoutMs);
    const seconds = Math.max(0.001, (performance.now() - started) / 1000);
    const mbps = (response.bytes / 1024 / 1024) / seconds;
    return {
      ...candidate,
      downloadBytes: response.bytes,
      downloadMbps: Number(mbps.toFixed(2)),
      downloadMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ...candidate,
      downloadBytes: 0,
      downloadMbps: 0,
      downloadMs: Math.round(performance.now() - started),
      downloadError: error.message,
    };
  }
}

function scoreNode(node) {
  const coloIndex = config.preferredColos.indexOf(node.colo);
  const coloBoost = coloIndex >= 0 ? (config.preferredColos.length - coloIndex) * 180 : 0;
  const latencyMs = Math.min(node.latencyMs || 9999, 9999);
  const latencyScore = Math.max(0, 5000 - latencyMs * 12);
  const downloadBoost = Math.min(node.downloadMbps || 0, 50) * 260;
  const sourceSpeedHint = Math.min(node.sourceSpeedMbps || 0, 100) * 4;
  return Number((latencyScore + downloadBoost + sourceSpeedHint + coloBoost).toFixed(2));
}

async function publishResult(result) {
  const targets = config.publish?.targets || [];
  const enabledTargets = targets.filter(target => target && target.enabled);
  if (!enabledTargets.length) return [];
  const outputs = [];
  for (const target of enabledTargets) {
    try {
      const payload = formatPublishBody(result, target.format || 'json');
      if (target.type === 'github') {
        outputs.push(await publishToGithub(target, payload));
      } else {
        outputs.push(await publishToHttp(target, payload));
      }
    } catch (error) {
      outputs.push({ name: target.name || target.url || target.path || 'publish-target', ok: false, error: error.message });
    }
  }
  return outputs;
}

function formatPublishBody(result, format) {
  if (format === 'plain') return result.nodes.map(node => `${node.ip}:443#${node.name}`).join('\n') + '\n';
  if (format === 'csv') return toCsv(result);
  return JSON.stringify(result, null, 2) + '\n';
}

async function publishToHttp(target, body) {
  if (!target.url) throw new Error('missing target.url');
  const format = target.format || 'json';
  const headers = {
    'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    ...(target.headers || {})
  };
  if (target.bearerToken) headers.authorization = `Bearer ${target.bearerToken}`;
  const response = await fetch(target.url, { method: target.method || 'PUT', headers, body });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return { name: target.name || target.url, ok: true, status: response.status };
}

async function publishToGithub(target, body) {
  const token = target.token || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('missing github token');
  const owner = target.owner;
  const repo = target.repo;
  const path = target.path || 'data/cfip.txt';
  const branch = target.branch || 'main';
  if (!owner || !repo) throw new Error('missing github owner/repo');
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replaceAll('%2F', '/')}`;
  let sha;
  const current = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'ShyVPN-Local-CFST/1.0' }
  });
  if (current.ok) sha = (await current.json()).sha;
  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'ShyVPN-Local-CFST/1.0' },
    body: JSON.stringify({
      message: target.message || `update cfip result ${new Date().toISOString()}`,
      branch,
      sha,
      content: Buffer.from(body, 'utf8').toString('base64')
    })
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return { name: target.name || `github:${owner}/${repo}/${path}`, ok: true, status: response.status };
}

async function runScan() {
  if (state.running) return state.result;
  state.running = true;
  state.lastError = null;
  try {
    const candidates = await collectCandidates();
    const sourceErrors = candidates.sourceErrors || [];
    const traced = (await mapLimit(candidates, config.concurrency, traceCandidate)).filter(Boolean);
    const usable = traced
      .filter(node => node.ok)
      .sort((a, b) => {
        const latencyDelta = a.latencyMs - b.latencyMs;
        if (Math.abs(latencyDelta) > 80) return latencyDelta;
        const speedDelta = (b.sourceSpeedMbps || 0) - (a.sourceSpeedMbps || 0);
        if (Math.abs(speedDelta) > 5) return speedDelta;
        const aPreferred = config.preferredColos.indexOf(a.colo);
        const bPreferred = config.preferredColos.indexOf(b.colo);
        return (aPreferred < 0 ? 99 : aPreferred) - (bPreferred < 0 ? 99 : bPreferred);
      });
    const downloadTargets = usable.slice(0, config.maxDownloadTests);
    const downloaded = await mapLimit(downloadTargets, Math.min(8, config.concurrency), downloadTest);
    const downloadMap = new Map(downloaded.map(node => [node.ip, node]));
    const nodes = usable.map(node => {
      const merged = downloadMap.get(node.ip) || node;
      return {
        ...merged,
        speedText: formatSpeed(merged),
        lineName: normalizeLineName(merged.line || merged.source),
        regionName: regionNameFrom(merged),
        score: scoreNode(merged),
        name: buildNodeName(merged),
      };
    }).sort((a, b) => b.score - a.score);

    const result = {
      generatedAt: new Date().toISOString(),
      targetHost: config.targetHost,
      count: nodes.length,
      candidates: candidates.length,
      nodes,
      stats: {
        byColo: countBy(nodes, 'colo'),
        bySource: countBy(nodes, 'source'),
        preferredColos: config.preferredColos,
        preferredRegions: config.preferredColos.map(code => COLO_REGIONS[code] || code),
        sourceErrors,
      },
    };
    await mkdir(dataDir, { recursive: true });
    result.publish = await publishResult(result);
    await writeFile(resultFile, JSON.stringify(result, null, 2) + '\n', 'utf8');
    state.result = result;
    state.lastRunAt = result.generatedAt;
    return result;
  } catch (error) {
    state.lastError = error.stack || error.message;
    throw error;
  } finally {
    state.running = false;
  }
}

function countBy(items, key) {
  const output = {};
  for (const item of items) {
    const value = item[key] || '(empty)';
    output[value] = (output[value] || 0) + 1;
  }
  return output;
}

function toCsv(result) {
  const header = ['rank', 'ip', 'name', 'lineName', 'regionName', 'ipColo', 'loc', 'latencyMs', 'downloadMbps', 'sourceSpeedText', 'source', 'score'];
  const rows = result.nodes.map((node, index) => [
    index + 1,
    node.ip,
    node.name,
    node.lineName || normalizeLineName(node.line),
    node.regionName || regionNameFrom(node),
    node.colo,
    node.loc,
    node.latencyMs,
    node.downloadMbps || '',
    node.sourceSpeedText || '',
    node.source,
    node.score,
  ]);
  return [header, ...rows].map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
}

function jsonResponse(response, data, status = 200) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  response.end(JSON.stringify(data, null, 2));
}

function textResponse(response, text, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  response.end(text);
}

function htmlPage() {
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ShyVPN Cloudflare 优选测速</title>
  <style>
    :root{color-scheme:dark;--bg:#030712;--bg2:#08111f;--card:rgba(13,23,38,.72);--card2:rgba(17,28,45,.9);--text:#f8fafc;--muted:#99a5b7;--line:rgba(125,211,252,.22);--brand:#38bdf8;--brand2:#2563eb;--cyan:#22d3ee;--ok:#22c55e;--warn:#f59e0b;--hot:#facc15;--shadow:0 22px 70px rgba(0,0,0,.42);--chip:rgba(15,23,42,.8)}
    html[data-theme="light"]{color-scheme:light;--bg:#f8fafc;--bg2:#eaf4ff;--card:rgba(255,255,255,.82);--card2:rgba(255,255,255,.96);--text:#0f172a;--muted:#64748b;--line:rgba(14,116,144,.18);--brand:#0284c7;--brand2:#2563eb;--cyan:#0891b2;--ok:#16a34a;--warn:#d97706;--hot:#b45309;--shadow:0 20px 55px rgba(15,23,42,.12);--chip:rgba(241,245,249,.85)}
    *{box-sizing:border-box}html{scrollbar-color:var(--brand) transparent}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 8% 8%,rgba(56,189,248,.24),transparent 28rem),radial-gradient(circle at 88% 0,rgba(37,99,235,.18),transparent 30rem),linear-gradient(135deg,var(--bg),var(--bg2));color:var(--text)}
    body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(148,163,184,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.04) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.9),transparent)}
    .shell{width:min(92rem,calc(100% - 2rem));margin:0 auto;padding:1.8rem 0 2.4rem}.hero{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1.6rem}.brand{display:flex;align-items:center;gap:1rem}.logo{width:4.2rem;height:4.2rem;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 25%,#67e8f9,#2563eb 62%,#111827);box-shadow:0 0 0 1px rgba(125,211,252,.5),0 0 35px rgba(56,189,248,.45);font-size:2rem}.title h1{margin:0;font-size:clamp(2rem,4vw,3.3rem);letter-spacing:-.04em}.title p{margin:.35rem 0 0;color:var(--muted);font-size:clamp(.95rem,1.5vw,1.18rem)}
    .status{display:flex;align-items:center;gap:.85rem;border:1px solid var(--line);border-radius:1.25rem;padding:.85rem 1.1rem;background:var(--card);backdrop-filter:blur(18px);box-shadow:var(--shadow)}.pulse{width:1.9rem;height:1.9rem;border-radius:50%;background:conic-gradient(from 0deg,var(--cyan),transparent 55%,var(--brand));animation:spin 1.6s linear infinite;position:relative}.pulse:after{content:"";position:absolute;inset:.48rem;border-radius:50%;background:var(--bg)}@keyframes spin{to{transform:rotate(360deg)}}.status b{display:block}.status span{color:var(--muted);font-size:.9rem}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem;margin-bottom:1.2rem}.card{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:1.15rem;background:linear-gradient(135deg,var(--card),rgba(2,6,23,.28));box-shadow:var(--shadow);padding:1.25rem;min-height:6.6rem}.card:before{content:"";position:absolute;inset:-1px;background:linear-gradient(120deg,rgba(56,189,248,.18),transparent 45%);pointer-events:none}.card-inner{position:relative;display:flex;align-items:center;gap:1rem}.icon{width:3.2rem;height:3.2rem;border-radius:999px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(59,130,246,.42),rgba(15,23,42,.18));box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);font-size:1.4rem}.label{color:var(--muted);font-size:.95rem}.value{font-size:clamp(1.35rem,2.4vw,1.8rem);font-weight:800;line-height:1.15;margin-top:.2rem}.wide .value{font-size:1.32rem;color:var(--brand)}
    .controls{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin:1.2rem 0}.left,.filters{display:flex;gap:.7rem;flex-wrap:wrap;align-items:center}.btn,.filter{border:1px solid var(--line);border-radius:999px;padding:.68rem 1.05rem;background:var(--chip);color:var(--text);text-decoration:none;font-weight:800;cursor:pointer;transition:.18s ease}.btn.primary,.filter.active{background:linear-gradient(135deg,var(--brand),var(--brand2));border-color:rgba(125,211,252,.7);color:white;box-shadow:0 0 24px rgba(56,189,248,.28)}.btn:hover,.filter:hover{transform:translateY(-1px);border-color:rgba(56,189,248,.5)}.search{min-width:min(22rem,100%);display:flex;align-items:center;gap:.65rem;border:1px solid var(--line);border-radius:999px;background:var(--card);padding:.72rem 1rem}.search input{border:0;outline:0;background:transparent;color:var(--text);font-size:1rem;width:100%}
    .table-wrap{border:1px solid var(--line);border-radius:1.2rem;overflow:auto;background:rgba(3,7,18,.55);box-shadow:var(--shadow);max-height:calc(100vh - 22rem)}html[data-theme="light"] .table-wrap{background:rgba(255,255,255,.78)}table{width:100%;border-collapse:collapse;min-width:62rem}th,td{padding:1rem 1.15rem;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;white-space:nowrap}th{position:sticky;top:0;z-index:1;background:linear-gradient(180deg,var(--card2),rgba(15,23,42,.92));color:#bfdbfe;font-size:.94rem}html[data-theme="light"] th{color:#075985;background:rgba(255,255,255,.96)}tbody tr{transition:.16s ease}tbody tr:hover{background:rgba(56,189,248,.08)}tbody tr:nth-child(2){box-shadow:inset .24rem 0 0 var(--brand);background:rgba(56,189,248,.08)}.rank{font-weight:900}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.region{display:inline-flex;border-radius:999px;padding:.32rem .7rem;background:rgba(37,99,235,.22);color:#60a5fa;font-weight:800}.region.sin{background:rgba(34,197,94,.18);color:#4ade80}.region.nrt,.region.kix{background:rgba(168,85,247,.18);color:#c084fc}.region.hkg{background:rgba(59,130,246,.2);color:#60a5fa}.region.fra,.region.ams{background:rgba(245,158,11,.17);color:#fbbf24}.latency.good{color:#86efac}.latency.mid{color:#fbbf24}.latency.bad{color:#fb7185}.speed{color:var(--cyan);font-weight:900}.score{color:var(--hot);font-weight:900}.source{display:inline-flex;border-radius:999px;padding:.32rem .68rem;background:rgba(148,163,184,.13);border:1px solid rgba(148,163,184,.16)}.muted{color:var(--muted)}
    @media(max-width:880px){.hero{align-items:flex-start;flex-direction:column}.stats{grid-template-columns:1fr 1fr}.controls{align-items:stretch}.left,.filters,.search{width:100%}.btn,.filter{flex:1;text-align:center}.table-wrap{max-height:60vh}.shell{width:min(100% - 1rem,92rem)}}@media(max-width:560px){.stats{grid-template-columns:1fr}.brand{align-items:flex-start}.logo{width:3.2rem;height:3.2rem}.status{width:100%}.card{min-height:auto}}
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="brand"><div class="logo">⚡</div><div class="title"><h1>ShyVPN 优选测速</h1><p>本机出口实测 · Cloudflare Colo · 延迟与下载测速</p></div></div>
      <div class="status"><div class="pulse"></div><div><b id="runText">状态同步中</b><span>30 分钟自动更新</span></div></div>
    </section>
    <section class="stats" id="cards"></section>
    <section class="controls">
      <div class="left">
        <button class="btn primary" id="scan">立即测速</button><a class="btn" href="/api/result" target="_blank">JSON</a><a class="btn" href="/api/csv" target="_blank">CSV</a><a class="btn" href="/api/plain" target="_blank">IP 列表</a><a class="btn" href="https://vpn.example.com/" target="_blank">返回 ShyVPN</a><button class="btn" id="theme">日夜切换</button>
      </div>
      <div class="search">⌕<input id="search" placeholder="搜索节点 / IP / 地区 / 来源"></div>
    </section>
    <section class="controls"><div class="filters" id="filters"></div></section>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>节点名</th><th>IP</th><th>地区</th><th>延迟</th><th>下载</th><th>来源</th><th>评分</th></tr></thead><tbody id="rows"></tbody></table></div>
  </div>
  <script>
    let allNodes=[]; let active='全部';
    const theme=localStorage.getItem('theme')||'dark'; document.documentElement.dataset.theme=theme;
    document.getElementById('theme').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('theme',next)};
    async function load(){
      const [data,status]=await Promise.all([fetch('/api/result').then(r=>r.json()),fetch('/api/status').then(r=>r.json()).catch(()=>({}))]);
      allNodes=data.nodes||[]; const stats=data.stats||{}; const downloadCount=allNodes.filter(n=>Number(n.downloadMbps)>0).length;
      document.getElementById('runText').textContent=status.running?'本机测速中':'本机已就绪';
      document.getElementById('cards').innerHTML=[
        ['◷','更新时间', data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '未测速'],
        ['⌘','可用节点', data.count || allNodes.length || 0],
        ['◎','下载测速', downloadCount + ' / ' + (data.count || allNodes.length || 0)],
        ['♕','最优地区', bestRegion(allNodes) || (stats.preferredRegions||[])[0] || '-']
      ].map(([icon,k,v],i)=>'<div class="card '+(i===3?'wide':'')+'"><div class="card-inner"><div class="icon">'+icon+'</div><div><div class="label">'+k+'</div><div class="value">'+escapeHtml(v)+'</div></div></div></div>').join('');
      buildFilters(allNodes); render();
    }
    function bestRegion(nodes){return (nodes[0]&&nodes[0].regionName)||''}
    function buildFilters(nodes){const regions=[...new Set(nodes.map(n=>n.regionName).filter(Boolean))].slice(0,8); const lines=[...new Set(nodes.map(n=>n.lineName).filter(Boolean))].filter(v=>['电信','移动','联通'].includes(v)); const list=['全部',...lines,...regions]; document.getElementById('filters').innerHTML=list.map(x=>'<button class="filter '+(x===active?'active':'')+'" data-filter="'+escapeHtml(x)+'">'+escapeHtml(x)+'</button>').join(''); document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{active=b.dataset.filter;buildFilters(allNodes);render()});}
    function render(){const q=document.getElementById('search').value.trim().toLowerCase(); const rows=allNodes.filter(n=>{const hay=[n.name,n.ip,n.regionName,n.colo,n.source,n.lineName].join(' ').toLowerCase(); const passFilter=active==='全部'||n.regionName===active||n.lineName===active; return passFilter&&(!q||hay.includes(q));}); document.getElementById('rows').innerHTML=rows.map((n,i)=>'<tr><td class="rank">'+(i+1)+'</td><td>'+escapeHtml(n.name||'')+'</td><td class="mono">'+escapeHtml(n.ip||'')+'</td><td><span class="region '+String(n.colo||'').toLowerCase()+'">'+escapeHtml(n.regionName||n.colo||'')+'</span></td><td class="latency '+latencyClass(n.latencyMs)+'">'+(n.latencyMs||'-')+'ms</td><td class="speed">'+(n.downloadMbps? n.downloadMbps+'m/s':'<span class="muted">来源 '+escapeHtml(n.sourceSpeedText||'-')+'</span>')+'</td><td><span class="source">'+escapeHtml(n.source||'')+'</span></td><td class="score">'+escapeHtml(n.score||'')+'</td></tr>').join('');}
    function latencyClass(ms){ms=Number(ms)||9999;return ms<250?'good':ms<520?'mid':'bad'}
    function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
    document.getElementById('search').addEventListener('input',render);
    document.getElementById('scan').onclick=async()=>{const b=document.getElementById('scan');b.disabled=true;b.textContent='测速中...';await fetch('/api/scan',{method:'POST'});setTimeout(load,1200);b.disabled=false;b.textContent='立即测速'};
    load(); setInterval(load, 10000);
  </script>
</body>
</html>`;
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/') return textResponse(response, htmlPage(), 'text/html; charset=utf-8');
  if (url.pathname === '/api/status') return jsonResponse(response, { running: state.running, lastRunAt: state.lastRunAt, lastError: state.lastError });
  if (url.pathname === '/api/result') return jsonResponse(response, state.result);
  if (url.pathname === '/api/csv') return textResponse(response, toCsv(state.result), 'text/csv; charset=utf-8');
  if (url.pathname === '/api/plain') return textResponse(response, state.result.nodes.map(node => `${node.ip}:443#${node.name}`).join('\n') + '\n');
  if (url.pathname === '/api/scan' && request.method === 'POST') {
    runScan().catch(error => console.error(error));
    return jsonResponse(response, { ok: true, running: true });
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not Found');
}

if (process.argv.includes('--scan-once')) {
  const result = await runScan();
  console.log(`Scan complete: ${result.count} nodes, ${result.generatedAt}`);
  process.exit(0);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    console.error(error);
    jsonResponse(response, { error: error.message }, 500);
  });
});

await mkdir(dataDir, { recursive: true });
server.listen(config.port, config.host, () => {
  console.log(`ShyVPN CFST dashboard: http://127.0.0.1:${config.port}`);
  console.log(`Listening on ${config.host}:${config.port}, interval ${config.intervalMinutes} minutes`);
});

setInterval(() => runScan().catch(error => console.error(error)), config.intervalMinutes * 60 * 1000);
runScan().catch(error => console.error(error));
