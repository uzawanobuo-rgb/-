// 画面：入力 → 自動取込 → 確認・修正 → 生成（SPEC.md §1）
(function () {
  'use strict';
  const Calc = window.AtinnCalc, Parse = window.AtinnParse, Sheet = window.AtinnSheet, GEO = window.AtinnGeoData, Samples = window.AtinnSamples;
  const STORE_KEY = 'atinn-access-sheet:v1';
  const VERSION = '1.0.0';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const MAJOR = GEO.majorStations.map(s => s.name);
  const LETTERS = ['A', 'B', 'C'];
  const COLORS = ['#0F7C7A', '#E0662A', '#2F74B5'];
  const TINTS = ['#E4F2F1', '#FCEDE4', '#E6EFF8'];

  // ---------- 状態 ----------
  function emptyProp() {
    return { planUrl: '', planName: '', name: '', address: '', lat: '', lng: '', stations: [], price: {}, photos: [], photoIdx: 0, photoCustom: '', hidePhoto: false, tag: '', built: '', structure: '', floors: '', smoking: '', capacity: '', imported: null };
  }
  function emptyRoute() { return { station: '', walk: '', legs: [{ mode: 'train', line: '', to: '' }], ride: '', display: '', transfers: '', source: '', note: '', exclude: false }; }
  function defaultState() {
    return {
      v: 1, pattern: 'p1', persons: 1, baseDate: Calc.todayStr(),
      p1: { checkIn: Calc.defaultCheckIn(), property: emptyProp(), routes: {}, headline: '', subheadline: '', note: '' },
      p2: { destName: '', destLabel: 'お勤め先', destAddress: '', destLat: '', destLng: '', customer: '', checkIn: '', checkOut: '', properties: [emptyProp(), emptyProp(), emptyProp()], routes: [emptyRoute(), emptyRoute(), emptyRoute()], headline: '', subheadline: '', note: '' },
      stationCoords: {},
    };
  }
  function normalize(s) {
    const d = defaultState();
    s = Object.assign(d, s || {});
    s.p1 = Object.assign(defaultState().p1, s.p1 || {});
    s.p2 = Object.assign(defaultState().p2, s.p2 || {});
    s.p1.property = Object.assign(emptyProp(), s.p1.property || {});
    s.p2.properties = [0, 1, 2].map(i => Object.assign(emptyProp(), (s.p2.properties || [])[i] || {}));
    s.p2.routes = [0, 1, 2].map(i => Object.assign(emptyRoute(), (s.p2.routes || [])[i] || {}));
    Object.keys(s.p1.routes || {}).forEach(k => { s.p1.routes[k] = Object.assign(emptyRoute(), s.p1.routes[k]); });
    s.stationCoords = s.stationCoords || {};
    return s;
  }

  // 開くたびにまっさらから始める。前回の入力は「前回の入力を復元」で戻せるように別の場所へ移しておく。
  const PREV_KEY = STORE_KEY + ':prev';
  let state = defaultState();
  try {
    const last = localStorage.getItem(STORE_KEY);
    localStorage.removeItem(STORE_KEY);
    if (last) {
      // 前回使わなかったパターンは、その前の入力を残しておく（パターンごとに最後の入力を戻せるように）
      const cur = JSON.parse(last);
      let old = null;
      try { old = JSON.parse(localStorage.getItem(PREV_KEY) || 'null'); } catch (e) { /* 壊れていれば捨てる */ }
      if (old) ['p1', 'p2'].forEach(pat => { if (!hasPatternContent(cur, pat) && hasPatternContent(old, pat)) cur[pat] = old[pat]; });
      if (hasContent(cur)) { localStorage.removeItem(PREV_KEY); localStorage.setItem(PREV_KEY, JSON.stringify(cur)); }
    }
  } catch (e) { /* 保存できない環境でも動かす */ }
  // パターンごとに「入力があるか」を見る
  function hasPatternContent(s, pat) {
    if (!s) return false;
    if (pat === 'p1') { const p = s.p1 && s.p1.property; return !!(p && (p.name || p.planUrl)); }
    const p2 = s.p2 || {};
    return !!(p2.destName || p2.customer || (p2.properties || []).some(p => p && (p.name || p.planUrl)));
  }
  function hasContent(s) { return hasPatternContent(s, 'p1') || hasPatternContent(s, 'p2'); }
  function prevSaved() {
    try { const v = JSON.parse(localStorage.getItem(PREV_KEY) || 'null'); return hasContent(v) ? v : null; } catch (e) { return null; }
  }
  // 復元の案内に出す名前（いま見ているパターンの分だけ）
  function prevLabel(v, pat) {
    if (pat === 'p1') return (v.p1 && v.p1.property && v.p1.property.name) || '物件';
    const names = (v.p2.properties || []).map(p => p && p.name).filter(Boolean);
    return [v.p2.destName ? `目的地：${v.p2.destName}` : '', names.join('・')].filter(Boolean).join('／') || 'パターン2';
  }
  const ui = { open: { howto: !localStorage.getItem(STORE_KEY + ':seen') } };

  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) {
      // 写真で容量オーバーのときは写真を除いて保存
      try {
        const lite = JSON.parse(JSON.stringify(state));
        [lite.p1.property].concat(lite.p2.properties).forEach(p => { p.photos = (p.photos || []).map(x => ({ src: x.src, caption: x.caption })); p.photoCustom = ''; });
        localStorage.setItem(STORE_KEY, JSON.stringify(lite));
      } catch (e2) { /* 保存できなくても動作は続ける */ }
    }
  }

  function getPath(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state); }
  function setPath(path, val) {
    const ks = path.split('.');
    let o = state;
    for (let i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = val;
  }
  function p1Route(name) {
    if (!state.p1.routes[name]) state.p1.routes[name] = emptyRoute();
    return state.p1.routes[name];
  }

  // ---------- 表示部品 ----------
  function inp(path, opts) {
    opts = opts || {};
    const v = getPath(path);
    const type = opts.type || 'text';
    const attrs = [`data-bind="${path}"`, `type="${type}"`, `value="${esc(v == null ? '' : v)}"`];
    if (opts.ph) attrs.push(`placeholder="${esc(opts.ph)}"`);
    if (type === 'number') attrs.push('inputmode="numeric"', `step="${opts.step || 'any'}"`);
    if (opts.list) attrs.push(`list="${opts.list}"`);
    if (opts.cls) attrs.push(`class="${opts.cls}"`);
    return `<input ${attrs.join(' ')}>`;
  }
  // 項目名を左、入力欄を右に1行で並べる（項目名の幅をそろえて縦位置を合わせる）
  function inlineField(label, html) { return `<label class="f-inline all"><span>${label}</span>${html}</label>`; }
  function field(label, html, cls) { return `<label class="f ${cls || ''}"><span>${label}</span>${html}</label>`; }
  function numOrEmpty(v) { const n = Calc.num(v); return n === null ? '' : n; }

  // ---------- ブックマークレット ----------
  // プランページで実行し、本文・地図座標・写真をJSONにしてコピーする。解析はツール側（parse.js）で行う。
  function bookmarkletMain() {
    (async () => {
      const d = document;
      if (!/(^|\.)atinn\.jp$/.test(location.hostname) && !confirm('アットインのページではないようです。続けますか？')) return;
      const h = d.documentElement.outerHTML;
      let lat = null, lng = null;
      const m = h.match(/maps\.google\.[a-z.]+\/maps\?[^"'<>\s]*?q=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i) || h.match(/google\.[a-z.]+\/maps[^"'<>\s]*?[?&;](?:q|ll|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
      if (m) { lat = +m[1]; lng = +m[2]; }
      const cands = [];
      d.querySelectorAll('img').forEach(i => {
        const s = i.currentSrc || i.src || i.dataset.src || i.dataset.lazy || i.getAttribute('data-original');
        if (s && !/^data:|\.svg|logo|icon|banner|sprite|btn_|button/i.test(s) && !cands.some(x => x.s === s)) {
          const fig = i.closest('figure,li,div');
          const cap = (i.alt || i.title || (fig && fig.querySelector('figcaption,p,span') && fig.querySelector('figcaption,p,span').innerText) || '').trim().slice(0, 60);
          cands.push({ el: i, s, a: cap });
        }
      });
      // ブラウザはクリック直後しかコピーを許さないので、写真は並列で読み、最大2.5秒で打ち切る
      const load = x => new Promise(r => {
        if (x.el.complete && x.el.naturalWidth && x.el.currentSrc === x.s) return r(x.el);
        const im = new Image();
        try { if (new URL(x.s, location.href).origin !== location.origin) im.crossOrigin = 'anonymous'; } catch (e) { /* noop */ }
        const t = setTimeout(() => r(null), 2500);
        im.onload = () => { clearTimeout(t); r(im); };
        im.onerror = () => { clearTimeout(t); r(null); };
        im.src = x.s;
      });
      const loaded = await Promise.all(cands.slice(0, 16).map(load));
      const images = [];
      cands.slice(0, 16).forEach((x, k) => {
        const im = loaded[k];
        if (images.length >= 8 || !im || im.naturalWidth < 300 || im.naturalHeight < 200) return;
        let data = null;
        try {
          const f = Math.min(1, 640 / im.naturalWidth);
          const c = d.createElement('canvas');
          c.width = Math.round(im.naturalWidth * f); c.height = Math.round(im.naturalHeight * f);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          data = c.toDataURL('image/jpeg', 0.8);
        } catch (e) { /* 別ドメインの画像は URL のみ */ }
        images.push({ src: new URL(x.s, location.href).href, data, caption: x.a });
      });
      const json = JSON.stringify({ v: 1, src: 'atinn-bookmarklet', url: location.href, title: d.title, h1: (d.querySelector('h1') || {}).innerText || '', text: d.body.innerText.slice(0, 80000), lat, lng, images, fetchedAt: new Date().toISOString() });
      const info = '写真 ' + images.length + '枚' + (lat ? '・地図座標あり' : '・地図座標なし');
      const copy = async () => {
        try { await navigator.clipboard.writeText(json); return true; } catch (e) { /* 次の方法 */ }
        try { const t = d.createElement('textarea'); t.value = json; t.style.cssText = 'position:fixed;left:-9999px'; d.body.appendChild(t); t.select(); const ok = d.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
      };
      const box = html => { const o = d.createElement('div'); o.innerHTML = html; d.body.appendChild(o.firstChild); return d.body.lastChild; };
      if (await copy()) {
        const o = box('<div style="position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#0F7C7A;color:#fff;padding:14px 18px;border-radius:10px;font:14px/1.6 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)"><b style="font-size:16px">✓ コピーしました</b><br>' + info + '<br>ツールに戻って Ctrl+V で貼り付けてください</div>');
        setTimeout(() => o.remove(), 3500);
        return;
      }
      // コピーが許可されなかったときだけボタンを出す
      const o = box('<div style="position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:sans-serif"><div style="background:#fff;color:#1E2B33;padding:24px;border-radius:12px;max-width:420px;text-align:center;line-height:1.6"><div style="font-size:17px;font-weight:bold;margin-bottom:6px">物件データを取得しました</div><div style="font-size:13px;color:#555;margin-bottom:16px">' + info + '<br>「コピーする」を押して、ツールの貼り付け欄に貼ってください。</div><button style="font-size:16px;padding:10px 22px;background:#0F7C7A;color:#fff;border:0;border-radius:8px;cursor:pointer">コピーする</button><button style="font-size:14px;padding:10px 14px;margin-left:8px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer">閉じる</button></div></div>');
      const bs = o.querySelectorAll('button');
      bs[1].onclick = () => o.remove();
      bs[0].onclick = async () => { await copy(); bs[0].textContent = 'コピーしました ✓'; setTimeout(() => o.remove(), 1200); };
    })().catch(e => alert('取得に失敗しました: ' + e));
  }
  const BOOKMARKLET = 'javascript:' + encodeURIComponent('(' + bookmarkletMain.toString() + ')()');

  // Yahoo!乗換案内の検索結果ページで実行し、経路の本文をコピーする。解析はツール側（parse.js の parseTransit）。
  function transitBookmarkletMain() {
    (async () => {
      const d = document;
      if (!/transit\.yahoo\.co\.jp$/.test(location.hostname) && !confirm('Yahoo!乗換案内のページではないようです。続けますか？')) return;
      const n = (d.body.innerText.match(/\d{1,2}:\d{2}\s*発\s*→/g) || []).length;
      const box = html => { const o = d.createElement('div'); o.innerHTML = html; d.body.appendChild(o.firstChild); return d.body.lastChild; };
      const toast = (html, bg, ms) => { const o = box('<div style="position:fixed;right:20px;bottom:20px;z-index:2147483647;background:' + bg + ';color:#fff;padding:14px 18px;border-radius:10px;font:14px/1.6 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)">' + html + '</div>'); setTimeout(() => o.remove(), ms); };
      if (!n) { toast('<b>経路が見つかりません</b><br>検索結果のページで押してください', '#B45309', 3500); return; }
      // 経路部分のHTMLも送る（画面の見た目に左右されずに読めるように）
      const area = d.querySelector('#srline') || d.querySelector('main') || d.body;
      const json = JSON.stringify({ v: 2, src: 'yahoo-transit', url: location.href, html: area.outerHTML.slice(0, 600000), text: d.body.innerText.slice(0, 120000), fetchedAt: new Date().toISOString() });
      const copy = async () => {
        try { await navigator.clipboard.writeText(json); return true; } catch (e) { /* 次の方法 */ }
        try { const t = d.createElement('textarea'); t.value = json; t.style.cssText = 'position:fixed;left:-9999px'; d.body.appendChild(t); t.select(); const ok = d.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
      };
      if (await copy()) { toast('<b style="font-size:16px">✓ コピーしました</b><br>経路 ' + n + ' 件（乗車時間がいちばん短いものが入ります）<br>ツールに戻って Ctrl+V で貼り付けてください', '#0F7C7A', 3500); return; }
      // コピーが許可されなかったときだけボタンを出す
      const o = box('<div style="position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:sans-serif"><div style="background:#fff;color:#1E2B33;padding:24px;border-radius:12px;max-width:420px;text-align:center;line-height:1.6"><div style="font-size:17px;font-weight:bold;margin-bottom:6px">経路を ' + n + ' 件読み取りました</div><div style="font-size:13px;color:#555;margin-bottom:16px">「コピーする」を押して、ツールの経路の貼り付け欄に貼ってください。</div><button style="font-size:16px;padding:10px 22px;background:#0F7C7A;color:#fff;border:0;border-radius:8px;cursor:pointer">コピーする</button><button style="font-size:14px;padding:10px 14px;margin-left:8px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer">閉じる</button></div></div>');
      const bs = o.querySelectorAll('button');
      bs[1].onclick = () => o.remove();
      bs[0].onclick = async () => { await copy(); bs[0].textContent = 'コピーしました ✓'; setTimeout(() => o.remove(), 1200); };
    })().catch(e => alert('取得に失敗しました: ' + e));
  }
  const TRANSIT_BOOKMARKLET = 'javascript:' + encodeURIComponent('(' + transitBookmarkletMain.toString() + ')()');

  // ---------- 外部サービス（座標） ----------
  function jsonp(url, timeout) {
    return new Promise((resolve, reject) => {
      const cb = '__atinn_cb' + Date.now() + Math.floor(Math.random() * 1e6);
      const s = document.createElement('script');
      const t = setTimeout(() => { done(); reject(new Error('timeout')); }, timeout || 8000);
      function done() { clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); }
      window[cb] = d => { done(); resolve(d); };
      s.onerror = () => { done(); reject(new Error('network')); };
      s.src = url + (url.includes('?') ? '&' : '?') + 'jsonp=' + cb;
      document.head.appendChild(s);
    });
  }
  // 駅名 → 座標（HeartRails Express）。near に近いものを選ぶ。
  async function lookupStation(name, near) {
    const d = await jsonp('https://express.heartrails.com/api/json?method=getStations&name=' + encodeURIComponent(name));
    const list = (d && d.response && d.response.station) || [];
    if (!list.length) return null;
    let best = list[0];
    if (near) {
      let bd = Infinity;
      for (const s of list) { const dd = Math.hypot(+s.y - near.lat, +s.x - near.lng); if (dd < bd) { bd = dd; best = s; } }
    }
    return { lat: +best.y, lng: +best.x, src: 'HeartRails Express', line: best.line };
  }
  // 住所・地名 → 座標（国土地理院 住所検索）
  async function geocode(q) {
    const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q));
    const a = await r.json();
    if (!Array.isArray(a) || !a.length) return null;
    const c = a[0].geometry.coordinates;
    return { lat: +c[1], lng: +c[0], title: a[0].properties && a[0].properties.title };
  }

  const tried = new Set();
  function knownCoord(name) {
    const k = String(name || '').trim().replace(/駅$/, '');
    return !!(k && (GEO.stations[k] || (state.stationCoords[k] && state.stationCoords[k].lat != null)));
  }
  function stationNamesInUse() {
    const names = new Set();
    const add = n => { n = String(n || '').trim().replace(/駅$/, ''); if (n) names.add(n); };
    if (state.pattern === 'p1') {
      Object.keys(state.p1.routes).forEach(k => { const r = state.p1.routes[k]; if (r.exclude) return; add(r.station); (r.legs || []).forEach((l, i, a) => add(l.to || (i === a.length - 1 ? k : ''))); });
    } else {
      state.p2.routes.forEach(r => { add(r.station); (r.legs || []).forEach(l => add(l.to)); });
    }
    return Array.from(names);
  }
  function nearPoint() {
    if (state.pattern === 'p1') { const p = state.p1.property; if (p.lat !== '' && p.lat != null) return { lat: +p.lat, lng: +p.lng }; }
    else if (state.p2.destLat !== '' && state.p2.destLat != null) return { lat: +state.p2.destLat, lng: +state.p2.destLng };
    return null;
  }
  let resolving = false;
  async function autoResolveStations() {
    if (resolving) return;
    resolving = true;
    let changed = false;
    try {
      for (const n of stationNamesInUse()) {
        if (knownCoord(n) || tried.has(n)) continue;
        tried.add(n);
        try {
          const r = await lookupStation(n, nearPoint());
          if (r) { state.stationCoords[n] = r; changed = true; }
        } catch (e) { /* 取得できなければ手入力 */ }
      }
    } finally { resolving = false; }
    if (changed) { persist(); renderForm(); renderPreview(); }
  }

  // ---------- 取り込み ----------
  function applyImport(prop, parsed, routeDefaults) {
    const keep = { photoIdx: 0, photoCustom: prop.photoCustom, hidePhoto: prop.hidePhoto, tag: prop.tag };
    const snapshot = JSON.parse(JSON.stringify(Object.assign({}, parsed, { photos: undefined })));
    Object.assign(prop, emptyProp(), keep, {
      planUrl: parsed.planUrl || prop.planUrl, planName: parsed.planName || '', name: parsed.name || '', address: parsed.address || '',
      lat: parsed.lat ?? '', lng: parsed.lng ?? '', stations: parsed.stations || [], price: Object.assign({}, parsed.price || {}),
      photos: parsed.photos || [], built: parsed.built || '', structure: parsed.structure || '', floors: parsed.floors || '',
      smoking: parsed.smoking || '', capacity: parsed.capacity || '', equipment: parsed.equipment || '', imported: snapshot,
    });
    if (parsed.fetchedAt) state.baseDate = Calc.todayStr(new Date(parsed.fetchedAt));
    const miss = [];
    if (!prop.name) miss.push('物件名');
    if (prop.lat === '' || prop.lat == null) miss.push('地図の位置（「住所から検索」で入ります）');
    if (!prop.stations.length) miss.push('最寄駅');
    const pv = prop.price;
    if (!pv || (Calc.num(pv.dailyCampaign) ?? Calc.num(pv.dailyList)) === null) miss.push('料金');
    if (routeDefaults) routeDefaults();
    return miss;
  }
  function fillRouteDefaults(route, prop, toName) {
    const s = (prop.stations || [])[0];
    if (!s) return;
    if (!route.station) { route.station = s.name; route.walk = s.walk; }
    if (!route.legs || !route.legs.length || (!route.legs[0].line && route.legs.length === 1)) {
      route.legs = [{ mode: 'train', line: route.station === s.name ? (s.line || '') : '', to: route.legs && route.legs[0] && route.legs[0].to || toName || '' }];
    }
  }
  // 別の物件を入れたら、前の物件の乗車駅・所要時間は消してから、新しい物件の最寄駅で初期値を入れる
  function resetRoutesFor(path) {
    const prop = getPath(path);
    if (path === 'p1.property') { state.p1.routes = {}; MAJOR.forEach(name => fillRouteDefaults(p1Route(name), prop, name)); }
    else { const i = +path.split('.')[2]; state.p2.routes[i] = emptyRoute(); fillRouteDefaults(state.p2.routes[i], prop, state.p2.destName); }
  }

  // もう一方のパターンで取り込んだ物件をそのまま使う（写真・料金も含めて丸ごと写す）
  function copyProp(from, to) {
    const src = getPath(from);
    if (!src || !src.name) return;
    const dst = getPath(to);
    if (dst && dst.name && dst.name !== src.name && !confirm(`「${dst.name}」を「${src.name}」に置き換えます。よろしいですか？`)) return;
    setPath(to, Object.assign(emptyProp(), JSON.parse(JSON.stringify(src))));
    resetRoutesFor(to);
    const now = new Date();
    ui.imported = ui.imported || {};
    const where = from === 'p1.property' ? 'パターン1の物件' : `パターン2の物件${LETTERS[+from.split('.')[2]]}`;
    ui.imported[to] = { name: src.name, got: `${where}から`, miss: [], time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}` };
    persist(); renderForm(); renderPreview(); autoResolveStations();
    toast(`${where}「${src.name}」を使いました`);
  }
  // 「ほかのパターンの物件から使う」ボタン（入力済みの物件だけ）
  function copyRow(path) {
    let label, btns = [];
    if (path === 'p1.property') {
      label = 'パターン2の物件から使う';
      state.p2.properties.forEach((p, i) => { if (p && p.name) btns.push(`<button type="button" class="btn small" data-action="copy-prop" data-from="p2.properties.${i}" data-path="${path}"><span class="prop-letter" style="background:${COLORS[i]};width:18px;height:18px;font-size:10px">${LETTERS[i]}</span>${esc(p.name)}</button>`); });
    } else {
      label = 'パターン1の物件を使う';
      const p = state.p1.property;
      if (p && p.name) btns.push(`<button type="button" class="btn small" data-action="copy-prop" data-from="p1.property" data-path="${path}">${esc(p.name)}</button>`);
    }
    if (!btns.length) return '';
    return `<div class="row copy-row"><span class="muted">または ${label}：</span>${btns.join('')}</div>`;
  }

  function importInto(path, text) {
    if (!text || !text.trim()) { toast('貼り付け欄が空です'); return; }
    const parsed = Parse.parsePlan(text);
    const prop = getPath(path);
    const miss = applyImport(prop, parsed, () => resetRoutesFor(path));
    const now = new Date();
    const got = [`最寄駅${(prop.stations || []).length}件`];
    if ((Calc.num((prop.price || {}).dailyCampaign) ?? Calc.num((prop.price || {}).dailyList)) !== null) got.push('料金');
    if ((prop.photos || []).length) got.push(`写真${prop.photos.length}枚`);
    if (prop.lat !== '' && prop.lat != null) got.push('地図の位置');
    ui.imported = ui.imported || {};
    ui.imported[path] = { name: prop.name || '（物件名なし）', got: got.join('・'), miss, time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}` };
    const ta = document.querySelector(`[data-paste="${path}"]`);
    if (ta) ta.value = '';
    persist(); renderForm(); renderPreview(); autoResolveStations();
    toast(miss.length ? `取り込みました（未取得：${miss.join('・')} → 手入力してください）` : '取り込みました。内容を確認してください');
  }

  // ---------- フォーム ----------
  function renderHowto() {
    return `<details class="card" data-ui="howto" ${ui.open.howto ? 'open' : ''}>
<summary>使い方・ブックマークレット<span class="badge">初回のみ準備</span></summary>
<div class="card-b">
<ol class="howto">
<li>下の黒いボタンを、ブラウザの<b>ブックマークバーにドラッグ</b>して登録します（初回だけ）。</li>
<li>アットインの<b>プランページ</b>（<code>atinn.jp/plan/…</code>）を開き、登録したブックマーク「アットイン取込」をクリック（押すだけでコピーされます）。</li>
<li>このツールの<b>貼り付け欄</b>に貼り付け（Ctrl+V）→「取り込む」。写真・料金・最寄駅・地図座標が入ります。</li>
<li>所要時間は、各駅の枠の「<b>Yahoo!乗換案内</b>」で検索 → 結果のページでブックマーク「<b>乗換取込</b>」をクリック（押すだけでコピー）→ 枠の貼り付け欄に Ctrl+V。乗車時間・乗換・路線がまとめて入ります。</li>
<li>右のプレビューを確認し、<b>PNG／PDF</b>で保存します。</li>
</ol>
<div class="row"><a class="bm" href="${esc(BOOKMARKLET)}" onclick="event.preventDefault();alert('このボタンはクリックではなく、ブックマークバーへドラッグして登録してください。');">アットイン取込</a>
<a class="bm" href="${esc(TRANSIT_BOOKMARKLET)}" onclick="event.preventDefault();alert('このボタンはクリックではなく、ブックマークバーへドラッグして登録してください。');">乗換取込</a>
<span class="muted">← 2つともブックマークバーへドラッグ</span></div>
<p class="muted" style="margin:0">ブックマークレットが使えないときは、プランページで<b>全選択（Ctrl+A）→コピー（Ctrl+C）</b>して貼り付けても、料金・最寄駅などは取り込めます（写真・座標は除く。座標は住所から検索できます）。</p>
</div></details>`;
  }

  function renderPropEditor(path, prop, opts) {
    opts = opts || {};
    const planUrl = /^https?:\/\//.test(prop.planUrl || '') ? prop.planUrl : '';
    const hasCoord = prop.lat !== '' && prop.lat != null && prop.lng !== '' && prop.lng != null;
    // かんたん表示（パターン2の物件A〜C）：貼り付け欄だけ。緯度・経度は取り込みで入るので状態だけ出す
    if (opts.simple) {
      return `<div class="card-b" style="padding:0">
<div class="import-box">
<div class="f"><span>プランページでブックマーク「アットイン取込」を押す → ここに Ctrl+V</span>
<div class="row" style="flex-wrap:nowrap"><input type="text" data-paste="${path}" placeholder="ここに貼り付けると、物件名・住所・最寄駅・料金・写真が入ります">
<button type="button" class="btn small" data-action="import-clip" data-path="${path}">クリップボードから</button></div></div>
${copyRow(path)}
${importedNote(path)}
</div>
<div class="grid">
${inlineField('物件名', inp(`${path}.name`, { ph: 'アットイン六本木4' }))}
${inlineField('住所', inp(`${path}.address`, { ph: '東京都港区西麻布2丁目…' }))}
</div>
<div class="row">${hasCoord
  ? `<span class="muted">地図の位置：✓ 取得済み</span><a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${esc(prop.lat)},${esc(prop.lng)}">Googleマップで確認</a>`
  : `<span class="warn-t">地図の位置：未取得</span><button type="button" class="btn small" data-action="geocode-prop" data-path="${path}">住所から検索</button>`}
${planUrl ? `<a class="btn small" href="${esc(planUrl)}" target="_blank" rel="noopener">プランページ ↗</a>` : ''}</div>
` + renderPropRest(path, prop, opts);
    }
    return `<div class="card-b" style="padding:0">
<div class="import-box">
<div class="f"><span>① プランURL</span>
<div class="row" style="flex-wrap:nowrap">${inp(`${path}.planUrl`, { type: 'url', ph: 'https://atinn.jp/plan/33705' })}
${planUrl ? `<a class="btn primary small" href="${esc(planUrl)}" target="_blank" rel="noopener">開く ↗</a>` : '<span class="btn small" aria-disabled="true" style="opacity:.5">開く ↗</span>'}</div></div>
<p class="muted" style="margin:0">② 開いたプランページで、ブックマーク「<b>アットイン取込</b>」を押す（押すだけでコピーされます）<br>（ブックマークが無ければ、ページで Ctrl+A → Ctrl+C でも可）</p>
<div class="f"><span>③ ここに貼り付け（Ctrl+V で自動取り込み）</span>
<textarea class="paste" data-paste="${path}" placeholder="ここに Ctrl+V で貼り付け"></textarea></div>
${importedNote(path)}
<div class="row"><button type="button" class="btn small" data-action="import" data-path="${path}">取り込む</button>
<button type="button" class="btn small" data-action="import-clip" data-path="${path}">クリップボードから取り込む</button></div>
<p class="muted" style="margin:0">※URLを入れただけでは読み込めません（ブラウザの制限で、ほかのサイトのページを直接読めないため）。</p>
</div>
<div class="grid">
${inlineField('物件名', inp(`${path}.name`, { ph: 'アットイン六本木4' }))}
${inlineField('住所', inp(`${path}.address`, { ph: '東京都港区西麻布2丁目…' }))}
${field('緯度', inp(`${path}.lat`, { ph: '35.6598' }))}
${field('経度', inp(`${path}.lng`, { ph: '139.7218' }))}
</div>
<div class="row"><button type="button" class="btn small" data-action="geocode-prop" data-path="${path}">住所から座標を検索</button>
${hasCoord ? `<a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${esc(prop.lat)},${esc(prop.lng)}">Googleマップで確認</a>` : ''}
<span class="muted">Googleマップの座標（35.66, 139.72）を緯度欄に貼っても入ります</span></div>
` + renderPropRest(path, prop, opts);
  }

  // 貼り付け欄の下に出す「取り込みました」の表示（次に貼るまで残す）
  function importedNote(path) {
    const r = ui.imported && ui.imported[path];
    if (!r) return '';
    return `<div class="muted">✓ ${esc(r.name)} を取り込み（${esc(r.got)}・${esc(r.time)}）${r.miss.length ? `<br><span class="warn-t">未取得：${esc(r.miss.join('・'))} → 手入力してください</span>` : ''}</div>`;
  }

  // 閉じた「料金・写真・強みタグ」の見出しに出す要約
  function propSummary(prop, opts) {
    const pv = prop.price || {}, yen = v => Calc.yen(v);
    const daily = Calc.num(pv.dailyCampaign) ?? Calc.num(pv.dailyList);
    const clean = Calc.num(pv.cleaningCampaign) ?? Calc.num(pv.cleaningList);
    const parts = [daily !== null ? `1日 ${yen(daily)}円` : '<span class="warn-t">料金 未入力</span>'];
    if (clean !== null) parts.push(`清掃 ${yen(clean)}円`);
    if (opts.photos) parts.push(prop.hidePhoto ? '写真なし' : `写真 ${(prop.photos || []).length + (prop.photoCustom ? 1 : 0)}枚`);
    if (opts.tag && prop.tag) parts.push(`タグ「${esc(prop.tag)}」`);
    return parts.join('・');
  }

  // 最寄駅・料金・写真・タグ・詳細（両方の表示で共通）
  function renderPropRest(path, prop, opts) {
    const pv = 'price';
    const imp = prop.imported && prop.imported.price || {};
    const priceField = (k, label) => {
      const changed = prop.imported && String(numOrEmpty(imp[k])) !== String(numOrEmpty(prop.price && prop.price[k]));
      return field(label, inp(`${path}.${pv}.${k}`, { type: 'number', cls: changed ? 'changed' : '' }));
    };
    const stRows = (prop.stations || []).map((s, i) => `<tr>
<td>${inp(`${path}.stations.${i}.name`, { ph: '駅名' })}</td><td>${inp(`${path}.stations.${i}.line`, { ph: '路線' })}</td>
<td class="num">${inp(`${path}.stations.${i}.walk`, { type: 'number', ph: '分' })}</td>
<td class="act"><button type="button" class="x" data-action="del-station" data-path="${path}" data-i="${i}" title="削除">×</button></td></tr>`).join('');
    const photos = opts.photos ? `<div class="sub-h">写真（カードに表示）</div>
<div class="photos">${(prop.photos || []).map((p, i) => `<button type="button" class="${!prop.photoCustom && (prop.photoIdx || 0) === i ? 'on' : ''}" style="background-image:url('${esc(p.data || p.src)}')" data-action="photo" data-path="${path}" data-i="${i}" title="${esc(p.caption || '')}"></button>`).join('')}
${prop.photoCustom ? `<button type="button" class="on" style="background-image:url('${esc(prop.photoCustom)}')" title="アップロードした写真"></button>` : ''}</div>
<div class="row"><label class="btn small">写真をアップロード<input type="file" accept="image/*" hidden data-action="upload-photo" data-path="${path}"></label>
<label class="row muted"><input type="checkbox" data-bind="${path}.hidePhoto" ${prop.hidePhoto ? 'checked' : ''}> 写真を載せない</label>
${(prop.photos || []).length ? '' : '<span class="muted">取り込んだ写真はありません</span>'}</div>` : '';
    return `<div class="sub-h">最寄駅</div>
<table class="mini"><thead><tr><th>駅名</th><th>路線</th><th>徒歩</th><th></th></tr></thead><tbody>${stRows}</tbody></table>
<div class="row"><button type="button" class="btn small" data-action="add-station" data-path="${path}">＋ 駅を追加</button></div>
<details class="more" data-ui="more-${path}" ${ui.open['more-' + path] ? 'open' : ''}><summary>料金・写真・強みタグ <span class="more-sum">${propSummary(prop, opts)}</span></summary>
<div class="more-b">
<div class="sub-h">料金（ご利用料金(1ヶ月以上)・税込）${prop.imported ? '<span class="muted">黄色＝取込値から修正</span>' : ''}</div>
<div class="grid g4">
${priceField('dailyList', '利用料/日（定価）')}${priceField('dailyCampaign', 'キャンペーン/日')}
${priceField('rentList', '賃料/日')}${priceField('utilities', '水道光熱費/日')}
${priceField('cleaningList', '清掃料（定価）')}${priceField('cleaningCampaign', '清掃キャンペーン')}
${priceField('insurancePerMonth', '住宅保険/月')}
</div>
<p class="muted" style="margin:0">キャンペーン価格があればそれを使います（期間表記はチェックしません）。</p>
${photos}
${opts.tag ? `<div class="grid">${field('強みタグ <small>（空欄なら自動。「、」区切りで複数）</small>', inp(`${path}.tag`, { ph: opts.tagPh || '' }), 'all')}</div>` : ''}
</div></details>
<details class="sub"><summary>物件の詳細（築年・構造など）</summary>
<div class="grid g3" style="margin-top:6px">
${field('築年月', inp(`${path}.built`, { ph: '2019年3月' }))}${field('構造', inp(`${path}.structure`))}${field('階建', inp(`${path}.floors`, { type: 'number' }))}
${field('禁煙/喫煙', inp(`${path}.smoking`))}${field('設定人数', inp(`${path}.capacity`, { type: 'number' }))}${field('プラン名', inp(`${path}.planName`))}
</div></details>
</div>`;
  }

  function coordStatus(names) {
    const miss = names.filter(n => n && !knownCoord(n));
    if (!miss.length) return '';
    return `<div class="warn-t">座標不明：${miss.map(n => `${esc(n)} <button type="button" class="btn small" data-action="coord" data-name="${esc(n)}">座標を入力</button>`).join(' ')} <span class="muted">（不明な区間は地図で省略）</span></div>`;
  }

  // 平日（翌月1日以降の最初の平日）10:00発、有料特急・新幹線・高速バス・飛行機なし
  function yahooUrl(fromName, toName) {
    let t = Calc.parse(Calc.defaultCheckIn());
    while ([0, 6].includes(new Date(t).getUTCDay())) t += 86400000;
    const d = new Date(t), pad = n => String(n).padStart(2, '0');
    // 駅名なら「〇〇駅」で検索（同名の地名と区別）。住所・施設名はそのまま
    const isStation = n => !!(GEO.stations[n] || state.stationCoords[n]);
    const st = (n, force) => /駅$|バス|〔/.test(n) ? n : (force || isStation(n)) ? n + '駅' : n;
    return `https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(st(fromName, true))}&to=${encodeURIComponent(st(toName))}&y=${d.getUTCFullYear()}&m=${pad(d.getUTCMonth() + 1)}&d=${pad(d.getUTCDate())}&hh=10&m1=0&m2=0&type=1&ticket=ic&expkind=1&ws=3&s=0&al=0&shin=0&ex=0&hb=0&lb=1&sr=1`;
  }
  function searchLinks(fromName, toName, fromCoord, missing) {
    const links = [];
    if (fromName && toName) {
      links.push(`<a class="btn primary small" target="_blank" rel="noopener" href="${esc(yahooUrl(fromName, toName))}">① Yahoo!乗換案内で検索</a>`);
    } else {
      // ボタンは消さずに、足りないものを示す
      const why = !toName ? (missing || '行き先を入れると検索できます') : '乗車駅を入れると検索できます';
      links.push(`<span class="btn primary small" aria-disabled="true" style="opacity:.45;cursor:not-allowed">① Yahoo!乗換案内で検索</span><span class="muted">${esc(why)}</span>`);
    }
    if (fromCoord && toName) links.push(`<a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${fromCoord.lat},${fromCoord.lng}&destination=${encodeURIComponent(toName)}&travelmode=transit">Googleマップ経路</a>`);
    return links.join('');
  }

  function renderRouteEditor(path, route, o) {
    const info = Sheet.routeInfo(route);
    const legs = (route.legs && route.legs.length ? route.legs : [{ mode: 'train', line: '', to: '' }]);
    const legRows = legs.map((l, i) => `<tr>
<td style="width:74px"><select data-bind="${path}.legs.${i}.mode"><option value="train" ${l.mode !== 'bus' ? 'selected' : ''}>電車</option><option value="bus" ${l.mode === 'bus' ? 'selected' : ''}>バス</option></select></td>
<td>${inp(`${path}.legs.${i}.line`, { ph: i === 0 ? '例：東京メトロ日比谷線' : '例：JR山手線' })}</td>
<td>${inp(`${path}.legs.${i}.to`, { ph: i === legs.length - 1 ? (o.toName || '降車駅') : '乗換駅', list: 'dl-stations' })}</td>
<td class="act">${legs.length > 1 ? `<button type="button" class="x" data-action="del-leg" data-path="${path}" data-i="${i}" title="削除">×</button>` : ''}</td></tr>`).join('');
    const names = [route.station].concat(legs.map((l, i) => l.to || (i === legs.length - 1 ? o.toName : '')));
    const stList = (o.stations || []).map(s => s.name).filter(Boolean);
    return `<div class="route ${o.selected ? 'sel' : ''} ${route.exclude ? 'off' : ''}">
<div class="route-h">${o.head}
<span class="total">合計 <b>${info.total ?? '–'}</b>分${info.display !== null && info.display !== info.total ? `（表示 ${info.display}分）` : ''}・${info.transfers === 0 ? '乗換なし' : info.transfers != null ? `乗換${info.transfers}回` : '–'}</span></div>
<div class="grid g4">
${field('乗車駅／バス停 <small>物件から歩いて乗る駅</small>', `<input data-bind="${path}.station" type="text" value="${esc(route.station || '')}" list="dl-${o.id}" placeholder="${esc(stList[0] || '駅名')}"><datalist id="dl-${o.id}">${stList.map(s => `<option value="${esc(s)}">`).join('')}</datalist>`, 'span2')}
${field('徒歩（分） <small>物件→乗車駅</small>', inp(`${path}.walk`, { type: 'number' }))}
${field('乗車（分） <small>電車・バス</small>', inp(`${path}.ride`, { type: 'number', ph: '乗換込み' }))}
</div>
<table class="mini"><thead><tr><th>手段</th><th>路線</th><th>降車駅（乗換駅）</th><th></th></tr></thead><tbody>${legRows}</tbody></table>
<div class="transit-box">
<div class="row">${searchLinks(route.station || stList[0], o.searchTo || o.toName, o.fromCoord, o.missing)}</div>
<div class="f"><span>② 検索結果のページでブックマーク「乗換取込」を押す → ここに Ctrl+V</span>
<div class="row" style="flex-wrap:nowrap"><input type="text" data-paste-route="${path}" data-to="${esc(o.searchTo || o.toName || '')}" placeholder="ここに貼り付けると、乗車時間・乗換・路線が入ります">
<button type="button" class="btn small" data-action="transit-clip" data-path="${path}" data-to="${esc(o.searchTo || o.toName || '')}">クリップボードから</button></div></div>
${route.note && /Yahoo/.test(route.note) ? `<div class="muted">✓ ${esc(route.note)}</div>` : ''}
</div>
<div class="row"><button type="button" class="btn small" data-action="add-leg" data-path="${path}">＋ 乗換を追加</button></div>
<div class="grid g4">
${field('表示する分 <small>任意</small>', inp(`${path}.display`, { type: 'number', ph: String(info.total ?? '') }))}
${field('乗換回数 <small>任意</small>', inp(`${path}.transfers`, { type: 'number', ph: String(legs.length - 1) }))}
${field('出典URL', inp(`${path}.source`, { type: 'url', ph: '調べたページのURL' }), 'span2')}
</div>
${route.source ? `<div class="row"><a class="muted" href="${esc(route.source)}" target="_blank" rel="noopener">出典を開く ↗</a></div>` : ''}
${o.excludable ? `<label class="row muted"><input type="checkbox" data-bind="${path}.exclude" ${route.exclude ? 'checked' : ''}> この駅はシートに載せない</label>` : ''}
${coordStatus(names)}
</div>`;
  }

  function renderP1() {
    const p = state.p1, prop = p.property;
    const built = Sheet.buildP1(viewState());
    const sel = built.model.selected;
    const coord = prop.lat !== '' && prop.lat != null ? { lat: prop.lat, lng: prop.lng } : null;
    const limit = Calc.num(p.maxMin) || 30;
    const routes = MAJOR.map(name => {
      const r = p1Route(name);
      const info = Sheet.routeInfo(r);
      const over = info.total !== null && info.total > limit;
      const chip = sel.includes(name) ? '<span class="chip">シートに表示</span>'
        : r.exclude ? '<span class="chip gray">載せない</span>'
        : over ? `<span class="chip gray">${limit}分超のため除外</span>`
        : info.ride === null ? '<span class="chip gray">乗車（分）を入れると表示</span>'
        : '<span class="chip gray">4番目以降のため非表示</span>';
      const head = `<b>${esc(name)}</b>${chip}`;
      return renderRouteEditor(`p1.routes.${name}`, r, { id: 'p1-' + name, head, toName: name, stations: prop.stations, fromCoord: coord, selected: sel.includes(name), excludable: true });
    }).join('');
    const propOk = prop.name && prop.lat !== '' && prop.lat != null;
    return `
<details class="card cond-card" id="sec-p1-prop" open><summary><span class="step">1</span>物件を入力<span class="badge ${propOk ? 'ok' : 'ng'}">${propOk ? esc(prop.name) : '未入力'}</span></summary>
<div class="card-b">
<div class="grid align-end">
${field('チェックイン日<br><small>未入力なら翌月1日</small>', inp('p1.checkIn', { type: 'date' }))}
${field('人数', inp('persons', { type: 'number', step: 1 }))}
</div>
${renderPropEditor('p1.property', prop, { simple: true })}
</div></details>
<details class="card" id="sec-p1-routes" open><summary><span class="step">2</span>主要駅までの所要時間<span class="badge ${sel.length ? 'ok' : 'ng'}">${sel.length ? `${sel.length}駅を表示` : '未入力'}</span></summary>
<div class="card-b">
<p class="muted" style="margin:0">所要時間＝<b>物件から乗車駅までの徒歩</b>＋<b>乗車時間</b>（乗換の歩き・待ちを含む。日中・平日の目安）。<b>「乗車（分）」を入れた駅</b>のうち、上限以内の駅から短い順に3つがシートに載ります。</p>
<div class="row"><button type="button" class="btn small" data-action="clear-routes">所要時間をすべてクリア</button><span class="muted">乗車駅は物件の最寄駅に戻ります</span></div>
<div class="grid">${field('載せる上限（徒歩＋乗車）', `<select data-bind="p1.maxMin">${[30, 45, 60, 90, 120].map(v => `<option value="${v}" ${v === limit ? 'selected' : ''}>${v}分以内</option>`).join('')}</select>`)}
<p class="muted" style="margin:0;align-self:end">郊外の物件は 60分・90分 などに広げてください。</p></div>
${routes}
</div></details>
${renderTextCard('p1', built.model)}`;
  }

  // 目的地の検索語：駅名ならそのまま、そうでなければ住所・地名欄を優先
  function destSearchName() {
    const p = state.p2, n = String(p.destName || '').replace(/駅$/, '');
    if (n && (GEO.stations[n] || state.stationCoords[n])) return n;
    return p.destAddress || p.destName || '';
  }
  function renderP2() {
    const p = state.p2;
    const built = Sheet.buildP2(viewState());
    const destOk = p.destName && p.destLat !== '' && p.destLat != null;
    const destCoord = destOk ? { lat: p.destLat, lng: p.destLng } : null;
    const propCards = p.properties.map((prop, i) => {
      const r = p.routes[i];
      const info = Sheet.routeInfo(r);
      const ok = prop.name && info.display !== null;
      const coord = prop.lat !== '' && prop.lat != null ? { lat: prop.lat, lng: prop.lng } : null;
      return `<details class="card prop-card" style="--pc:${COLORS[i]};--pbg:${TINTS[i]}" ${ui.open['p2prop' + i] === false ? '' : 'open'} data-ui="p2prop${i}" id="sec-p2-${i}"><summary><span class="prop-letter" style="background:${COLORS[i]}">${LETTERS[i]}</span>物件${LETTERS[i]}<span class="badge ${ok ? 'ok' : 'ng'}">${prop.name ? esc(prop.name) : '未入力'}${info.display !== null ? `・約${info.display}分` : ''}</span></summary>
<div class="card-b">
${renderPropEditor(`p2.properties.${i}`, prop, { simple: true, photos: true, tag: true, tagPh: (built.model.tags[i] || []).join('、') || '例：運河沿い・11階建' })}
<div class="sub-h">${esc(p.destName || '目的地')}までの所要時間</div>
${renderRouteEditor(`p2.routes.${i}`, r, { id: 'p2-' + i, head: `<b>${LETTERS[i]} → ${esc(p.destName || '目的地')}</b>`, toName: p.destName, searchTo: destSearchName(), missing: '上の「1 目的地と条件」で目的地を入れると検索できます', stations: prop.stations, fromCoord: coord })}
${i > 0 || p.properties.filter(x => x.name).length ? `<div class="row"><button type="button" class="btn small" data-action="clear-prop" data-i="${i}">この物件を空にする</button></div>` : ''}
</div></details>`;
    }).join('');
    return `
<details class="card cond-card" id="sec-p2-dest" open><summary><span class="step">1</span>目的地と条件
<span class="sum-actions"><button type="button" class="btn small" data-action="geocode-dest">住所・地名から座標を検索</button>
${destCoord ? `<a class="btn small" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${esc(p.destLat)},${esc(p.destLng)}">Googleマップで確認</a>` : ''}</span>
<span class="badge ${destOk ? 'ok' : 'ng'}">${destOk ? esc(p.destName) : '未入力'}</span></summary>
<div class="card-b">
<div class="grid">
${field('お客様名 <small>入れると「〇〇様へのご提案」を表示</small>', inp('p2.customer', { ph: '山田' }), 'all')}
</div>
<div class="grid g3 align-end">
${field('チェックイン<br><small>未入力なら翌月1日</small>', inp('p2.checkIn', { type: 'date' }))}
${field('チェックアウト<br><small>未入力なら30日間</small>', inp('p2.checkOut', { type: 'date' }))}
${field('人数', inp('persons', { type: 'number', step: 1 }))}
</div>
<div class="grid">
${field('目的地（シートの表記）', inp('p2.destName', { ph: '大手町' }))}
${field('目的地の種類', `<input data-bind="p2.destLabel" type="text" value="${esc(p.destLabel)}" list="dl-labels"><datalist id="dl-labels"><option value="お勤め先"><option value="学校"><option value="病院"><option value="研修先"><option value="ご実家"></datalist>`)}
</div>
<details class="more" data-ui="dest-geo" ${ui.open['dest-geo'] ? 'open' : ''}><summary>住所・緯度・経度 <span class="more-sum">${destCoord ? '地図の位置：✓ 設定済み' : '<span class="warn-t">地図の位置：未設定（見出しの「住所・地名から座標を検索」で入ります）</span>'}</span></summary>
<div class="more-b"><div class="grid">
${field('住所・地名（座標の検索用）', inp('p2.destAddress', { ph: '〇〇株式会社 本社の住所 など' }), 'all')}
${field('緯度', inp('p2.destLat', { ph: '35.6862' }))}
${field('経度', inp('p2.destLng', { ph: '139.7660' }))}
</div></div></details>
</div></details>
${propCards}
${renderTextCard('p2', built.model)}`;
  }

  function renderTextCard(pat, model) {
    return `<details class="card" data-ui="text-${pat}" ${ui.open['text-' + pat] ? 'open' : ''}><summary><span class="step">✎</span>見出し・注記の修正（任意）</summary>
<div class="card-b"><div class="grid">
${field('見出し <small>空欄なら自動</small>', inp(`${pat}.headline`, { ph: model.title }), 'all')}
${field('サブ見出し', inp(`${pat}.subheadline`, { ph: model.sub }), 'all')}
${field('注記（最下行）', `<textarea data-bind="${pat}.note" rows="3" placeholder="${esc(model.note)}">${esc(state[pat].note || '')}</textarea>`, 'all')}
${field('料金の基準日', inp('baseDate', { type: 'date' }))}
</div></div></details>`;
  }

  function stationDatalist() {
    const names = Object.keys(GEO.stations).concat(Object.keys(state.stationCoords));
    return `<datalist id="dl-stations">${Array.from(new Set(names)).map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
  }

  function renderForm() {
    const form = $('#form');
    // フォーカスとスクロールを保つ
    const ae = document.activeElement;
    const focusKey = ae && ae.dataset && ae.dataset.bind;
    const selStart = ae && 'selectionStart' in ae ? (() => { try { return ae.selectionStart; } catch (e) { return null; } })() : null;
    const pastes = {};
    form.querySelectorAll('textarea[data-paste]').forEach(t => { if (t.value) pastes[t.dataset.paste] = t.value; });
    // いま見ているパターンが空で、前回そのパターンに入力があったときだけ案内する
    const pat = state.pattern, prevAll = prevSaved();
    const prev = !hasPatternContent(state, pat) && hasPatternContent(prevAll, pat) ? prevAll : null;
    const restore = prev ? `<div class="card restore"><div class="card-b" style="padding:10px 14px;flex-direction:row;align-items:center;flex-wrap:wrap">
<span class="muted">前回の${pat === 'p1' ? 'パターン1' : 'パターン2'}の入力（${esc(prevLabel(prev, pat))}）があります。</span>
<button type="button" class="btn small" data-action="restore-prev">前回の入力を復元</button></div></div>` : '';
    form.innerHTML = restore + renderHowto() + (state.pattern === 'p2' ? renderP2() : renderP1()) + stationDatalist();
    Object.keys(pastes).forEach(k => { const t = form.querySelector(`textarea[data-paste="${k}"]`); if (t) t.value = pastes[k]; });
    if (focusKey) {
      const el = form.querySelector(`[data-bind="${CSS.escape(focusKey)}"]`);
      if (el) { el.focus({ preventScroll: true }); if (selStart != null) { try { el.setSelectionRange(selStart, selStart); } catch (e) { /* number input */ } } }
    }
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.value === state.pattern)));
  }

  // ---------- プレビュー ----------
  function viewState() {
    const pat = state.pattern;
    return Object.assign({}, state, { headline: state[pat].headline, subheadline: state[pat].subheadline, note: state[pat].note });
  }
  let lastBuilt = null;
  // 画面上部の進み具合（✓ 済 / ○ まだ）。押すとその欄へ移動する
  function renderProgress() {
    const el = $('#progress');
    if (!el) return;
    const has = v => v !== '' && v != null;
    const item = (ok, label, target, title) => `<button type="button" class="pg ${ok ? 'done' : 'todo'}" data-action="goto" data-target="${target}" title="${esc(title || '')}"><span class="pg-mark">${ok ? '✓' : '○'}</span>${label}</button>`;
    let html = '';
    if (state.pattern === 'p2') {
      const p = state.p2;
      html += `<span class="pg-group">${item(p.destName && has(p.destLat) && has(p.destLng), '目的地', 'sec-p2-dest', '目的地の名前と地図の位置')}</span>`;
      p.properties.forEach((prop, i) => {
        const info = Sheet.routeInfo(p.routes[i]);
        const propOk = !!prop.name && has(prop.lat) && has(prop.lng);
        html += `<span class="pg-group"><span class="pg-letter" style="background:${COLORS[i]}">${LETTERS[i]}</span>${item(propOk, '物件', 'sec-p2-' + i, '物件名と地図の位置')}${item(info.display !== null, '乗換', 'sec-p2-' + i, '目的地までの所要時間')}</span>`;
      });
    } else {
      const prop = state.p1.property;
      const sel = Sheet.buildP1(viewState()).model.selected;
      html += `<span class="pg-group">${item(!!prop.name && has(prop.lat) && has(prop.lng), '物件', 'sec-p1-prop', '物件名と地図の位置')}</span>`;
      html += `<span class="pg-group">${item(sel.length > 0, sel.length ? `主要駅 ${sel.length}駅` : '主要駅', 'sec-p1-routes', 'シートに載る主要駅')}</span>`;
    }
    el.innerHTML = html;
    syncTopbar();
  }

  function renderPreview() {
    renderProgress();
    lastBuilt = Sheet.buildSheet(viewState());
    $('#sheet').innerHTML = lastBuilt.html;
    $('#warnings').innerHTML = Array.from(new Set(lastBuilt.warnings)).map(w => `<div>⚠ ${esc(w)}</div>`).join('');
    fitPreview();
  }
  function fitPreview() {
    const wrap = $('#sheet-wrap');
    const s = Math.min(1, wrap.clientWidth / 1123);
    $('#sheet').style.transform = `scale(${s})`;
    wrap.style.height = Math.round(794 * s) + 'px';
  }
  let pvTimer = null;
  function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, 150); }

  // ---------- 出力 ----------
  function fileBase() {
    const d = state.baseDate || Calc.todayStr();
    const name = state.pattern === 'p1' ? (state.p1.property.name || '物件') : `${state.p2.destName || '目的地'}_3物件`;
    return `アクセス案内_${name}_${d}`.replace(/[\\/:*?"<>|\s]/g, '_');
  }
  function download(url, name) {
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
  // 使っている文字だけのフォント（Google Fonts の text= 指定）を埋め込む
  async function fontCSS(text) {
    const chars = Array.from(new Set((text + '0123456789,.約分円（）()・＋×〜～※ABCN').replace(/\s/g, ''))).join('');
    const url = 'https://fonts.googleapis.com/css2?family=M+PLUS+1p:wght@400;500;700;900&text=' + encodeURIComponent(chars);
    let css = await (await fetch(url)).text();
    const urls = Array.from(new Set(Array.from(css.matchAll(/url\((https:[^)]+)\)/g)).map(m => m[1])));
    for (const u of urls) { const d = await blobToDataURL(await (await fetch(u)).blob()); css = css.split(u).join(d); }
    return css;
  }
  async function renderExportNode() {
    const root = $('#export-root');
    root.innerHTML = Sheet.buildSheet(viewState()).html;
    await document.fonts.ready;
    return root.firstElementChild;
  }
  const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  async function toPng() {
    const node = await renderExportNode();
    let css = '';
    try { css = await fontCSS(node.textContent); } catch (e) { console.warn('font embed failed', e); }
    const opt = { pixelRatio: 2, width: 1123, height: 794, cacheBust: false, imagePlaceholder: PIXEL, backgroundColor: '#F7F6F2' };
    if (css) opt.fontEmbedCSS = css; else opt.skipFonts = true;
    return window.htmlToImage.toPng(node, opt);
  }
  async function busy(btn, fn) {
    const t = btn.textContent; btn.disabled = true; btn.textContent = '作成中…';
    try { await fn(); } catch (e) { console.error(e); toast('作成に失敗しました：' + (e && e.message || e)); }
    finally { btn.disabled = false; btn.textContent = t; }
  }
  async function exportPng() { const url = await toPng(); download(url, fileBase() + '.png'); toast('PNGを保存しました'); }
  async function exportPdf() {
    const png = await toPng();
    // PNGのままだと10MB超になるため、JPEGにしてから埋め込む
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = png; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.fillStyle = '#F7F6F2'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
    pdf.save(fileBase() + '.pdf');
    toast('PDFを保存しました');
  }
  async function doPrint() { await renderExportNode(); window.print(); }

  function saveJson() {
    const built = Sheet.buildSheet(viewState());
    const data = { app: 'atinn-access-sheet', version: VERSION, savedAt: new Date().toISOString(), state, output: { headline: built.model.title, warnings: built.warnings } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    download(url, fileBase() + '.json');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  let toastTimer = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), msg.length > 40 ? 6000 : 3200); }

  // ---------- イベント ----------
  const COORD_PATH = /\.(lat|lng|destLat|destLng)$/;
  function coerce(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || COORD_PATH.test(el.dataset.bind)) {
      const n = Calc.num(el.value);
      return n === null ? '' : n;
    }
    return el.value;
  }
  function onBindInput(el, isChange) {
    const path = el.dataset.bind;
    // 緯度欄に「35.66, 139.72」やGoogleマップURLを貼ったら両方埋める
    if (/\.(lat|destLat)$/.test(path)) {
      const c = Parse.parseCoords(el.value);
      if (c && /[,，\s@]/.test(el.value.trim())) {
        const lngPath = path.replace(/lat$/, 'lng').replace(/Lat$/, 'Lng');
        setPath(path, c.lat); setPath(lngPath, c.lng);
        persist(); renderForm(); renderPreview();
        return;
      }
    }
    setPath(path, coerce(el));
    // 乗車駅を最寄駅から選んだら徒歩分を補完
    const m = /^(p1\.routes\.[^.]+|p2\.routes\.\d)\.station$/.exec(path);
    if (m && isChange) {
      const route = getPath(m[1]);
      const prop = path.startsWith('p1') ? state.p1.property : state.p2.properties[+path.split('.')[2]];
      const s = (prop.stations || []).find(x => x.name === String(el.value).replace(/駅$/, ''));
      if (s) { route.walk = s.walk; if (route.legs && route.legs[0] && !route.legs[0].line) route.legs[0].line = s.line || ''; }
    }
    persist();
    if (isChange) { requestFormRender(); autoResolveStations(); }
    schedulePreview();
  }

  // change 直後にフォームを描き直すと、押しかけたボタンのクリックやTab移動が失われる。
  // マウスを離した後・フォーカス移動の後に描き直す。
  let pointerIsDown = false, pendingForm = false;
  function requestFormRender() {
    if (pointerIsDown) { pendingForm = true; return; }
    setTimeout(renderForm, 0);
  }
  document.addEventListener('pointerdown', () => { pointerIsDown = true; }, true);
  document.addEventListener('pointerup', () => {
    pointerIsDown = false;
    if (pendingForm) { pendingForm = false; setTimeout(renderForm, 0); }
  }, true);

  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset && el.dataset.bind && el.type !== 'checkbox' && el.tagName !== 'SELECT') onBindInput(el, false);
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset && el.dataset.bind) { onBindInput(el, true); return; }
    const act = el.dataset && el.dataset.action;
    if (act === 'load-json') loadJson(el);
    if (act === 'upload-photo') uploadPhoto(el);
  });
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.dataset && d.dataset.ui) { ui.open[d.dataset.ui] = d.open; if (d.dataset.ui === 'howto' && !d.open) { try { localStorage.setItem(STORE_KEY + ':seen', '1'); } catch (er) { /* noop */ } } }
  }, true);
  // 貼り付け欄に貼ったら自動で取り込む
  document.addEventListener('paste', e => {
    const t = e.target;
    if (t.dataset && t.dataset.paste) {
      if (t.tagName === 'INPUT') { e.preventDefault(); importInto(t.dataset.paste, (e.clipboardData || window.clipboardData).getData('text')); }
      else setTimeout(() => importInto(t.dataset.paste, t.value), 0);
    }
    if (t.dataset && t.dataset.pasteRoute) {
      e.preventDefault();
      applyTransit(t.dataset.pasteRoute, (e.clipboardData || window.clipboardData).getData('text'), t.dataset.to);
    }
  });

  // 乗換取込の結果を経路に入れる
  function propForRoute(path) {
    return path.startsWith('p1.') ? state.p1.property : state.p2.properties[+path.split('.')[2]];
  }
  function applyTransit(path, text, toName) {
    const r = Parse.parseTransit(text || '');
    if (!r) { toast('経路を読み取れませんでした。ブックマーク「乗換取込」を登録し直して（使い方の欄から再ドラッグ）、検索結果のページでもう一度押してください'); return; }
    const route = getPath(path);
    const prop = propForRoute(path);
    const near = (prop.stations || []).find(s => s.name === r.from);
    if (route.station !== r.from) route.walk = near ? near.walk : '';
    else if (near && route.walk === '') route.walk = near.walk;
    route.station = r.from;
    route.legs = r.legs.map(l => Object.assign({}, l));
    route.ride = r.ride;
    route.transfers = r.transfers;
    route.display = '';
    route.source = r.url || route.source;
    route.note = `Yahoo!乗換案内から取込（${r.dep}発・乗車${r.ride}分・乗換${r.transfers}回）`;
    persist(); renderForm(); renderPreview(); autoResolveStations();
    const want = String(toName || '').replace(/駅$/, '');
    const msgs = [`${r.from} → ${r.to}：乗車${r.ride}分・乗換${r.transfers === 0 ? 'なし' : r.transfers + '回'}を入れました`];
    if (want && r.to !== want && !r.to.startsWith(want)) msgs.push(`（行き先が「${r.to}」です。${want}の検索結果か確認してください）`);
    if (route.walk === '') msgs.push(`「${r.from}」は物件の最寄駅にないので、徒歩（分）を入れてください`);
    toast(msgs.join(''));
  }

  // 「その他」メニュー：項目を選ぶか、外側を押したら閉じる
  document.addEventListener('click', e => {
    const m = $('#menu');
    if (!m || !m.open) return;
    if (!m.contains(e.target) || e.target.closest('.menu-item')) setTimeout(() => { m.open = false; }, 0);
  }, true);

  document.addEventListener('click', async e => {
    if (e.target.closest('summary .sum-actions')) {
      const a = e.target.closest('a');
      if (!a) e.preventDefault(); // ボタン：開閉させない（リンクはそのまま開く）
      else { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); return; }
    }
    const b = e.target.closest('[data-action]');
    if (!b || b.tagName === 'INPUT') return;
    const act = b.dataset.action, path = b.dataset.path, i = +b.dataset.i;
    switch (act) {
      case 'pattern': state.pattern = b.dataset.value; persist(); renderForm(); renderPreview(); autoResolveStations(); break;
      case 'sample':
        if (!confirm('現在の入力を見本データで置き換えます。よろしいですか？')) return;
        state = normalize(Object.assign(Samples[state.pattern](), { pattern: state.pattern }));
        if (state.pattern === 'p1') state.p2 = defaultState().p2; else state.p1 = defaultState().p1;
        persist(); renderForm(); renderPreview(); break;
      case 'goto': {
        const t = document.getElementById(b.dataset.target);
        if (t) { if (t.tagName === 'DETAILS') t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        break;
      }
      case 'copy-prop': copyProp(b.dataset.from, path); break;
      case 'transit-clip':
        try { applyTransit(path, await navigator.clipboard.readText(), b.dataset.to); }
        catch (er) { toast('クリップボードを読めませんでした。貼り付け欄に Ctrl+V で貼ってください'); }
        break;
      case 'restore-prev': {
        const v = prevSaved();
        if (!v) return;
        // いま見ているパターンの分だけ戻す（もう一方のパターンと、見ているタブはそのまま）
        const pat = state.pattern, old = normalize(v);
        state[pat] = old[pat];
        state.stationCoords = Object.assign({}, old.stationCoords, state.stationCoords);
        if (!hasPatternContent(state, pat === 'p1' ? 'p2' : 'p1')) { state.persons = old.persons; state.baseDate = old.baseDate; }
        persist(); renderForm(); renderPreview(); autoResolveStations(); toast(`前回の${pat === 'p1' ? 'パターン1' : 'パターン2'}の入力を復元しました`);
        break;
      }
      case 'reset':
        if (!confirm('入力をすべて消して新規作成します。よろしいですか？（必要なら先に「データ保存」）')) return;
        { const pat = state.pattern; state = defaultState(); state.pattern = pat; ui.imported = {}; }
        persist(); renderForm(); renderPreview(); break;
      case 'save-json': saveJson(); break;
      case 'png': busy(b, exportPng); break;
      case 'pdf': busy(b, exportPdf); break;
      case 'print': busy(b, doPrint); break;
      case 'import': { const t = $(`textarea[data-paste="${path}"]`); importInto(path, t && t.value); break; }
      case 'import-clip':
        {
          let txt = null;
          try { txt = await navigator.clipboard.readText(); }
          catch (er) { toast('クリップボードを読めませんでした。貼り付け欄に Ctrl+V で貼ってください'); break; }
          importInto(path, txt);
        }
        break;
      case 'add-station': getPath(path).stations.push({ name: '', line: '', walk: '' }); persist(); renderForm(); break;
      case 'del-station': getPath(path).stations.splice(i, 1); persist(); renderForm(); renderPreview(); break;
      case 'add-leg': {
        const r = getPath(path);
        r.legs = r.legs && r.legs.length ? r.legs : [{ mode: 'train', line: '', to: '' }];
        const last = r.legs[r.legs.length - 1];
        r.legs.splice(r.legs.length - 1, 0, { mode: 'train', line: last.line, to: '' });
        last.line = '';
        persist(); renderForm(); renderPreview(); break;
      }
      case 'del-leg': { const r = getPath(path); r.legs.splice(i, 1); persist(); renderForm(); renderPreview(); break; }
      case 'photo': { const p = getPath(path); p.photoIdx = i; p.photoCustom = ''; p.hidePhoto = false; persist(); renderForm(); renderPreview(); break; }
      case 'clear-routes':
        if (!confirm('主要駅までの所要時間をすべて消します。よろしいですか？')) return;
        state.p1.routes = {};
        MAJOR.forEach(name => fillRouteDefaults(p1Route(name), state.p1.property, name));
        persist(); renderForm(); renderPreview(); break;
      case 'clear-prop':
        if (!confirm(`物件${LETTERS[i]}の入力を消します。よろしいですか？`)) return;
        state.p2.properties[i] = emptyProp(); state.p2.routes[i] = emptyRoute(); if (ui.imported) delete ui.imported[`p2.properties.${i}`]; persist(); renderForm(); renderPreview(); break;
      case 'geocode-prop': {
        const p = getPath(path);
        if (!p.address) { toast('住所を入力してください'); return; }
        try { const r = await geocode(p.address); if (!r) { toast('見つかりませんでした'); return; } p.lat = r.lat; p.lng = r.lng; persist(); renderForm(); renderPreview(); toast('座標を入れました：' + (r.title || '')); }
        catch (er) { toast('検索できませんでした。Googleマップで座標を調べて入力してください'); }
        break;
      }
      case 'geocode-dest': {
        const q = state.p2.destAddress || state.p2.destName;
        if (!q) { toast('住所か目的地名を入力してください'); return; }
        try {
          let r = GEO.stations[q.replace(/駅$/, '')] ? { lat: GEO.stations[q.replace(/駅$/, '')][0], lng: GEO.stations[q.replace(/駅$/, '')][1], title: q + '駅' } : await geocode(q);
          if (!r) { toast('見つかりませんでした'); return; }
          state.p2.destLat = r.lat; state.p2.destLng = r.lng; persist(); renderForm(); renderPreview(); autoResolveStations(); toast('座標を入れました：' + (r.title || ''));
        } catch (er) { toast('検索できませんでした。Googleマップで座標を調べて入力してください'); }
        break;
      }
      case 'coord': {
        const name = b.dataset.name;
        let near = nearPoint(), r = null;
        try { r = await lookupStation(name, near); } catch (er) { /* 手入力へ */ }
        if (r && confirm(`「${name}」の座標を駅データから見つけました（${r.line || ''}）。\n${r.lat}, ${r.lng}\nこれを使いますか？`)) {
          state.stationCoords[name] = r;
        } else {
          const v = prompt(`「${name}」の座標を入力してください（Googleマップで右クリック→座標をコピー）\n例：35.6601, 139.7236`);
          const c = Parse.parseCoords(v || '');
          if (!c) { if (v) toast('座標の形式が読めませんでした'); return; }
          state.stationCoords[name] = { lat: c.lat, lng: c.lng, src: '手入力' };
        }
        persist(); renderForm(); renderPreview(); break;
      }
    }
  });

  function loadJson(el) {
    const f = el.files && el.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        state = normalize(d.state || d);
        persist(); renderForm(); renderPreview(); toast('読み込みました');
      } catch (e) { toast('読み込めませんでした（形式が違います）'); }
      el.value = '';
    };
    r.readAsText(f);
  }
  function uploadPhoto(el) {
    const f = el.files && el.files[0];
    if (!f) return;
    const path = el.dataset.path;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, 640 / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const p = getPath(path); p.photoCustom = c.toDataURL('image/jpeg', 0.85); p.hidePhoto = false;
      URL.revokeObjectURL(url); persist(); renderForm(); renderPreview();
    };
    img.src = url;
  }

  // 上部バーの高さ（進み具合で変わる）に合わせて、右のプレビューの固定位置と移動先をずらす
  function syncTopbar() {
    const h = ($('.topbar') || { offsetHeight: 64 }).offsetHeight;
    document.documentElement.style.setProperty('--topbar-h', h + 'px');
  }
  window.addEventListener('resize', () => { fitPreview(); syncTopbar(); });
  renderForm();
  renderPreview();
  if (document.fonts) document.fonts.ready.then(renderPreview);
  autoResolveStations();
})();
