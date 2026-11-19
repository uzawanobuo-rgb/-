// アクセス案内シート作成ツール：初回準備と使い方 の PowerPoint を作る
//   cd atinn-access-sheet/manual && npm install && node build-pptx.js
//   → output/アクセス案内シート作成ツール_初回準備と使い方.pptx
// 画像は screenshots/ の画面写真から、必要な部分を切り出して使う（img/ に作る）
const fs = require('fs');
const pptxgen = require('pptxgenjs');
const JSZip = require('jszip');
const sharp = require('sharp');
const path = require('path');

const SHOT = f => path.join(__dirname, 'screenshots', f);
const IMG = f => path.join(__dirname, 'img', f + '.png');
const OUT = process.argv[2] || path.join(__dirname, 'output');
const URL = 'http://magi2.atinn.jp/access-sheet/index.html';

// 画面写真から、スライドで使う部分を切り出す
async function prepareImages() {
  fs.mkdirSync(path.join(__dirname, 'img'), { recursive: true });
  const cut = (f, o, box) => sharp(SHOT(f + '.png')).extract(box).png().toFile(IMG(o));
  await cut('g03-slot', 'slot', { left: 300, top: 150, width: 1700, height: 1000 });
  await cut('g05-prop-before', 'before', { left: 0, top: 1050, width: 1120, height: 674 });
  await cut('g08-prop-after', 'after', { left: 0, top: 1050, width: 1120, height: 722 });
  await cut('g12-mail', 'mail', { left: 0, top: 0, width: 1120, height: 1000 });
  await sharp(SHOT('g10-tool-full.png')).png().toFile(IMG('tool'));
  await sharp(SHOT('howto-panel.png')).png().toFile(IMG('howto'));
  for (const f of ['g04-dest', 'g09-opts', 'g13-sheet', 'u-magi', 'g02-plan']) await sharp(SHOT(f + '.png')).png().toFile(IMG(f));
}

// pptxgenjs はテーマの色を書けないので、書き出したあとにテーマの色を入れ替える
async function applyTheme(file, theme) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  for (const name of Object.keys(zip.files).filter(n => /^ppt\/theme\/theme\d+\.xml$/.test(n))) {
    let xml = await zip.file(name).async('string');
    for (const [k, v] of Object.entries(theme.colors)) {
      xml = xml.replace(new RegExp(`<a:${k}>[\\s\\S]*?</a:${k}>`), `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`);
    }
    xml = xml.replace(/(<a:clrScheme name=")[^"]*/, `$1${theme.name}`);
    zip.file(name, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

const HEX = { navy: '1F2A33', teal: '0E7C7B', tealTint: 'E6F2F1', orange: 'E8692E', orangeTint: 'FDF0E8', gray: '5B6670', line: 'D5DCE0', light: 'F4F6F7' };
const THEME = {
  name: 'atinn access sheet', headFontFace: 'Meiryo', bodyFontFace: 'Meiryo',
  colors: { dk1: '1F2A33', lt1: 'FFFFFF', dk2: '5B6670', lt2: 'F4F6F7', accent1: '0E7C7B', accent2: 'E8692E', accent3: 'E6F2F1', accent4: 'FDF0E8', accent5: 'D5DCE0', accent6: '2B6CB0', hlink: '0E7C7B', folHlink: '5B6670' },
};
const W = 13.333, H = 7.5, M = 0.6;

async function size(f) { const m = await sharp(IMG(f)).metadata(); return { w: m.width, h: m.height }; }

function makeDeck(title) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = title;
  pres.author = 'アットイン';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;
  pres.defineSlideMaster({
    title: 'TITLE_DARK',
    background: { color: C.text1 },
    objects: [
      { placeholder: { options: { name: 'kicker', type: 'body', x: M, y: 1.7, w: 9, h: 0.5, fontSize: 18, bold: true, color: C.accent2, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.25, w: 11.5, h: 1.6, fontSize: 40, bold: true, color: C.background1, margin: 0, valign: 'top', align: 'left' }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: M, y: 4.0, w: 6.6, h: 1.8, fontSize: 16, color: 'C9D3D9', margin: 0, valign: 'top' }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'CONTENT',
    background: { color: C.background1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: M + 0.75, y: 0.38, w: W - 2 * M - 0.75, h: 0.7, fontSize: 28, bold: true, color: C.text1, margin: 0, valign: 'middle', align: 'left' }, text: '' } },
      { text: { text: 'アットイン　アクセス案内シート作成ツール', options: { x: M, y: H - 0.42, w: 6, h: 0.3, fontSize: 10, color: C.text2, margin: 0 } } },
    ],
    slideNumber: { x: W - M - 0.6, y: H - 0.42, w: 0.6, h: 0.3, fontSize: 10, color: '5B6670', align: 'right' },
  });
  return { pres, C };
}

