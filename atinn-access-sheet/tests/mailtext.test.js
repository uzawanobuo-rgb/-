// メール用テキスト（見積りExcel【一般用】と同じ書式・計算）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/parse.js');
const M = require('../js/mailtext.js');

const plan = P.parsePlan(fs.readFileSync(path.join(__dirname, '../testdata/plan_pages/30877.json'), 'utf8'));
const prop = { name: plan.name, planName: plan.planName, planUrl: 'https://atinn.jp/plan/30877', price: plan.price, smoking: plan.smoking };

test('メール用テキスト：Excelの見本（平塚・10/1〜10/31・1名）と同じ', () => {
  const st = { pattern: 'p2', persons: 1, checkIn: '2026-10-01', checkOut: '2026-10-31', p1: {}, p2: { properties: [prop] } };
  const t = M.buildMailText(st, '2026-09-29');
  assert.equal(t, [
    '◯ご利用期間',
    '　チェックイン　：2026/10/01(木)(10時)',
    '　チェックアウト：2026/10/31(土)(15時)',
    '　　【合計：31日間】',
    '※見積り有効期限： 2026/10/05(月)',
    '　',
    '■物件名：【おためし入居キャンペーン】アットイン平塚4-1（横浜駅まで電車で約30分）',
    '　URL 　：https://atinn.jp/plan/30877',
    '--［料金内訳］--------------------------',
    '　賃料：　　　　　　　　　2,800円/日',
    '　水道光熱費：　　　　　　　880円/日',
    '　ルームクリーニング代： 0円/契約',
    '　住宅保険：　　　　　　　830円/契約',
    '----------------------------------------',
    '　総額　　　　　　　　：114,910円（1室1名様利用）',
    '----------------------------------------',
    '※禁煙',
    '（月額目安：110,400 円）',
  ].join('\n'));
});

test('メール用テキスト：2名なら 1,100円/日 のオプション料金を足す', () => {
  const st = { pattern: 'p2', persons: 2, checkIn: '2026-10-01', checkOut: '2026-10-31', p1: {}, p2: { properties: [prop] } };
  const t = M.buildMailText(st, '2026-09-29');
  assert.ok(t.includes('　オプション料金：　　　　1,100円/日（2名様入居）'));
  assert.ok(t.includes('：149,010円（1室2名様利用）')); // 114,910 + 1,100×31
  assert.ok(t.includes('（月額目安：143,400 円）'));
});
