// プランページ解析の単体テスト。料金の本文は SPEC.md §3.1 の実例（2026-09時点）。
// 実サイトのHTMLは未確認なので、表記ゆれ（全角数字・改行位置）も確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/parse.js');

const PRICE_TEXT = `ご利用料金(１ヶ月以上)
利用料(賃料+水道光熱費)  7,460
賃料:6,580
水道光熱費:880
キャンペーン  1月27日～1月31日までにご利用開始の方限定  3,560
※原則、ご延長時は定価でのご案内となります。
ルーム クリーニング  48,400
キャンペーン  24,200
住宅保険  1ヶ月あたり830`;

const EXPECT = { dailyList: 7460, rentList: 6580, utilities: 880, dailyCampaign: 3560, cleaningList: 48400, cleaningCampaign: 24200, insurancePerMonth: 830 };

test('料金セクション（SPECの実例）', () => {
  assert.deepEqual(P.parsePrice(PRICE_TEXT), EXPECT);
});

test('料金セクション：表のセルが改行・タブで分かれていても読める', () => {
  const t = PRICE_TEXT.replace(/  /g, '\n').replace(/:/g, '：\t');
  assert.deepEqual(P.parsePrice('ほかの本文\n' + t + '\nご予約はこちら'), EXPECT);
});

test('料金セクション：全角数字', () => {
  const t = PRICE_TEXT.replace(/[0-9]/g, d => String.fromCharCode(d.charCodeAt(0) + 0xFEE0)).replace(/,/g, '，');
  assert.deepEqual(P.parsePrice(t), EXPECT);
});

test('料金セクション：キャンペーンなし', () => {
  const t = `ご利用料金(1ヶ月以上)\n利用料(賃料+水道光熱費) 7,460\n賃料:6,580\n水道光熱費:880\nルーム クリーニング 48,400\n住宅保険 1ヶ月あたり830`;
  const r = P.parsePrice(t);
  assert.equal(r.dailyCampaign, null);
  assert.equal(r.cleaningCampaign, null);
  assert.equal(r.cleaningList, 48400);
  assert.equal(r.dailyList, 7460);
});

test('物件名：【】と記号を外す', () => {
  assert.equal(P.stripBrackets('【3ヶ月以上～・ロングSALE】□アットインmini門前仲町5-1'), 'アットインmini門前仲町5-1');
  assert.equal(P.stripBrackets('【3ヶ月以上～・ロングSALE】◆アットイン田町2'), 'アットイン田町2');
});

test('交通：駅名・路線・徒歩分', () => {
  const t = '交通\n東京メトロ日比谷線「広尾」駅 徒歩11分\n東京メトロ千代田線「乃木坂」駅 徒歩15分\n都営大江戸線 六本木駅 徒歩16分\n表参道駅 徒歩19分';
  const s = P.parseStations(t);
  assert.deepEqual(s.map(x => [x.name, x.walk]), [['広尾', 11], ['乃木坂', 15], ['六本木', 16], ['表参道', 19]]);
  assert.equal(s[0].line, '東京メトロ日比谷線');
});

test('Googleマップの座標', () => {
  assert.deepEqual(P.parseCoords('<a href="https://maps.google.com/maps?q=35.6598549,139.7218323&z=16">'), { lat: 35.6598549, lng: 139.7218323 });
  assert.deepEqual(P.parseCoords('https://www.google.com/maps/place/x/@35.676281,139.7924957,17z'), { lat: 35.676281, lng: 139.7924957 });
  assert.deepEqual(P.parseCoords('35.6862, 139.7660'), { lat: 35.6862, lng: 139.766 });
});

test('住所の短縮', () => {
  assert.equal(P.shortAddress('東京都港区西麻布2丁目24-1').upToChome, '東京都港区西麻布2丁目');
  assert.deepEqual([P.shortAddress('東京都江東区福住1-2-3').ward, P.shortAddress('東京都江東区福住1-2-3').town], ['江東区', '福住']);
  assert.equal(P.shortAddress('東京都新宿区箪笥町35').town, '箪笥町');
});

test('ページ全体（ブックマークレットのJSON）', () => {
  const payload = {
    url: 'https://atinn.jp/plan/33705',
    title: '【3ヶ月以上～・ロングSALE】アットイン品川9｜マンスリーマンションのアットイン',
    text: '【3ヶ月以上～・ロングSALE】アットイン品川9\n所在地 東京都港区高輪4丁目1-1\n交通 JR山手線「品川」駅 徒歩9分\n築年月 2019年3月\n構造 鉄筋コンクリート造 地上11階\n全室禁煙\n設定人数 1名\n' + PRICE_TEXT,
    html: '<iframe src="https://maps.google.com/maps?q=35.62,139.73&output=embed">',
  };
  const r = P.parsePlan(JSON.stringify(payload));
  assert.equal(r.name, 'アットイン品川9');
  assert.equal(r.planId, '33705');
  assert.equal(r.address, '東京都港区高輪4丁目1-1');
  assert.equal(r.lat, 35.62);
  assert.equal(r.stations[0].name, '品川');
  assert.equal(r.built, '2019年3月');
  assert.equal(r.floors, 11);
  assert.equal(r.smoking, '禁煙');
  assert.deepEqual(r.price, EXPECT);
});

