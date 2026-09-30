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

  // 手入力の日付を YYYY-MM-DD にする。「10/5」「10月5日」「1005」「2026/10/5」「20261005」など。
  // 年を省いたときは ref（YYYY-MM-DD）の年とし、ref より前になるなら翌年にする。読めなければ null。
  function parseDateInput(v, ref) {
    let t = String(v == null ? '' : v).replace(/[０-９／－．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[（(].*?[）)]/g, '').replace(/日/g, '').replace(/[年月.\-]/g, '/').replace(/\s+/g, '').replace(/\/+$/, '');
    if (!t) return null;
    let y = null, m, d;
    let r;
    if ((r = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t)) || (r = /^(\d{4})(\d{2})(\d{2})$/.exec(t))) { y = +r[1]; m = +r[2]; d = +r[3]; }
    else if ((r = /^(\d{1,2})\/(\d{1,2})$/.exec(t)) || (r = /^(\d{2})(\d{2})$/.exec(t))) { m = +r[1]; d = +r[2]; }
    else return null;
    const make = yy => { const s2 = `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return fmt(parse(s2)) === s2 ? s2 : null; };
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (y !== null) return make(y);
    const base = ref || todayStr();
    const by = +base.slice(0, 4);
    const cand = make(by);
    if (cand && cand >= base) return cand;
    return make(by + 1) || cand;
  }
  // 画面に出す形：2026/10/5（月）
  function showDate(s) {
    if (!s) return '';
    const t = parse(s);
    if (isNaN(t)) return s;
    const dt = new Date(t);
    return `${dt.getUTCFullYear()}/${dt.getUTCMonth() + 1}/${dt.getUTCDate()}（${'日月火水木金土'[dt.getUTCDay()]}）`;
  }

  const M = { parseDateInput, showDate, parse, fmt, addDays, daysInclusive, addMonthsClamp, insuranceMonths, calcPrice, planOneThree, defaultCheckIn, todayStr, num, yen };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnCalc = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
