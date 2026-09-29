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
      .trim();
  }

  // 「ご利用料金(１ヶ月以上)」セクションの料金
  function parsePrice(text) {
    const t = toHalf(text);
    let start = t.search(/ご利用料金\s*[(（]\s*1\s*[ヶケかカヵ]月以上\s*[)）]/);
    if (start < 0) start = t.search(/ご利用料金/);
    if (start < 0) return null;
    let sec = t.slice(start, start + 2000);
    const next = sec.slice(10).search(/ご利用料金|ご予約|お問い合わせ|物件概要|設備・サービス/);
    if (next > 0) sec = sec.slice(0, next + 10);
    sec = sec.replace(/^ご利用料金\s*[(（][^)）]*[)）]/, '');
    // 「利用料(賃料+水道光熱費)」の括弧内を消す（ラベルの誤認識を防ぐ）
    sec = sec.replace(/[(（]\s*賃料\s*[+＋]\s*水道光熱費\s*[)）]/g, '');

    const out = { dailyList: null, rentList: null, utilities: null, dailyCampaign: null, cleaningList: null, cleaningCampaign: null, insurancePerMonth: null };
    const re = /(利用料|賃料|水道光熱費|キャンペーン|クリーニング|住宅保険)|(\d{1,3}(?:,\d{3})+|\d{3,})(?![\d,]*\s*[年月日件名])/g;
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
    const t = toHalf(text);
    const found = new Map();
    function add(name, line, walk) {
      name = name.replace(/駅$/, '').trim();
      if (!name || name.length > 12) return;
      const w = Number(walk);
      const cur = found.get(name);
      if (!cur || w < cur.walk) found.set(name, { name, line: (line || '').trim(), walk: w });
    }
    let m;
    const re1 = /([^\s「」『』、,/／|｜:]*?線)?\s*[「『]([^」』\n]{1,12})[」』]\s*駅?\s*(?:から|より)?\s*(?:徒歩|歩)\s*(?:約)?\s*(\d{1,2})\s*分/g;
    while ((m = re1.exec(t))) add(m[2], m[1], m[3]);
    const re2 = /(?:([^\s「」『』、,/／|｜:]{1,20}線)\s*)?([^\s「」『』、,/／|｜:()（）]{1,12}?)駅\s*(?:から|より)?\s*(?:徒歩|歩)\s*(?:約)?\s*(\d{1,2})\s*分/g;
    while ((m = re2.exec(t))) add(m[2], m[1], m[3]);
    return Array.from(found.values()).sort((a, b) => a.walk - b.walk);
  }

  function parseCoords(s) {
    const t = String(s || '');
    let m = /maps\.google\.[a-z.]+\/maps\?[^"'\s<>]*?[?&;]q=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(t)
      || /google\.[a-z.]+\/maps[^"'\s<>]*?[?&;](?:q|ll|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(t)
      || /@(-?\d{2}\.\d+),(-?\d{3}\.\d+)/.exec(t)
      || /^\s*(-?\d{2}\.\d+)\s*[,，\s]\s*(-?\d{3}\.\d+)\s*$/.exec(t);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (!(lat > 20 && lat < 50 && lng > 120 && lng < 155)) return null;
    return { lat, lng };
  }

  function parseAddress(text) {
    const t = toHalf(text);
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
    m = /地上\s*(\d{1,2})\s*階/.exec(t) || /(\d{1,2})\s*階建/.exec(t);
    if (m) out.floors = Number(m[1]);
    if (/全室禁煙|禁煙/.test(t)) out.smoking = '禁煙';
    else if (/喫煙可/.test(t)) out.smoking = '喫煙可';
    m = /設定人数\s*:?\s*(\d{1,2})/.exec(t);
    if (m) out.capacity = Number(m[1]);
    m = /最大(?:人数|利用人数|定員)\s*:?\s*(\d{1,2})/.exec(t);
    if (m) out.maxCapacity = Number(m[1]);
    m = /(?:主な)?設備[^\n]{0,4}\n?([^\n]{4,200})/.exec(t);
    if (m) out.equipment = m[1].trim();
    return out;
  }

  function parseNames(title, h1, text) {
    const cands = [h1, title].concat(String(text || '').split('\n').slice(0, 80)).filter(Boolean).map(s => toHalf(s).trim());
    let planName = '';
    for (const c of cands) {
      if (/アットイン|@in|at\s?inn/i.test(c)) { planName = c.split(/\s*[|｜]\s*|\s+-\s+/)[0].trim(); break; }
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

  const M = { toHalf, stripBrackets, parsePrice, parseStations, parseCoords, parseAddress, shortAddress, parseBuilding, parseNames, parsePlan };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnParse = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
