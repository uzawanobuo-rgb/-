// オプション（人数・ペット・レンタル品・手入力）の計算
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/options.js');

const PV = { cleaningList: 48400, cleaningCampaign: 24200 };

test('住所から地域を決める', () => {
  assert.equal(O.regionOf('東京都港区芝浦2-8-9'), 'kanto');
  assert.equal(O.regionOf('愛知県名古屋市中区栄1-1'), 'tokai');
  assert.equal(O.regionOf('大阪府大阪市北区梅田1-1'), 'kansai');
  assert.equal(O.regionOf('香川県高松市'), '');
});

test('地域ごとの料金（空気清浄機：関東165円・東海143円）', () => {
  const st = { persons: 1, options: [{ name: '空気清浄機（プラズマクラスター）【禁煙部屋限定】', qty: 1 }] };
  assert.equal(O.calc(st, { address: '東京都港区芝浦', smoking: '禁煙' }, PV, 30).total, 165 * 30);
  assert.equal(O.calc(st, { address: '愛知県名古屋市中区', smoking: '禁煙' }, PV, 30).total, 143 * 30);
  // 喫煙可の部屋では入れない
  const r = O.calc(st, { address: '東京都港区芝浦', smoking: '喫煙可' }, PV, 30);
  assert.equal(r.total, 0);
  assert.match(r.warnings[0], /禁煙部屋のみ/);
});

test('提供エリアの限定（名古屋市内のみ・東京23区のみ）', () => {
  const nagoya = { persons: 1, options: [{ name: '除湿機', qty: 1 }] };
  assert.equal(O.calc(nagoya, { address: '愛知県名古屋市中区' }, PV, 10).total, 770);
  assert.match(O.calc(nagoya, { address: '愛知県豊田市' }, PV, 10).warnings[0], /提供エリア外（名古屋市内のみ）/);
  assert.match(O.calc(nagoya, { address: '東京都港区' }, PV, 10).warnings[0], /関東の一覧にない/);
  const set = { persons: 1, options: [{ name: '追加備品（1セット）', qty: 1 }] };
  assert.equal(O.calc(set, { address: '東京都江東区福住' }, PV, 30).total, 8800);
  assert.match(O.calc(set, { address: '東京都八王子市' }, PV, 30).warnings[0], /提供エリア外/);
});

test('人数・ペット・個数・手入力（割引）', () => {
  const st = { persons: 2, options: [{ name: 'ペット追加', qty: 1 }, { name: 'モバイルデータ通信端末', qty: 2 }, { name: '法人割引', price: -200, unit: 'day', custom: true, qty: 1 }, { name: '鍵追加', price: 3300, unit: 'contract', custom: true, qty: 1 }] };
  const r = O.calc(st, { address: '東京都港区' }, PV, 30);
  // 1日：1,100（2人目）＋1,320（ペット）＋440×2－200 ＝ 3,100円 × 30日、契約：3,300円、ペットで清掃費を定価に（＋24,200円）
  assert.equal(r.perDay, 3100);
  assert.equal(r.cleaningExtra, 24200);
  assert.equal(r.total, 3100 * 30 + 3300 + 24200);
});
