// メール本文に貼る見積りテキスト（見積りExcel【一般用】の AE 列と同じ書式）
// ブラウザでは window.AtinnMailText、Node では require() で使う。
(function (root) {
  'use strict';
  const req = typeof require === 'function';
  const Calc = req ? require('./calc.js') : root.AtinnCalc;

  const W = '　'; // 全角スペース（Excel の書式に合わせて、項目名のあとの空きをそろえる）
  const yen = n => Number(n || 0).toLocaleString('ja-JP');
  function ymd(s) {
    const d = new Date(Calc.parse(s));
    const p = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}(${'日月火水木金土'[d.getUTCDay()]})`;
  }

  // 期間：パターン2は入力の期間（未入力なら翌月1日から30日間）、パターン1は1か月プランの期間
  function period(state) {
    if (state.pattern === 'p2') {
      const ci = state.p2.checkIn || Calc.defaultCheckIn();
      const co = state.p2.checkOut || Calc.addDays(ci, 29);
      return { ci, co };
    }
    const ci = state.p1.checkIn || Calc.defaultCheckIn();
    return { ci, co: Calc.addDays(Calc.addMonthsClamp(ci, 1), -1) };
  }

  function block(prop, ci, co, persons) {
    const lines = [];
    lines.push(`■物件名：${prop.planName || prop.name || ''}`);
    lines.push(`${W}URL ${W}：${prop.planUrl || ''}`);
    lines.push('--［料金内訳］--------------------------');
    const pv = prop.price || {};
    const hasPrice = Calc.num(pv.dailyCampaign) !== null || Calc.num(pv.dailyList) !== null || Calc.num(pv.rentList) !== null;
    if (!hasPrice) {
      lines.push(`${W}（料金が未入力です）`);
      return lines;
    }
    const r = Calc.calcPrice(pv, ci, co);
    const utilities = Calc.num(pv.utilities) ?? 0;
    const option = persons > 1 ? 1100 * (persons - 1) : 0; // 2人目から1名1,100円/日
    const total = r.total + option * r.days;
    lines.push(`${W}賃料：${W.repeat(9)}${yen(r.rentApplied)}円/日`);
    lines.push(`${W}水道光熱費：${W.repeat(7)}${yen(utilities)}円/日`);
    if (option) lines.push(`${W}オプション料金：${W.repeat(4)}${yen(option)}円/日（${persons}名様入居）`);
    lines.push(`${W}ルームクリーニング代： ${yen(r.cleaning)}円/契約`);
    lines.push(`${W}住宅保険：${W.repeat(7)}${yen(r.insurance)}円/契約`);
    lines.push('----------------------------------------');
    lines.push(`${W}総額${W.repeat(8)}：${yen(total)}円（1室${persons}名様利用）`);
    lines.push('----------------------------------------');
    const smoke = String(prop.smoking || '');
    if (/禁煙/.test(smoke)) lines.push('※禁煙');
    else if (/喫煙/.test(smoke)) lines.push('※喫煙可能');
    lines.push(`（月額目安：${yen((r.rentApplied + utilities + option) * 30)} 円）`);
    return lines;
  }

  function buildMailText(state, today) {
    const { ci, co } = period(state);
    const persons = Math.max(1, Math.round(Calc.num(state.persons) || 1));
    const days = Calc.daysInclusive(ci, co);
    const until = Calc.addDays(today || Calc.todayStr(), 6);
    const out = [
      '◯ご利用期間',
      `${W}チェックイン${W}：${ymd(ci)}(10時)`,
      `${W}チェックアウト：${ymd(co)}(15時)`,
      `${W}${W}【合計：${yen(days)}日間】`,
      `※見積り有効期限： ${ymd(until)}`,
      W,
    ];
    const props = state.pattern === 'p2'
      ? (state.p2.properties || []).filter(p => p && (p.name || p.planName))
      : [state.p1.property].filter(p => p && (p.name || p.planName));
    if (!props.length) out.push('（物件が未入力です）');
    props.forEach((p, i) => {
      if (i) out.push('');
      block(p, ci, co, persons).forEach(l => out.push(l));
    });
    return out.join('\n');
  }

  const M = { buildMailText };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnMailText = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
