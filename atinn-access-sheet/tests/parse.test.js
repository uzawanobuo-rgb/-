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
