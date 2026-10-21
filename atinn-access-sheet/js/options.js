// オプション（追加料金・レンタル品）。ブラウザでは window.AtinnOptions、Node では require() で使う。
// 一覧は公式サイト「オプション商品一覧」（https://atinn.jp/options/lineup）を元にした。地域ごとに料金・品目が違う。
// 値段が変わったら ITEMS と AS_OF を直す。
(function (root) {
  'use strict';
  const req = typeof require === 'function';
  const Calc = req ? require('./calc.js') : root.AtinnCalc;

  const AS_OF = '2026-10-21';
  const REGIONS = { kanto: '関東', tokai: '東海', kansai: '関西' };
  // r：地域、n：名前、p：料金、u：day（円/日）か contract（円/契約）、area：提供エリアの限定、smoke：禁煙部屋のみ、elev：エレベーターのある物件のみ
  const ITEMS = [
    {"r": "kanto", "n": "追加備品（1セット）", "p": 8800, "u": "contract", "area": "tokyo23"},
    {"r": "kanto", "n": "姿見", "p": 22, "u": "day", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "kanto", "n": "モバイルデータ通信端末", "p": 440, "u": "day"},
    {"r": "kanto", "n": "折りたたみ自転車【保険付き】", "p": 220, "u": "day", "area": "tokyo"},
    {"r": "kanto", "n": "電動アシスト自転車【保険付き】", "p": 440, "u": "day", "area": "tokyo"},
    {"r": "kanto", "n": "洗濯便利セット", "p": 110, "u": "day"},
    {"r": "kanto", "n": "テレワーク応援セット", "p": 220, "u": "day"},
    {"r": "kanto", "n": "デスク＆チェアセット", "p": 220, "u": "day", "notes": ["常設の部屋あり（注文時に確認）", "入替・搬出は別途費用"]},
    {"r": "kanto", "n": "空気清浄機（プラズマクラスター）【禁煙部屋限定】", "p": 165, "u": "day", "smoke": 1},
    {"r": "kanto", "n": "Blu-ray対応HDDレコーダー", "p": 220, "u": "day"},
    {"r": "kanto", "n": "クッキングセット", "p": 110, "u": "day", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "kanto", "n": "ズボンプレッサー", "p": 110, "u": "day"},
    {"r": "kanto", "n": "加湿セラミックファンヒーター", "p": 220, "u": "day"},
    {"r": "kanto", "n": "プリンター（レーザー複合機）", "p": 275, "u": "day"},
    {"r": "kanto", "n": "炊飯器", "p": 55, "u": "day", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "kanto", "n": "カラーボックス", "p": 11, "u": "day"},
    {"r": "kanto", "n": "衣装ケース", "p": 33, "u": "day"},
    {"r": "kanto", "n": "毛布", "p": 33, "u": "day"},
    {"r": "kanto", "n": "ゲーミングチェア", "p": 330, "u": "day"},
    {"r": "kanto", "n": "ゲーミングデスク", "p": 330, "u": "day"},
    {"r": "kanto", "n": "折りたたみベッド", "p": 220, "u": "day", "elev": 1, "notes": ["エレベーターのある物件のみ"]},
    {"r": "tokai", "n": "追加備品（1セット）", "p": 8800, "u": "contract"},
    {"r": "tokai", "n": "アイロン・アイロン台", "p": 44, "u": "day", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "tokai", "n": "空気清浄機（プラズマクラスター）【禁煙部屋限定】", "p": 143, "u": "day", "smoke": 1},
    {"r": "tokai", "n": "エアーウィーヴライト", "p": 220, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "ブルーレイレコーダー", "p": 220, "u": "day"},
    {"r": "tokai", "n": "カラーボックス", "p": 22, "u": "day"},
    {"r": "tokai", "n": "衣装ケース", "p": 33, "u": "day"},
    {"r": "tokai", "n": "電気スタンド", "p": 11, "u": "day"},
    {"r": "tokai", "n": "扇風機", "p": 33, "u": "day"},
    {"r": "tokai", "n": "32型液晶テレビに変更", "p": 253, "u": "day", "area": "nagoya", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "tokai", "n": "50型液晶テレビに変更・テレビ台セット", "p": 880, "u": "day", "area": "nagoya", "notes": ["搬入出費8,800円が別途", "1か月以上の利用から"]},
    {"r": "tokai", "n": "ホームベーカリー", "p": 55, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "イオンドライヤー", "p": 44, "u": "day", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "tokai", "n": "除湿機", "p": 77, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "加湿器", "p": 33, "u": "day"},
    {"r": "tokai", "n": "加湿器（湿度調整機能付）", "p": 77, "u": "day"},
    {"r": "tokai", "n": "ローテーブル", "p": 22, "u": "day"},
    {"r": "tokai", "n": "マッサージクッション", "p": 33, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "毛布", "p": 22, "u": "day"},
    {"r": "tokai", "n": "掃除ロボット（ルンバ）", "p": 110, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "プロジェクター", "p": 143, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "二人がけソファー", "p": 143, "u": "day", "area": "nagoya", "elev": 1, "notes": ["エレベーターのある物件のみ"]},
    {"r": "tokai", "n": "三段ラック", "p": 11, "u": "day"},
    {"r": "tokai", "n": "姿見", "p": 22, "u": "day", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "tokai", "n": "体脂肪計", "p": 44, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "シャワートイレ", "p": 143, "u": "day", "notes": ["トイレ別の物件が対象"]},
    {"r": "tokai", "n": "自転車【保険付き】", "p": 110, "u": "day", "area": "tokaiBike"},
    {"r": "tokai", "n": "折りたたみベッド", "p": 143, "u": "day", "area": "nagoya", "elev": 1, "notes": ["エレベーターのある物件のみ"]},
    {"r": "tokai", "n": "座椅子", "p": 88, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "タオルケット", "p": 33, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "エアリーマットレスMAR-S　シングル", "p": 99, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "冷感敷きパッド", "p": 33, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "セラミックファンヒーター", "p": 176, "u": "day"},
    {"r": "tokai", "n": "パーソナルチェア", "p": 176, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "ツイン用椅子(折りたたみ)", "p": 55, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "モバイルデータ通信端末", "p": 440, "u": "day"},
    {"r": "tokai", "n": "クッキングセット1", "p": 66, "u": "day", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "tokai", "n": "クッキングセット2", "p": 33, "u": "day", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "tokai", "n": "コーヒーメーカー(ネスカフェ ドルチェ グスト)", "p": 44, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "エアコンクリーニング", "p": 13200, "u": "contract", "notes": ["自動お掃除機能付き・天井埋込型は対象外"]},
    {"r": "tokai", "n": "プリンター（レーザー複合機）", "p": 275, "u": "day"},
    {"r": "tokai", "n": "センターテーブル", "p": 55, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "2ドア冷蔵庫(230L前後)に変更", "p": 550, "u": "day", "area": "nagoya", "elev": 1, "notes": ["エレベーターのある物件のみ", "搬入出費8,800円が別途"]},
    {"r": "tokai", "n": "衣類スチーマー・アイロン台", "p": 44, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "至福の焼き鳥タイム", "p": 550, "u": "day", "area": "nagoya"},
    {"r": "tokai", "n": "シングルクッション【禁煙部屋限定】", "p": 110, "u": "day", "smoke": 1},
    {"r": "tokai", "n": "新洗濯便利セット", "p": 110, "u": "day", "area": "nagoya"},
    {"r": "kansai", "n": "追加備品（1セット）", "p": 8800, "u": "contract"},
    {"r": "kansai", "n": "モバイルデータ通信端末", "p": 440, "u": "day"},
    {"r": "kansai", "n": "自転車【保険付き】", "p": 110, "u": "day", "area": "osaka", "notes": ["物件により駐輪場料金が別途"]},
    {"r": "kansai", "n": "折りたたみ自転車【保険付き】", "p": 220, "u": "day", "area": "osaka", "notes": ["物件により駐輪場料金が別途"]},
    {"r": "kansai", "n": "姿見", "p": 22, "u": "day", "area": "osaka", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "kansai", "n": "洗濯便利セット", "p": 110, "u": "day", "area": "osaka"},
    {"r": "kansai", "n": "デスク＆チェアセット", "p": 220, "u": "day", "area": "osaka", "notes": ["常設の部屋あり（注文時に確認）", "入替・搬出は別途費用"]},
    {"r": "kansai", "n": "クッキングセット", "p": 110, "u": "day", "area": "osaka", "notes": ["常設の部屋あり（注文時に確認）"]},
    {"r": "kansai", "n": "加湿セラミックファンヒーター", "p": 220, "u": "day", "area": "osaka"},
    {"r": "kansai", "n": "カラーボックス", "p": 22, "u": "day", "area": "osaka"},
    {"r": "kansai", "n": "衣装ケース", "p": 33, "u": "day", "area": "osaka"},
    {"r": "kansai", "n": "アイロン・アイロン台", "p": 44, "u": "day", "area": "osaka"},
    {"r": "kansai", "n": "空気清浄機（プラズマクラスター）【禁煙部屋限定】", "p": 143, "u": "day", "area": "osaka", "smoke": 1}

  ];
  // 見積りExcel【一般用】の欄外の決まり（地域を問わない）
  const PET = { n: 'ペット追加', p: 1320, u: 'day', notes: ['ルームクリーニング代はキャンペーン中でも定価'] };
  const PERSON = 1100; // 2人目から1名1,100円/日

  // 提供エリアの限定：住所で判定する。判定できない書き方の住所は「要確認」にする
  const AREAS = {
    tokyo23: { label: '東京23区、横浜市、川崎市のみ', re: /^東京都[^市町村]{1,4}区|横浜市|川崎市/ },
    tokyo: { label: '東京都、横浜市、川崎市のみ', re: /^東京都|横浜市|川崎市/ },
    nagoya: { label: '名古屋市内のみ', re: /名古屋市/ },
    tokaiBike: { label: '名古屋・岐阜・四日市・三河エリアのみ', re: /名古屋市|岐阜県|四日市市|豊橋市|岡崎市|豊田市|安城市|刈谷市|西尾市|知立市|碧南市|高浜市|豊川市|蒲郡市|新城市|田原市|みよし市/ },
    osaka: { label: '大阪市内と江坂（吹田市南部）のみ', re: /大阪市|吹田市/ },
  };

  // 物件の住所から地域を決める（一覧のない地域は ''）
  function regionOf(address) {
    const a = String(address || '');
    if (/^(東京都|神奈川県|埼玉県|千葉県|茨城県|栃木県|群馬県)/.test(a)) return 'kanto';
    if (/^(愛知県|岐阜県|三重県|静岡県)/.test(a)) return 'tokai';
    if (/^(大阪府|京都府|兵庫県|奈良県|滋賀県|和歌山県)/.test(a)) return 'kansai';
    return '';
  }
  function find(name, region) {
    if (name === PET.n) return PET;
    return ITEMS.find(x => x.n === name && x.r === region) || null;
  }
  // 品目の読み（五十音順に並べるため。一覧に品目を足したら、ここにも読みを足す）
  const YOMI = {
    "追加備品（1セット）": "ついかびひん",
    "姿見": "すがたみ",
    "モバイルデータ通信端末": "もばいるでーたつうしんたんまつ",
    "折りたたみ自転車【保険付き】": "おりたたみじてんしゃ",
    "電動アシスト自転車【保険付き】": "でんどうあしすとじてんしゃ",
    "洗濯便利セット": "せんたくべんりせっと",
    "テレワーク応援セット": "てれわーくおうえんせっと",
    "デスク＆チェアセット": "ですくあんどちぇあせっと",
    "空気清浄機（プラズマクラスター）【禁煙部屋限定】": "くうきせいじょうき",
    "Blu-ray対応HDDレコーダー": "ぶるーれいたいおうれこーだー",
    "クッキングセット": "くっきんぐせっと",
    "ズボンプレッサー": "ずぼんぷれっさー",
    "加湿セラミックファンヒーター": "かしつせらみっくふぁんひーたー",
    "プリンター（レーザー複合機）": "ぷりんたー",
    "炊飯器": "すいはんき",
    "カラーボックス": "からーぼっくす",
    "衣装ケース": "いしょうけーす",
    "毛布": "もうふ",
    "ゲーミングチェア": "げーみんぐちぇあ",
    "ゲーミングデスク": "げーみんぐですく",
    "折りたたみベッド": "おりたたみべっど",
    "アイロン・アイロン台": "あいろん",
    "エアーウィーヴライト": "えあーうぃーゔらいと",
    "ブルーレイレコーダー": "ぶるーれいれこーだー",
    "電気スタンド": "でんきすたんど",
    "扇風機": "せんぷうき",
    "32型液晶テレビに変更": "えきしょうてれび32",
    "50型液晶テレビに変更・テレビ台セット": "えきしょうてれび50",
    "ホームベーカリー": "ほーむべーかりー",
    "イオンドライヤー": "いおんどらいやー",
    "除湿機": "じょしつき",
    "加湿器": "かしつき",
    "加湿器（湿度調整機能付）": "かしつき2",
    "ローテーブル": "ろーてーぶる",
    "マッサージクッション": "まっさーじくっしょん",
    "掃除ロボット（ルンバ）": "そうじろぼっと",
    "プロジェクター": "ぷろじぇくたー",
    "二人がけソファー": "ふたりがけそふぁー",
    "三段ラック": "さんだんらっく",
    "体脂肪計": "たいしぼうけい",
    "シャワートイレ": "しゃわーといれ",
    "自転車【保険付き】": "じてんしゃ",
    "座椅子": "ざいす",
    "タオルケット": "たおるけっと",
    "エアリーマットレスMAR-S　シングル": "えありーまっとれす",
    "冷感敷きパッド": "れいかんしきぱっど",
    "セラミックファンヒーター": "せらみっくふぁんひーたー",
    "パーソナルチェア": "ぱーそなるちぇあ",
    "ツイン用椅子(折りたたみ)": "ついんよういす",
    "クッキングセット1": "くっきんぐせっと1",
    "クッキングセット2": "くっきんぐせっと2",
    "コーヒーメーカー(ネスカフェ ドルチェ グスト)": "こーひーめーかー",
    "エアコンクリーニング": "えあこんくりーにんぐ",
    "センターテーブル": "せんたーてーぶる",
    "2ドア冷蔵庫(230L前後)に変更": "れいぞうこ",
    "衣類スチーマー・アイロン台": "いるいすちーまー",
    "至福の焼き鳥タイム": "しふくのやきとりたいむ",
    "シングルクッション【禁煙部屋限定】": "しんぐるくっしょん",
    "新洗濯便利セット": "しんせんたくべんりせっと",
  };
  // 選べる品目（地域をまたいで同じ名前は1つ）を五十音順に。regions を渡すと、その地域にあるものだけ
  function names(regions) {
    const rs = regions && regions.length ? regions : Object.keys(REGIONS);
    const out = [];
    ITEMS.forEach(x => { if (rs.includes(x.r) && !out.includes(x.n)) out.push(x.n); });
    const key = n => YOMI[n] || n;
    return out.sort((a, b) => key(a).localeCompare(key(b), 'ja'));
  }

  // この物件でその品目が使えるか。使えないときは理由、確認が要るときは note を返す
  function check(item, prop) {
    const addr = String(prop.address || '');
    if (item.area) {
      const a = AREAS[item.area];
      if (addr && !a.re.test(addr)) return { ng: `提供エリア外（${a.label}）` };
      if (!addr) return { note: `${a.label}（住所が未入力のため要確認）` };
    }
    if (item.smoke && prop.smoking && !/禁煙/.test(prop.smoking)) return { ng: '禁煙部屋のみ' };
    if (item.elev && prop.equipmentChecked && !/エレベーター/.test(prop.equipment || '')) return { ng: 'エレベーターのある物件のみ' };
    return {};
  }

  // 物件ごとのオプション料金。state.options：[{ name, qty }]（手入力は { name, price, unit, custom: true }）
  // pv はその物件の料金（ペットのときのルームクリーニング代の差額に使う）
  function calc(state, prop, pv, days) {
    const region = regionOf(prop.address);
    const lines = [], warnings = [];
    const persons = Math.max(1, Math.round(Calc.num(state.persons) || 1));
    if (persons > 1) lines.push({ name: `${persons}名様入居`, unitPrice: PERSON * (persons - 1), unit: 'day', qty: 1, person: true });
    let pet = false;
    (state.options || []).forEach(o => {
      if (!o || !o.name) return;
      const qty = Math.max(0, Math.round(Calc.num(o.qty) ?? 1));
      if (!qty) return;
      if (o.custom) {
        const p = Calc.num(o.price);
        if (p === null) return;
        lines.push({ name: o.name, unitPrice: p, unit: o.unit === 'contract' ? 'contract' : 'day', qty });
        return;
      }
      const it = find(o.name, region);
      if (!it) { warnings.push(`「${o.name}」は${REGIONS[region] || 'この地域'}の一覧にないため、料金に入れていません`); return; }
      const c = check(it, prop);
      if (c.ng) { warnings.push(`「${o.name}」は${c.ng}のため、料金に入れていません`); return; }
      if (it === PET) pet = true;
      lines.push({ name: o.name, unitPrice: it.p, unit: it.u, qty, note: c.note || '' });
    });
    // ペットのときは、ルームクリーニング代をキャンペーン中でも定価にする
    const cl = Calc.num((pv || {}).cleaningList), cc = Calc.num((pv || {}).cleaningCampaign);
    const cleaningExtra = pet && cl !== null && cc !== null && cl > cc ? cl - cc : 0;
    lines.forEach(l => { l.amount = l.unitPrice * l.qty * (l.unit === 'day' ? days : 1); });
    const total = lines.reduce((t, l) => t + l.amount, 0) + cleaningExtra;
    return { region, lines, warnings, cleaningExtra, total, perDay: lines.filter(l => l.unit === 'day').reduce((t, l) => t + l.unitPrice * l.qty, 0) };
  }

  const M = { AS_OF, REGIONS, ITEMS, YOMI, PET, AREAS, regionOf, find, names, check, calc };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnOptions = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
