// 見本データ（reference/ の2枚と testdata/ の値）。画面の「見本を読み込む」で使う。
(function (root) {
  'use strict';
  const PRICE = {
    shinagawa9: { dailyList: 7460, rentList: 6580, utilities: 880, dailyCampaign: 3560, cleaningList: 48400, cleaningCampaign: 24200, insurancePerMonth: 830 },
    monzen: { dailyList: 7660, rentList: 6780, utilities: 880, dailyCampaign: 3820, cleaningList: 48400, cleaningCampaign: 24200, insurancePerMonth: 830 },
    iidabashi: { dailyList: 9020, rentList: 8140, utilities: 880, dailyCampaign: 4940, cleaningList: 48400, cleaningCampaign: 24200, insurancePerMonth: 830 },
    tamachi: { dailyList: 9700, rentList: 8820, utilities: 880, dailyCampaign: 4500, cleaningList: 48400, cleaningCampaign: 24200, insurancePerMonth: 830 },
  };

  function p1() {
    return {
      v: 1, pattern: 'p1', persons: 1, baseDate: '2026-09-29', checkIn: '2026-10-01', checkOut: '2026-10-31',
      p1: {
        property: {
          planUrl: 'https://atinn.jp/plan/33705', planName: '（見本）アットイン六本木4', name: 'アットイン六本木4',
          address: '東京都港区西麻布2丁目', lat: 35.6598549, lng: 139.7218323,
          stations: [{ name: '広尾', line: '東京メトロ日比谷線', walk: 11 }, { name: '乃木坂', line: '東京メトロ千代田線', walk: 15 }, { name: '六本木', line: '都営大江戸線', walk: 16 }, { name: '表参道', line: '', walk: 19 }],
          price: Object.assign({}, PRICE.shinagawa9), photos: [], smoking: '禁煙',
          equipment: 'エレベーター、宅配ボックス、光WiFi使い放題、ユニットバス、深夜電気温水器、コインランドリー、IHコンロ、ソファ、快適テレワーク、禁煙選択', equipmentChecked: true,
        },
        routes: {
          '渋谷': { station: '西麻布', walk: 5, legs: [{ mode: 'bus', line: '都営バス 都01', to: '渋谷' }], ride: 14, display: 20, source: 'https://www.navitime.co.jp/bus/diagram/timelist?departure=00017381&arrival=00016951&line=00004287', note: 'バス停までの徒歩5分は地図上の推定' },
          '新宿': { station: '六本木', walk: 16, legs: [{ mode: 'train', line: '都営大江戸線', to: '新宿' }], ride: 9, source: 'https://www.navitime.co.jp/transfer/searchlist?orvStationCode=00009098&dnvStationCode=00004254&defaultCondition=0' },
          '品川': { station: '広尾', walk: 11, legs: [{ mode: 'train', line: '日比谷線', to: '恵比寿' }, { mode: 'train', line: 'JR山手線', to: '品川' }], ride: 18, display: 30, source: 'https://ekitan.com/transit/route/sf-2934/st-2236' },
          '東京': { station: '広尾', walk: 11, legs: [{ mode: 'train', line: '日比谷線', to: '銀座' }, { mode: 'train', line: '丸ノ内線', to: '東京' }], ride: 20, source: 'https://www.navitime.co.jp/transfer/searchlist?orvStationCode=00002403&dnvStationCode=00006668&defaultCondition=0' },
        },
      },
      stationCoords: {},
    };
  }

  function p2() {
    return {
      v: 1, pattern: 'p2', persons: 1, baseDate: '2026-09-29', checkIn: '2026-10-01', checkOut: '2026-10-30', customer: '〇〇',
      p2: {
        destName: '大手町', destLabel: 'お勤め先', destAddress: '東京都千代田区大手町', destLat: 35.6862, destLng: 139.7660,
        properties: [
          { planUrl: 'https://atinn.jp/plan/33492', planName: '【3ヶ月以上～・ロングSALE】□アットインmini門前仲町5-1', name: 'アットインmini門前仲町5-1', address: '東京都江東区福住', lat: 35.676281, lng: 139.7924957, stations: [{ name: '門前仲町', line: '東京メトロ東西線', walk: 11 }], price: Object.assign({}, PRICE.monzen), photos: [], equipment: 'オートロック、エレベーター、光WiFi使い放題、バス・トイレ別、ガス給湯、温水洗浄便座、洗濯機、IHコンロ、禁煙選択', equipmentChecked: true },
          { planUrl: 'https://atinn.jp/plan/27788', planName: '【スペシャルSALE】アットイン飯田橋5-1', name: 'アットイン飯田橋5-1', address: '東京都新宿区箪笥町', lat: 35.700489, lng: 139.7338257, stations: [{ name: '牛込神楽坂', line: '都営大江戸線', walk: 3 }, { name: '神楽坂', line: '東京メトロ東西線', walk: 6 }], price: Object.assign({}, PRICE.iidabashi), photos: [], equipment: 'オートロック、エレベーター、光WiFi使い放題、ユニットバス、深夜電気温水器、洗濯機、IHコンロ、快適テレワーク、24時間ゴミ出し可能', equipmentChecked: true },
          { planUrl: 'https://atinn.jp/plan/34063', planName: '【3ヶ月以上～・ロングSALE】◆アットイン田町2', name: 'アットイン田町2', address: '東京都港区芝浦', lat: 35.6431923, lng: 139.7535706, stations: [{ name: '田町', line: 'JR山手線', walk: 11 }, { name: '三田', line: '都営三田線', walk: 13 }], price: Object.assign({}, PRICE.tamachi), photos: [], equipment: 'オートロック、エレベーター、宅配ボックス、オンライン警備システム、光WiFi使い放題、ユニットバス、ガス給湯、浴室乾燥機、洗濯機、ガスコンロ、快適テレワーク、24時間ゴミ出し可能', equipmentChecked: true, tag: '運河沿い・11階建' },
        ],
        routes: [
          { station: '門前仲町', walk: 11, legs: [{ mode: 'train', line: '東京メトロ東西線', to: '大手町' }], ride: 6, source: 'https://ekitan.com/transit/route/sf-3192/st-1709' },
          { station: '神楽坂', walk: 6, legs: [{ mode: 'train', line: '東京メトロ東西線', to: '大手町' }], ride: 8, source: 'https://ekitan.com/transit/route/sf-1795/st-1709', note: '最寄りは牛込神楽坂だが大手町へは乗換が要るので神楽坂の方が速い' },
          { station: '三田', walk: 13, legs: [{ mode: 'train', line: '都営三田線', to: '大手町' }], ride: 8, source: 'https://ekitan.com/transit/route/sf-3071/st-1709' },
        ],
      },
      stationCoords: {},
    };
  }

  const M = { p1, p2, PRICE };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnSamples = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