// 実サイトのプランページ（2026-09-29 取得。testdata/plan_pages/）
const fs = require('node:fs');
const path = require('node:path');
const priceCases = require('../testdata/price_cases.json').cases;
const REAL = {
  '33705': { name: 'アットイン品川9', address: '東京都港区高輪4-19-11', near: ['品川', 8, 'JR山手線'], stations: 5, floors: 4, built: '1976年10月' },
  '33492': { name: 'アットインmini門前仲町5-1', address: '東京都江東区福住1-5-4', near: ['門前仲町', 11, '東京メトロ東西線'], stations: 5, floors: 5, built: '2017年07月' },
  '27788': { name: 'アットイン飯田橋5-1', address: '東京都新宿区箪笥町18-3', near: ['牛込神楽坂', 3, '都営大江戸線'], stations: 6, floors: 9, built: '1987年05月' },
  '30877': { name: 'アットイン平塚4-1', address: '神奈川県平塚市明石町21-25', near: ['平塚', 8, 'JR東海道本線(東京～熱海)'], stations: 1, floors: 10, built: '2025年09月',
    price: { dailyList: 8580, rentList: 7700, utilities: 880, dailyCampaign: 3680, cleaningList: 48400, cleaningCampaign: 0, insurancePerMonth: 830 }, max: 2 },
  '34063': { name: 'アットイン田町2', address: '東京都港区芝浦2-8-9', near: ['芝浦ふ頭', 7, 'ゆりかもめ'], stations: 4, floors: 11, built: '2000年01月' },
};
for (const id of Object.keys(REAL)) {
  test(`実ページ plan/${id}`, () => {
    const page = JSON.parse(fs.readFileSync(path.join(__dirname, `../testdata/plan_pages/${id}.json`), 'utf8'));
    const r = P.parsePlan(page);
    const e = REAL[id];
    assert.equal(r.name, e.name);
    assert.equal(r.address, e.address);
    assert.ok(r.lat > 35 && r.lat < 36 && r.lng > 139 && r.lng < 140, 'coords');
    assert.deepEqual([r.stations[0].name, r.stations[0].walk, r.stations[0].line], e.near);
    assert.equal(r.stations.length, e.stations);
    assert.ok(r.stations.every(s => /^[^\s・]+$/.test(s.name) && s.line), '駅名・路線がきれい');
    assert.equal(r.floors, e.floors);
    assert.equal(r.built, e.built);
    assert.equal(r.smoking, '禁煙');
    // 料金は price_cases.json（ページから読み取った値）と一致
    if (e.max) assert.equal(r.maxCapacity, e.max);
    if (e.price) { assert.deepEqual(r.price, e.price); return; }
    const pc = priceCases.find(c => c.plan_url.endsWith(id) && c.page_values.daily_list);
    const pv = pc.page_values;
    assert.deepEqual(r.price, { dailyList: pv.daily_list, rentList: pv.rent_list, utilities: pv.utilities, dailyCampaign: pv.daily_campaign, cleaningList: pv.cleaning_list, cleaningCampaign: pv.cleaning_campaign, insurancePerMonth: pv.insurance_per_month });
  });
}

test('交通：路線名の中にカッコがある（平塚4-1）', () => {
  const t = '詳細情報\nプラン名\t【おためし入居キャンペーン】アットイン平塚4-1（横浜駅まで電車で約30分）\n住所\t〒254-0042 神奈川県平塚市明石町21-25 Googleマップで開く\n交通\t平塚駅 ( JR東海道本線(東京～熱海) ほか ) 徒歩 8分\n間取り\t1K\t専有面積\t20.59㎡\n総階数\t10階建\n\nほかの物件\n田原町駅徒歩5分の人気物件\n蔵前駅 徒歩7分';
  const r = P.parsePlan(t);
  assert.deepEqual(r.stations, [{ name: '平塚', line: 'JR東海道本線(東京～熱海)', walk: 8 }]);
  assert.equal(r.name, 'アットイン平塚4-1');
  assert.equal(r.address, '神奈川県平塚市明石町21-25');
  assert.equal(r.floors, 10);
});

test('清掃キャンペーン0円（無料）は0として読む。郵便番号は拾わない', () => {
  const t = 'ご利用料金(１ヶ月以上)\n利用料(賃料+水道光熱費)\n8,580\n賃料:7,700\n水道光熱費:880\nキャンペーン\n即日から11月30日までの期間内でご利用の方限定\n3,680\nルーム\nクリーニング\n48,400\nキャンペーン\n0\n住宅保険\n1ヶ月あたり830\nご注意事項\n詳細情報\n住所\t〒254-0042 神奈川県平塚市明石町21-25';
  const r = P.parsePrice(t);
  assert.equal(r.cleaningCampaign, 0);
  assert.equal(r.insurancePerMonth, 830);
});
