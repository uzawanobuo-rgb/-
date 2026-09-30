// 案内シート（A4横 1123×794px）の組み立て（SPEC.md §5）
(function (root) {
  'use strict';
  const req = typeof require === 'function';
  const Calc = req ? require('./calc.js') : root.AtinnCalc;
  const Parse = req ? require('./parse.js') : root.AtinnParse;
  const MapM = req ? require('./map.js') : root.AtinnMap;
  const GEO = req ? require('./data.js') : root.AtinnGeoData;
  const LOGO = req ? require('./logo.js') : root.AtinnLogo;

  const esc = MapM.esc;
  const yen = Calc.yen;
  const TAG_TEXT = ['#0B5E5C', '#A8461A', '#245B8F'];
  const CENTRAL = ['新宿', '渋谷', '池袋', '東京', '品川', '上野'];

  function n(v) { return Calc.num(v); }
  function shortLine(l) { return String(l || '').replace(/^(東京メトロ|都営|ＪＲ|JR)\s*/, ''); }
  function roundTo(v, u) { return Math.round(v / u) * u; }

  // ルートの集計値
  function routeInfo(r) {
    r = r || {};
    const walk = n(r.walk), ride = n(r.ride);
    const legs = (r.legs || []).filter(l => l && (l.line || l.to));
    const total = walk !== null && ride !== null ? walk + ride : null;
    const display = n(r.display) ?? total;
    const transfers = n(r.transfers) ?? (legs.length ? legs.length - 1 : null);
    return { walk, ride, total, display, transfers, legs };
  }

  // 駅名→座標
  function makeResolver(state) {
    const user = state.stationCoords || {};
    return function (name) {
      if (!name) return null;
      const k = String(name).trim().replace(/駅$/, '');
      const u = user[k];
      if (u && u.lat != null && u.lng != null) return { lat: +u.lat, lng: +u.lng, name: k };
      const s = GEO.stations[k];
      if (s) return { lat: s[0], lng: s[1], name: k };
      return null;
    };
  }

  function mapRoute(r, info, resolve, finalName, finalFallback, warnings, label) {
    const out = { legs: [] };
    if (r.station) {
      const w = resolve(r.station);
      if (w) out.walkTo = w; else warnings.push(`${label}：「${r.station}」の座標が不明です（徒歩の線を省略）`);
    }
    const legs = info.legs.length ? info.legs : [{ mode: 'train', line: '', to: finalName }];
    legs.forEach((lg, i) => {
      const last = i === legs.length - 1;
      const toName = (lg.to || (last ? finalName : '')).trim();
      let to = resolve(toName);
      if (!to && last && finalFallback) to = Object.assign({}, finalFallback, { name: toName || finalFallback.name });
      if (!to) { if (toName) warnings.push(`${label}：「${toName}」の座標が不明です（線を省略）`); return; }
      out.legs.push({ mode: lg.mode === 'bus' ? 'bus' : 'train', line: lg.line || '', to });
    });
    return out;
  }

  // 経路の終わりの駅が目的地から離れすぎていないか（目的地を変えたのに経路が古いまま、など）
  // 離れていれば { name, km } を返す。駅から歩ける範囲（1.2km）なら null
  function routeEndGap(state, r) {
    const p2 = state.p2 || {};
    if (!r || p2.destLat === '' || p2.destLat == null || p2.destLng === '' || p2.destLng == null) return null;
    // 乗換取込で Yahoo! の到着地点の位置が分かっていれば、それで確かめる（名前だけの検索で別の場所になっていないか）
    if (r.arrive && r.arrive.lat != null) {
      const dy = (r.arrive.lat - p2.destLat) * 111, dx = (r.arrive.lng - p2.destLng) * 111 * Math.cos(p2.destLat * Math.PI / 180);
      const km = Math.hypot(dx, dy);
      return km > 0.8 ? { name: r.arrive.name, km, arrive: true } : null;
    }
    const legs = (r.legs || []).filter(l => l && l.to);
    if (!legs.length) return null;
    const name = legs[legs.length - 1].to;
    const c = makeResolver(state)(name);
    if (!c) return null;
    const dy = (c.lat - p2.destLat) * 111, dx = (c.lng - p2.destLng) * 111 * Math.cos(p2.destLat * Math.PI / 180);
    const km = Math.hypot(dx, dy);
    return km > 1.2 ? { name: c.name, km } : null;
  }

  function header(title, sub, right) {
    // 長い見出し（目的地がビル名など）は、1行に収まるよう文字を小さくする
    const maxW = right ? 800 : 1030;
    const fs = Math.max(22, Math.min(38, Math.floor(38 * maxW / Math.max(1, MapM.textW(title, 38) * 1.04))));
    return `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;">
<div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
<h1 style="margin:0;font-size:${fs}px;font-weight:900;letter-spacing:0.02em;line-height:1.2;white-space:nowrap;">${esc(title)}</h1>
<div style="font-size:16px;color:#5B6770;font-weight:500;">${esc(sub)}</div>
</div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;"><img src="${LOGO.src}" alt="アットイン" style="height:30px;display:block;">${right || ''}</div></div>`;
  }
  function frame(inner) {
    return `<div class="atinn-sheet" style="width:1123px;height:794px;box-sizing:border-box;border-top:10px solid #0F7C7A;padding:18px 40px 16px;display:flex;flex-direction:column;gap:12px;background:#F7F6F2;color:#1E2B33;font-family:'M PLUS 1p','Hiragino Sans',sans-serif;overflow:hidden;">${inner}</div>`;
  }
  function panel(svg, h, what) {
    return `<div style="position:relative;height:${h}px;flex-shrink:0;background:#FFFFFF;border:1px solid #E2DED3;border-radius:16px;overflow:hidden;">${svg}
<div style="position:absolute;left:14px;bottom:8px;font-size:10px;color:#8C959B;">※路線図・イラストはイメージです（方角は実際に合わせ、${what}周辺を拡大してデフォルメしています）</div></div>`;
  }
  function jpDate(s) {
    try { const d = new Date(Calc.parse(s)); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; } catch (e) { return s || ''; }
  }
  function ceil5(v) { return Math.ceil(v / 5) * 5; }

  // ================= パターン1：物件 → 主要駅 =================
  function buildP1(state) {
    const warnings = [];
    const p1 = state.p1 || {};
    const prop = p1.property || {};
    const resolve = makeResolver(state);
    const ci = p1.checkIn || Calc.defaultCheckIn();

    // 主要駅の選定：上限（初期値30分）を超える駅を外し、短い順に3つ
    const limit = n(p1.maxMin) || 30;
    const rows = GEO.majorStations.map(ms => {
      const r = (p1.routes || {})[ms.name] || {};
      return { ms, r, info: routeInfo(r) };
    });
    const selected = rows.filter(x => !x.r.exclude && x.info.total !== null && x.info.total <= limit)
      .sort((a, b) => a.info.total - b.info.total).slice(0, 3);
    if (!selected.length) {
      const entered = rows.filter(x => !x.r.exclude && x.info.total !== null);
      warnings.push(entered.length
        ? `${limit}分以内の主要駅がありません。「②主要駅までの所要時間」の上限を広げてください`
        : '主要駅までの「乗車（分）」を入力してください（入力した駅が地図に載ります）');
    }

    const center = (prop.lat != null && prop.lng != null) ? { lat: +prop.lat, lng: +prop.lng, name: prop.name || '物件' } : null;
    if (!center) warnings.push('物件の座標（緯度・経度）が未入力です');

    let svg = '';
    if (center) {
      const routes = selected.map((x, i) => {
        const mr = mapRoute(x.r, x.info, resolve, x.ms.name, x.ms, warnings, x.ms.name);
        mr.callout = { title: x.ms.name, minutes: x.info.display, transfers: x.info.transfers };
        mr.target = x.ms;
        return mr;
      });
      svg = MapM.renderMap({ width: 1043, height: 468, mode: 'p1', center, routes, ariaLabel: `物件から${selected.map(x => x.ms.name).join('・')}への路線概要図` });
    } else {
      svg = `<svg width="1043" height="468"><rect width="1043" height="468" fill="#FBFAF6"/><text x="521" y="234" text-anchor="middle" font-size="16" fill="#8C959B">物件の座標を入力すると路線図が表示されます</text></svg>`;
    }

    // 見出し
    const maxMin = selected.length ? Math.max.apply(null, selected.map(x => x.info.display)) : 30;
    const allCentral = selected.every(x => CENTRAL.includes(x.ms.name));
    const autoTitle = selected.length ? `${allCentral ? '都心の' : ''}主要駅へ、${ceil5(maxMin)}分以内` : '主要駅へのアクセス';
    const title = state.headline || autoTitle;
    const sub = state.subheadline || `${prop.name || '物件'}から主要駅へのアクセス概要図`;
    const addr = Parse.shortAddress(prop.address || '').upToChome;
    const near = (prop.stations || []).filter(s => s && s.name).slice().sort((a, b) => (n(a.walk) ?? 99) - (n(b.walk) ?? 99)).slice(0, 2)
      .map(s => `${esc(s.name)}駅 徒歩${esc(s.walk)}分`).join('／');
    const right = `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:13px;color:#5B6770;flex-shrink:0;">
<div style="font-weight:700;color:#1E2B33;">${esc(addr)}</div><div>${near}</div></div>`;

    // 料金
    let bottom;
    const pv = prop.price || {};
    let priceInfo = null;
    try { priceInfo = Calc.planOneThree(pv, ci); } catch (e) { warnings.push('チェックイン日が不正です'); }
    const hasPrice = priceInfo && (n(pv.dailyCampaign) ?? n(pv.dailyList)) !== null;
    if (!hasPrice) warnings.push('料金（利用料・清掃費・住宅保険）が未入力です');
    const one = priceInfo && priceInfo.one, three = priceInfo && priceInfo.three;
    const strengths = `<div style="display:flex;flex-direction:column;gap:8px;padding:12px 18px;background:#1E2B33;color:#FFFFFF;border-radius:12px;">
<div style="font-size:15px;font-weight:900;">家賃以外、ほぼかかりません</div>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px;font-size:12px;line-height:1.4;">
<div style="display:flex;flex-direction:column;"><span style="font-size:18px;font-weight:900;color:#7FD1CB;">0円</span><span>保証料・契約手数料</span></div>
<div style="display:flex;flex-direction:column;"><span style="font-size:18px;font-weight:900;color:#7FD1CB;">0円</span><span>管理費</span></div>
<div style="display:flex;flex-direction:column;"><span style="font-size:18px;font-weight:900;color:#7FD1CB;">無料</span><span>Wi-Fi 使い放題</span></div>
<div style="display:flex;flex-direction:column;"><span style="font-size:18px;font-weight:900;color:#7FD1CB;">込み</span><span>水道光熱費・家具家電</span></div>
</div></div>`;
    const v = x => hasPrice ? yen(x) : '—';
    const oneBox = `<div style="display:flex;flex-direction:column;justify-content:space-between;gap:6px;padding:12px 18px;background:#FFFFFF;border:1px solid #E2DED3;border-radius:12px;">
<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:15px;font-weight:900;">1か月プラン</div><div style="font-size:11px;color:#5B6770;">${one ? one.days : '–'}日間</div></div>
<div style="display:flex;align-items:baseline;gap:4px;"><span style="font-size:13px;font-weight:700;color:#5B6770;">総額</span><span style="font-size:34px;font-weight:900;line-height:1;">${one ? v(one.total) : '—'}</span><span style="font-size:14px;font-weight:700;">円</span></div>
<div style="font-size:12px;line-height:1.5;color:#5B6770;">利用料 ${one ? v(one.usageFee) : '—'}円 ＋ 清掃費 ${one ? v(one.cleaning) : '—'}円 ＋ 保険 ${one ? v(one.insurance) : '—'}円<br>1日あたり 約${one ? v(roundTo(one.total / one.days, 100)) : '—'}円</div></div>`;
    const saving = priceInfo ? priceInfo.savingPerMonth : 0;
    const badge = hasPrice && saving > 0
      ? `<div style="padding:3px 10px;border-radius:999px;background:#C4531A;color:#FFFFFF;font-size:11px;font-weight:700;white-space:nowrap;">月あたり 約${saving >= 10000 ? (Math.round(saving / 1000) / 10) + '万' : yen(roundTo(saving, 100))}円おトク</div>` : '';
    const threeBox = `<div style="position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:6px;padding:12px 18px;background:#FFF8F1;border:2px solid #E0662A;border-radius:12px;">
<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;"><div style="font-size:15px;font-weight:900;">3か月プラン</div>${badge}</div>
<div style="display:flex;align-items:baseline;gap:4px;"><span style="font-size:13px;font-weight:700;color:#5B6770;">総額</span><span style="font-size:34px;font-weight:900;line-height:1;color:#C4531A;">${three ? v(three.total) : '—'}</span><span style="font-size:14px;font-weight:700;color:#C4531A;">円</span></div>
<div style="font-size:12px;line-height:1.5;color:#5B6770;">利用料 ${three ? v(three.usageFee) : '—'}円 ＋ 清掃費 ${three ? v(three.cleaning) : '—'}円 ＋ 保険 ${three ? v(three.insurance) : '—'}円<br>1か月あたり 約${three ? v(roundTo(three.perMonth, 1000)) : '—'}円（1日あたり 約${three ? v(roundTo(three.perDay, 100)) : '—'}円）</div></div>`;
    bottom = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;flex-grow:1;min-height:0;">${strengths}${oneBox}${threeBox}</div>`;

    const base = state.baseDate || Calc.todayStr();
    const campaign = n(pv.dailyCampaign) !== null ? 'キャンペーン価格' : '定価';
    const autoNote = `※所要時間は「物件からの徒歩＋乗車時間」の日中の目安です（待ち時間は含みません）。料金は${jpDate(base)}時点の${campaign}・${state.persons || 1}名・${jpDate(ci)}チェックインの税込総額（利用料＋清掃費＋住宅保険。保険は応当日で月数を計算）です。空室状況・時期により変動します。`;
    const note = `<div style="font-size:11px;color:#8C959B;line-height:1.4;">${esc(state.note || autoNote)}</div>`;

    const html = frame(header(title, sub, right) + panel(svg, 468, '物件') + bottom + note);
    return { html, warnings, model: { title: autoTitle, sub: `${prop.name || '物件'}から主要駅へのアクセス概要図`, note: autoNote, selected: selected.map(x => x.ms.name), priceInfo } };
  }

  // ================= パターン2：目的地 → 3物件 =================
  function autoTags(items) {
    // 物件A〜Cの位置（x.i）で持つ。A が空でも B・C のタグが正しい位置に入るように
    const tags = [[], [], []];
    const withMin = items.filter(x => x.info.display !== null);
    if (withMin.length > 1) {
      const m = Math.min.apply(null, withMin.map(x => x.info.display));
      withMin.filter(x => x.info.display === m).forEach(x => tags[x.i].push('いちばん近い'));
    }
    const withPrice = items.filter(x => x.price);
    if (withPrice.length > 1) {
      const m = Math.min.apply(null, withPrice.map(x => x.price.total));
      withPrice.filter(x => x.price.total === m).forEach(x => tags[x.i].push('いちばんお手頃'));
    }
    const thisYear = new Date().getFullYear();
    items.forEach(x => {
      if (tags[x.i].length) return;
      const p = x.prop;
      const by = /(\d{4})/.exec(p.built || '');
      if (by && thisYear - Number(by[1]) <= 5) tags[x.i].push(`築浅（${by[1]}年築）`);
      else if (n(p.floors) >= 10) tags[x.i].push(`${n(p.floors)}階建`);
      else if (x.info.walk !== null && x.info.walk <= 5) tags[x.i].push(`駅徒歩${x.info.walk}分`);
      else if (p.smoking === '禁煙') tags[x.i].push('全室禁煙');
    });
    return tags;
  }

  function buildP2(state) {
    const warnings = [];
    const p2 = state.p2 || {};
    const resolve = makeResolver(state);
    const destName = p2.destName || '目的地';
    const label = p2.destLabel || 'お勤め先';
    const ci = p2.checkIn || Calc.defaultCheckIn();
    const co = p2.checkOut || Calc.addDays(ci, 29);
    const props = (p2.properties || []).filter(p => p && (p.name || p.planUrl || p.lat));
    const letters = ['A', 'B', 'C'];

    const items = (p2.properties || []).map((prop, i) => {
      if (!prop || !(prop.name || prop.planUrl || prop.lat)) return null;
      const r = (p2.routes || [])[i] || {};
      const info = routeInfo(r);
      let price = null;
      const pv = prop.price || {};
      if ((n(pv.dailyCampaign) ?? n(pv.dailyList)) !== null) {
        try { price = Calc.calcPrice(pv, ci, co); } catch (e) { warnings.push('利用期間の日付が不正です'); }
      } else warnings.push(`${letters[i]}：料金が未入力です`);
      if (info.display === null) warnings.push(`${letters[i]}：所要時間（徒歩・乗車）が未入力です`);
      return { i, prop, r, info, price, letter: letters[i] };
    }).filter(Boolean);
    if (!props.length) warnings.push('物件のプランを入力してください');

    const dest = (p2.destLat != null && p2.destLng != null && p2.destLat !== '' && p2.destLng !== '') ? { lat: +p2.destLat, lng: +p2.destLng, name: destName, sublabel: `目的地（${label}）` } : null;
    if (!dest) warnings.push('目的地の座標（緯度・経度）が未入力です');

    let svg;
    if (dest) {
      const routes = items.map(x => {
        const gap = routeEndGap(state, x.r);
        if (gap) warnings.push(gap.arrive
          ? `${x.letter}：Yahoo!乗換案内の行き先「${gap.name}」が、目的地から約${gap.km.toFixed(1)}km離れています。行き先が違う場所になっていないか確かめて、検索し直してください`
          : `${x.letter}：経路が「${gap.name}」までで、目的地から約${gap.km.toFixed(1)}km離れています。目的地を変えたときは、Yahoo!乗換案内で検索し直してください`);
        const mr = x.prop.lat != null && x.prop.lat !== '' ? mapRoute(x.r, x.info, resolve, x.r.alight || destName, dest, warnings, x.letter) : { legs: [] };
        if (x.prop.lat == null || x.prop.lat === '') { warnings.push(`${x.letter}：物件の座標が未入力です`); return null; }
        mr.origin = { lat: +x.prop.lat, lng: +x.prop.lng, name: x.prop.name, letter: x.letter };
        mr.callout = { title: x.prop.name, minutes: x.info.display, transfers: x.info.transfers };
        mr.color = MapM.ROUTE_COLORS[x.i % 3];
        return mr;
      }).filter(Boolean);
      svg = MapM.renderMap({ width: 1043, height: 440, mode: 'p2', center: dest, routes, ariaLabel: `${destName}と物件の位置関係と路線概要図` });
    } else {
      svg = `<svg width="1043" height="440"><rect width="1043" height="440" fill="#FBFAF6"/><text x="521" y="220" text-anchor="middle" font-size="16" fill="#8C959B">目的地の座標を入力すると路線図が表示されます</text></svg>`;
    }

    const allNoTransfer = items.length && items.every(x => x.info.transfers === 0);
    const maxMin = items.filter(x => x.info.display !== null).reduce((m, x) => Math.max(m, x.info.display), 0);
    const count = ['', '1つ', '2つ', '3つ'][items.length] || `${items.length}つ`;
    const autoTitle = `${destName}まで${allNoTransfer ? '乗換なし' : (maxMin ? ceil5(maxMin) + '分以内' : '')}、${count}のお部屋`;
    const title = state.headline || autoTitle;
    const autoSub = `${label}（${destName}）から選んだ、おすすめ物件のアクセス比較`;
    const sub = state.subheadline || autoSub;
    const right = p2.customer ? `<div style="padding:6px 14px;border-radius:999px;background:#1E2B33;color:#FFFFFF;font-size:13px;font-weight:700;white-space:nowrap;flex-shrink:0;">${esc(p2.customer)}様へのご提案</div>` : '';

    const tags = autoTags(items);
    const cols = MapM.ROUTE_COLORS;
    const cards = items.map((x, k) => {
      const p = x.prop, col = cols[x.i % 3];
      const sa = Parse.shortAddress(p.address || '');
      const photo = p.photoCustom || (p.photos && p.photos[p.photoIdx || 0] && (p.photos[p.photoIdx || 0].data || p.photos[p.photoIdx || 0].src)) || '';
      const photoHtml = photo && !p.hidePhoto
        ? `<div style="width:80px;flex-shrink:0;border-radius:8px;background:#EDEAE2 url('${esc(photo)}') center/cover no-repeat;"></div>`
        : `<div style="width:80px;flex-shrink:0;border-radius:8px;background:#EDEAE2;display:flex;align-items:center;justify-content:center;font-size:11px;color:#8C959B;">${p.hidePhoto ? '' : '写真なし'}</div>`;
      const st = x.r.station ? `${esc(x.r.station)}${/停|前$/.test(x.r.station) ? '' : '駅'} 徒歩${x.info.walk ?? '–'}分` : '';
      const lines = x.info.legs.map(l => shortLine(l.line)).filter(Boolean);
      const rideTxt = x.info.ride !== null ? `（${lines.length ? lines.join('・') : '乗車'}${x.info.ride}分）` : '';
      const tagList = (p.tag != null && p.tag !== '' ? String(p.tag).split(/[、,]/).map(s => s.trim()).filter(Boolean) : tags[x.i]);
      const pills = tagList.map(t => `<span style="padding:2px 8px;border-radius:999px;background:${col.fill};color:${TAG_TEXT[x.i % 3]};font-size:11px;font-weight:700;white-space:nowrap;">${esc(t)}</span>`).join('');
      const daily = x.price ? x.price.dailyApplied : null;
      return `<div style="display:flex;gap:12px;padding:12px;background:#FFFFFF;border:1px solid #E2DED3;border-top:5px solid ${col.line};border-radius:12px;min-width:0;">
${photoHtml}
<div style="display:flex;flex-direction:column;gap:2px;flex-grow:1;min-width:0;">
<div style="font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${x.letter}　${esc(p.name || '')}</div>
<div style="font-size:12px;color:#5B6770;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(sa.ward + sa.town)}${st ? '｜' + st : ''}</div>
<div style="font-size:12px;color:#5B6770;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(destName)}まで 約${x.info.display ?? '–'}分${esc(rideTxt)}</div>
${pills ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">${pills}</div>` : ''}
<div style="margin-top:auto;display:flex;flex-direction:column;gap:0;">
<div style="display:flex;align-items:baseline;gap:3px;white-space:nowrap;"><span style="font-size:11px;color:#5B6770;">${x.price && x.price.days !== 30 ? x.price.days + '日間' : '1か月'}総額</span><span style="font-size:22px;font-weight:900;">${x.price ? yen(x.price.total) : '—'}</span><span style="font-size:11px;font-weight:700;">円</span></div>
<div style="font-size:10px;color:#7A7466;white-space:nowrap;">1日 ${daily !== null ? yen(daily) : '—'}円 × ${x.price ? x.price.days : '–'}日 ＋ 清掃費・保険</div>
</div></div></div>`;
    }).join('');
    const bottom = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;flex-grow:1;min-height:0;">${cards}</div>`;

    const base = state.baseDate || Calc.todayStr();
    const days = Calc.daysInclusive(ci, co);
    const cleanVals = items.filter(x => x.price).map(x => x.price.cleaning);
    const insVals = items.map(x => n((x.prop.price || {}).insurancePerMonth)).filter(v => v !== null);
    const sameClean = cleanVals.length && cleanVals.every(v => v === cleanVals[0]);
    const sameIns = insVals.length && insVals.every(v => v === insVals[0]);
    const anyCampaign = items.some(x => x.price && x.price.isCampaign);
    const autoNote = `※所要時間は「物件からの徒歩＋乗車時間」の日中の目安です（待ち時間は含みません）。料金は${jpDate(base)}時点の各プランの${anyCampaign ? 'キャンペーン価格' : '料金'}で、${state.persons || 1}名・${days}日利用時の総額（利用料＋ルームクリーニング${sameClean ? yen(cleanVals[0]) + '円' : ''}＋住宅保険${sameIns ? yen(insVals[0]) + '円' : ''}×月数（応当日で計算、端数月は1か月））です。`;
    const note = `<div style="font-size:11px;color:#8C959B;line-height:1.4;">${esc(state.note || autoNote)}</div>`;

    const html = frame(header(title, sub, right) + panel(svg, 440, '目的地') + bottom + note);
    return { html, warnings, model: { title: autoTitle, sub: autoSub, note: autoNote, tags } };
  }

  function buildSheet(state) {
    return state.pattern === 'p2' ? buildP2(state) : buildP1(state);
  }

  const M = { buildSheet, buildP1, buildP2, routeInfo, makeResolver, routeEndGap, autoTags, shortLine };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnSheet = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
