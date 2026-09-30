// Yahoo!乗換案内の検索結果（2026-09-29 取得、10/1 10:00発）の読み取りテスト
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/parse.js');
const page = f => fs.readFileSync(path.join(__dirname, '../testdata/transit_pages', f), 'utf8');

test('乗換なし：品川→新宿（3経路のうち乗車がいちばん短いもの）', () => {
  const r = P.parseTransit(page('shinagawa-shinjuku.txt'));
  assert.equal(r.routes.length, 3);
  assert.deepEqual([r.from, r.to, r.ride, r.transfers], ['品川', '新宿', 20, 0]);
  assert.deepEqual(r.legs, [{ mode: 'train', line: 'JR山手線', to: '新宿' }]);
});

test('乗換あり：広尾→恵比寿→品川。乗換の待ち時間は乗車時間に含む', () => {
  const r = P.parseTransit(page('hiroo-shinagawa.txt'));
  assert.deepEqual(r.routes.map(x => x.ride), [24, 22, 33]);
  assert.deepEqual([r.from, r.to, r.ride, r.transfers], ['広尾', '品川', 22, 1]);
  assert.deepEqual(r.legs.map(l => [l.line, l.to]), [['東京メトロ日比谷線', '恵比寿'], ['JR山手線', '品川']]);
});

test('駅まで歩く区間があるときは、最初の駅を出てからを乗車時間にする', () => {
  const r = P.parseTransitRoutes(page('walk-first.txt'))[0];
  assert.equal(r.initialWalk, 10);
  assert.equal(r.from, '乃木坂');
  assert.equal(r.ride, 21); // 乃木坂 10:12発 → 10:33着
  assert.deepEqual(r.legs.map(l => l.line), ['東京メトロ千代田線', '東京メトロ半蔵門線']);
});

test('バス：バス停名と路線名を整える', () => {
  const r = P.parseTransitRoutes(page('bus.txt'))[0];
  assert.equal(r.from, '西麻布');
  assert.deepEqual(r.legs[0], { mode: 'bus', line: '都営バス 都01', to: '渋谷駅前' });
});

test('路線名の整形', () => {
  assert.equal(P.cleanLine('ＪＲ東海道本線(上野東京ライン)高崎行'), 'JR上野東京ライン');
  assert.equal(P.cleanLine('ＪＲ山手線内回り東京・上野方面'), 'JR山手線');
  assert.equal(P.cleanLine('東京メトロ東西線中野行'), '東京メトロ東西線');
  assert.equal(P.cleanStation('大宮(埼玉県)'), '大宮');
  assert.equal(P.cleanStation('渋谷駅前(東側)/都営バス'), '渋谷駅前');
});

test('ブックマークレットのJSONでも読める', () => {
  const r = P.parseTransit(JSON.stringify({ v: 1, src: 'yahoo-transit', url: 'https://transit.yahoo.co.jp/search/result?from=a&to=b', text: page('shinagawa-shinjuku.txt') }));
  assert.equal(r.url, 'https://transit.yahoo.co.jp/search/result?from=a&to=b');
  assert.equal(r.ride, 20);
});

test('ブックマークレットが送るHTML（経路部分）から読む：途中駅は乗換駅にしない', () => {
  const html = page('hiroo-shinagawa.srline.html');
  const r = P.parseTransit({ v: 2, src: 'yahoo-transit', url: 'u', html, text: '' });
  assert.deepEqual([r.from, r.to, r.ride, r.transfers], ['広尾', '品川', 24, 1]);
  assert.deepEqual(r.legs.map(l => [l.line, l.to]), [['東京メトロ日比谷線', '恵比寿'], ['JR山手線', '品川']]);
});

test('画面表示で要約が2行に分かれていても読める', () => {
  const t = page('hiroo-shinagawa.txt').replace(/着(\d+分（乗車)/g, '着\n$1');
  assert.equal(P.parseTransit(t).ride, 22);
});

test('乗換取込：到着地点・乗車地点の位置を地図リンクから読む（行き先が想定の場所かの確認用）', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname, '../testdata/transit_pages/hiroo-shinagawa.srline.html'), 'utf8');
  const r = require('../js/parse.js').parseTransit(JSON.stringify({ v: 2, html, text: '' }));
  assert.equal(r.to, '品川');
  assert.ok(Math.abs(r.toCoord.lat - 35.6285) < 0.001 && Math.abs(r.toCoord.lng - 139.7387) < 0.001);
  assert.ok(Math.abs(r.fromCoord.lat - 35.6522) < 0.001);
});

test('乗換取込：Yahoo!の到着地点が目的地から離れていれば知らせる', () => {
  const Sheet = require('../js/sheet.js');
  const st = require('../js/samples.js').p2();
  st.p2.destLat = 35.7075; st.p2.destLng = 139.8395; // 平井
  const r = st.p2.routes[0];
  r.arrive = { name: '葛西内科皮膚科クリニック', lat: 35.66439, lng: 139.86945 };
  const g = Sheet.routeEndGap(st, r);
  assert.equal(g.arrive, true);
  assert.ok(g.km > 5);
  r.arrive = { name: '医療法人社団俊爽会', lat: 35.7075, lng: 139.8395 };
  assert.equal(Sheet.routeEndGap(st, r), null);
});
