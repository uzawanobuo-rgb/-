// プランページ（https://atinn.jp/plan/{id}）の本文テキストから項目を取り出す（SPEC.md §3.1）
// ブックマークレットは本文テキスト・座標・写真だけを送り、解析はこのファイルで行う。
// こうしておくと、サイト改修に合わせた修正がツール側だけで済む。
// 取れなかった項目は確認画面で手入力する。
(function (root) {
  'use strict';

  function toHalf(s) {
    return String(s || '')
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/，/g, ',').replace(/：/g, ':').replace(/　/g, ' ')
      .replace(/\r/g, '');
  }
  function toNum(s) { const n = Number(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : null; }

  function stripBrackets(name) {
    return String(name || '')
      .replace(/【[^】]*】/g, '')
      .replace(/^[\s□■◆◇●○★☆◎◯▲△▼▽※・]+/, '')
      .replace(/\s*[(（][^()（）]*(?:駅|分|徒歩)[^()（）]*[)）]\s*$/, '')
      .trim();
  }

  // 「ご利用料金(１ヶ月以上)」セクションの料金
  function parsePrice(text) {
    const t = toHalf(text);
    let start = t.search(/ご利用料金\s*[(（]\s*1\s*[ヶケかカヵ]月以上\s*[)）]/);
    if (start < 0) start = t.search(/ご利用料金/);
    if (start < 0) return null;
    let sec = t.slice(start, start + 2000);
    const next = sec.slice(10).search(/ご利用料金|ご予約|お問い合わせ|物件概要|設備・サービス|ご注意事項|予約\s*\[|同じ建物の他プラン|詳細情報/);
    if (next > 0) sec = sec.slice(0, next + 10);
    sec = sec.replace(/^ご利用料金\s*[(（][^)）]*[)）]/, '');
    // 「利用料(賃料+水道光熱費)」の括弧内を消す（ラベルの誤認識を防ぐ）
    sec = sec.replace(/[(（]\s*賃料\s*[+＋]\s*水道光熱費\s*[)）]/g, '');

    const out = { dailyList: null, rentList: null, utilities: null, dailyCampaign: null, cleaningList: null, cleaningCampaign: null, insurancePerMonth: null };
    const re = /(利用料|賃料|水道光熱費|キャンペーン|クリーニング|住宅保険)|((?<![\d,.\-])(?:\d{1,3}(?:,\d{3})+|\d{3,}|0)(?![\d,.\-]|\s*[年月日件名ヶケか]))/g;
    let label = null, afterCleaning = false, m;
    while ((m = re.exec(sec))) {
      if (m[1]) {
        label = m[1];
        if (label === 'クリーニング') afterCleaning = true;
        continue;
      }
      if (!label) continue;
      const v = toNum(m[2]);
      const key = {
        '利用料': 'dailyList', '賃料': 'rentList', '水道光熱費': 'utilities',
        'クリーニング': 'cleaningList', '住宅保険': 'insurancePerMonth',
        'キャンペーン': afterCleaning ? 'cleaningCampaign' : 'dailyCampaign',
      }[label];
      if (out[key] === null) out[key] = v;
      label = null;
    }
    // 水道光熱費は3桁未満のこともあるので個別に拾い直す
    if (out.utilities === null) {
      const u = /水道光熱費\s*:?\s*(\d[\d,]*)/.exec(sec);
      if (u) out.utilities = toNum(u[1]);
    }
    if (out.dailyList === null && out.rentList !== null && out.utilities !== null) out.dailyList = out.rentList + out.utilities;
    const any = Object.values(out).some(v => v !== null);
    return any ? out : null;
  }

  // 交通：「JR山手線「品川」駅 徒歩9分」「品川駅 徒歩9分」など
  function parseStations(text) {
    let t = toHalf(text);
    const found = new Map();
    function add(name, line, walk) {
      name = name.replace(/駅$/, '').trim();
      if (!name || name.length > 12 || /^[・･、。]/.test(name)) return;
      const w = Number(walk);
      const cur = found.get(name);
      if (!cur || w < cur.walk) found.set(name, { name, line: (line || '').trim(), walk: w });
    }
    let m;
    // 「詳細情報」表の交通欄だけを読む。ページには別物件のおすすめ一覧も同じ書式で並ぶので、
    // 表の行（「住所」の次の「交通」〜次の見出し）に範囲を絞る。
    const ROW_END = '(?=\\n\\s*(?:間取り|専有面積|築年月|総階数|建物種別|建物構造|設定人数)\\s*\\t|$)';
    const row = new RegExp('住所\\s*\\t[^\\n]*\\n\\s*交通\\s*\\t([^]*?)' + ROW_END).exec(t)
      || new RegExp('(?:^|\\n)\\s*交通\\s*\\t([^]*?)' + ROW_END).exec(t);
    if (row) t = row[1];
    // 「品川駅 ( JR山手線 ほか ) 徒歩 8分」。路線名にカッコが入ることがある：「平塚駅 ( JR東海道本線(東京～熱海) ほか ) 徒歩 8分」
    const re0 = /([^\s「」『』、,/／|｜:()（）]{1,12}?)駅\s*[(（]\s*((?:[^()（）\n]|[(（][^()（）\n]*[)）])*?)\s*(?:ほか)?\s*[)）]\s*(?:から|より)?\s*(?:徒歩|歩)\s*(?:約)?\s*(\d{1,2})\s*分/g;
    while ((m = re0.exec(t))) add(m[1], m[2], m[3]);
    if (found.size) return Array.from(found.values()).sort((a, b) => a.walk - b.walk);
    const re1 = /([^\s「」『』、,/／|｜:]*?線)?\s*[「『]([^」』\n]{1,12})[」』]\s*駅?\s*(?:から|より)?\s*(?:徒歩|歩)\s*(?:約)?\s*(\d{1,2})\s*分/g;
    while ((m = re1.exec(t))) add(m[2], m[1], m[3]);
    const re2 = /(?:([^\s「」『』、,/／|｜:]{1,20}線)\s*)?([^\s「」『』、,/／|｜:()（）]{1,12}?)駅\s*(?:から|より)?\s*(?:徒歩|歩)\s*(?:約)?\s*(\d{1,2})\s*分/g;
    while ((m = re2.exec(t))) add(m[2], m[1], m[3]);
    return Array.from(found.values()).sort((a, b) => a.walk - b.walk);
  }

  function parseCoords(s) {
    const t = String(s || '');
    // Googleマップの場所のURL：data の最後の !3d緯度!4d経度 が、選んだ場所の位置（@ のあとは画面の中心）
    const pl = [...t.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)].pop();
    let m = pl || /maps\.google\.[a-z.]+\/maps\?[^"'\s<>]*?[?&;]q=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(t)
      || /google\.[a-z.]+\/maps[^"'\s<>]*?[?&;](?:q|ll|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(t)
      || /@(-?\d{2}\.\d+),(-?\d{3}\.\d+)/.exec(t)
      || /^\s*(-?\d{2}\.\d+)\s*[,，\s]\s*(-?\d{3}\.\d+)\s*$/.exec(t);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (!(lat > 20 && lat < 50 && lng > 120 && lng < 155)) return null;
    return { lat, lng };
  }

  // GoogleマップのURL（場所・ピン）から、場所の名前と位置を読む。読めなければ null
  function parseGmapPlace(s) {
    const t = String(s || '').trim();
    if (!/google\.[a-z.]+\/maps/i.test(t)) return null;
    const c = parseCoords(t);
    if (!c) return null;
    let name = '';
    const m = /\/maps\/place\/([^/@?]+)/.exec(t);
    if (m) {
      try { name = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim(); } catch (e) { name = ''; }
      if (/^[-\d.,\s°'"NSEWnsew]+$/.test(name)) name = ''; // 座標だけのピン
    }
    return { name, lat: c.lat, lng: c.lng };
  }

  function parseAddress(text) {
    const t = toHalf(text);
    const lab = /(?:^|\n)\s*(?:住所|所在地)\s*[\t:：]?\s*(?:〒?\s*\d{3}-?\d{4}\s*)?((?:東京都|北海道|(?:京都|大阪)府|[^\s\n]{2,3}県)[^\n\t]{2,60})/.exec(t);
    if (lab) return lab[1].replace(/\s*(Google\s*マップ|地図|MAP|マップ).*$/i, '').trim();
    const m = /(東京都|北海道|(?:京都|大阪)府|[^\s\n]{2,3}県)[^\s\n,、。]{2,40}/.exec(t);
    return m ? m[0].replace(/(地図|MAP|マップ).*$/i, '').trim() : '';
  }

  // 住所から「区＋町名」「都道府県＋区＋町名（丁目まで）」を作る
  function shortAddress(addr) {
    const a = toHalf(addr || '').trim();
    const m = /^(東京都|北海道|(?:京都|大阪)府|[^\s]{2,3}県)?(.+?[市区町村])(.*)$/.exec(a);
    if (!m) return { ward: '', town: '', upToChome: a };
    const pref = m[1] || '', city = m[2];
    let rest = m[3];
    const chome = /^([^\d\-－]+?\d+丁目)/.exec(rest) || /^([^\d\-－]+?[一二三四五六七八九十]+丁目)/.exec(rest);
    const townOnly = /^([^\d\-－一二三四五六七八九十]+)/.exec(rest);
    const town = townOnly ? townOnly[1].replace(/丁目$/, '') : '';
    return { ward: city.replace(/^.*?郡/, ''), town, upToChome: pref + city + (chome ? chome[1] : town) };
  }

  function parseBuilding(text) {
    const t = toHalf(text);
    const out = {};
    let m = /築年月\s*:?\s*(\d{4})\s*年\s*(\d{1,2})\s*月/.exec(t) || /(\d{4})\s*年\s*(\d{1,2})\s*月\s*築/.exec(t);
    if (m) out.built = m[1] + '年' + m[2] + '月';
    m = /構造\s*:?\s*([^\s\n]{2,20})/.exec(t);
    if (m) out.structure = m[1];
    m = /総階数\s*:?\s*(\d{1,2})\s*階/.exec(t) || /地上\s*(\d{1,2})\s*階/.exec(t) || /(\d{1,2})\s*階建/.exec(t);
    if (m) out.floors = Number(m[1]);
    if (/全室禁煙|禁煙/.test(t)) out.smoking = '禁煙';
    else if (/喫煙可/.test(t)) out.smoking = '喫煙可';
    m = /設定人数\s*:?\s*(\d{1,2})/.exec(t);
    if (m) out.capacity = Number(m[1]);
    m = /設定人数[^\n]*?最大\s*[:：]?\s*(\d{1,2})/.exec(t) || /最大(?:人数|利用人数|定員)\s*:?\s*(\d{1,2})/.exec(t);
    if (m) out.maxCapacity = Number(m[1]);
    m = /主な設備[^\n]*\n((?:[ \t]*[^\t\n]{1,30}\n){1,40})/.exec(t + '\n');
    if (m) out.equipment = m[1].split('\n').map(x => x.trim()).filter(Boolean).join('、');
    return out;
  }

  function parseNames(title, h1, text) {
    const lab = /(?:^|\n)\s*プラン名\s*[\t:：]\s*([^\n]+)/.exec(toHalf(text || ''));
    if (lab) { const pn = lab[1].trim(); return { planName: pn, name: stripBrackets(pn) }; }
    const cands = [h1, title].concat(String(text || '').split('\n').slice(0, 80)).filter(Boolean).map(s => toHalf(s).trim());
    let planName = '';
    for (const c of cands) {
      if (/アットイン|@in|at\s?inn/i.test(c)) { planName = c.split(/\s*[|｜]\s*|\s+[-─―]\s+/)[0].replace(/のプラン詳細$/, '').trim(); break; }
    }
    if (!planName && cands.length) planName = cands[0].split(/\s*[|｜]\s*/)[0];
    const name = stripBrackets(planName);
    return { planName, name };
  }

  // payload: ブックマークレットのJSON、またはページ全文のテキスト
  function parsePlan(payload) {
    let p = payload;
    if (typeof p === 'string') {
      const s = p.trim();
      if (s.startsWith('{')) { try { p = JSON.parse(s); } catch (e) { p = { text: s }; } }
      else p = { text: s };
    }
    const text = p.text || '';
    const names = parseNames(p.title, p.h1, text);
    const coords = (p.lat && p.lng) ? { lat: Number(p.lat), lng: Number(p.lng) } : parseCoords(p.html || text);
    const idm = /\/plan\/(\d+)/.exec(p.url || '');
    return Object.assign({
      planUrl: p.url || '',
      planId: idm ? idm[1] : '',
      planName: names.planName,
      name: names.name,
      address: parseAddress(text),
      lat: coords ? coords.lat : null,
      lng: coords ? coords.lng : null,
      stations: parseStations(text),
      price: parsePrice(text),
      photos: Array.isArray(p.images) ? p.images.filter(i => i && (i.data || i.src)) : [],
      fetchedAt: p.fetchedAt || null,
    }, parseBuilding(text));
  }


  // ---------- Yahoo!乗換案内の検索結果（「乗換取込」ブックマークレット）----------
  // 路線名を短く：「ＪＲ東海道本線(上野東京ライン)高崎行」→「JR上野東京ライン」、「ＪＲ山手線内回り東京・上野方面」→「JR山手線」
  function cleanLine(s) {
    s = toHalf(s).replace(/ＪＲ/g, 'JR').replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).trim();
    const alias = /^(JR)?[^(（]*[(（]([^)）]*ライン)[)）]/.exec(s);
    if (alias) return (alias[1] || '') + alias[2];
    if (/バス/.test(s)) return s.replace(/[(（][^)）]*[)）].*$/, '').replace(/\s*\S*(行|方面)$/, '').replace(/・/, ' ').trim();
    const m = /^(.*?(?:線|ライン|ゆりかもめ|ライナー))/.exec(s);
    if (m) return m[1].replace(/(内回り|外回り)$/, '');
    return s.replace(/\s*\S*(行|方面)$/, '').trim();
  }
  // 「西麻布/都営バス」「渋谷駅前(東側)/都営バス」「大宮(埼玉県)」「品川駅」→ 地点名
  function cleanStation(s) {
    return String(s || '').replace(/\/.*$/, '').replace(/[(（][^)）]*[)）]/g, '').replace(/〔[^〕]*〕/g, '').replace(/駅$/, '').trim();
  }
  function hm(s) { const m = /(\d{1,2}):(\d{2})/.exec(s); return m ? (+m[1]) * 60 + (+m[2]) : null; }

  // 経路の詳細を「地点 → 区間 → 地点 …」として読む
  const SKIP = /^(時刻表|出口|地図|地図でルートを表示|ルート保存|定期券|ルート共有|印刷する|発|着)$|^出口[:：]|^\[発\]|^乗車位置|^\d+駅$|円$|^[\d.]+km$|^IC優先|^現金優先|^乗換：|^定期の種類|^\d+か月|^メールで送信|^カレンダーに登録|^[早楽安]+$/;
  function parseTransitRoutes(text) {
    const L = String(text || '').replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean);
    const routes = [];
    for (let i = 0; i < L.length; i++) {
      const m = /^(\d{1,2}:\d{2})発→(\d{1,2}:\d{2})着(\d+)分（乗車(\d+)分）/.exec(L[i]);
      if (!m) continue;
      let transfers = null;
      // 地点：時刻の直後の名前。「時刻表」「出口」「地図」のリンクが付くものだけが乗り降りする地点（途中駅は名前だけ）
      const pts = [];
      let pend = { arr: null, dep: null }, expectPoint = false, j = i + 1;
      for (; j < L.length; j++) {
        const x = L[j];
        if (/^(\d{1,2}:\d{2})発→/.test(x) || /^ルートに表示される記号/.test(x) || /^ルート\d+$/.test(x)) break;
        const t = /^乗換：(\d+)回/.exec(x);
        if (t) { transfers = +t[1]; continue; }
        const tm = /^(\d{1,2}:\d{2})(発|着)?$/.exec(x);
        if (tm) {
          const kind = tm[2] || (L[j + 1] === '発' ? '発' : L[j + 1] === '着' ? '着' : '発');
          if (kind === '発') pend.dep = hm(tm[1]); else pend.arr = hm(tm[1]);
          expectPoint = true;
          continue;
        }
        const last = pts[pts.length - 1];
        // 「地図」リンクの位置（htmlToText が 地図@緯度,経度 にしたもの）
        const mc = /^地図@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(x);
        if (mc) { if (last) { last.real = true; last.coord = { lat: +mc[1], lng: +mc[2] }; } continue; }
        if (/^(時刻表|出口|地図)$|^出口[:：]/.test(x)) { if (last) last.real = true; continue; }
        if (SKIP.test(x)) continue;
        if (expectPoint) {
          pts.push({ name: cleanStation(x), raw: x, arr: pend.arr, dep: pend.dep, real: false, seg: null });
          pend = { arr: null, dep: null }; expectPoint = false;
          continue;
        }
        if (last && last.real && !last.seg) {
          const w = /^徒歩(\d+)?分?/.exec(x);
          last.seg = w ? { walk: true, min: w[1] ? +w[1] : null } : { walk: false, line: x };
        }
      }
      const points = pts.filter(p => p.real);
      const segs = points.slice(0, -1).map(p => p.seg || { walk: true, min: null });
      i = j - 1;
      const rideIdx = segs.map((sg, k) => sg.walk ? -1 : k).filter(k => k >= 0);
      if (points.length < 2 || !rideIdx.length) continue;
      const f = rideIdx[0];
      const board = points[f], last = points[points.length - 1];
      const initialWalk = segs.slice(0, f).reduce((a, sg) => a + (sg.min || 0), 0);
      let ride = board.dep != null && last.arr != null ? last.arr - board.dep : +m[3];
      if (ride < 0) ride += 24 * 60;
      routes.push({
        dep: m[1], arr: m[2], total: +m[3], ride, transfers: transfers ?? (rideIdx.length - 1), initialWalk,
        from: board.name, to: last.name, toCoord: last.coord || null, fromCoord: board.coord || null,
        legs: rideIdx.map(k => ({ mode: /バス/.test(segs[k].line) ? 'bus' : 'train', line: cleanLine(segs[k].line), to: (points[k + 1] || last).name })),
      });
    }
    return routes;
  }

  // HTML → 行のリスト（ページの見た目＝CSSに左右されないよう、タグの種類だけで改行を決める）
  function htmlToText(html) {
    let t = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
    // Yahoo!乗換案内の各地点の「地図」リンクには位置が入っている。行き先が想定の場所かを確かめるために残す
    t = t.replace(/<a\b[^>]*href="([^"]*map\.yahoo\.co\.jp\/place\?[^"]*)"[^>]*>\s*地図\s*<\/a>/gi, (m0, href) => {
      const h = href.replace(/&amp;/g, '&');
      const la = /[?&]lat=(-?\d+(?:\.\d+)?)/.exec(h), lo = /[?&]lon=(-?\d+(?:\.\d+)?)/.exec(h);
      return la && lo ? `\n地図@${la[1]},${lo[1]}\n` : m0;
    });
    t = t.replace(/<br\s*\/?>|<\/(li|div|p|dd|dt|dl|ul|ol|tr|h\d|section|table)>|<(li|div|p|dd|dt|dl|ul|ol|tr|h\d|section|table)\b[^>]*>/gi, '\n');
    t = t.replace(/<[^>]+>/g, '');
    t = t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    return t.split('\n').map(x => x.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
  }
  // 画面の表示（innerText）は環境で改行位置が変わるので、要約行が2行に分かれていたらつなぐ
  function normalizeTransitText(text) {
    return String(text || '').replace(/\r/g, '')
      .replace(/(\d{1,2}:\d{2})\s*発\s*→\s*(\d{1,2}:\d{2})\s*着\s*(\d+)\s*分\s*[(（]\s*乗車\s*(\d+)\s*分\s*[)）]/g, '$1発→$2着$3分（乗車$4分）')
      .replace(/(\d{1,2}:\d{2})\s+(発|着)\s*$/gm, '$1\n$2');
  }

  // 貼り付けられた内容（ブックマークレットのJSON またはページ全文）から、乗車時間がいちばん短い経路を選ぶ
  function parseTransit(payload) {
    let p = payload;
    if (typeof p === 'string') {
      const s = p.trim();
      if (s.startsWith('{')) { try { p = JSON.parse(s); } catch (e) { p = { text: s }; } } else p = { text: s };
    }
    let routes = p.html ? parseTransitRoutes(htmlToText(p.html)) : [];
    if (!routes.length) routes = parseTransitRoutes(normalizeTransitText(p.text || ''));
    if (!routes.length) return null;
    const best = routes.slice().sort((a, b) => a.ride - b.ride || a.transfers - b.transfers)[0];
    return Object.assign({ url: p.url || '', routes }, best);
  }

  const M = { htmlToText, normalizeTransitText, cleanLine, cleanStation, parseTransitRoutes, parseTransit, toHalf, stripBrackets, parsePrice, parseStations, parseCoords, parseGmapPlace, parseAddress, shortAddress, parseBuilding, parseNames, parsePlan };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnParse = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