// 見出しの左の丸い番号（全スライドで同じ位置）
function badge(slide, C, label, color) {
  slide.addShape('ellipse', { x: M, y: 0.43, w: 0.6, h: 0.6, fill: { color: color || C.accent1 }, line: { type: 'none' }, objectName: 'badge' });
  slide.addText(label, { x: M, y: 0.43, w: 0.6, h: 0.6, align: 'center', valign: 'middle', fontSize: label.length > 1 ? 12 : 20, bold: true, color: C.background1, margin: 0, isTextBox: true, objectName: 'badge-label' });
}

// 枠に収まるように画像を置く（縦横比そのまま）。枠線つき
async function pic(slide, C, f, x, y, w, h, opt = {}) {
  const s = await size(f);
  const r = Math.min(w / s.w, h / s.h);
  const iw = s.w * r, ih = s.h * r;
  const ix = opt.alignLeft ? x : x + (w - iw) / 2, iy = opt.alignTop ? y : y + (h - ih) / 2;
  slide.addShape('rect', { x: ix - 0.02, y: iy - 0.02, w: iw + 0.04, h: ih + 0.04, fill: { color: C.background1 }, line: { color: HEX.line, width: 1 }, shadow: { type: 'outer', color: '000000', opacity: 0.12, blur: 6, offset: 2, angle: 90 }, objectName: 'frame-' + f });
  slide.addImage({ path: IMG(f), x: ix, y: iy, w: iw, h: ih, altText: opt.alt || f, objectName: 'img-' + f });
  return { x: ix, y: iy, w: iw, h: ih };
}

function caption(slide, C, text, x, y, w) {
  slide.addText(text, { x, y, w, h: 0.32, fontSize: 11, color: C.text2, margin: 0, isTextBox: true, objectName: 'caption' });
}

// 説明のかたまり：太字の見出し＋本文の行
function points(slide, C, items, x, y, w, h, opt = {}) {
  const runs = [];
  items.forEach((it, i) => {
    const last = i === items.length - 1;
    if (it.head) runs.push({ text: it.head, options: { bold: true, color: it.color || C.accent1, fontSize: opt.headSize || 15, breakLine: true, paraSpaceAfter: 2 } });
    runs.push({ text: it.text, options: { fontSize: opt.size || 14, color: C.text1, breakLine: !last, paraSpaceAfter: last ? 0 : 12 } });
  });
  slide.addText(runs, { x, y, w, h, valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.15, objectName: opt.name || 'points' });
}

// 色のついたメモ（ヒント・注意）
function note(slide, C, head, text, x, y, w, h, kind) {
  const warn = kind === 'warn';
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.12, fill: { color: warn ? C.accent4 : C.accent3 }, line: { type: 'none' }, objectName: 'note-bg' });
  slide.addText([
    { text: head, options: { bold: true, fontSize: 14, color: warn ? C.accent2 : C.accent1, breakLine: true, paraSpaceAfter: 4 } },
    { text, options: { fontSize: 13, color: C.text1 } },
  ], { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: h - 0.3, valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1, objectName: 'note-text' });
}

// 番号つきの手順（丸数字＋文）
function steps(slide, C, list, x, y, w, gap) {
  list.forEach((s, i) => {
    const yy = y + i * gap;
    slide.addShape('ellipse', { x, y: yy, w: 0.42, h: 0.42, fill: { color: C.accent2 }, line: { type: 'none' }, objectName: 'step-dot' });
    slide.addText(String(i + 1), { x, y: yy, w: 0.42, h: 0.42, align: 'center', valign: 'middle', fontSize: 14, bold: true, color: C.background1, margin: 0, isTextBox: true, objectName: 'step-num' });
    slide.addText(s, { x: x + 0.6, y: yy - 0.05, w: w - 0.6, h: gap - 0.05, fontSize: 14, color: C.text1, valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1, objectName: 'step-text' });
  });
}

