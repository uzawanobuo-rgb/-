// 路線図パネルの自動生成（SPEC.md §6）
// 入力は座標解決済みのルート。出力はインラインSVG文字列。
(function (root) {
  'use strict';
  const req = typeof require === 'function';
  const Geo = req ? require('./geo.js') : root.AtinnGeo;
  const GEO = req ? require('./data.js') : root.AtinnGeoData;
  const Icons = req ? require('./icons.js') : root.AtinnIcons;

  const C = {
    text: '#1E2B33', sub: '#5B6770', gray: '#8C959B', ring: '#C9CDD0', ringFill: '#F3F1EA', bg: '#FBFAF6',
  };
  const ROUTE_COLORS = [
    { line: '#0F7C7A', text: '#0F7C7A', fill: '#E4F2F1' },
    { line: '#E0662A', text: '#C4531A', fill: '#FCEDE4' },
    { line: '#2F74B5', text: '#2F74B5', fill: '#E6EFF8' },
  ];
  const RING_BASE = ['東京', '新橋', '品川', '大崎', '恵比寿', '渋谷', '新宿', '高田馬場', '池袋', '駒込', '田端', '日暮里', '上野', '秋葉原'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function textW(s, size) {
    let w = 0;
    for (const ch of String(s || '')) w += /[\x20-\x7e]/.test(ch) ? 0.6 : 1;
    return w * size;
  }
  function r1(n) { return Math.round(n * 10) / 10; }
  function pathD(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + r1(p.x) + ' ' + r1(p.y)).join(' '); }
  function kmDist(a, b) { const k = Geo.toKm(a, b); return Math.hypot(k.x, k.y); }

  // ---- 当たり判定 ----
  function rectOverlap(a, b) {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function segHitsRect(p, q, r, pad) {
    pad = pad || 0;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const n = Math.max(1, Math.ceil(len / 5));
    for (let i = 0; i <= n; i++) {
      const x = p.x + (q.x - p.x) * i / n, y = p.y + (q.y - p.y) * i / n;
      if (x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad) return true;
    }
    return false;
  }

  function Layout(W, H) {
    this.W = W; this.H = H; this.rects = []; this.segs = [];
  }
  Layout.prototype.cost = function (r, opt) {
    opt = opt || {};
    let c = 0;
    const m = opt.margin == null ? 6 : opt.margin;
    if (r.x0 < m || r.y0 < m || r.x1 > this.W - m || r.y1 > this.H - (opt.bottom == null ? 22 : opt.bottom)) c += 1e6;
    for (const o of this.rects) {
      if (opt.ignore && opt.ignore.includes(o)) continue;
      const a = rectOverlap(r, o);
      if (a > 0) c += 1000 + a * 10 * (o.weight || 1);
    }
    if (opt.segWeight !== 0) {
      for (const s of this.segs) if (segHitsRect(s.p, s.q, r, 2)) c += (opt.segWeight || 400);
    }
    return c;
  };
  Layout.prototype.add = function (r, weight) { r.weight = weight || 1; this.rects.push(r); return r; };
  Layout.prototype.addPath = function (pts) { for (let i = 1; i < pts.length; i++) this.segs.push({ p: pts[i - 1], q: pts[i] }); };

  // ---- メイン ----
  // spec = {
  //   width, height, mode: 'p1'|'p2',
  //   center: { lat, lng, name, sublabel },
  //   routes: [{ origin?:{lat,lng,name,letter}, walkTo?:{lat,lng,name}, legs:[{mode:'train'|'bus', line, to:{lat,lng,name}}],
  //              callout:{ title, minutes, transfers } }],
  //   landmarks: true|false, yamanote: true|false
  // }
  // 何通りかの拡大率で配置してみて、ラベルの重なりが増えない範囲でいちばん大きく描く
  function renderMap(spec) {
    let best = null;
    // 縦が窮屈なときは、横だけ少し広げてもよい（最大1.3倍。東西・南北の向きは変わらない）
    for (const k of [1, 1.12, 1.25, 1.4, 1.55, 1.7, 1.85, 2]) {
      for (const f of [1, 1.15, 1.3]) {
        const r = renderMapOnce(spec, k * f, k);
        if (r.bad >= 1e5) continue; // 線や駅が枠からはみ出す
        // 拡大するほど見やすいので、拡大の分だけ少しの重なりは許す。横だけの引き伸ばしは控えめに評価
        const score = r.bad - (k - 1) * 1500 - (f - 1) * 900;
        if (!best || score < best.score) best = { score, svg: r.svg };
      }
    }
    return best ? best.svg : renderMapOnce(spec, 1, 1).svg;
  }

  function renderMapOnce(spec, zoomX, zoomY) {
    const W = spec.width || 1043, H = spec.height || 468;
    let bad = 0; // 配置の悪さ（重なり・線とのかぶり）
    const mode = spec.mode;
    const center = spec.center;
    const routes = (spec.routes || []).map((r, i) => Object.assign({ color: ROUTE_COLORS[i % 3], idx: i }, r));
    const L = new Layout(W, H);

    // 1. 投影（方角は正確、距離は圧縮）
    const fitPts = [];
    for (const r of routes) {
      if (r.origin) fitPts.push(r.origin);
      if (r.walkTo) fitPts.push(r.walkTo);
      for (const lg of r.legs) if (lg.to) fitPts.push(lg.to);
    }
    const mx = mode === 'p2' ? 150 : 130;
    const box = { x0: mx, y0: 70, x1: W - mx, y1: H - 60 };
    const proj = Geo.makeProjection(center, fitPts.length ? fitPts : [{ lat: center.lat + 0.01, lng: center.lng + 0.01 }], box, { maxA: 110 });
    // 拡大：物件・駅の範囲の中心を基準に広げ、はみ出したら枠内へずらす
    const P0 = p => proj.project(p);
    const fp0 = [P0(center)].concat(fitPts.map(P0));
    const bx0 = Math.min.apply(null, fp0.map(q => q.x)), bx1 = Math.max.apply(null, fp0.map(q => q.x));
    const by0 = Math.min.apply(null, fp0.map(q => q.y)), by1 = Math.max.apply(null, fp0.map(q => q.y));
    const zx = (bx0 + bx1) / 2, zy = (by0 + by1) / 2;
    const edge = { x: 40, top: 40, bottom: 44 };
    const fit = (lo, hi, min, max) => (hi - lo > max - min ? null : lo < min ? min - lo : hi > max ? max - hi : 0);
    const sx = fit(zx + (bx0 - zx) * zoomX, zx + (bx1 - zx) * zoomX, edge.x, W - edge.x);
    const sy = fit(zy + (by0 - zy) * zoomY, zy + (by1 - zy) * zoomY, edge.top, H - edge.bottom);
    if (sx === null || sy === null) return { bad: 1e9, svg: '' };
    const P = p => { const q = P0(p); return { x: zx + (q.x - zx) * zoomX + sx, y: zy + (q.y - zy) * zoomY + sy }; };
    const cP = P(center);

    // 2. 山手線の輪
    const ringNamesUsed = new Set(RING_BASE);
    const ringByName = {};
    GEO.yamanote.forEach((s, i) => { ringByName[s.name] = i; });
    for (const r of routes) {
      let prev = r.walkTo;
      for (const lg of r.legs) {
        if (isYamanote(lg) && prev && lg.to && prev.name in ringByName && lg.to.name in ringByName) {
          ringNamesUsed.add(prev.name); ringNamesUsed.add(lg.to.name); lg._ring = true; lg._from = prev.name;
        }
        prev = lg.to;
      }
    }
    const ringV = GEO.yamanote.filter(s => ringNamesUsed.has(s.name)).map(s => Object.assign({ name: s.name }, P(s)));
    const ringCtr = ringV.reduce((a, v) => ({ x: a.x + v.x / ringV.length, y: a.y + v.y / ringV.length }), { x: 0, y: 0 });
    const ringEdges = ringV.map((v, i) => Geo.octiSegment(v, ringV[(i + 1) % ringV.length], ringCtr));
    const ringPts = [];
    ringEdges.forEach(e => { for (let j = 0; j < e.length - 1; j++) ringPts.push(e[j]); });
    const ringIdx = {}; ringV.forEach((v, i) => { ringIdx[v.name] = i; });
    function ringPath(fromName, toName) {
      const n = ringV.length, i = ringIdx[fromName], j = ringIdx[toName];
      const fw = (j - i + n) % n, bw = (i - j + n) % n;
      const out = [];
      if (fw <= bw) {
        for (let k = 0; k < fw; k++) { const e = ringEdges[(i + k) % n]; e.forEach((p, t) => { if (t || !out.length) out.push(p); }); }
      } else {
        for (let k = 0; k < bw; k++) { const e = ringEdges[(i - k - 1 + n) % n].slice().reverse(); e.forEach((p, t) => { if (t || !out.length) out.push(p); }); }
      }
      return out;
    }
    const ringInView = ringPts.some(p => p.x > -50 && p.x < W + 50 && p.y > -50 && p.y < H + 50);

    // 3. ルートの形
    const drawn = []; // {pts, style, color}
    const stationMarks = []; // {p, name, color, kind:'board'|'transfer'|'end'}
    const legLabels = []; // {pts, text, color, bus}
    const ends = []; // 吹き出しの基点
    routes.forEach(r => {
      const col = r.color;
      const start = r.origin ? P(r.origin) : cP;
      if (r.origin) r._originP = start;
      let prevGeo = r.walkTo || (r.origin || center);
      let prevP = r.walkTo ? P(r.walkTo) : start;
      if (r.walkTo) {
        drawn.push({ pts: [start, prevP], style: 'walk', color: col.line });
        stationMarks.push({ p: prevP, name: r.walkTo.name, color: col.line, kind: 'board', stop: r.legs[0] && r.legs[0].mode === 'bus' });
      }
      r.legs.forEach((lg, li) => {
        if (!lg.to) return;
        const last = li === r.legs.length - 1;
        let toP = P(lg.to);
        let extraWalk = null;
        if (mode === 'p2' && last) {
          if (kmDist(lg.to, center) < 0.35) toP = cP;
          else extraWalk = [toP, cP];
        }
        let pts = (lg._ring && ringIdx[lg._from] != null) ? ringPath(lg._from, lg.to.name) : Geo.octiSegment(prevP, toP, cP);
        if (!pts.length) pts = [prevP, toP];
        drawn.push({ pts, style: lg.mode === 'bus' ? 'bus' : 'train', color: col.line, ring: !!lg._ring });
        legLabels.push({ pts, text: lg.line || '', color: col.text, bus: lg.mode === 'bus', ring: !!lg._ring });
        if (!last) stationMarks.push({ p: toP, name: lg.to.name, color: col.line, kind: 'transfer' });
        if (extraWalk) {
          drawn.push({ pts: extraWalk, style: 'walk', color: col.line });
          stationMarks.push({ p: toP, name: lg.to.name, color: col.line, kind: 'transfer' });
        }
        if (last && mode === 'p1') ends.push({ r, p: toP });
        prevGeo = lg.to; prevP = toP;
      });
      if (mode === 'p2') ends.push({ r, p: start });
      if (mode === 'p1' && !r.legs.some(lg => lg.to) && r.target) {
        const tp = P(r.target);
        drawn.push({ pts: Geo.octiSegment(prevP, tp, cP), style: 'train', color: col.line });
        ends.push({ r, p: tp });
      }
    });
    drawn.forEach(d => L.addPath(d.pts));
    // 線が枠の外に出る配置（山手線まわりの区間など）は避ける
    drawn.forEach(d => d.pts.forEach(q => { if (q.x < 10 || q.x > W - 10 || q.y < 10 || q.y > H - 10) bad += 2000; }));

    // 4. 固定の占有領域（中心・駅・物件マーカー）
    const cMarkR = mode === 'p2' ? 20 : 16;
    L.add({ x0: cP.x - cMarkR, y0: cP.y - cMarkR, x1: cP.x + cMarkR, y1: cP.y + cMarkR }, 3);
    stationMarks.forEach(s => L.add({ x0: s.p.x - 10, y0: s.p.y - 10, x1: s.p.x + 10, y1: s.p.y + 10 }, 2));
    ends.forEach(e => L.add({ x0: e.p.x - 16, y0: e.p.y - 16, x1: e.p.x + 16, y1: e.p.y + 16 }, 3));

    // 北矢印・凡例（点の少ない隅に置く）
    const hasBus = routes.some(r => r.legs.some(l => l.mode === 'bus'));
    const legRows = hasBus ? ['train', 'bus', 'walk'] : ['train', 'walk'];
    // 凡例と北の矢印は1つの箱にまとめ、ラベルを置いたあとで空いている場所に置く（下の 9.5）
    const legendH = Math.max(legRows.length * 22 + 10, 60), legendW = 128;

    // 5. 中心のラベル（物件名／目的地）
    const cName = center.name || '';
    let cLabel;
    {
      const w = mode === 'p2'
        ? Math.max(150, Math.max(textW(cName, 18), textW(center.sublabel || '', 11)) + 40)
        : textW(cName, 18) + 66;
      const h = 50;
      const cands = [
        { x: cP.x - w / 2 + 0, y: cP.y - 34 - h, tail: 'down' },
        { x: cP.x - w / 2, y: cP.y + 34, tail: 'up' },
        { x: cP.x - w * 0.25, y: cP.y - 34 - h, tail: 'down' },
        { x: cP.x - w * 0.75, y: cP.y - 34 - h, tail: 'down' },
        { x: cP.x - w * 0.25, y: cP.y + 34, tail: 'up' },
        { x: cP.x - w * 0.75, y: cP.y + 34, tail: 'up' },
        { x: cP.x + 34, y: cP.y - h / 2, tail: 'left' },
        { x: cP.x - 34 - w, y: cP.y - h / 2, tail: 'right' },
      ];
      let bc = Infinity;
      for (const c of cands) {
        const rr = { x0: c.x, y0: c.y, x1: c.x + w, y1: c.y + h };
        const cost = L.cost(rr, { segWeight: 250 });
        if (cost < bc) { bc = cost; cLabel = Object.assign({ w, h }, c); }
      }
      bad += bc * 2;
      L.add({ x0: cLabel.x, y0: cLabel.y, x1: cLabel.x + w, y1: cLabel.y + h }, 3);
    }

    // 6. 吹き出し
    const callouts = [];
    ends.forEach(e => {
      const co = e.r.callout || {};
      const w = mode === 'p2' ? Math.max(180, textW(co.title, 13) + 30) : Math.max(170, textW(co.title, 22) + 110);
      const h = mode === 'p2' ? 62 : 70;
      const out = { x: e.p.x - cP.x, y: e.p.y - cP.y };
      const ol = Math.hypot(out.x, out.y) || 1;
      let bestC = null, bcost = Infinity;
      for (let a = 0; a < 16; a++) {
        const ang = a * Math.PI / 8;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        for (const d of [26, 50, 90, 140, 200, 270]) {
          const cx = e.p.x + dx * (d + w / 2), cy = e.p.y + dy * (d + h / 2);
          const rr = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
          let cost = L.cost(rr, { segWeight: 500 });
          const dot = (dx * out.x + dy * out.y) / ol;
          cost += d * 1.2 + (dot < 0 ? -dot * 160 : 0);
          if (cost < bcost) { bcost = cost; bestC = rr; }
        }
      }
      bad += L.cost(bestC, { segWeight: 500 }) * 2;
      L.add(bestC, 3);
      // 引き出し線も、あとから置く駅名などが避けるようにする
      const nx = Math.max(bestC.x0, Math.min(e.p.x, bestC.x1)), ny = Math.max(bestC.y0, Math.min(e.p.y, bestC.y1));
      if (Math.hypot(nx - e.p.x, ny - e.p.y) > 16) L.segs.push({ p: e.p, q: { x: nx, y: ny } });
      callouts.push({ e, rect: bestC, co, w, h });
    });

    // 7. 駅名ラベル
    const stLabels = [];
    const seenSt = new Set();
    const calloutNames = new Set(ends.map(e => e.r.callout && e.r.callout.title).filter(Boolean));
    stationMarks.forEach(s => {
      if (s.kind === 'transfer' && calloutNames.has(s.name)) return;
      const key = s.name + '@' + Math.round(s.p.x) + ',' + Math.round(s.p.y);
      if (seenSt.has(key)) return; seenSt.add(key);
      const size = s.kind === 'board' ? (mode === 'p1' ? 15 : 13) : 13;
      const w = textW(s.name, size), h = size + 2;
      const cands = [
        { x: s.p.x + 14, y: s.p.y + size * 0.35, anchor: 'start' },
        { x: s.p.x - 14, y: s.p.y + size * 0.35, anchor: 'end' },
        { x: s.p.x, y: s.p.y + 26, anchor: 'middle' },
        { x: s.p.x, y: s.p.y - 16, anchor: 'middle' },
        { x: s.p.x + 12, y: s.p.y + 24, anchor: 'start' },
        { x: s.p.x - 12, y: s.p.y - 14, anchor: 'end' },
        // 物件マーカーなどが近くて置けないときの、少し離れた位置
        { x: s.p.x + 30, y: s.p.y + size * 0.35, anchor: 'start', far: 1 },
        { x: s.p.x - 30, y: s.p.y + size * 0.35, anchor: 'end', far: 1 },
        { x: s.p.x, y: s.p.y + 42, anchor: 'middle', far: 1 },
        { x: s.p.x, y: s.p.y - 32, anchor: 'middle', far: 1 },
        { x: s.p.x + 22, y: s.p.y + 36, anchor: 'start', far: 1 },
        { x: s.p.x - 22, y: s.p.y - 26, anchor: 'end', far: 1 },
      ];
      let bl = null, bc = Infinity;
      for (const c of cands) {
        const x0 = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2;
        const rr = { x0, y0: c.y - size, x1: x0 + w, y1: c.y + 3 };
        const cost = L.cost(rr, { segWeight: 120, bottom: 4, margin: 2 }) + (c.far ? 60 : 0);
        if (cost < bc) { bc = cost; bl = { c, rr }; }
      }
      bad += bc;
      L.add(bl.rr, 2);
      stLabels.push({ s, size, pos: bl.c });
    });

    // 8. 路線名ラベル
    const lineLabels = [];
    legLabels.forEach(ll => {
      if (!ll.text && !ll.bus) return;
      // 同じ線路を共有するルート（例：東京行きと上野行きの上野東京ライン）で同じ路線名を重ねて書かない
      const mid = ll.pts[Math.floor(ll.pts.length / 2)];
      if (!ll.bus && lineLabels.some(o => o.c.text === ll.text && ll.pts.some(p => Math.hypot(p.x - o.c.x, p.y - o.c.y) < 260))) return;
      const segs = [];
      for (let i = 1; i < ll.pts.length; i++) segs.push({ p: ll.pts[i - 1], q: ll.pts[i], len: Math.hypot(ll.pts[i].x - ll.pts[i - 1].x, ll.pts[i].y - ll.pts[i - 1].y) });
      segs.sort((a, b) => b.len - a.len);
      const size = 12;
      const texts = [ll.text];
      const short = String(ll.text).replace(/^(東京メトロ|都営|ＪＲ|JR)\s*/, '');
      if (short && short !== ll.text) texts.push(short);
      let bestL = null, bc = Infinity;
      for (const text of texts) {
      if (bc < 1000) break;
      const tw = textW(text, size);
      for (const sg of segs.slice(0, 3)) {
        const dx = sg.q.x - sg.p.x, dy = sg.q.y - sg.p.y;
        const horiz = Math.abs(dy) < 1, vert = Math.abs(dx) < 1;
        for (const t of [0.5, 0.3, 0.7]) {
          const mxp = sg.p.x + dx * t, myp = sg.p.y + dy * t;
          for (const side of [-1, 1]) {
            let c;
            if (ll.bus) {
              const bx = mxp, by = myp;
              const rr = { x0: bx - tw / 2 - 4, y0: by - 14, x1: bx + tw / 2 + 4, y1: by + 36 };
              c = { kind: 'bus', x: bx, y: by, rr };
            } else if (horiz) {
              const y = myp + side * 16 + (side > 0 ? 8 : 0);
              c = { kind: 'h', x: mxp, y, rr: { x0: mxp - tw / 2, y0: y - size, x1: mxp + tw / 2, y1: y + 3 } };
            } else if (vert) {
              const x = mxp + side * 12;
              c = { kind: 'v', x, y: myp + 4, anchor: side > 0 ? 'start' : 'end', rr: side > 0 ? { x0: x, y0: myp - size, x1: x + tw, y1: myp + 5 } : { x0: x - tw, y0: myp - size, x1: x, y1: myp + 5 } };
            } else {
              // 斜め：線に沿って回転
              const ang = Math.atan2(dy, dx) * 180 / Math.PI;
              const rot = (ang > 90 || ang < -90) ? ang + 180 : ang;
              const nx = -Math.sin(rot * Math.PI / 180), ny = Math.cos(rot * Math.PI / 180);
              const x = mxp + nx * side * 17, y = myp + ny * side * 17;
              const half = tw * 0.36 + 8;
              c = { kind: 'd', x, y, rot, side, rr: { x0: x - half, y0: y - half, x1: x + half, y1: y + half } };
            }
            c.text = text;
            const cost = L.cost(c.rr, { segWeight: 60, bottom: 4, margin: 2 }) + Math.abs(t - 0.5) * 40;
            if (cost < bc) { bc = cost; bestL = c; }
          }
          if (ll.bus) break;
        }
      }
      }
      if (bestL && (bc < 1000 || ll.bus)) { bad += bc; L.add(bestL.rr, 1); lineLabels.push({ ll, c: bestL, size }); }
      else bad += 400; // 路線名を書けなかった
    });

    // 9. 山手線の駅名（グレー）
    const ringLabels = [];
    const routeStationNames = new Set(stationMarks.map(s => s.name).concat(routes.map(r => r.callout && r.callout.title)));
    if (spec.yamanote !== false && ringInView) {
      for (const name of GEO.yamanoteLabeled) {
        if (routeStationNames.has(name) || ringIdx[name] == null) continue;
        const v = ringV[ringIdx[name]];
        if (v.x < 20 || v.x > W - 20 || v.y < 20 || v.y > H - 30) continue;
        const w = textW(name, 13);
        const cands = [
          { x: v.x + 14, y: v.y + 5, anchor: 'start' }, { x: v.x - 14, y: v.y + 5, anchor: 'end' },
          { x: v.x, y: v.y - 14, anchor: 'middle' }, { x: v.x, y: v.y + 24, anchor: 'middle' },
        ];
        let ok = null;
        for (const c of cands) {
          const x0 = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2;
          const rr = { x0, y0: c.y - 13, x1: x0 + w, y1: c.y + 3 };
          const dot = { x0: v.x - 8, y0: v.y - 8, x1: v.x + 8, y1: v.y + 8 };
          if (L.cost(rr, { segWeight: 0, bottom: 4, margin: 2 }) === 0 && L.cost(dot, { segWeight: 0, margin: 0, bottom: 0 }) === 0) { ok = { c, rr, dot }; break; }
        }
        if (!ok) continue;
        L.add(ok.rr, 1); L.add(ok.dot, 1);
        ringLabels.push({ v, name, c: ok.c });
      }
    }
    // 「JR山手線」の表示
    let ringName = null;
    if (spec.yamanote !== false && ringInView && !drawn.some(d => d.ring)) {
      const segs = [];
      for (let i = 0; i < ringPts.length; i++) {
        const p = ringPts[i], q = ringPts[(i + 1) % ringPts.length];
        segs.push({ p, q, len: Math.hypot(q.x - p.x, q.y - p.y) });
      }
      segs.sort((a, b) => b.len - a.len);
      const tw = textW('JR山手線', 12);
      outer: for (const sg of segs.slice(0, 8)) {
        for (const t of [0.5, 0.3, 0.7]) {
          const mxp = sg.p.x + (sg.q.x - sg.p.x) * t, myp = sg.p.y + (sg.q.y - sg.p.y) * t;
          const vx = mxp - ringCtr.x, vy = myp - ringCtr.y;
          const vl = Math.hypot(vx, vy) || 1;
          const x = mxp + vx / vl * 22, y = myp + vy / vl * 22;
          const rr = { x0: x - tw / 2, y0: y - 12, x1: x + tw / 2, y1: y + 4 };
          if (L.cost(rr, { segWeight: 0, bottom: 4 }) === 0) { L.add(rr, 1); ringName = { x, y }; break outer; }
        }
      }
    }

    // 9.5 凡例と北（線や文字のない場所。四隅を少し優先）
    let legendPos = null;
    {
      let bc = Infinity;
      const xs = [], ys = [];
      for (let x = 12; x <= W - 12 - legendW; x += 24) xs.push(x);
      xs.push(W - 12 - legendW);
      for (let y = 12; y <= H - 26 - legendH; y += 20) ys.push(y);
      ys.push(H - 26 - legendH);
      for (const x of xs) for (const y of ys) {
        const rr = { x0: x, y0: y, x1: x + legendW, y1: y + legendH };
        const edgeD = Math.min(x - 12, W - 12 - legendW - x) + Math.min(y - 12, H - 26 - legendH - y);
        // 空いている場所が複数あるときは右下を優先（見出し・吹き出しが集まりやすい左上を避ける）
        const cornerD = (W - 12 - rr.x1) + (H - 26 - rr.y1);
        const cost = L.cost(rr, { segWeight: 300, margin: 4, bottom: 20 }) + edgeD * 0.3 + cornerD * 0.05;
        if (cost < bc) { bc = cost; legendPos = { x, y }; }
      }
      bad += Math.max(0, bc - 200);
      L.add({ x0: legendPos.x, y0: legendPos.y, x1: legendPos.x + legendW, y1: legendPos.y + legendH }, 2);
    }

    // 10. ランドマーク（低優先。重なるものは外す）
    const lmOut = [];
    if (spec.landmarks !== false) {
      const importantPts = [cP].concat(stationMarks.map(s => s.p), ends.map(e => e.p));
      const cand = GEO.landmarks.map(lm => {
        const icon = Icons.iconFor(lm);
        if (!icon) return null;
        const p = P(lm);
        const dmin = Math.min.apply(null, importantPts.map(q => Math.hypot(q.x - p.x, q.y - p.y)));
        return { lm, icon, p, dmin };
      }).filter(Boolean).filter(c => c.p.x > 0 && c.p.x < W && c.p.y > 0 && c.p.y < H).sort((a, b) => a.dmin - b.dmin);
      for (const c of cand) {
        if (lmOut.length >= 4) break;
        const name = Icons.SHORT_NAME[c.lm.id] || c.lm.name.replace(/（.*?）/, '');
        const b = c.icon.box(name);
        let placed = null;
        for (const off of [[0, 0], [0, -24], [0, 24], [-30, 0], [30, 0], [-24, -24], [24, -24], [-24, 24], [24, 24], [0, -48], [0, 48]]) {
          const x = c.p.x + off[0], y = c.p.y + off[1];
          const rr = { x0: x + b.x0, y0: y + b.y0, x1: x + b.x1, y1: y + b.y1 };
          if (L.cost(rr, { segWeight: 1, bottom: 20, margin: 4 }) === 0) { placed = { x, y, rr }; break; }
        }
        if (!placed) continue;
        L.add(placed.rr, 1);
        lmOut.push({ c, name, x: placed.x, y: placed.y });
      }
    }

    // ---- 描画 ----
    const s = [];
    s.push(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(spec.ariaLabel || '路線概要図')}" style="display:block;font-family:'M PLUS 1p',sans-serif;">`);
    s.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}"/>`);
    if (spec.yamanote !== false && ringInView && ringPts.length > 2) {
      const d = pathD(ringPts) + ' Z';
      s.push(`<path d="${d}" fill="${C.ringFill}"/>`);
      s.push(`<path d="${d}" fill="none" stroke="${C.ring}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    // ランドマーク
    lmOut.forEach(l => s.push(`<g transform="translate(${r1(l.x)},${r1(l.y)})">${l.c.icon.draw(esc(l.name))}</g>`));
    // 山手線の駅名
    ringLabels.forEach(l => {
      s.push(`<circle cx="${r1(l.v.x)}" cy="${r1(l.v.y)}" r="6" fill="#FFFFFF" stroke="${C.gray}" stroke-width="3"/>`);
      s.push(`<text x="${r1(l.c.x)}" y="${r1(l.c.y)}" text-anchor="${l.c.anchor}" font-size="13" font-weight="700" fill="${C.gray}">${esc(l.name)}</text>`);
    });
    if (ringName) s.push(`<text x="${r1(ringName.x)}" y="${r1(ringName.y)}" text-anchor="middle" font-size="12" font-weight="700" fill="${C.gray}">JR山手線</text>`);
    // 線：徒歩→バス→電車の順
    drawn.filter(d => d.style === 'walk').forEach(d => s.push(`<path d="${pathD(d.pts)}" fill="none" stroke="${d.color}" stroke-width="4" stroke-dasharray="2 8" stroke-linecap="round"/>`));
    drawn.filter(d => d.style !== 'walk').forEach(d => {
      const dash = d.style === 'bus' ? ' stroke-dasharray="15 9"' : '';
      s.push(`<path d="${pathD(d.pts)}" fill="none" stroke="${d.color}" stroke-width="${d.ring ? 12 : 8}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`);
    });
    // 路線名
    lineLabels.forEach(({ ll, c, size }) => {
      if (c.kind === 'bus') {
        s.push(`<g transform="translate(${r1(c.x)},${r1(c.y)})"><rect x="-19" y="-13" width="38" height="25" rx="6" fill="${ll.color}"/><rect x="-13" y="-8" width="11" height="8" rx="1.5" fill="#FFFFFF"/><rect x="2" y="-8" width="11" height="8" rx="1.5" fill="#FFFFFF"/><circle cx="-9" cy="12" r="4.5" fill="${C.text}"/><circle cx="9" cy="12" r="4.5" fill="${C.text}"/></g>`);
        if (c.text) s.push(`<text x="${r1(c.x)}" y="${r1(c.y + 32)}" text-anchor="middle" font-size="11" font-weight="700" fill="${ll.color}">${esc(c.text)}</text>`);
      } else if (c.kind === 'd') {
        s.push(`<text x="${r1(c.x)}" y="${r1(c.y)}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" font-weight="700" fill="${ll.color}" transform="rotate(${r1(c.rot)} ${r1(c.x)} ${r1(c.y)})">${esc(c.text)}</text>`);
      } else if (c.kind === 'v') {
        s.push(`<text x="${r1(c.x)}" y="${r1(c.y)}" text-anchor="${c.anchor}" font-size="${size}" font-weight="700" fill="${ll.color}">${esc(c.text)}</text>`);
      } else {
        s.push(`<text x="${r1(c.x)}" y="${r1(c.y)}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${ll.color}">${esc(c.text)}</text>`);
      }
    });
    // 駅
    const seenDot = new Set();
    stationMarks.forEach(st => {
      const k = Math.round(st.p.x) + ',' + Math.round(st.p.y);
      if (seenDot.has(k)) return; seenDot.add(k);
      s.push(`<circle cx="${r1(st.p.x)}" cy="${r1(st.p.y)}" r="${mode === 'p1' && st.kind === 'board' ? 8 : 7}" fill="#FFFFFF" stroke="${st.color}" stroke-width="3"/>`);
    });
    stLabels.forEach(({ s: st, size, pos }) => {
      const fill = st.kind === 'board' ? C.text : C.sub;
      s.push(`<text x="${r1(pos.x)}" y="${r1(pos.y)}" text-anchor="${pos.anchor}" font-size="${size}" font-weight="700" fill="${fill}">${esc(st.name)}</text>`);
    });
    // 吹き出し（引き出し線→枠）
    callouts.forEach(({ e, rect, co, w, h }) => {
      const col = e.r.color;
      const nx = Math.max(rect.x0, Math.min(e.p.x, rect.x1)), ny = Math.max(rect.y0, Math.min(e.p.y, rect.y1));
      const dist = Math.hypot(nx - e.p.x, ny - e.p.y);
      if (dist > 16) {
        const ux = (nx - e.p.x) / dist, uy = (ny - e.p.y) / dist;
        s.push(`<line x1="${r1(e.p.x + ux * 15)}" y1="${r1(e.p.y + uy * 15)}" x2="${r1(nx)}" y2="${r1(ny)}" stroke="${col.line}" stroke-width="1.5"/>`);
      }
      const x = rect.x0, y = rect.y0;
      const tr = co.transfers === 0 ? '乗換なし' : (co.transfers > 0 ? `乗換${co.transfers}回` : '');
      const mins = co.minutes != null && co.minutes !== '' ? co.minutes : '–';
      s.push(`<g><rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${h}" rx="12" fill="${col.fill}" stroke="${col.line}" stroke-width="1.5"/>`);
      if (mode === 'p2') {
        s.push(`<text x="${r1(x + 14)}" y="${r1(y + 21)}" font-size="13" font-weight="700" fill="${C.sub}">${esc(co.title)}</text>`);
        s.push(`<text x="${r1(x + 14)}" y="${r1(y + 51)}" font-size="14" font-weight="700" fill="${col.text}">約<tspan font-size="28" font-weight="900">${esc(mins)}</tspan>分</text>`);
        s.push(`<text x="${r1(x + w - 14)}" y="${r1(y + 51)}" text-anchor="end" font-size="12" font-weight="700" fill="${col.text}">${tr}</text></g>`);
      } else {
        s.push(`<text x="${r1(x + 16)}" y="${r1(y + 30)}" font-size="22" font-weight="900" fill="${C.text}">${esc(co.title)}</text>`);
        s.push(`<text x="${r1(x + 16)}" y="${r1(y + 59)}" font-size="14" font-weight="700" fill="${col.text}">約<tspan font-size="26" font-weight="900">${esc(mins)}</tspan>分</text>`);
        s.push(`<text x="${r1(x + w - 14)}" y="${r1(y + 59)}" text-anchor="end" font-size="11" font-weight="700" fill="${col.text}">${tr}</text></g>`);
      }
    });
    // 終点マーカー（p1：主要駅）／物件マーカー（p2）
    ends.forEach(e => {
      const col = e.r.color;
      if (mode === 'p1') {
        s.push(`<circle cx="${r1(e.p.x)}" cy="${r1(e.p.y)}" r="13" fill="${col.line}" stroke="#FFFFFF" stroke-width="4"/>`);
      } else {
        s.push(`<circle cx="${r1(e.p.x)}" cy="${r1(e.p.y)}" r="14" fill="${col.line}" stroke="#FFFFFF" stroke-width="4"/>`);
        s.push(`<text x="${r1(e.p.x)}" y="${r1(e.p.y + 5)}" text-anchor="middle" font-size="13" font-weight="900" fill="#FFFFFF">${esc(e.r.origin && e.r.origin.letter || '')}</text>`);
      }
    });
    // 中心
    {
      const cl = cLabel;
      const tailY = cl.tail === 'down' ? cl.y + cl.h : cl.y;
      const tx = Math.max(cl.x + 16, Math.min(cP.x, cl.x + cl.w - 16));
      const my = cl.y + cl.h / 2;
      const tail = cl.tail === 'down'
        ? `${r1(tx - 12)},${r1(tailY)} ${r1(tx)},${r1(tailY + 14)} ${r1(tx + 12)},${r1(tailY)}`
        : cl.tail === 'up' ? `${r1(tx - 12)},${r1(tailY)} ${r1(tx)},${r1(tailY - 14)} ${r1(tx + 12)},${r1(tailY)}`
        : cl.tail === 'left' ? `${r1(cl.x)},${r1(my - 12)} ${r1(cl.x - 14)},${r1(my)} ${r1(cl.x)},${r1(my + 12)}`
        : `${r1(cl.x + cl.w)},${r1(my - 12)} ${r1(cl.x + cl.w + 14)},${r1(my)} ${r1(cl.x + cl.w)},${r1(my + 12)}`;
      if (mode === 'p2') {
        s.push(`<g><circle cx="${r1(cP.x)}" cy="${r1(cP.y)}" r="30" fill="${C.text}" opacity="0.1"/><circle cx="${r1(cP.x)}" cy="${r1(cP.y)}" r="16" fill="${C.text}" stroke="#FFFFFF" stroke-width="4"/><path d="M${r1(cP.x - 8)} ${r1(cP.y)} L${r1(cP.x - 2)} ${r1(cP.y + 6)} L${r1(cP.x + 9)} ${r1(cP.y - 6)}" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
        s.push(`<rect x="${r1(cl.x)}" y="${r1(cl.y)}" width="${r1(cl.w)}" height="${cl.h}" rx="10" fill="${C.text}"/><polygon points="${tail}" fill="${C.text}"/>`);
        s.push(`<text x="${r1(cl.x + cl.w / 2)}" y="${r1(cl.y + 20)}" text-anchor="middle" font-size="11" font-weight="700" fill="#9FD9D4">${esc(center.sublabel || '目的地')}</text>`);
        s.push(`<text x="${r1(cl.x + cl.w / 2)}" y="${r1(cl.y + 41)}" text-anchor="middle" font-size="18" font-weight="900" fill="#FFFFFF">${esc(cName)}</text></g>`);
      } else {
        s.push(`<g><circle cx="${r1(cP.x)}" cy="${r1(cP.y)}" r="24" fill="${C.text}" opacity="0.12"/><circle cx="${r1(cP.x)}" cy="${r1(cP.y)}" r="11" fill="${C.text}" stroke="#FFFFFF" stroke-width="3"/>`);
        s.push(`<rect x="${r1(cl.x)}" y="${r1(cl.y)}" width="${r1(cl.w)}" height="${cl.h}" rx="10" fill="${C.text}"/><polygon points="${tail}" fill="${C.text}"/>`);
        s.push(`<g transform="translate(${r1(cl.x + 14)},${r1(cl.y + 9)})" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"><rect x="0" y="4" width="20" height="26" rx="2"/><line x1="6" y1="10" x2="6" y2="12"/><line x1="14" y1="10" x2="14" y2="12"/><line x1="6" y1="17" x2="6" y2="19"/><line x1="14" y1="17" x2="14" y2="19"/></g>`);
        s.push(`<text x="${r1(cl.x + 44)}" y="${r1(cl.y + 32)}" font-size="18" font-weight="900" fill="#FFFFFF">${esc(cName)}</text></g>`);
      }
    }
    // 凡例と北
    {
      const lx = legendPos.x, ly = legendPos.y;
      s.push(`<g transform="translate(${r1(lx + 10)},${r1(ly + 14)})" font-size="12" fill="${C.sub}"><rect x="-10" y="-14" width="${legendW}" height="${legendH}" rx="8" fill="#FFFFFF" opacity="0.92"/>`);
      legRows.forEach((k, i) => {
        const y = i * 22;
        const st = k === 'train' ? 'stroke-width="5"' : k === 'bus' ? 'stroke-width="5" stroke-dasharray="10 6"' : 'stroke-width="3.5" stroke-dasharray="2 7"';
        s.push(`<line x1="0" y1="${y}" x2="34" y2="${y}" stroke="${C.sub}" ${st} stroke-linecap="round"/><text x="44" y="${y + 4}">${k === 'train' ? '電車' : k === 'bus' ? 'バス' : '徒歩'}</text>`);
      });
      s.push(`</g>`);
      const nx = lx + legendW - 22, ny = ly + legendH / 2 - 6;
      s.push(`<g transform="translate(${r1(nx)},${r1(ny)})" fill="none" stroke="${C.gray}" stroke-width="1.5"><line x1="0" y1="12" x2="0" y2="-14"/><polyline points="-6,-6 0,-14 6,-6"/></g><text x="${r1(nx)}" y="${r1(ny + 27)}" text-anchor="middle" font-size="11" fill="${C.gray}">N</text>`);
    }
    s.push('</svg>');
    return { bad, svg: s.join('\n') };
  }

  function isYamanote(lg) { return lg && lg.mode !== 'bus' && /山手線/.test(lg.line || ''); }

  const M = { renderMap, ROUTE_COLORS, textW, esc };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnMap = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
