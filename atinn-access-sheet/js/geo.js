// 座標変換とオクチリニア（縦・横・45度）化（SPEC.md §6.1, §6.2）
(function (root) {
  'use strict';

  const EXP = 0.74;

  // 中心からの相対km（x: 東, y: 北）
  function toKm(center, p) {
    return {
      x: (p.lng - center.lng) * 111.32 * Math.cos(center.lat * Math.PI / 180),
      y: (p.lat - center.lat) * 110.57,
    };
  }

  // 方位角はそのまま、距離 r を r^EXP に圧縮した「単位座標」（画面座標系：y下向き）
  function compress(center, p, exp) {
    const k = toKm(center, p);
    const r = Math.hypot(k.x, k.y);
    if (r === 0) return { x: 0, y: 0 };
    const rr = Math.pow(r, exp || EXP);
    return { x: k.x / r * rr, y: -k.y / r * rr };
  }

  // 点群がパネルの枠 box に収まるように a（倍率）と平行移動を決める。
  // 一様な倍率＋平行移動なので、方位角と距離の順序は保たれる。
  function makeProjection(center, points, box, opts) {
    opts = opts || {};
    const exp = opts.exp || EXP;
    const maxA = opts.maxA || 120; // 近い点ばかりのときに拡大しすぎない
    const minA = opts.minA || 10;
    const us = [{ x: 0, y: 0 }].concat(points.map(p => compress(center, p, exp)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const u of us) { x0 = Math.min(x0, u.x); y0 = Math.min(y0, u.y); x1 = Math.max(x1, u.x); y1 = Math.max(y1, u.y); }
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    let a = Math.min(bw / Math.max(x1 - x0, 1e-6), bh / Math.max(y1 - y0, 1e-6));
    a = Math.max(minA, Math.min(maxA, a));
    // 中心寄せ
    const ox = box.x0 + (bw - (x1 - x0) * a) / 2 - x0 * a;
    const oy = box.y0 + (bh - (y1 - y0) * a) / 2 - y0 * a;
    function project(p) {
      const u = compress(center, p, exp);
      return { x: ox + u.x * a, y: oy + u.y * a };
    }
    return { a, project, origin: { x: ox, y: oy } };
  }

  // p→q を縦横45度の2本以下の線分でつなぐ。候補の曲がり角を2つ返す。
  function octiCorners(p, q) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const sx = Math.sign(dx), sy = Math.sign(dy);
    if (ax < 1 || ay < 1 || Math.abs(ax - ay) < 1) return []; // すでに縦・横・45度
    if (ax > ay) {
      // 斜め ay 分と 横 (ax-ay) 分
      return [
        { x: p.x + sx * ay, y: q.y },        // 斜め→横
        { x: p.x + sx * (ax - ay), y: p.y }, // 横→斜め
      ];
    }
    return [
      { x: q.x, y: p.y + sy * ax },          // 斜め→縦
      { x: p.x, y: p.y + sy * (ay - ax) },   // 縦→斜め
    ];
  }

  // 曲がり角を ref 点から遠い側（外側に膨らむ側）に置く
  function octiSegment(p, q, ref) {
    const cs = octiCorners(p, q);
    if (!cs.length) return [p, q];
    let best = cs[0];
    if (ref) {
      const d0 = Math.hypot(cs[0].x - ref.x, cs[0].y - ref.y);
      const d1 = Math.hypot(cs[1].x - ref.x, cs[1].y - ref.y);
      best = d1 > d0 ? cs[1] : cs[0];
    }
    return [p, best, q];
  }

  function octiPolyline(pts, ref) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = octiSegment(pts[i], pts[i + 1], ref);
      if (i === 0) out.push(seg[0]);
      for (let j = 1; j < seg.length; j++) out.push(seg[j]);
    }
    return out;
  }

  function bearing(v) { return Math.atan2(v.x, -v.y); } // 画面座標で北=0、時計回り

  const M = { EXP, toKm, compress, makeProjection, octiCorners, octiSegment, octiPolyline, bearing };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnGeo = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
