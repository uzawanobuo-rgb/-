// 地域（東京・名古屋・大阪・京都）の判定と、同じ名前の駅の取り違え防止
const test = require('node:test');
const assert = require('node:assert/strict');
const GEO = require('../js/data.js');
const Sheet = require('../js/sheet.js');

test('位置から地域を決める', () => {
  assert.equal(GEO.areaOf(35.6812, 139.7671), 'tokyo');
  assert.equal(GEO.areaOf(35.1709, 136.8815), 'nagoya');
  assert.equal(GEO.areaOf(34.7025, 135.4959), 'osaka');
  assert.equal(GEO.areaOf(34.9858, 135.7588), 'kyoto');
  assert.equal(GEO.areaOf('', ''), 'tokyo');
});

test('1物件の主要駅は地域ごと', () => {
  assert.deepEqual(GEO.areas.nagoya.major.map(s => s.name), ['名古屋', '栄', '金山', '伏見', '千種', '大曽根']);
  assert.deepEqual(GEO.areas.osaka.major.map(s => s.name), ['大阪', '新大阪', 'なんば', '天王寺', '本町', '京橋']);
  assert.deepEqual(GEO.areas.kyoto.major.map(s => s.name), ['京都', '四条', '河原町', '烏丸御池', '二条', '三条']);
  assert.equal(GEO.areas.tokyo.major[0].name, '新宿');
});

test('同じ名前の駅は、その地域の座標を使う（京橋・大宮）', () => {
  const osaka = { pattern: 'p1', p1: { property: { lat: 34.6967, lng: 135.5344 } }, stationCoords: {} };
  const tokyo = { pattern: 'p1', p1: { property: { lat: 35.6762, lng: 139.7700 } }, stationCoords: {} };
  assert.ok(Sheet.makeResolver(osaka)('京橋').lng < 136);
  assert.ok(Sheet.makeResolver(tokyo)('京橋').lng > 139);
  const kyoto = { pattern: 'p2', p2: { destLat: 35.0037, destLng: 135.7597, properties: [] }, stationCoords: {} };
  assert.ok(Sheet.makeResolver(kyoto)('大宮').lng < 136);
  // 別の地域で調べた座標（例：東京の京橋）が残っていても使わない
  osaka.stationCoords = { '京橋': { lat: 35.6766, lng: 139.77 } };
  assert.ok(Sheet.makeResolver(osaka)('京橋').lng < 136);
});