// ブラウザの上部（アドレスバー＋ブックマークバー）の説明図
function browser(slide, C, x, y, w, url, opt = {}) {
  const h = opt.h || 1.5;
  const cw = opt.compact ? 1.25 : 1.6, c0 = opt.compact ? 1.25 : 1.6, fs = opt.compact ? 11 : 12;
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: C.background1 }, line: { color: HEX.line, width: 1 }, shadow: { type: 'outer', color: '000000', opacity: 0.12, blur: 6, offset: 2, angle: 90 }, objectName: 'browser' });
  slide.addShape('roundRect', { x: x + 0.05, y: y + 0.05, w: w - 0.1, h: 0.6, rectRadius: 0.08, fill: { color: 'E9ECEF' }, line: { type: 'none' }, objectName: 'browser-top' });
  slide.addText('←  →  ⟳', { x: x + 0.2, y: y + 0.12, w: 1.0, h: 0.45, fontSize: 13, color: C.text2, margin: 0, valign: 'middle', isTextBox: true });
  slide.addShape('roundRect', { x: x + 1.2, y: y + 0.13, w: w - 1.4, h: 0.44, rectRadius: 0.2, fill: { color: C.background1 }, line: { type: 'none' }, objectName: 'address' });
  slide.addText(url, { x: x + 1.4, y: y + 0.13, w: w - 1.7, h: 0.44, fontSize: opt.compact ? 10 : 12, color: C.text1, margin: 0, valign: 'middle', isTextBox: true, fit: 'shrink', objectName: 'address-text' });
  const by = y + 0.75;
  slide.addText(opt.compact ? '📁' : '📁 よく使う', { x: x + 0.25, y: by, w: 1.3, h: 0.45, fontSize: 12, color: C.text2, margin: 0, valign: 'middle', isTextBox: true });
  const chips = [['🏠 プラン取込', opt.hiPlan], ['🚃 乗換取込', opt.hiTransit]];
  let cx = x + (opt.compact ? 0.65 : c0);
  chips.forEach(([t, hi]) => {
    slide.addShape('roundRect', { x: cx, y: by + 0.02, w: cw, h: 0.42, rectRadius: 0.08, fill: { color: hi ? C.accent4 : C.background1 }, line: { color: hi ? C.accent2 : HEX.line, width: hi ? 2 : 1 }, objectName: 'chip' });
    slide.addText(t, { x: cx, y: by + 0.02, w: cw, h: 0.42, fontSize: fs, bold: true, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'chip-text' });
    cx += cw + 0.15;
  });
  return { barY: by, chipX: x + 1.6 };
}

