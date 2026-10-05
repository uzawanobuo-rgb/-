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
  const TAG_TEXT = ['#0B5E5C', '#A8461A', '#245B8F', '#5A3F94', '#7A5E10'];
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

  // 縦型（スマホ向け）で作るときは true。buildSheet(state, { portrait: true }) で切り替える
  let PORTRAIT = false;
  const PW = 600, PMAP = 568; // 縦型の幅と、地図の幅

  function header(title, sub, right) {
    if (PORTRAIT) {
      const fs = Math.max(20, Math.min(30, Math.floor(30 * 560 / Math.max(1, MapM.textW(title, 30) * 1.04))));
      return `<div style="display:flex;flex-direction:column;gap:8px;">
<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;"><img src="${LOGO.src}" alt="アットイン" style="height:26px;display:block;">${right || ''}</div>
<h1 style="margin:0;font-size:${fs}px;font-weight:900;letter-spacing:0.02em;line-height:1.25;">${esc(title)}</h1>
<div style="font-size:14px;color:#5B6770;font-weight:500;">${esc(sub)}</div></div>`;
    }
    // 長い見出し（目的地がビル名など）は、1行に収まるよう文字を小さくする
    const maxW = right ? 800 : 1030;
    const fs = Math.max(22, Math.min(38, Math.floor(38 * maxW / Math.max(1, MapM.textW(title, 38) * 1.04))));
    return `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;">
<div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
<h1 style="margin:0;font-size:${fs}px;font-weight:900;letter-spacing:0.02em;line-height:1.2;white-space:nowrap;">${esc(title)}</h1>
<div style="font-size:16px;color:#5B6770;font-weight:500;">${esc(sub)}</div>
</div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;"><img src="${LOGO.src}" alt="アットイン" style="height:30px;display:block;">${right || ''}</div></div>`;
  }
  // 主な設備のうち、お客様へのメリットになりそうなものを上から（最大8つ）。
  // 「家賃以外…」の欄に Wi-Fi があるので重ねない。ユニットバス・深夜電気温水器・給湯やコンロの種類は出さない
  const MERIT = ['オートロック', 'バス・トイレ別', '独立洗面台', '浴室乾燥機', '温水洗浄便座', '洗濯機', '宅配ボックス', '快適テレワーク', 'ペット可', '24時間ゴミ出し可能', 'オンライン警備システム', 'エレベーター', 'コインランドリー', 'ソファ', '禁煙選択'];
  const NOT_MERIT = /WiFi|Wi-Fi|ユニットバス|温水器|給湯|コンロ|秘密|法人|限定|ご利用/;
  function meritFacilities(prop) {
    if (!prop || !prop.equipmentChecked) return [];
    const have = String(prop.equipment || '').split(/[、,]/).map(x => x.trim()).filter(Boolean);
    const known = MERIT.filter(m => have.includes(m));
    const other = have.filter(x => !MERIT.includes(x) && !NOT_MERIT.test(x) && x.length <= 12);
    return known.concat(other).slice(0, 8);
  }

  // 「〇〇様へのご提案」（お客様名はパターン1・2で共通）
  function customerBadge(state) {
    const c = String(state.customer || '').trim().replace(/\s*様$/, '');
    return c ? `<div style="padding:6px 14px;border-radius:999px;background:#1E2B33;color:#FFFFFF;font-size:13px;font-weight:700;white-space:nowrap;flex-shrink:0;">${esc(c)}様へのご提案</div>` : '';
  }
  function frame(inner) {
    if (PORTRAIT) return `<div class="atinn-sheet portrait" style="width:${PW}px;box-sizing:border-box;border-top:8px solid #0F7C7A;padding:16px 16px 18px;display:flex;flex-direction:column;gap:12px;background:#F7F6F2;color:#1E2B33;font-family:'M PLUS 1p','Hiragino Sans',sans-serif;">${inner}</div>`;
    return `<div class="atinn-sheet" style="width:1123px;height:794px;box-sizing:border-box;border-top:10px solid #0F7C7A;padding:18px 40px 16px;display:flex;flex-direction:column;gap:12px;background:#F7F6F2;color:#1E2B33;font-family:'M PLUS 1p','Hiragino Sans',sans-serif;overflow:hidden;">${inner}</div>`;
  }
  function panel(svg, h, what) {
    return `<div style="position:relative;height:${h}px;flex-shrink:0;background:#FFFFFF;border:1px solid #E2DED3;border-radius:16px;overflow:hidden;">${svg}
<div style="position:absolute;left:14px;bottom:8px;font-size:10px;color:#8C959B;${PORTRAIT ? 'right:14px;' : ''}">※路線図・イラストはイメージです（方角は実際に合わせ、${what}周辺を拡大してデフォルメしています）</div></div>`;
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
    const ci = state.checkIn || Calc.defaultCheckIn();
    const co = state.checkOut || Calc.addDays(ci, 29);

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

    // 最寄駅と徒歩は、地図の物件名の枠の中に出す
    const nearText = (prop.stations || []).filter(s => s && s.name).slice().sort((a, b) => (n(a.walk) ?? 99) - (n(b.walk) ?? 99)).slice(0, 2)
      .map(s => `${s.name}駅 徒歩${s.walk}分`).join('／');
    const addr = Parse.shortAddress(prop.address || '').upToChome;
    // 住所と最寄駅は、地図の物件名の枠の中に出す
    const center = (prop.lat != null && prop.lng != null) ? { lat: +prop.lat, lng: +prop.lng, name: prop.name || '物件', notes: [addr, nearText].filter(Boolean) } : null;
    if (!center) warnings.push('物件の座標（緯度・経度）が未入力です');

    // 主な設備（メリットになるもの）。あれば地図の下に1行で出し、そのぶん地図を低くする
    const facs = meritFacilities(prop);
    if (prop.name && !prop.equipmentChecked) warnings.push('主な設備を出すには、プランページでもう一度「🏠プラン取込」を押してください（設備の「ある・なし」を読み取ります）');
    const mapW = PORTRAIT ? PMAP : 1043, mapH = PORTRAIT ? 560 : 468; // 設備は地図の空いている場所に出す
    let svg = '';
    if (center) {
      const routes = selected.map((x, i) => {
        const mr = mapRoute(x.r, x.info, resolve, x.ms.name, x.ms, warnings, x.ms.name);
        mr.callout = { title: x.ms.name, minutes: x.info.display, transfers: x.info.transfers };
        mr.target = x.ms;
        return mr;
      });
      svg = MapM.renderMap({ width: mapW, height: mapH, mode: 'p1', center, routes, facilities: facs, ariaLabel: `物件から${selected.map(x => x.ms.name).join('・')}への路線概要図` });
    } else {
      svg = `<svg width="${mapW}" height="${mapH}"><rect width="${mapW}" height="${mapH}" fill="#FBFAF6"/><text x="${mapW / 2}" y="${mapH / 2}" text-anchor="middle" font-size="16" fill="#8C959B">物件の座標を入力すると路線図が表示されます</text></svg>`;
    }

    // 見出し
    const maxMin = selected.length ? Math.max.apply(null, selected.map(x => x.info.display)) : 30;
    const allCentral = selected.every(x => CENTRAL.includes(x.ms.name));
    const autoTitle = selected.length ? `${allCentral ? '都心の' : ''}主要駅へ、${ceil5(maxMin)}分以内` : '主要駅へのアクセス';
    const title = state.headline || autoTitle;
    const sub = state.subheadline || `${prop.name || '物件'}から主要駅へのアクセス概要図`;
    const right = customerBadge(state);

    // 料金
    let bottom;
    const pv = prop.price || {};
    // 入力した利用期間の実際の金額
    let price = null;
    try { price = Calc.calcPrice(pv, ci, co); } catch (e) { warnings.push('利用期間の日付が不正です'); }
    const hasPrice = price && (n(pv.dailyCampaign) ?? n(pv.dailyList)) !== null;
    if (!hasPrice) warnings.push('料金（利用料・清掃費・住宅保険）が未入力です');
    const strengths = `<div style="display:flex;flex-direction:column;gap:8px;padding:12px 18px;background:#1E2B33;color:#FFFFFF;border-radius:12px;">
<div style="font-size:15px;font-weight:900;">家賃以外、ほぼかかりません</div>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px;font-size:12px;line-height:1.4;">
<div style="display:flex;flex-direction:column;"><span style="font-size:18px;font-weight:900;color:#7FD1CB;">0円</span><span>保証料・契約手数料</span></div>
<div style="display:flex;flex-direction:column;"><span style="font-size:18px;font-weight:900;color:#7FD1CB;">0円</span><span>管理費</span></div>
<div style="display:flex;flex-direction:column;"><span style="font-size:18px;font-weight:900;color:#7FD1CB;">無料</span><span>Wi-Fi 使い放題</span></div>
<div style="display:flex;flex-direction:column;"><span style="font-size:18px;font-weight:900;color:#7FD1CB;">込み</span><span>水道光熱費・家具家電</span></div>
</div></div>`;
    const v = x => hasPrice ? yen(x) : '—';
    const md = s => { const d = new Date(Calc.parse(s)); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${'日月火水木金土'[d.getUTCDay()]}）`; };
    const perMonth = price && price.days >= 28 ? roundTo(price.total / price.days * 30, 1000) : null;
    const priceBox = `<div style="grid-column:span ${PORTRAIT ? 1 : 2};display:flex;justify-content:space-between;align-items:stretch;gap:18px;padding:12px 20px;background:#FFF8F1;border:2px solid #E0662A;border-radius:12px;">
<div style="display:flex;flex-direction:column;justify-content:space-between;gap:6px;min-width:0;">
<div style="display:flex;align-items:baseline;gap:10px;"><div style="font-size:15px;font-weight:900;">ご利用期間の総額</div><div style="font-size:13px;font-weight:700;color:#5B6770;">${price ? `${md(ci)}〜${md(co)}・${price.days}日間` : '—'}</div></div>
<div style="display:flex;align-items:baseline;gap:4px;"><span style="font-size:13px;font-weight:700;color:#5B6770;">総額</span><span style="font-size:40px;font-weight:900;line-height:1;color:#C4531A;">${price ? v(price.total) : '—'}</span><span style="font-size:15px;font-weight:700;color:#C4531A;">円</span></div>
<div style="font-size:12px;line-height:1.5;color:#5B6770;">利用料 ${price ? v(price.usageFee) : '—'}円（1日 ${price ? v(price.dailyApplied) : '—'}円 × ${price ? price.days : '–'}日）＋ 清掃費 ${price ? v(price.cleaning) : '—'}円 ＋ 保険 ${price ? v(price.insurance) : '—'}円</div></div>
<div style="display:flex;flex-direction:column;justify-content:center;gap:8px;padding-left:18px;border-left:1px solid #F1C9AE;flex-shrink:0;">
<div style="display:flex;flex-direction:column;"><span style="font-size:11px;color:#5B6770;">1日あたり</span><span style="font-size:20px;font-weight:900;">約${price ? v(roundTo(price.total / price.days, 100)) : '—'}<span style="font-size:12px;">円</span></span></div>
${perMonth !== null ? `<div style="display:flex;flex-direction:column;"><span style="font-size:11px;color:#5B6770;">1か月（30日）あたり</span><span style="font-size:20px;font-weight:900;">約${v(perMonth)}<span style="font-size:12px;">円</span></span></div>` : ''}
</div></div>`;
    bottom = `<div style="display:grid;grid-template-columns:repeat(${PORTRAIT ? 1 : 3},minmax(0,1fr));gap:${PORTRAIT ? 10 : 14}px;flex-grow:1;min-height:0;">${PORTRAIT ? priceBox + strengths : strengths + priceBox}</div>`;

    const base = state.baseDate || Calc.todayStr();
    const campaign = n(pv.dailyCampaign) !== null ? 'キャンペーン価格' : '定価';
    const autoNote = `※所要時間は「物件からの徒歩＋乗車時間」の日中の目安です（待ち時間は含みません）。料金は${jpDate(base)}時点の${campaign}・${state.persons || 1}名・${jpDate(ci)}〜${jpDate(co)}の税込総額（利用料＋清掃費＋住宅保険。保険は応当日で月数を計算）です。空室状況・時期により変動します。`;
    const note = `<div style="font-size:11px;color:#8C959B;line-height:1.4;">${esc(state.note || autoNote)}</div>`;

    const html = frame(header(title, sub, right) + panel(svg, mapH, '物件') + bottom + note);
    return { html, warnings, model: { title: autoTitle, sub: `${prop.name || '物件'}から主要駅へのアクセス概要図`, note: autoNote, selected: selected.map(x => x.ms.name), price, facilities: facs } };
  }

  // ================= パターン2：目的地 → 2〜5物件 =================
  function autoTags(items) {
    // 物件A〜Eの位置（x.i）で持つ。A が空でも B 以降のタグが正しい位置に入るように
    const tags = [[], [], [], [], []];
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
    const ci = state.checkIn || Calc.defaultCheckIn();
    const co = state.checkOut || Calc.addDays(ci, 29);
    const props = (p2.properties || []).filter(p => p && (p.name || p.planUrl || p.lat));
    const letters = ['A', 'B', 'C', 'D', 'E'];

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

    // 4・5件目は、地図の右側に重ねて置く（下の段の C の上。4件のときは下の場所だけ使う）
    const SIDE = { left: 704, w: 327, h: 205 };
    const extra = PORTRAIT ? [] : items.slice(3); // 縦型では全部を地図の下に並べる
    const mapHP = 520; // 縦型の地図の高さ
    const sideSlots = extra.length === 1 ? [{ left: SIDE.left, top: 225, h: SIDE.h }]
      : extra.length >= 2 ? [{ left: SIDE.left, top: 10, h: SIDE.h }, { left: SIDE.left, top: 225, h: SIDE.h }] : [];
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
        mr.color = MapM.ROUTE_COLORS[x.i % MapM.ROUTE_COLORS.length];
        return mr;
      }).filter(Boolean);
      svg = MapM.renderMap({ width: PORTRAIT ? PMAP : 1043, height: PORTRAIT ? mapHP : 440, mode: 'p2', compact: PORTRAIT && items.length > 3, center: dest, routes, blocked: sideSlots.map(b => ({ x0: b.left - 10, y0: b.top - 6, x1: 1043, y1: b.top + b.h + 6 })), ariaLabel: `${destName}と物件の位置関係と路線概要図` });
    } else {
      svg = `<svg width="${PORTRAIT ? PMAP : 1043}" height="${PORTRAIT ? mapHP : 440}"><rect width="100%" height="100%" fill="#FBFAF6"/><text x="${PORTRAIT ? PMAP / 2 : 521}" y="${PORTRAIT ? mapHP / 2 : 220}" text-anchor="middle" font-size="16" fill="#8C959B">目的地の座標を入力すると路線図が表示されます</text></svg>`;
    }

    const allNoTransfer = items.length && items.every(x => x.info.transfers === 0);
    const maxMin = items.filter(x => x.info.display !== null).reduce((m, x) => Math.max(m, x.info.display), 0);
    const count = ['', '1つ', '2つ', '3つ'][items.length] || `${items.length}つ`;
    const autoTitle = `${destName}まで${allNoTransfer ? '乗換なし' : (maxMin ? ceil5(maxMin) + '分以内' : '')}、${count}のお部屋`;
    const title = state.headline || autoTitle;
    const autoSub = `${label}（${destName}）から選んだ、おすすめ物件のアクセス比較`;
    const sub = state.subheadline || autoSub;
    const right = customerBadge(state);

    const tags = autoTags(items);
    const cols = MapM.ROUTE_COLORS;
    const cardHtml = (x, extraStyle) => {
      const p = x.prop, col = cols[x.i % cols.length];
      const sa = Parse.shortAddress(p.address || '');
      const photo = p.photoCustom || (p.photos && p.photos[p.photoIdx || 0] && (p.photos[p.photoIdx || 0].data || p.photos[p.photoIdx || 0].src)) || '';
      const photoHtml = photo && !p.hidePhoto
        ? `<div style="width:80px;flex-shrink:0;border-radius:8px;background:#EDEAE2 url('${esc(photo)}') center/cover no-repeat;"></div>`
        : `<div style="width:80px;flex-shrink:0;border-radius:8px;background:#EDEAE2;display:flex;align-items:center;justify-content:center;font-size:11px;color:#8C959B;">${p.hidePhoto ? '' : '写真なし'}</div>`;
      const st = x.r.station ? `${esc(x.r.station)}${/停|前$/.test(x.r.station) ? '' : '駅'} 徒歩${x.info.walk ?? '–'}分` : '';
      const lines = x.info.legs.map(l => shortLine(l.line)).filter(Boolean);
      const rideTxt = x.info.ride !== null ? `（${lines.length ? lines.join('・') : '乗車'}${x.info.ride}分）` : '';
      const tagList = (p.tag != null && p.tag !== '' ? String(p.tag).split(/[、,]/).map(s => s.trim()).filter(Boolean) : tags[x.i]);
      const pills = tagList.map(t => `<span style="padding:2px 8px;border-radius:999px;background:${col.fill};color:${TAG_TEXT[x.i % TAG_TEXT.length]};font-size:11px;font-weight:700;white-space:nowrap;">${esc(t)}</span>`).join('');
      const daily = x.price ? x.price.dailyApplied : null;
      const termLabel = x.price && x.price.days !== 30 ? x.price.days + '日間' : '1か月';
      if (PORTRAIT) {
        // 縦型：写真｜物件の情報｜料金（右側の空きに料金を置く）
        const ph = photo && !p.hidePhoto
          ? `<div style="width:96px;flex-shrink:0;border-radius:8px;background:#EDEAE2 url('${esc(photo)}') center/cover no-repeat;"></div>`
          : `<div style="width:96px;flex-shrink:0;border-radius:8px;background:#EDEAE2;display:flex;align-items:center;justify-content:center;font-size:11px;color:#8C959B;">${p.hidePhoto ? '' : '写真なし'}</div>`;
        return `<div style="display:flex;gap:12px;padding:12px;background:#FFFFFF;border:1px solid #E2DED3;border-top:5px solid ${col.line};border-radius:12px;min-width:0;box-sizing:border-box;min-height:118px;">
${ph}
<div style="display:flex;flex-direction:column;gap:3px;flex-grow:1;min-width:0;">
<div style="font-size:15px;font-weight:900;line-height:1.3;">${x.letter}　${esc(p.name || '')}</div>
<div style="font-size:12px;color:#5B6770;line-height:1.4;">${esc(sa.ward + sa.town)}${st ? '｜' + st : ''}</div>
<div style="font-size:12px;color:#5B6770;line-height:1.4;">${esc(destName)}まで <b style="color:${col.text};font-size:14px;">約${x.info.display ?? '–'}分</b>${esc(rideTxt)}</div>
${pills ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">${pills}</div>` : ''}
</div>
<div style="display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:2px;flex-shrink:0;padding-left:12px;border-left:1px solid #EFEBE2;">
<div style="font-size:11px;color:#5B6770;">${termLabel}総額</div>
<div style="white-space:nowrap;"><span style="font-size:24px;font-weight:900;">${x.price ? yen(x.price.total) : '—'}</span><span style="font-size:11px;font-weight:700;">円</span></div>
<div style="font-size:10px;color:#7A7466;white-space:nowrap;">1日 ${daily !== null ? yen(daily) : '—'}円 × ${x.price ? x.price.days : '–'}日</div>
<div style="font-size:10px;color:#7A7466;white-space:nowrap;">＋ 清掃費・保険</div>
</div></div>`;
      }
      return `<div style="display:flex;gap:12px;padding:12px;background:#FFFFFF;border:1px solid #E2DED3;border-top:5px solid ${col.line};border-radius:12px;min-width:0;box-sizing:border-box;${extraStyle || ''}">
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
    };
    const cards = (PORTRAIT ? items : items.slice(0, 3)).map(x => cardHtml(x)).join('');
    const sideCards = extra.slice(0, 2).map((x, k) => cardHtml(x, `position:absolute;left:${sideSlots[k].left}px;top:${sideSlots[k].top}px;width:${SIDE.w}px;height:${sideSlots[k].h}px;box-shadow:0 2px 10px rgba(30,43,51,.12);`)).join('');
    const bottom = `<div style="display:grid;grid-template-columns:repeat(${PORTRAIT ? 1 : 3},minmax(0,1fr));gap:${PORTRAIT ? 10 : 14}px;flex-grow:1;min-height:0;">${cards}</div>`;

    const base = state.baseDate || Calc.todayStr();
    const days = Calc.daysInclusive(ci, co);
    const cleanVals = items.filter(x => x.price).map(x => x.price.cleaning);
    const insVals = items.map(x => n((x.prop.price || {}).insurancePerMonth)).filter(v => v !== null);
    const sameClean = cleanVals.length && cleanVals.every(v => v === cleanVals[0]);
    const sameIns = insVals.length && insVals.every(v => v === insVals[0]);
    const anyCampaign = items.some(x => x.price && x.price.isCampaign);
    const autoNote = `※所要時間は「物件からの徒歩＋乗車時間」の日中の目安です（待ち時間は含みません）。料金は${jpDate(base)}時点の各プランの${anyCampaign ? 'キャンペーン価格' : '料金'}で、${state.persons || 1}名・${days}日利用時の総額（利用料＋ルームクリーニング${sameClean ? yen(cleanVals[0]) + '円' : ''}＋住宅保険${sameIns ? yen(insVals[0]) + '円' : ''}×月数（応当日で計算、端数月は1か月））です。`;
    const note = `<div style="font-size:11px;color:#8C959B;line-height:1.4;">${esc(state.note || autoNote)}</div>`;

    const html = frame(header(title, sub, right) + panel(svg + sideCards, PORTRAIT ? mapHP : 440, '目的地') + bottom + note);
    const pages = [html];
    if (p2.compare && items.length) { const pv = PORTRAIT; PORTRAIT = false; pages.push(buildCompare(state, items, destName, label, warnings)); PORTRAIT = pv; } // 比較表は横型のまま
    return { html, pages, warnings, model: { title: autoTitle, sub: autoSub, note: autoNote, tags } };
  }

  // ================= パターン2の2ページ目：設備・条件の比較表 =================
  // 列が物件、行が項目。設備はどれかの物件にあるものだけ、メリットになりそうな順。全物件にある設備は薄く
  function buildCompare(state, items, destName, label, warnings) {
    const cols = MapM.ROUTE_COLORS;
    const sel = items.slice(0, 5);
    sel.filter(x => !x.prop.equipmentChecked).forEach(x => warnings.push(`${x.letter}：設備比較を出すには、プランページでもう一度「🏠プラン取込」を押してください`));
    // ユニットバス・温水器・給湯やコンロの種類は比べる意味が薄いので出さない
    const haveOf = x => x.prop.equipmentChecked ? String(x.prop.equipment || '').split(/[、,]/).map(t => t.trim()).filter(t => t && !/秘密|法人|限定|ご利用|ユニットバス|温水器|給湯|コンロ/.test(t)) : null;
    const have = sel.map(haveOf);
    const all = [];
    have.forEach(h => (h || []).forEach(t => { if (!all.includes(t)) all.push(t); }));
    const order = t => { const i = MERIT.indexOf(t); return i < 0 ? 100 + all.indexOf(t) : i; };
    const known = have.filter(Boolean);
    const everyone = t => known.length > 1 && known.length === have.length && known.every(h => h.includes(t));
    const sorted = all.sort((a, b) => order(a) - order(b));
    const common = sorted.filter(everyone); // 全物件にある設備は1行にまとめる
    const facs = sorted.filter(t => !everyone(t));

    const lw = 150; // 項目名の列
    const head = sel.map(x => {
      const col = cols[x.i % cols.length];
      return `<th style="padding:8px 8px 6px;background:${col.fill};border-top:5px solid ${col.line};text-align:left;vertical-align:top;font-size:13px;font-weight:900;color:#1E2B33;"><span style="display:inline-flex;width:20px;height:20px;border-radius:50%;background:${col.line};color:#fff;align-items:center;justify-content:center;font-size:11px;margin-right:6px;vertical-align:1px;">${x.letter}</span>${esc(x.prop.name || '')}</th>`;
    }).join('');
    const photoOf = p => p.photoCustom || (p.photos && p.photos[p.photoIdx || 0] && (p.photos[p.photoIdx || 0].data || p.photos[p.photoIdx || 0].src)) || '';
    const cell = (html, extra) => `<td style="padding:5px 8px;border-top:1px solid #ECE8DF;font-size:12px;color:#1E2B33;vertical-align:middle;${extra || ''}">${html}</td>`;
    const row = (name, fn, opt) => `<tr><th style="padding:5px 10px;border-top:1px solid #ECE8DF;text-align:left;font-size:12px;font-weight:700;color:#5B6770;white-space:nowrap;background:#FBFAF6;">${name}</th>${sel.map(x => cell(fn(x), opt)).join('')}</tr>`;
    const info = [
      `<tr><th style="background:#FBFAF6;"></th>${sel.map(x => { const ph = photoOf(x.prop); return `<td style="padding:6px 8px;">${ph && !x.prop.hidePhoto ? `<div style="height:70px;border-radius:8px;background:#EDEAE2 url('${esc(ph)}') center/cover no-repeat;"></div>` : '<div style="height:70px;border-radius:8px;background:#EDEAE2;display:flex;align-items:center;justify-content:center;font-size:11px;color:#8C959B;">写真なし</div>'}</td>`; }).join('')}</tr>`,
      row('住所', x => { const sa = Parse.shortAddress(x.prop.address || ''); return esc(sa.upToChome || sa.ward + sa.town || '—'); }),
      row('最寄駅', x => x.r.station ? `${esc(x.r.station)}${/停|前$/.test(x.r.station) ? '' : '駅'} 徒歩${x.info.walk ?? '–'}分` : '—'),
      row(`${esc(destName)}まで`, x => {
        const lines = x.info.legs.map(l => shortLine(l.line)).filter(Boolean);
        return `<b style="font-size:15px;">約${x.info.display ?? '–'}分</b> <span style="color:#5B6770;">${x.info.transfers === 0 ? '乗換なし' : x.info.transfers != null ? '乗換' + x.info.transfers + '回' : ''}${lines.length ? '（' + esc(lines.join('・')) + '）' : ''}</span>`;
      }),
      row('総額', x => x.price ? `<b style="font-size:16px;">${yen(x.price.total)}</b>円<div style="font-size:11px;color:#5B6770;line-height:1.3;">${x.price.days}日間・1日あたり約${yen(roundTo(x.price.total / x.price.days, 10))}円</div>` : '—'),
      row('建物', x => [x.prop.built, x.prop.structure, x.prop.floors ? `${n(x.prop.floors) || x.prop.floors}階建` : ''].filter(Boolean).map(esc).join('・') || '—'),
    ].join('');
    // 設備の行の高さは、入る数に合わせて小さくする
    const rowH = Math.max(15, Math.min(30, Math.floor((300 - (common.length ? 34 : 0)) / Math.max(1, facs.length))));
    const commonRow = common.length ? `<tr><th style="padding:6px 10px;border-top:2px solid #CFE6E3;text-align:left;font-size:12px;font-weight:900;color:#0B5E5C;background:#F1F8F7;white-space:nowrap;">全物件にあり</th><td colspan="${sel.length}" style="padding:6px 10px;border-top:2px solid #CFE6E3;font-size:12px;color:#1E2B33;">${common.map(t => `<span style="display:inline-block;margin:1px 10px 1px 0;"><span style="color:#0F7C7A;font-weight:900;">✓</span> ${esc(t)}</span>`).join('')}</td></tr>` : '';
    const facRows = commonRow + facs.map((t, k) => {
      return `<tr>${k === 0 ? `<th rowspan="${facs.length}" style="padding:6px 10px;border-top:${common.length ? '1px solid #ECE8DF' : '2px solid #CFE6E3'};text-align:left;vertical-align:top;font-size:12px;font-weight:900;color:#0B5E5C;background:#F1F8F7;">主な設備<div style="font-size:10px;font-weight:500;color:#5B6770;margin-top:4px;line-height:1.5;">✓＝あり</div></th>` : ''}${sel.map((x, j) => {
        const h = have[j];
        const v = h === null ? '<span style="color:#B9B3A6;font-size:10px;">未取得</span>' : h.includes(t) ? `<span style="color:${cols[x.i % cols.length].line};font-weight:900;font-size:14px;">✓</span>` : '';
        return `<td style="height:${rowH}px;padding:0 8px;border-top:${k === 0 && !common.length ? '2px solid #CFE6E3' : '1px solid #F0EDE6'};font-size:${rowH < 20 ? 11.5 : 12}px;line-height:1.15;vertical-align:middle;"><span style="display:inline-block;width:18px;text-align:center;line-height:1;">${v}</span><span style="color:${h && h.includes(t) ? '#1E2B33' : '#B9B3A6'};">${esc(t)}</span></td>`;
      }).join('')}</tr>`;
    }).join('');
    const table = `<div style="flex-grow:1;min-height:0;background:#FFFFFF;border:1px solid #E2DED3;border-radius:16px;overflow:hidden;">
<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><colgroup><col style="width:${lw}px">${sel.map(() => '<col>').join('')}</colgroup>
<thead><tr><th style="background:#FBFAF6;"></th>${head}</tr></thead><tbody>${info}${facRows || `<tr><th style="padding:8px 10px;text-align:left;font-size:12px;color:#5B6770;background:#F1F8F7;">主な設備</th><td colspan="${sel.length}" style="padding:8px;font-size:12px;color:#8C959B;">設備の情報がありません（プランページで「🏠プラン取込」をすると入ります）</td></tr>`}</tbody></table></div>`;
    const ttl = `${destName}まで、${sel.length}つのお部屋の比較`;
    const note = `<div style="font-size:11px;color:#8C959B;line-height:1.4;">※設備はプランページの「主な設備」より。総額は1ページ目と同じ条件（${state.persons || 1}名）で計算しています。</div>`;
    return frame(header(ttl, `${label}（${destName}）までの時間・料金・設備`, customerBadge(state)) + table + note);
  }

  function buildSheet(state, opt) {
    PORTRAIT = !!(opt && opt.portrait);
    try {
      const r = state.pattern === 'p2' ? buildP2(state) : buildP1(state);
      if (!r.pages) r.pages = [r.html];
      r.portrait = PORTRAIT;
      return r;
    } finally { PORTRAIT = false; }
  }

  const M = { buildSheet, buildP1, buildP2, routeInfo, makeResolver, routeEndGap, autoTags, shortLine };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnSheet = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
