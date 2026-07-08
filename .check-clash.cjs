const fs = require('fs');
const text = fs.readFileSync('clash-grouped.yaml','utf8').replace(/^\uFEFF/, '');
function blockAfter(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`  - name: ${escaped}\\n[\\s\\S]*?(?=\\n  - name: |\\nrules:)`));
  return match ? match[0] : '';
}
function countList(block) { return (block.match(/^      - /gm) || []).length; }
const groups = [...text.matchAll(/^  - name: (.+)$/gm)].map(m => m[1]);
const proxyNames = [...text.matchAll(/^\s*- \{name: ([^,]+),/gm)].map(m => m[1].trim().replace(/^"|"$/g, ''));
const duplicatedProxyNames = [...new Set(proxyNames.filter((name, index) => proxyNames.indexOf(name) !== index))];
const checks = {
  groups: groups.slice(0, 20),
  hasNodeSelectGroup: groups.includes('节点选择'),
  hasAutoGroup: groups.includes('自动优选'),
  hasOldBestGroup: groups.includes('优选节点'),
  hasCityGroups: groups.some(name => /圣何塞|丹佛|洛杉矶|华盛顿|东京|法兰克福|阿姆斯特丹/.test(name)),
  proxyCount: proxyNames.length,
  duplicateProxyNameCount: duplicatedProxyNames.length,
  duplicateProxyNames: duplicatedProxyNames.slice(0, 20),
  hkProxyCount: proxyNames.filter(n => n.includes('中国香港')).length,
  hkFixed36: Array.from({length:36}, (_,i)=>`🇭🇰 | 中国香港 | ${String(i+1).padStart(2,'0')}`).every(n=>proxyNames.includes(n)),
  nodeSelectCount: countList(blockAfter('节点选择')),
  autoTypeUrlTest: /  - name: 自动优选\n    type: url-test/.test(text),
  autoCount: countList(blockAfter('自动优选')),
  autoHongKongCount: (blockAfter('自动优选').match(/🇭🇰 \| 中国香港/g) || []).length,
  globalCount: countList(blockAfter('全球节点')),
  hkGroupCount: countList(blockAfter('🇭🇰 | 香港节点')),
  usGroupCount: countList(blockAfter('🇺🇸 | 美国节点')),
  jpGroupCount: countList(blockAfter('🇯🇵 | 日本节点')),
  sgGroupCount: countList(blockAfter('🇸🇬 | 新加坡节点')),
  deGroupCount: countList(blockAfter('🇩🇪 | 德国节点')),
  nlGroupCount: countList(blockAfter('🇳🇱 | 荷兰节点')),
  backupCount: countList(blockAfter('备用节点')),
  sampleProxyNames: proxyNames.slice(0, 50),
};
console.log(JSON.stringify(checks, null, 2));
