// 料金計算と住宅保険の月数の単体テスト（testdata/ の検算データを使う）
// 実行: node --test atinn-access-sheet/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Calc = require('../js/calc.js');

const priceCases = require(path.join(__dirname, '../testdata/price_cases.json')).cases;
const insCases = require(path.join(__dirname, '../testdata/insurance_months_cases.json')).cases;

for (const c of insCases) {
  test(`保険月数 ${c.check_in}〜${c.check_out} = ${c.months}${c.tentative ? '（暫定）' : ''}`, () => {
    assert.equal(Calc.insuranceMonths(c.check_in, c.check_out), c.months);
  });
}

for (const c of priceCases) {
  test(`料金 case ${c.id} ${c.plan_name}`, () => {
    const pv = c.page_values;
    const r = Calc.calcPrice({
      dailyList: pv.daily_list,
      rentList: pv.rent_list,
      utilities: pv.utilities,
      dailyCampaign: pv.daily_campaign,
      cleaningList: pv.cleaning_list,
      cleaningCampaign: pv.cleaning_campaign,
      insurancePerMonth: pv.insurance_per_month,
    }, c.input.check_in, c.input.check_out);
    const e = c.expected;
    assert.equal(r.days, e.days, 'days');
    assert.equal(r.dailyApplied, e.daily_applied, 'daily_applied');
    if (e.rent_applied !== undefined) assert.equal(r.rentApplied, e.rent_applied, 'rent_applied');
    assert.equal(r.usageFee, e.usage_fee, 'usage_fee');
    assert.equal(r.cleaning, e.cleaning, 'cleaning');
    assert.equal(r.insuranceMonths, e.insurance_months, 'insurance_months');
    assert.equal(r.insurance, e.insurance, 'insurance');
    assert.equal(r.total, e.total, 'total');
    if (e.monthly_estimate !== undefined) assert.equal(r.monthlyEstimate, e.monthly_estimate, 'monthly_estimate');
  });
}

test('日数は両端を含む', () => {
  assert.equal(Calc.daysInclusive('2026-10-01', '2026-10-31'), 31);
  assert.equal(Calc.daysInclusive('2026-12-31', '2027-01-01'), 2);
});

test('応当日：月末がない月は末日', () => {
  assert.equal(Calc.addMonthsClamp('2027-01-31', 1), '2027-02-28');
  assert.equal(Calc.addMonthsClamp('2028-01-31', 1), '2028-02-29');
  assert.equal(Calc.addMonthsClamp('2026-10-15', 3), '2027-01-15');
});

test('キャンペーンがなければ定価', () => {
  const r = Calc.calcPrice({ dailyList: 7460, utilities: 880, cleaningList: 48400, insurancePerMonth: 830 }, '2026-10-01', '2026-10-30');
  assert.equal(r.dailyApplied, 7460);
  assert.equal(r.cleaning, 48400);
  assert.equal(r.total, 7460 * 30 + 48400 + 830);
});

test('パターン1の1か月／3か月プラン', () => {
  const pv = { dailyList: 7460, utilities: 880, dailyCampaign: 3560, cleaningList: 48400, cleaningCampaign: 24200, insurancePerMonth: 830 };
  const p = Calc.planOneThree(pv, '2026-10-01');
  assert.equal(p.one.checkOut, '2026-10-31');
  assert.equal(p.one.days, 31);
  assert.equal(p.one.total, 135390);
  assert.equal(p.three.checkOut, '2026-12-31');
  assert.equal(p.three.days, 92);
  assert.equal(p.three.total, 354210);
  assert.equal(p.three.perMonth, Math.round(354210 / 3));
  assert.equal(p.savingPerMonth, 135390 - Math.round(354210 / 3));
});

test('既定のチェックイン日は翌月1日、既定のチェックアウトは30日間', () => {
  assert.equal(Calc.defaultCheckIn(new Date(2026, 8, 29)), '2026-10-01');
  assert.equal(Calc.defaultCheckIn(new Date(2026, 11, 5)), '2027-01-01');
  assert.equal(Calc.addDays('2026-10-01', 29), '2026-10-30');
});

