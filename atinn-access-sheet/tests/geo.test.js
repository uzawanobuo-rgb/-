// 座標変換の単体テスト：方位角が保たれること、距離の順序が保たれること、線が縦横45度であること
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Geo = require('../js/geo.js');
const geo = require(path.join(__dirname, '../testdata/geo_tokyo.json'));
const transit = require(path.join(__dirname, '../testdata/transit_cases.json'));

const center = transit.pattern1_roppongi4.property;
const pts = geo.yamanote_loop_clockwise_from_tokyo.concat(geo.major_stations_for_pattern1, geo.landmarks);
const box = { x0: 40, y0: 30, x1: 1000, y1: 440 };

function angDiff(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

test('方位角が保たれる', () => {
  const pr = Geo.makeProjection(center, pts, box);
  const c = pr.project(center);
  for (const p of pts) {
    const k = Geo.toKm(center, p);
    const s = pr.project(p);
    const trueB = Math.atan2(k.x, k.y);
    const drawB = Geo.bearing({ x: s.x - c.x, y: s.y - c.y });
    assert.ok(angDiff(trueB, drawB) < 1e-9, p.name);
  }
});

test('どちらが遠いかの順序が保たれる', () => {
  const pr = Geo.makeProjection(center, pts, box);
  const c = pr.project(center);
  const rows = pts.map(p => {
    const k = Geo.toKm(center, p);
    const s = pr.project(p);
    return { name: p.name, km: Math.hypot(k.x, k.y), px: Math.hypot(s.x - c.x, s.y - c.y) };
  }).sort((a, b) => a.km - b.km);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].px >= rows[i - 1].px - 1e-9, rows[i].name);
});

test('全点がパネルに収まる', () => {
  const pr = Geo.makeProjection(center, pts, box);
  for (const p of pts.concat([center])) {
    const s = pr.project(p);
    assert.ok(s.x >= box.x0 - 1e-6 && s.x <= box.x1 + 1e-6 && s.y >= box.y0 - 1e-6 && s.y <= box.y1 + 1e-6, p.name);
  }
});

test('見本の縮尺に近い（渋谷1.8km≈140px、新宿3.8km≈240px の比）', () => {
  const r1 = Math.pow(1.8, Geo.EXP), r2 = Math.pow(3.8, Geo.EXP);
  assert.ok(Math.abs(r2 / r1 - 240 / 140) < 0.1);
});

test('オクチリニア化：各線分が縦・横・45度', () => {
  const ptsPx = [{ x: 0, y: 0 }, { x: 130, y: 40 }, { x: 170, y: 300 }, { x: 20, y: 310 }, { x: 20, y: 200 }];
  const line = Geo.octiPolyline(ptsPx, { x: 0, y: 0 });
  for (let i = 1; i < line.length; i++) {
    const dx = Math.abs(line[i].x - line[i - 1].x), dy = Math.abs(line[i].y - line[i - 1].y);
    assert.ok(dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9, `segment ${i}`);
  }
  assert.deepEqual(line[0], ptsPx[0]);
  assert.deepEqual(line[line.length - 1], ptsPx[ptsPx.length - 1]);
});
