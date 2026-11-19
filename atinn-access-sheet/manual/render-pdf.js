// 使い方ガイド（A4縦の PDF）を guide.html から作る
//   node manual/render-pdf.js   → manual/output/アクセス案内シート作成ツール_使い方.pdf
// Playwright（Chromium）が必要。ページからはみ出していないかの目安も表示する
const path = require('path');
const { chromium } = require('playwright');
const G = __dirname;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(G, 'guide.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const ov = await p.$$eval('.page', ps => ps.map((pg, i) => { const last = [...pg.children].filter(c => !c.classList.contains('foot')).pop(); return (i + 1) + ':' + Math.round(last.getBoundingClientRect().bottom - pg.getBoundingClientRect().top); }));
  console.log('各ページの本文の下端（1090 くらいまで）:', ov.join(' '));
  await p.pdf({ path: path.join(G, 'output', 'アクセス案内シート作成ツール_使い方.pdf'), format: 'A4', printBackground: true });
  await b.close();
})();