test('パターン2：物件Aが空でもB・Cだけでシートを作れる', () => {
  const Sheet = require('../js/sheet.js');
  const Samples = require('../js/samples.js');
  const st = Samples.p2();
  st.p2.properties[0] = { name: '', planUrl: '', lat: '', stations: [], price: {}, photos: [] };
  st.p2.routes[0] = {};
  const r = Sheet.buildSheet(st);
  assert.ok(r.html.includes('アットイン飯田橋5-1'));
  assert.equal(r.model.tags[0].length, 0);
  assert.ok(r.model.tags[1].length > 0);
});

test('日付の手入力：年を省いたら基準日以降でいちばん近い日', () => {
  assert.equal(Calc.parseDateInput('10/5', '2026-09-30'), '2026-10-05');
  assert.equal(Calc.parseDateInput('11/15', '2026-10-05'), '2026-11-15');
  assert.equal(Calc.parseDateInput('1/10', '2026-12-20'), '2027-01-10');
  assert.equal(Calc.parseDateInput('1005', '2026-09-30'), '2026-10-05');
  assert.equal(Calc.parseDateInput('10月5日', '2026-09-30'), '2026-10-05');
  assert.equal(Calc.parseDateInput('１０／５', '2026-09-30'), '2026-10-05');
  assert.equal(Calc.parseDateInput('2026/10/5（月）', '2026-09-30'), '2026-10-05');
  assert.equal(Calc.parseDateInput('20261005'), '2026-10-05');
  assert.equal(Calc.parseDateInput('2/30', '2026-09-30'), null);
  assert.equal(Calc.parseDateInput('abc'), null);
  assert.equal(Calc.showDate('2026-10-05'), '2026/10/5（月）');
});

test('目的地を変えたのに経路が前の目的地までのままなら知らせる', () => {
  const Sheet = require('../js/sheet.js');
  const Samples = require('../js/samples.js');
  const st = Samples.p2();
  assert.equal(Sheet.buildSheet(st).warnings.filter(w => /検索し直して/.test(w)).length, 0);
  st.p2.destName = '平井'; st.p2.destLat = 35.7065; st.p2.destLng = 139.8425; // 経路は大手町までのまま
  const g = Sheet.routeEndGap(st, st.p2.routes[0]);
  assert.equal(g.name, '大手町');
  assert.ok(g.km > 5);
  assert.equal(Sheet.buildSheet(st).warnings.filter(w => /検索し直して/.test(w)).length, 3);
});

test('パターン1：利用期間（パターン2と共通）の実際の総額を出す', () => {
  const Sheet = require('../js/sheet.js');
  const Samples = require('../js/samples.js');
  const st = Samples.p1();
  st.checkIn = '2026-10-01'; st.checkOut = '2026-11-15';
  const r = Sheet.buildSheet(st);
  const exp = Calc.calcPrice(st.p1.property.price, '2026-10-01', '2026-11-15');
  assert.equal(r.model.price.total, exp.total);
  assert.equal(r.model.price.days, 46);
  assert.ok(r.html.includes(exp.total.toLocaleString('ja-JP')));
  assert.ok(r.html.includes('10/1（木）〜11/15（日）・46日間'));
});

test('パターン2：設備比較の2ページ目（チェックしたときだけ）', () => {
  const Sheet = require('../js/sheet.js');
  const st = require('../js/samples.js').p2();
  assert.equal(Sheet.buildSheet(st).pages.length, 1);
  st.p2.compare = true;
  const r = Sheet.buildSheet(st);
  assert.equal(r.pages.length, 2);
  assert.ok(r.pages[1].includes('3つのお部屋の比較'));
  assert.ok(r.pages[1].includes('全物件にあり'));   // オートロック・エレベーター・光WiFi・洗濯機は全物件
  assert.ok(r.pages[1].includes('宅配ボックス'));   // 田町2だけにある
  assert.ok(!r.pages[1].includes('ユニットバス'));  // 比べる意味が薄いものは出さない
});
