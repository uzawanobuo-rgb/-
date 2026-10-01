// ブックマーク「プラン取込」の本体。アットインのプランページで動く。
// ブックマークには「このファイルを読み込むだけ」の短いコードを登録するので、ここを直せば登録し直さずに反映される。
// 本文・地図座標・写真を集め、ツールを開いて（開いていればそのタブへ切り替えて）直接送る。
// 送れなかったときは、今までどおりクリップボードのコピーから貼り付けで入れる。
(function (root) {
  function planBookmarkletMain(toolUrl) {
    (async () => {
      const d = document;
      if (!/(^|\.)atinn\.jp$/.test(location.hostname) && !confirm('アットインのページではないようです。続けますか？')) return;
      const h = d.documentElement.outerHTML;
      let lat = null, lng = null;
      const m = h.match(/maps\.google\.[a-z.]+\/maps\?[^"'<>\s]*?q=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i) || h.match(/google\.[a-z.]+\/maps[^"'<>\s]*?[?&;](?:q|ll|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
      if (m) { lat = +m[1]; lng = +m[2]; }
      const cands = [];
      d.querySelectorAll('img').forEach(i => {
        const s = i.currentSrc || i.src || i.dataset.src || i.dataset.lazy || i.getAttribute('data-original');
        if (s && !/^data:|\.svg|logo|icon|banner|sprite|btn_|button/i.test(s) && !cands.some(x => x.s === s)) {
          const fig = i.closest('figure,li,div');
          const cap = (i.alt || i.title || (fig && fig.querySelector('figcaption,p,span') && fig.querySelector('figcaption,p,span').innerText) || '').trim().slice(0, 60);
          cands.push({ el: i, s, a: cap });
        }
      });
      // ブラウザはクリック直後しかコピーを許さないので、写真は並列で読み、最大2.5秒で打ち切る
      const load = x => new Promise(r => {
        if (x.el.complete && x.el.naturalWidth && x.el.currentSrc === x.s) return r(x.el);
        const im = new Image();
        try { if (new URL(x.s, location.href).origin !== location.origin) im.crossOrigin = 'anonymous'; } catch (e) { /* noop */ }
        const t = setTimeout(() => r(null), 2500);
        im.onload = () => { clearTimeout(t); r(im); };
        im.onerror = () => { clearTimeout(t); r(null); };
        im.src = x.s;
      });
      const loaded = await Promise.all(cands.slice(0, 16).map(load));
      const images = [];
      cands.slice(0, 16).forEach((x, k) => {
        const im = loaded[k];
        if (images.length >= 8 || !im || im.naturalWidth < 300 || im.naturalHeight < 200) return;
        let data = null;
        try {
          const f = Math.min(1, 640 / im.naturalWidth);
          const c = d.createElement('canvas');
          c.width = Math.round(im.naturalWidth * f); c.height = Math.round(im.naturalHeight * f);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          data = c.toDataURL('image/jpeg', 0.8);
        } catch (e) { /* 別ドメインの画像は URL のみ */ }
        images.push({ src: new URL(x.s, location.href).href, data, caption: x.a });
      });
      // 主な設備：灰色（unsupport）のものは「ない」設備なので、ある設備だけ集める
      const facilities = Array.from(d.querySelectorAll('.prop_detail_facs li')).filter(li => !li.classList.contains('unsupport'))
        .map(li => ((li.querySelector('.prop_facs_spntxt') || li).innerText || '').trim()).filter(Boolean);
      const json = JSON.stringify({ v: 1, src: 'atinn-bookmarklet', url: location.href, facilities, title: d.title, h1: (d.querySelector('h1') || {}).innerText || '', text: d.body.innerText.slice(0, 80000), lat, lng, images, fetchedAt: new Date().toISOString() });
      const info = '写真 ' + images.length + '枚' + (lat ? '・地図座標あり' : '・地図座標なし');
      const copy = async () => {
        try { await navigator.clipboard.writeText(json); return true; } catch (e) { /* 次の方法 */ }
        try { const t = d.createElement('textarea'); t.value = json; t.style.cssText = 'position:fixed;left:-9999px'; d.body.appendChild(t); t.select(); const ok = d.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
      };
      const box = html => { const o = d.createElement('div'); o.innerHTML = html; d.body.appendChild(o.firstChild); return d.body.lastChild; };
      // コピーはクリック直後しか許されないので先にしておく（ツールへ送れなかったときの予備）
      const copied = await copy();
      // ツールを開いて（ブラウザが許せば、開いているツールのタブに切り替えて）データを直接送る
      const sent = !toolUrl ? false : await new Promise(resolve => {
        let w = null;
        try { w = window.open(toolUrl + '#atinn-' + Date.now(), 'atinn-tool'); } catch (e) { /* ポップアップが止められた */ }
        if (!w) { resolve(false); return; }
        const origin = new URL(toolUrl).origin, id = Math.random().toString(36).slice(2);
        let started = false;
        const ping = () => { try { w.postMessage({ src: 'atinn-bm', type: 'ping', id }, origin); } catch (e) { /* 読み込み中 */ } };
        const iv = setInterval(ping, 300);
        const to = setTimeout(() => done(false), 20000);
        function done(ok) { clearInterval(iv); clearTimeout(to); window.removeEventListener('message', on); resolve(ok); }
        function on(e) {
          if (e.source !== w || e.origin !== origin || !e.data || e.data.src !== 'atinn-tool' || e.data.id !== id) return;
          if (e.data.type === 'ready' && !started) { started = true; clearInterval(iv); w.postMessage({ src: 'atinn-bm', type: 'data', id, json }, origin); }
          if (e.data.type === 'ack') done(true);
        }
        window.addEventListener('message', on);
        ping();
      });
      if (sent) {
        const o = box('<div style="position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#0F7C7A;color:#fff;padding:14px 18px;border-radius:10px;font:14px/1.6 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)"><b style="font-size:16px">✓ ツールに送りました</b><br>' + info + '<br>ツールのタブで内容を確認してください</div>');
        setTimeout(() => o.remove(), 5000);
        return;
      }
      if (copied) {
        const o = box('<div style="position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#0F7C7A;color:#fff;padding:14px 18px;border-radius:10px;font:14px/1.6 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)"><b style="font-size:16px">✓ コピーしました</b><br>' + info + '<br>ツールに戻って Ctrl+V で貼り付けてください</div>');
        setTimeout(() => o.remove(), 3500);
        return;
      }
      // コピーが許可されなかったときだけボタンを出す
      const o = box('<div style="position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:sans-serif"><div style="background:#fff;color:#1E2B33;padding:24px;border-radius:12px;max-width:420px;text-align:center;line-height:1.6"><div style="font-size:17px;font-weight:bold;margin-bottom:6px">物件データを取得しました</div><div style="font-size:13px;color:#555;margin-bottom:16px">' + info + '<br>「コピーする」を押して、ツールの貼り付け欄に貼ってください。</div><button style="font-size:16px;padding:10px 22px;background:#0F7C7A;color:#fff;border:0;border-radius:8px;cursor:pointer">コピーする</button><button style="font-size:14px;padding:10px 14px;margin-left:8px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer">閉じる</button></div></div>');
      const bs = o.querySelectorAll('button');
      bs[1].onclick = () => o.remove();
      bs[0].onclick = async () => { await copy(); bs[0].textContent = 'コピーしました ✓'; setTimeout(() => o.remove(), 1200); };
    })().catch(e => alert('取得に失敗しました: ' + e));
  }
  root.AtinnPlanBM = planBookmarkletMain;
  // ブックマークから読み込まれたときだけ実行する。ツールの場所は、このファイルの場所から求める
  const cs = typeof document !== 'undefined' && document.currentScript;
  if (cs && cs.dataset && cs.dataset.run) planBookmarkletMain(new URL('../', cs.src.split('?')[0]).href);
})(typeof window !== 'undefined' ? window : globalThis);