// ───────────── 初回のみ：ブックマークの登録 ─────────────
async function buildSetup(pres, C) {
  pres.addSection({ title: '初回のみの準備' });
  let s = pres.addSlide({ masterName: 'TITLE_DARK', sectionTitle: '初回のみの準備' });
  s.addText('初回のみの準備　約1分', { placeholder: 'kicker' });
  s.addText('はじめにブックマークを登録する', { placeholder: 'title' });
  s.addText('ツールを使い始める前に1回だけ、「プラン取込」「乗換取込」の2つをブラウザのブックマークバーに登録します。', { placeholder: 'body' });
  // 右側：登録後のブックマークバー
  browser(s, C, 7.6, 4.0, 5.15, 'magi2.atinn.jp/access-sheet/index.html', { hiPlan: true, hiTransit: true });

  // 1. ツールを開く
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '初回のみの準備' });
  badge(s, C, '初回', C.accent2);
  s.addText('ツールを開いて、ブックマークバーを表示する', { placeholder: 'title' });
  s.addShape('roundRect', { x: M, y: 1.45, w: W - 2 * M, h: 1.05, rectRadius: 0.12, fill: { color: C.text1 }, line: { type: 'none' }, objectName: 'url-box' });
  s.addText([
    { text: 'ツールの場所　', options: { fontSize: 15, bold: true, color: 'C9D3D9' } },
    { text: URL, options: { fontSize: 22, bold: true, color: C.background1 } },
  ], { x: M + 0.35, y: 1.45, w: W - 2 * M - 0.7, h: 1.05, valign: 'middle', margin: 0, isTextBox: true, objectName: 'url-text' });
  points(s, C, [
    { head: 'ブラウザは Chrome か Edge', text: '社内ネットワークにつながったパソコンで開きます。よく使うので、このページもブックマークしておくと便利です。' },
    { head: 'ブックマークバーが見えないとき', text: 'キーボードで Ctrl ＋ Shift ＋ B を押すと、アドレスバーの下に表示されます。' },
  ], M, 3.2, 5.6, 3.4, { size: 16, headSize: 18 });
  browser(s, C, 6.8, 3.3, 5.93, URL, { h: 1.5 });
  s.addShape('roundRect', { x: 6.8 + 0.12, y: 3.3 + 0.72, w: 5.7, h: 0.6, rectRadius: 0.08, fill: { type: 'none' }, line: { color: C.accent2, width: 2.5, dashType: 'dash' }, objectName: 'bar-ring' });
  s.addText('ここがブックマークバー（Ctrl＋Shift＋B で表示）', { x: 6.8, y: 4.95, w: 5.93, h: 0.4, fontSize: 13, bold: true, color: C.accent2, margin: 0, isTextBox: true, objectName: 'bar-label' });

  // 2. ドラッグ
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '初回のみの準備' });
  badge(s, C, '初回', C.accent2);
  s.addText('黒い2つのボタンを、ブックマークバーへドラッグ', { placeholder: 'title' });
  const p = await pic(s, C, 'howto', M, 1.4, 5.6, 5.3, { alignLeft: true, alt: 'ツールの「使い方・ブックマークレット」の欄' });
  // 画像の中の黒いボタン（元画像 627×592 の x18〜254, y393〜433）を囲む
  const sx = p.w / 627, sy = p.h / 592;
  s.addShape('roundRect', { x: p.x + 12 * sx, y: p.y + 386 * sy, w: 250 * sx, h: 54 * sy, rectRadius: 0.08, fill: { type: 'none' }, line: { color: C.accent2, width: 3 }, objectName: 'btn-ring' });
  const rx = 6.8;
  steps(s, C, [
    'ツールの左上「使い方・ブックマークレット」の欄を開きます。',
    '黒いボタン「🏠プラン取込」を、マウスで押したままブックマークバーまで動かして離します（クリックではなくドラッグ）。',
    '「🚃乗換取込」も同じようにドラッグします。',
  ], rx, 1.5, W - M - rx, 0.95);
  s.addShape('line', { x: p.x + 262 * sx, y: p.y + 413 * sy, w: rx + 1.6 - (p.x + 262 * sx), h: 4.55 + 0.75 - (p.y + 413 * sy), line: { color: C.accent2, width: 2.5, endArrowType: 'triangle', dashType: 'dash' }, objectName: 'drag-arrow' });
  browser(s, C, rx, 4.55, W - M - rx, URL, { hiPlan: true, hiTransit: true, h: 1.35 });
  caption(s, C, '登録できると、ブックマークバーにこの2つが並びます。', rx, 6.05, W - M - rx);

  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '初回のみの準備' });
  badge(s, C, '!', C.accent2);
  s.addText('登録し直しが必要なとき・使えないとき', { placeholder: 'title' });
  const cw = (W - 2 * M - 0.6) / 3, cy = 1.6, ch = 3.6;
  [
    ['ツールが更新されたとき', '社内サーバー（http）のツールは、ブックマークの中にツールの本体が入っています。更新の連絡があったら、古い2つを削除して、もう一度ドラッグしてください。', 'warn'],
    ['2026年9月30日より前に登録した人', '「プラン取込」「乗換取込」とも、一度だけ登録し直してください（古いほうを削除して、ボタンを再ドラッグ）。', 'warn'],
    ['ブックマークが使えないとき', 'プランページで 全選択（Ctrl＋A）→ コピー（Ctrl＋C）して、ツールに貼り付けても、料金・最寄駅などは取り込めます。写真と地図の位置は取れないので、位置は住所から検索します。', 'info'],
  ].forEach(([h, t, k], i) => note(s, C, h, t, M + i * (cw + 0.3), cy, cw, ch, k));
  s.addText('準備はここまで。次のページから、毎回の作り方です。', { x: M, y: 5.7, w: W - 2 * M, h: 0.45, fontSize: 15, bold: true, color: C.accent1, margin: 0, isTextBox: true, objectName: 'next' });

}

