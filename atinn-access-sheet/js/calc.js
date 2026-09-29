// 料金計算・日付計算（SPEC.md §4）
// ブラウザでは window.AtinnCalc、Node では require() で使う。
(function (root) {
  'use strict';

  // 'YYYY-MM-DD' ⇔ UTC日付（タイムゾーンの影響を受けないようにUTCで扱う）
  function parse(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) throw new Error('日付の形式が不正です: ' + s);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  function fmt(t) {
    const d = new Date(t);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  const DAY = 86400000;

  function addDays(s, n) { return fmt(parse(s) + n * DAY); }

  // 両端を含む日数（10/1〜10/31 = 31日）
  function daysInclusive(ci, co) { return Math.round((parse(co) - parse(ci)) / DAY) + 1; }

  // n か月後の応当日。応当日がない月はその月の末日。
  function addMonthsClamp(s, n) {
    const d = new Date(parse(s));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return fmt(Date.UTC(y, m, Math.min(day, last)));
  }

  // 住宅保険の月数：応当日の前日までを1か月とし、1日でもはみ出したら次の月。
  // チェックアウト日＝応当日の場合は次の月に入る扱い（暫定。SPEC §9-1）。
  function insuranceMonths(ci, co) {
    const end = parse(co);
    let n = 1;
    while (parse(addMonthsClamp(ci, n)) <= end) n++;
    return n;
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/[,，円\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  // pv: { dailyList, rentList, utilities, dailyCampaign, cleaningList, cleaningCampaign, insurancePerMonth }
  function calcPrice(pv, ci, co) {
    const dailyCampaign = num(pv.dailyCampaign);
    const dailyList = num(pv.dailyList) ?? ((num(pv.rentList) ?? 0) + (num(pv.utilities) ?? 0));
    const dailyApplied = dailyCampaign ?? dailyList;
    const utilities = num(pv.utilities) ?? 0;
    const days = daysInclusive(ci, co);
    const usageFee = dailyApplied * days;
    const cleaning = num(pv.cleaningCampaign) ?? num(pv.cleaningList) ?? 0;
    const insMonths = insuranceMonths(ci, co);
    const insurance = (num(pv.insurancePerMonth) ?? 0) * insMonths;
    return {
      checkIn: ci, checkOut: co, days,
      dailyApplied, rentApplied: dailyApplied - utilities,
      usageFee, cleaning, insuranceMonths: insMonths, insurance,
      total: usageFee + cleaning + insurance,
      monthlyEstimate: dailyApplied * 30,
      isCampaign: dailyCampaign !== null,
    };
  }

  // パターン1下段：1か月プラン／3か月プラン
  function planOneThree(pv, ci) {
    const one = calcPrice(pv, ci, addDays(addMonthsClamp(ci, 1), -1));
    const three = calcPrice(pv, ci, addDays(addMonthsClamp(ci, 3), -1));
    three.perMonth = Math.round(three.total / 3);
    three.perDay = Math.round(three.total / three.days);
    one.perDay = Math.round(one.total / one.days);
    return { one, three, savingPerMonth: one.total - three.perMonth };
  }

  // 翌月1日
  function defaultCheckIn(today) {
    const t = today || new Date();
    return fmt(Date.UTC(t.getFullYear(), t.getMonth() + 1, 1));
  }

  function todayStr(today) {
    const t = today || new Date();
    return fmt(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
  }

  function yen(n) { return Math.round(n).toLocaleString('ja-JP'); }

  const M = { parse, fmt, addDays, daysInclusive, addMonthsClamp, insuranceMonths, calcPrice, planOneThree, defaultCheckIn, todayStr, num, yen };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnCalc = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
