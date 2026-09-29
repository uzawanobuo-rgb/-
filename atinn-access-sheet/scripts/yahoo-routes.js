// Yahoo!乗換案内で「物件の最寄駅（複数）→目的駅」を平日10時発で検索し、徒歩＋乗車が最短の経路を返す（Claude Code での作成用）
// 使い方: node scripts/yahoo-routes.js '[{"name":"品川","walk":8}]' '["新宿","渋谷"]' 2026-10-01 > routes.json
// 有料特急・新幹線・高速バス・飛行機は使わない。乗車時間＝出発→到着（乗換の歩き・待ちを含む）。
const { execFileSync } = require('child_process');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';

function toText(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<br\s*\/?>|<\/(li|div|p|dd|dt|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '');
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  return t.split('\n').map(s => s.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
}

function parseRoutes(lines) {
  const routes = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\d{1,2}:\d{2})発→(\d{1,2}:\d{2})着(\d+)分（乗車(\d+)分）/.exec(lines[i]);
    if (!m) continue;
    const r = { dep: m[1], arr: m[2], total: +m[3], ride: +m[4], transfers: null, stations: [], lines: [] };
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (/^ルート\d+$/.test(lines[j]) || /^ルートに表示される記号/.test(lines[j])) break;
      const t = /^乗換：(\d+)回/.exec(lines[j]);
      if (t) r.transfers = +t[1];
      if (lines[j] === '時刻表' && lines[j - 1]) r.stations.push(lines[j - 1].replace(/[(（][^)）]*[)）]$/, ''));
      if (lines[j] === '地図' && lines[j + 1] && !/^(ルート|\d{1,2}:\d{2}$)/.test(lines[j + 1])) r.lines.push(lines[j + 1]);
    }
    routes.push(r);
    i = j - 1;
  }
  return routes;
}

function search(from, to, date) {
  const [y, mo, d] = date.split('-');
  const url = `https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&y=${y}&m=${mo}&d=${d}&hh=10&m1=0&m2=0&type=1&ticket=ic&expkind=1&ws=3&s=0&al=0&shin=0&ex=0&hb=0&lb=1&sr=1`;
  const html = execFileSync('curl', ['-sS', '-m', '30', '-A', UA, url], { maxBuffer: 20e6 }).toString();
  const routes = parseRoutes(toText(html)).filter(r => r.stations.length >= 2);
  return { url: `https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&y=${y}&m=${mo}&d=${d}&hh=10&m1=0&m2=0&type=1`, routes };
}

// 路線名を整える：「ＪＲ山手線外回り渋谷・新宿方面」→「JR山手線」
function cleanLine(s) {
  s = s.replace(/ＪＲ/g, 'JR').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const alias = /^(JR)?[^(（]*[(（]([^)）]*ライン)[)）]/.exec(s); // JR東海道本線(上野東京ライン) → JR上野東京ライン
  if (alias) return (alias[1] || '') + alias[2];
  const m = /^(.*?(?:線|ライン|ゆりかもめ))/.exec(s);
  if (m) return m[1].replace(/(内回り|外回り)$/, '');
  return s.replace(/\s*\S*(行|方面)$/, '').trim();
}

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function best(stations, target, date) {
  let bestR = null;
  for (const st of stations) {
    if (st.name === target) {
      const c = { total: st.walk, walk: st.walk, ride: 0, transfers: 0, station: st.name, legs: [], url: '' };
      if (!bestR || c.total < bestR.total) bestR = c;
      continue;
    }
    let res;
    try { res = search(st.name + '駅', target + '駅', date); } catch (e) { continue; }
    sleep(1200);
    for (const r of res.routes) {
      // 乗車時間＝出発→到着（乗換の歩き・待ちを含む、最初の待ちは含まない）
      const tot = st.walk + r.total;
      if (!bestR || tot < bestR.total || (tot === bestR.total && r.transfers < bestR.transfers)) {
        const legs = r.lines.map((ln, k) => ({ mode: /バス/.test(ln) ? 'bus' : 'train', line: cleanLine(ln), to: r.stations[k + 1] }));
        bestR = { total: tot, walk: st.walk, ride: r.total, transfers: r.transfers, station: st.name, legs, url: res.url, raw: r };
      }
    }
  }
  return bestR;
}

if (require.main === module) {
  const stations = JSON.parse(process.argv[2]);
  const targets = JSON.parse(process.argv[3]);
  const date = process.argv[4] || '2026-10-01';
  const out = {};
  for (const t of targets) {
    out[t] = best(stations, t, date);
    const b = out[t];
    console.error(t, b ? `${b.total}分 = 徒歩${b.walk}(${b.station}) + ${b.ride}分 乗換${b.transfers} ${b.legs.map(l => l.line + '→' + l.to).join(' / ')}` : 'なし');
  }
  console.log(JSON.stringify(out));
}
module.exports = { search, parseRoutes, toText, cleanLine, best };