// ───────────── 使い方 ─────────────
async function buildUsage(file) {
  const { pres, C } = makeDeck('アクセス案内シート作成ツール 初回準備と使い方');
  pres.addSection({ title: '表紙' });
  let s = pres.addSlide({ masterName: 'TITLE_DARK', sectionTitle: '表紙' });
  s.addText('営業向け　使い方', { placeholder: 'kicker' });
  s.addText('アクセス案内シート作成ツール\nご提案シートの作り方', { placeholder: 'title' });
  s.addText('お客様の目的地（お勤め先など）から、候補の部屋までの所要時間と料金を1枚にまとめます。物件の情報も経路も、ブックマークのボタンで取り込めます。', { placeholder: 'body' });
  await pic(s, C, 'g13-sheet', 8.2, 3.9, 4.55, 3.0, { alt: 'ご提案シートの見本' });

  pres.addSection({ title: '全体の流れ' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '全体の流れ' });
  badge(s, C, '◎');
  s.addText('できあがりのイメージ', { placeholder: 'title' });
  await pic(s, C, 'g13-sheet', M, 1.35, 8.2, 5.4, { alignLeft: true, alt: 'ご提案シートの見本（大手町にお勤めの山田様へ、3部屋のご提案）' });
  points(s, C, [
    { head: '例', text: '大手町にお勤めの山田様へ、大崎・大井町・品川の3部屋をご提案' },
    { head: '1枚にまとまるもの', text: '目的地から各部屋までの所要時間と乗換回数、路線図、1か月の総額、写真・強み' },
    { head: '保存のしかた', text: 'PNG（横・縦）、PDF。メール用の見積り文もコピーできます。' },
  ], 9.2, 1.45, W - M - 9.2, 5.2);

  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '全体の流れ' });
  badge(s, C, '◎');
  s.addText('作り方の流れ（3部屋で約5分）', { placeholder: 'title' });
  const flow = [
    ['1', '部屋を選ぶ', 'MAGI の空室検索で部屋を決め、プランページを開く'],
    ['2', 'プラン取込', 'プランページでブックマーク「プラン取込」を押す'],
    ['3', '目的地・条件', '目的地・利用期間・人数を入れる'],
    ['4', '乗換取込', 'Yahoo!乗換案内で検索して「乗換取込」を押す'],
    ['5', 'オプション', 'レンタル品・ペットなど（必要なときだけ）'],
    ['6', '確認して保存', 'PNG・PDFで保存、メール文をコピー'],
  ];
  const fw = (W - 2 * M - 0.25 * 5) / 6;
  flow.forEach(([n, h, t], i) => {
    const x = M + i * (fw + 0.25), y = 1.7;
    s.addShape('roundRect', { x, y, w: fw, h: 3.6, rectRadius: 0.12, fill: { color: i === 4 ? C.background2 : C.accent3 }, line: { type: 'none' }, objectName: 'flow-card' });
    s.addShape('ellipse', { x: x + (fw - 0.8) / 2, y: y + 0.3, w: 0.8, h: 0.8, fill: { color: i === 4 ? C.text2 : C.accent1 }, line: { type: 'none' }, objectName: 'flow-dot' });
    s.addText(n, { x: x + (fw - 0.8) / 2, y: y + 0.3, w: 0.8, h: 0.8, fontSize: 24, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'flow-num' });
    s.addText(h, { x: x + 0.12, y: y + 1.3, w: fw - 0.24, h: 0.5, fontSize: 16, bold: true, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'flow-head' });
    s.addText(t, { x: x + 0.18, y: y + 1.9, w: fw - 0.36, h: 1.5, fontSize: 13, color: C.text1, valign: 'top', margin: 0, isTextBox: true, lineSpacingMultiple: 1.1, objectName: 'flow-text' });
  });
  note(s, C, 'はじめて使うとき', '最初の1回だけ、ブックマーク「プラン取込」「乗換取込」の登録が必要です。次のページからの「初回のみの準備」で登録してください。', M, 5.65, W - 2 * M, 1.05, 'info');

  await buildSetup(pres, C);

  pres.addSection({ title: '手順' });
  // 1. 部屋を選ぶ
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '手順' });
  badge(s, C, '1');
  s.addText('MAGI で部屋を選び、プランページを開く', { placeholder: 'title' });
  const half = (W - 2 * M - 0.4) / 2;
  await pic(s, C, 'u-magi', M, 1.4, half, 3.6, { alt: 'MAGI の空室検索' });
  await pic(s, C, 'g02-plan', M + half + 0.4, 1.4, half, 3.6, { alt: '公式サイトのプランページ' });
  caption(s, C, 'MAGI の空室検索（表示期間・営業エリアなどで検索）', M, 5.15, half);
  caption(s, C, '公式サイトのプランページ（atinn.jp/plan/番号）', M + half + 0.4, 5.15, half);
  points(s, C, [
    { text: 'ご提案する部屋（2〜5部屋。1部屋だけでも可）を決めて、それぞれの公式サイトのプランページを開きます。' },
  ], M, 5.65, half, 1.0);
  points(s, C, [
    { text: '例：大崎 atinn.jp/plan/15449　大井町 atinn.jp/plan/13177　品川 atinn.jp/plan/15393' },
  ], M + half + 0.4, 5.65, half, 1.0, { size: 13 });

  // 2. プラン取込
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '手順' });
  badge(s, C, '2');
  s.addText('プランページで「プラン取込」を押す', { placeholder: 'title' });
  await pic(s, C, 'slot', M, 1.4, 6.9, 4.1, { alignLeft: true, alt: 'プラン取込を押したあと、入れる枠を選ぶ画面' });
  caption(s, C, 'ツールに切り替わり、「どの物件に入れますか？」と出ます', M, 5.65, 6.9);
  steps(s, C, [
    'ツールを先に開き、上のタブで「複数物件」を選びます（1部屋なら「1物件」）。',
    'プランページで、ブックマークバーの「🏠プラン取込」を押します。',
    'ツールで A・B・C… から入れる枠を選びます。物件名・住所・料金・最寄駅・写真・設備・地図の位置が入ります。',
    '残りの部屋も同じように。4・5部屋目は「＋物件を追加」で枠を増やします。',
  ], 7.9, 1.45, W - M - 7.9, 1.05);
  note(s, C, 'ツールに切り替わらないとき', '内容はコピーされています。ツールの画面で Ctrl＋V を押すと取り込めます。', 7.9, 5.75, W - M - 7.9, 1.0, 'info');

  // 3. 目的地・条件
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '手順' });
  badge(s, C, '3');
  s.addText('目的地・利用期間・人数を入れる', { placeholder: 'title' });
  await pic(s, C, 'g04-dest', M, 1.4, 6.3, 4.4, { alignLeft: true, alt: '目的地と条件の欄' });
  caption(s, C, '「目的地と条件」の欄', M, 5.95, 6.3);
  points(s, C, [
    { head: 'お客様名', text: '入れると「〇〇様へのご提案」と出ます。' },
    { head: '目的地', text: '駅名や地名を入れると、地図の位置が自動で入ります。会社名など駅でない場所は「住所・GoogleマップのURL」に Google マップのアドレスを貼ると正確です。' },
    { head: 'チェックイン・チェックアウト', text: '10/5 のように入れます。空欄なら翌月1日から30日間。1ヶ月未満のご利用にも対応しています。' },
    { head: '人数', text: '2人以上は、2人目から1,100円/日が総額に入ります。' },
  ], 7.3, 1.45, W - M - 7.3, 5.3, { size: 13, headSize: 14 });

  // 4. 乗換取込
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '手順' });
  badge(s, C, '4');
  s.addText('Yahoo!乗換案内で検索して「乗換取込」を押す', { placeholder: 'title' });
  const col = (W - 2 * M - 0.6) / 3;
  const x1 = M, x2 = M + col + 0.3, x3 = M + 2 * (col + 0.3);
  ['物件の欄で「Yahoo!で検索」', '結果のページで「🚃乗換取込」', '経路と時間が入る'].forEach((t, i) => {
    const x = [x1, x2, x3][i];
    s.addShape('ellipse', { x, y: 1.4, w: 0.42, h: 0.42, fill: { color: C.accent2 }, line: { type: 'none' }, objectName: 'step-dot' });
    s.addText(String(i + 1), { x, y: 1.4, w: 0.42, h: 0.42, align: 'center', valign: 'middle', fontSize: 14, bold: true, color: C.background1, margin: 0, isTextBox: true, objectName: 'step-num' });
    s.addText(t, { x: x + 0.55, y: 1.36, w: col - 0.55, h: 0.5, fontSize: 15, bold: true, color: C.text1, valign: 'middle', margin: 0, isTextBox: true, objectName: 'step-head' });
  });
  await pic(s, C, 'before', x1, 2.05, col, 3.0, { alt: '物件の欄の Yahoo!乗換案内で検索ボタン' });
  // Yahoo! の結果ページの説明図
  browser(s, C, x2, 2.05, col, 'transit.yahoo.co.jp/search/result…', { hiTransit: true, h: 3.0, compact: true });
  s.addText([
    { text: '大崎 → 大手町(東京都)', options: { bold: true, fontSize: 13, breakLine: true } },
    { text: 'ルート1　10:03→10:31　28分　乗換1回', options: { fontSize: 11, breakLine: true } },
    { text: 'ルート2　10:05→10:35　30分　乗換1回', options: { fontSize: 11 } },
  ], { x: x2 + 0.25, y: 3.45, w: col - 0.5, h: 0.85, color: C.text1, valign: 'top', margin: 0, isTextBox: true, objectName: 'yahoo-result' });
  s.addShape('roundRect', { x: x2 + 0.25, y: 4.35, w: col - 0.5, h: 0.55, rectRadius: 0.08, fill: { color: C.accent1 }, line: { type: 'none' }, objectName: 'toast' });
  s.addText('✓ ツールに入れました', { x: x2 + 0.25, y: 4.35, w: col - 0.5, h: 0.55, fontSize: 11, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true, objectName: 'toast-text' });
  await pic(s, C, 'after', x3, 2.05, col, 3.0, { alt: '取り込んだあとの経路の欄' });
  caption(s, C, 'ツールの物件の欄', x1, 5.2, col);
  caption(s, C, 'Yahoo!乗換案内の結果ページ（説明用の図）', x2, 5.2, col);
  caption(s, C, '乗車駅・徒歩・乗車時間・経路が入ります', x3, 5.2, col);
  points(s, C, [
    { text: '乗るまでの歩き・待ちも含めて、いちばん早い経路が入ります。徒歩の分数はプランページの「徒歩〇分」から入ります。別の駅から乗る経路になったときは、徒歩（分）を入れてください。' },
  ], M, 5.7, 7.4, 1.1, { size: 13 });
  note(s, C, '自動で入らないとき', '結果はコピーされています。物件の欄の「コピーした経路を読み込む」を押してください。', 8.35, 5.65, W - M - 8.35, 1.1, 'info');

  // 5. オプション
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '手順' });
  badge(s, C, '5');
  s.addText('オプションを選ぶ（必要なときだけ）', { placeholder: 'title' });
  await pic(s, C, 'g09-opts', M, 1.4, 6.6, 3.8, { alignLeft: true, alt: 'オプションの欄' });
  caption(s, C, 'オプションの欄（例：モバイルデータ通信端末）', M, 5.35, 6.6);
  points(s, C, [
    { head: '＋ 一覧から追加', text: '公式サイトのオプションが五十音順に並びます。選ぶと物件の地域の料金で、提案書とメール文の総額に入ります。ペット追加（1,320円/日）は先頭。' },
    { head: '＋ 手入力の項目', text: '一覧にないもの・割引（マイナスの金額）はこちらで入れます。' },
    { head: '提供エリア外の物件', text: '総額には入れたうえで、提案書に「ご用意できない場合があります」と出ます。名古屋市外はツールに「在庫を確認」と出ます。' },
  ], 7.6, 1.45, W - M - 7.6, 5.3, { size: 13, headSize: 14 });

  // 6. 確認して保存
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '手順' });
  badge(s, C, '6');
  s.addText('プレビューを確認して保存する', { placeholder: 'title' });
  const t = await pic(s, C, 'tool', M, 1.4, 7.6, 4.75, { alignLeft: true, alt: 'ツールの画面全体' });
  // 右上の保存ボタン（元画像 2880×1800 の x1460〜1960, y95〜135 付近）と上の丸い印（x480〜1300, y45〜90）
  const k = t.w / 2880;
  s.addShape('roundRect', { x: t.x + 2100 * k, y: t.y + 150 * k, w: 460 * k, h: 95 * k, rectRadius: 0.05, fill: { type: 'none' }, line: { color: C.accent2, width: 2.5 }, objectName: 'save-ring' });
  s.addShape('roundRect', { x: t.x + 1395 * k, y: t.y + 25 * k, w: 1010 * k, h: 90 * k, rectRadius: 0.05, fill: { type: 'none' }, line: { color: C.accent1, width: 2.5 }, objectName: 'progress-ring' });
  caption(s, C, 'オレンジ枠：保存ボタン　緑枠：入力の進み具合（全部 ✓ で入力完了）', M, 6.3, 7.6);
  points(s, C, [
    { head: '保存', text: 'PNG：横長の画像　PNG（縦）：スマホ向け　PDF：印刷用。ファイル名は「山田 様_大手町_ご提案3物件_日付」のように自動で付きます。' },
    { head: '確認すること', text: '黄色の注意が出ていたら内容を確認。見出し・注記は「見出し・注記の修正（任意）」で直せます。' },
    { head: '設備比較（任意）', text: '複数物件でチェックを入れると、2ページ目に設備比較の表が付きます。' },
  ], 8.55, 1.45, W - M - 8.55, 5.3, { size: 13, headSize: 14 });

  // メール用テキスト
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '手順' });
  badge(s, C, '6');
  s.addText('メール用の見積り文をコピーする', { placeholder: 'title' });
  await pic(s, C, 'mail', M, 1.4, 5.2, 5.3, { alignLeft: true, alt: 'メール用テキストの欄' });
  points(s, C, [
    { head: 'メール用テキスト', text: 'いちばん下の欄に、見積りExcel【一般用】と同じ形の料金内訳が出ます。「コピー」を押してメール本文に貼ります。オプション・キャンペーン条件も入ります。' },
    { head: '1ヶ月未満のご利用', text: '「●ご契約期間＿1ヶ月未満ご利用の場合」として契約期間が入り、使わない期間は値引きする旨の文が付きます。見積りの有効期限は本日になります。' },
  ], 6.3, 1.45, W - M - 6.3, 3.6, { size: 13, headSize: 14 });
  note(s, C, '共有リンクは使わない', '社内サーバーのツールなので、お客様は開けません。画像・PDF・メール用テキストで送ってください。', 6.3, 5.3, W - M - 6.3, 1.25, 'warn');

  pres.addSection({ title: '困ったとき' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '困ったとき' });
  badge(s, C, '?', C.accent2);
  s.addText('困ったとき', { placeholder: 'title' });
  const rows = [
    ['プラン取込で「Not Found」になる', '古いブックマークのままです。古い2つを削除し、使い方の欄からもう一度ドラッグしてください。'],
    ['ツールに切り替わらない', 'ポップアップが止められています。ツールで Ctrl＋V。アドレスバー右の表示から atinn.jp を許可すると次から切り替わります。'],
    ['「経路を読み取れませんでした」', 'Yahoo!乗換案内の「検索結果」のページで押しているか確認してください。'],
    ['行き先が目的地から離れていると出る', '目的地の住所か Google マップのアドレスを入れてから、もう一度検索してください。'],
    ['キャンペーン条件に当てはまらないと出る', '利用開始日がキャンペーン期間の外です。条件と利用期間を確かめてください。'],
    ['前に作った内容に戻したい', '画面上の「前回の入力を復元」で戻せます。残すときは「その他」→「データ保存」。'],
  ];
  s.addTable([
    [{ text: 'こんなとき', options: { bold: true, color: C.background1, fill: { color: C.text1 } } }, { text: 'こうする', options: { bold: true, color: C.background1, fill: { color: C.text1 } } }],
    ...rows.map((r, i) => [
      { text: r[0], options: { bold: true, color: C.text1, fill: { color: i % 2 ? C.background1 : C.background2 } } },
      { text: r[1], options: { color: C.text1, fill: { color: i % 2 ? C.background1 : C.background2 } } },
    ]),
  ], { x: M, y: 1.4, w: W - 2 * M, colW: [4.0, W - 2 * M - 4.0], fontSize: 13, margin: [0.08, 0.15, 0.08, 0.15], border: { type: 'solid', color: 'D5DCE0', pt: 0.75 }, valign: 'middle', rowH: 0.62, objectName: 'faq' });
  s.addText('分からないことがあったら、画面のスクリーンショットを付けて担当者まで連絡してください。', { x: M, y: 6.25, w: W - 2 * M, h: 0.4, fontSize: 13, color: C.text2, margin: 0, isTextBox: true, objectName: 'contact' });

  await pres.writeFile({ fileName: file });
  await applyTheme(file, THEME);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await prepareImages();
  await buildUsage(path.join(OUT, 'アクセス案内シート作成ツール_初回準備と使い方.pptx'));
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
