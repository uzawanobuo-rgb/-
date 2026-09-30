// ブックマーク「乗換取込」の本体。Yahoo!乗換案内の検索結果ページで動く。
// ブックマークには「このファイルを読み込むだけ」の短いコードを登録するので、ここを直せば登録し直さずに反映される。
// ツールの「Yahoo!乗換案内で検索」から開いたタブなら、結果をツールへ直接送ってタブを閉じる。
// それ以外（またはツールから返事がない）ときは、今までどおりクリップボードにコピーする。
(function (root) {
  function transitBookmarkletMain() {
    (async () => {
      const d = document;
      if (!/transit\.yahoo\.co\.jp$/.test(location.hostname) && !confirm('Yahoo!乗換案内のページではないようです。続けますか？')) return;
      const n = (d.body.innerText.match(/\d{1,2}:\d{2}\s*発\s*→/g) || []).length;
      const box = html => { const o = d.createElement('div'); o.innerHTML = html; d.body.appendChild(o.firstChild); return d.body.lastChild; };
      const toast = (html, bg, ms) => { const o = box('<div style="position:fixed;right:20px;bottom:20px;z-index:2147483647;background:' + bg + ';color:#fff;padding:14px 18px;border-radius:10px;font:14px/1.6 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)">' + html + '</div>'); setTimeout(() => o.remove(), ms); };
      if (!n) { toast('<b>経路が見つかりません</b><br>検索結果のページで押してください', '#B45309', 3500); return; }
      // 経路部分のHTMLも送る（画面の見た目に左右されずに読めるように）
      const area = d.querySelector('#srline') || d.querySelector('main') || d.body;
      const data = { v: 2, bm: 3, src: 'yahoo-transit', url: location.href, html: area.outerHTML.slice(0, 600000), text: d.body.innerText.slice(0, 120000), fetchedAt: new Date().toISOString() };
      const json = JSON.stringify(data);
      const copy = async () => {
        try { await navigator.clipboard.writeText(json); return true; } catch (e) { /* 次の方法 */ }
        try { const t = d.createElement('textarea'); t.value = json; t.style.cssText = 'position:fixed;left:-9999px'; d.body.appendChild(t); t.select(); const ok = d.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
      };
      // コピーはクリック直後しか許されないので先にしておく（ツールへ送れなかったときの予備）
      const copied = await copy();
      // ツールから開いたタブなら、ツールへ直接送る
      const target = /^atinn-yahoo\|/.test(window.name) && window.opener && !window.opener.closed ? window.opener : null;
      if (target) {
        const ack = await new Promise(resolve => {
          const t = setTimeout(() => { window.removeEventListener('message', on); resolve(null); }, 2000);
          function on(e) {
            if (e.source !== target || !e.data || e.data.src !== 'atinn-tool') return;
            clearTimeout(t); window.removeEventListener('message', on); resolve(e.data);
          }
          window.addEventListener('message', on);
          try { target.postMessage(Object.assign({ name: window.name }, data), '*'); } catch (e) { clearTimeout(t); resolve(null); }
        });
        if (ack && ack.ok) {
          toast('<b style="font-size:16px">✓ ツールに入れました</b><br>' + String(ack.msg || '').replace(/[<>&]/g, '') + '<br>このタブは閉じます', '#0F7C7A', 3000);
          setTimeout(() => { try { target.focus(); } catch (e) { /* noop */ } window.close(); }, 1300);
          return;
        }
        if (ack && !ack.ok) { toast('<b>ツールに入れられませんでした</b><br>' + String(ack.msg || '').replace(/[<>&]/g, ''), '#B45309', 5000); return; }
      }
      if (copied) { toast('<b style="font-size:16px">✓ コピーしました</b><br>経路 ' + n + ' 件（乗車時間がいちばん短いものが入ります）<br>ツールに戻って、経路の欄の「コピーした経路を読み込む」を押してください', '#0F7C7A', 3500); return; }
      // コピーが許可されなかったときだけボタンを出す
      const o = box('<div style="position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:sans-serif"><div style="background:#fff;color:#1E2B33;padding:24px;border-radius:12px;max-width:420px;text-align:center;line-height:1.6"><div style="font-size:17px;font-weight:bold;margin-bottom:6px">経路を ' + n + ' 件読み取りました</div><div style="font-size:13px;color:#555;margin-bottom:16px">「コピーする」を押してから、ツールの経路の欄の「コピーした経路を読み込む」を押してください。</div><button style="font-size:16px;padding:10px 22px;background:#0F7C7A;color:#fff;border:0;border-radius:8px;cursor:pointer">コピーする</button><button style="font-size:14px;padding:10px 14px;margin-left:8px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer">閉じる</button></div></div>');
      const bs = o.querySelectorAll('button');
      bs[1].onclick = () => o.remove();
      bs[0].onclick = async () => { await copy(); bs[0].textContent = 'コピーしました ✓'; setTimeout(() => o.remove(), 1200); };
    })().catch(e => alert('取得に失敗しました: ' + e));
  }
  root.AtinnTransitBM = transitBookmarkletMain;
  // ブックマークから読み込まれたときだけ実行する（ツールの画面で読み込んだときは何もしない）
  const cs = typeof document !== 'undefined' && document.currentScript;
  if (cs && cs.dataset && cs.dataset.run) transitBookmarkletMain();
})(typeof window !== 'undefined' ? window : globalThis);
