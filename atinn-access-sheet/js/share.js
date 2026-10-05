// 共有リンク：シートの中身を URL の「#」より後ろに入れる（サーバーなしで見られるように）。
// 「#」より後ろはブラウザの中だけで使われ、サーバーには送られない。
// 写真の画像データは長すぎるので入れず、公式サイトの写真の場所（URL）だけを入れる。
(function (root) {
  'use strict';

  // 共有に要らないもの・重いものを落とし、見ているパターンの分だけにする
  function slim(state) {
    const s = JSON.parse(JSON.stringify(state));
    const fixProp = p => {
      if (!p) return;
      const ph = (p.photos || [])[p.photoIdx || 0];
      const src = ph && /^https?:\/\//.test(ph.src || '') ? ph.src : '';
      p.photos = !p.hidePhoto && src ? [{ src }] : [];
      p.photoIdx = 0;
      p.photoCustom = '';
      delete p.imported;
    };
    if (s.pattern === 'p2') {
      delete s.p1;
      (s.p2.properties || []).forEach(fixProp);
    } else {
      delete s.p2;
      fixProp(s.p1 && s.p1.property);
    }
    return s;
  }

  const b64url = bytes => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64url = str => {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  // 先頭1文字で形式を区別：z＝圧縮あり、j＝圧縮なし（古いブラウザ用）
  async function encode(state) {
    const json = new TextEncoder().encode(JSON.stringify(slim(state)));
    if (typeof CompressionStream === 'function') return 'z' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
    return 'j' + b64url(json);
  }
  async function decode(hash) {
    const h = String(hash || '').replace(/^#/, '');
    if (!h) return null;
    const kind = h[0], body = unb64url(h.slice(1));
    const bytes = kind === 'z' ? await pipe(body, new DecompressionStream('deflate-raw')) : body;
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  root.AtinnShare = { slim, encode, decode };
})(typeof window !== 'undefined' ? window : globalThis);
