(function () {
  var ID = 'atinn-caption-extractor';
  var old = document.getElementById(ID);
  if (old) old.remove();

  function clean(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

  // 1) スライダー下のキャプション（ループ用の複製スライドは除く）
  var items = [];
  var seen = {};
  document.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate) p.caption').forEach(function (p) {
    var slide = p.closest('.swiper-slide');
    var a = slide && slide.querySelector('a[href]');
    var key = a ? a.getAttribute('href') : '';
    var text = clean(p.textContent);
    if (!text) return;
    if (key && seen[key]) return;
    if (key) seen[key] = 1;
    items.push(text);
  });

  // 2) 見つからなければ写真リンクの data-title、さらに画像の alt を使う
  if (!items.length) {
    document.querySelectorAll('a[data-lightbox][data-title]').forEach(function (a) {
      var key = a.getAttribute('href');
      var text = clean(a.getAttribute('data-title'));
      if (!text || seen[key]) return;
      seen[key] = 1;
      items.push(text);
    });
  }
  if (!items.length) {
    alert('写真の説明文が見つかりませんでした。\nアットインの物件ページ（atinn.jp/plan/...）で実行してください。');
    return;
  }

  var title = clean(document.title);
  var numbered = items.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n');
  var checkPrompt =
    '以下は賃貸物件ページの写真に付いている説明文です。誤字脱字、表記ゆれ、意味の重複、不自然な表現がないかチェックしてください。' +
    '問題がある箇所は「番号・該当箇所・理由・修正案」を表にまとめ、問題がなければ「問題なし」と答えてください。\n\n' +
    '物件ページ：' + location.href + '\n\n' + numbered;

  function copy(text, btn) {
    function done() {
      var label = btn.textContent;
      btn.textContent = 'コピーしました！';
      setTimeout(function () { btn.textContent = label; }, 1500);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      box.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { alert('コピーできませんでした。表示された文章を手で選択してコピーしてください。'); }
      ta.remove();
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  var box = document.createElement('div');
  box.id = ID;
  box.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Meiryo",sans-serif;';

  var panel = document.createElement('div');
  panel.style.cssText =
    'background:#fff;color:#222;width:min(720px,92vw);max-height:86vh;display:flex;flex-direction:column;border-radius:10px;' +
    'box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden;';

  var head = document.createElement('div');
  head.style.cssText = 'padding:14px 18px;border-bottom:1px solid #eee;';
  var h = document.createElement('div');
  h.textContent = '写真の説明文（' + items.length + '件）';
  h.style.cssText = 'font-size:17px;font-weight:bold;';
  var sub = document.createElement('div');
  sub.textContent = title;
  sub.style.cssText = 'font-size:12px;color:#777;margin-top:4px;';
  head.appendChild(h);
  head.appendChild(sub);

  // サイト側のCSSで番号が消えないよう、番号は文字として表示する
  var list = document.createElement('div');
  list.style.cssText = 'margin:0;padding:12px 18px;overflow:auto;flex:1;font-size:14px;line-height:1.7;text-align:left;';
  items.forEach(function (t, i) {
    var row = document.createElement('div');
    row.className = 'atinn-caption-item';
    row.style.cssText = 'display:flex;gap:8px;margin:0 0 6px;padding:0;';
    var num = document.createElement('span');
    num.textContent = (i + 1) + '.';
    num.style.cssText = 'flex:0 0 2.2em;text-align:right;color:#e07b00;font-weight:bold;';
    var txt = document.createElement('span');
    txt.textContent = t;
    txt.style.cssText = 'flex:1;';
    row.appendChild(num);
    row.appendChild(txt);
    list.appendChild(row);
  });

  var foot = document.createElement('div');
  foot.style.cssText = 'padding:12px 18px;border-top:1px solid #eee;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;';
  function button(label, primary, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'padding:9px 14px;border-radius:6px;font-size:14px;cursor:pointer;border:1px solid ' + (primary ? '#e07b00' : '#ccc') + ';' +
      'background:' + (primary ? '#f39800' : '#fff') + ';color:' + (primary ? '#fff' : '#333') + ';';
    b.addEventListener('click', function () { onClick(b); });
    foot.appendChild(b);
    return b;
  }
  button('文章をコピー', false, function (b) { copy(numbered, b); });
  button('誤字チェック用にコピー', true, function (b) { copy(checkPrompt, b); });
  button('閉じる', false, function () { box.remove(); });

  panel.appendChild(head);
  panel.appendChild(list);
  panel.appendChild(foot);
  box.appendChild(panel);
  box.addEventListener('click', function (e) { if (e.target === box) box.remove(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(box);
})();
