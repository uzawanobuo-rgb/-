// ランドマークのデフォルメイラスト（自作SVG。見本HTMLから部品を切り出したもの＋追加分）
// 各アイコンは (0,0) を地点に合わせた座標で描く。box は当たり判定用の外接矩形。
(function (root) {
  'use strict';

  function label(y, text, size, color) {
    return `<text x="0" y="${y}" text-anchor="middle" font-size="${size || 12}" font-weight="700" fill="${color || '#5B6770'}">${text}</text>`;
  }
  function lw(text, size) { return Math.max(40, String(text).length * (size || 12) + 6); }

  const ICONS = {
    twin_towers: {
      draw: n => `<g transform="translate(-26,-70)"><rect x="0" y="0" width="24" height="70" rx="2" fill="#B9C7D3"/><rect x="28" y="0" width="24" height="70" rx="2" fill="#B9C7D3"/><rect x="22" y="26" width="8" height="44" fill="#A5B5C3"/><rect x="-6" y="40" width="64" height="30" rx="2" fill="#CAD5DE"/><g fill="#FFFFFF" opacity="0.8"><rect x="5" y="8" width="14" height="3"/><rect x="5" y="16" width="14" height="3"/><rect x="5" y="24" width="14" height="3"/><rect x="5" y="32" width="14" height="3"/><rect x="33" y="8" width="14" height="3"/><rect x="33" y="16" width="14" height="3"/><rect x="33" y="24" width="14" height="3"/><rect x="33" y="32" width="14" height="3"/></g></g>${label(18, n)}`,
      box: n => ({ x0: -Math.max(34, lw(n) / 2), y0: -72, x1: Math.max(34, lw(n) / 2), y1: 22 }),
    },
    crosswalk: {
      draw: n => `<g transform="translate(-35,-40)"><rect x="0" y="0" width="70" height="40" rx="6" fill="#DCDFE2"/><g fill="#FFFFFF"><rect x="8" y="5" width="5" height="30" transform="rotate(-30 10 20)"/><rect x="19" y="5" width="5" height="30" transform="rotate(-30 21 20)"/><rect x="30" y="5" width="5" height="30" transform="rotate(-30 32 20)"/><rect x="41" y="5" width="5" height="30" transform="rotate(30 43 20)"/><rect x="52" y="5" width="5" height="30" transform="rotate(30 54 20)"/><rect x="62" y="5" width="4" height="30" transform="rotate(30 64 20)"/></g></g>${label(16, n, 11)}`,
      box: n => ({ x0: -Math.max(38, lw(n, 11) / 2), y0: -42, x1: Math.max(38, lw(n, 11) / 2), y1: 20 }),
    },
    tower_building: {
      draw: n => `<g transform="translate(-20,-70)"><rect x="4" y="8" width="32" height="62" rx="4" fill="#9FB3C4"/><rect x="0" y="3" width="40" height="9" rx="3" fill="#8AA1B4"/><g fill="#FFFFFF" opacity="0.75"><rect x="10" y="20" width="20" height="3"/><rect x="10" y="29" width="20" height="3"/><rect x="10" y="38" width="20" height="3"/><rect x="10" y="47" width="20" height="3"/><rect x="10" y="56" width="20" height="3"/></g></g>${label(16, n, 11)}`,
      box: n => ({ x0: -Math.max(24, lw(n, 11) / 2), y0: -68, x1: Math.max(24, lw(n, 11) / 2), y1: 20 }),
    },
    lattice_tower: {
      draw: n => `<g transform="scale(0.8)"><path d="M-24 0 L-5 -120 L5 -120 L24 0 Z" fill="#E8743B"/><path d="M-16 0 L0 -36 L16 0 Z" fill="#F3F1EA"/><rect x="-15" y="-54" width="30" height="9" rx="2" fill="#FBFAF6"/><rect x="-8" y="-98" width="16" height="7" rx="2" fill="#FBFAF6"/><rect x="-11" y="-76" width="22" height="5" fill="#FFFFFF"/><line x1="0" y1="-120" x2="0" y2="-142" stroke="#E8743B" stroke-width="3"/></g>${label(16, n)}`,
      box: n => ({ x0: -Math.max(22, lw(n) / 2), y0: -116, x1: Math.max(22, lw(n) / 2), y1: 20 }),
    },
    park_pond: {
      draw: n => `<ellipse cx="0" cy="0" rx="54" ry="22" fill="#DCEBD6"/><ellipse cx="-2" cy="4" rx="14" ry="6" fill="#BFDDE8"/><g fill="#7FB36F"><circle cx="-36" cy="-6" r="10"/><circle cx="-24" cy="-12" r="8"/><circle cx="32" cy="-8" r="10"/><circle cx="43" cy="-1" r="8"/></g>${label(38, n, 11, '#4E7A43')}`,
      box: n => ({ x0: -Math.max(56, lw(n, 11) / 2), y0: -24, x1: Math.max(56, lw(n, 11) / 2), y1: 42 }),
    },
    park_trees: {
      draw: n => `<ellipse cx="0" cy="0" rx="46" ry="20" fill="#DCEBD6"/><g fill="#7FB36F"><circle cx="-26" cy="-6" r="10"/><circle cx="-12" cy="-12" r="9"/><circle cx="6" cy="-6" r="10"/><circle cx="24" cy="-10" r="9"/></g>${label(36, n, 11, '#4E7A43')}`,
      box: n => ({ x0: -Math.max(48, lw(n, 11) / 2), y0: -22, x1: Math.max(48, lw(n, 11) / 2), y1: 40 }),
    },
    bullet_train: {
      draw: n => `<g transform="translate(-46,-11)"><path d="M0 22 H76 Q92 22 92 12 Q92 4 70 2 Q54 0 40 0 H0 Z" fill="#FFFFFF" stroke="#8C959B" stroke-width="2"/><path d="M52 3 Q66 3 75 8 H52 Z" fill="#2F74B5"/><rect x="0" y="16" width="80" height="3" fill="#2F74B5"/><g fill="#8C959B"><rect x="8" y="6" width="8" height="5" rx="1"/><rect x="21" y="6" width="8" height="5" rx="1"/><rect x="34" y="6" width="8" height="5" rx="1"/></g></g>${label(-18, n, 11)}`,
      box: n => ({ x0: -48, y0: -30, x1: 48, y1: 13 }),
    },
    park_blob: {
      draw: n => `<g transform="scale(0.8)"><path d="M-70 -20 Q-60 -52 -10 -54 Q46 -56 56 -18 Q64 24 20 40 Q-40 52 -64 24 Z" fill="#DCEBD6"/><g fill="#7FB36F"><circle cx="-40" cy="-20" r="10"/><circle cx="-24" cy="-30" r="8"/><circle cx="30" cy="10" r="10"/><circle cx="40" cy="-4" r="8"/></g></g>${label(6, n, 13, '#4E7A43')}`,
      box: n => ({ x0: -56, y0: -44, x1: 52, y1: 40 }),
    },
    brick_station: {
      draw: n => `<g transform="translate(-38,-36)"><rect x="0" y="10" width="76" height="26" fill="#C98A6B"/><rect x="-4" y="6" width="84" height="6" fill="#A8694E"/><path d="M4 6 Q14 -10 24 6 Z" fill="#6E7F8C"/><path d="M52 6 Q62 -10 72 6 Z" fill="#6E7F8C"/><g fill="#FFFFFF" opacity="0.8"><rect x="8" y="18" width="6" height="8"/><rect x="22" y="18" width="6" height="8"/><rect x="36" y="18" width="6" height="8"/><rect x="50" y="18" width="6" height="8"/><rect x="64" y="18" width="6" height="8"/></g></g>${label(16, n)}`,
      box: n => ({ x0: -44, y0: -46, x1: 44, y1: 20 }),
    },
    slim_tower: {
      draw: n => `<g transform="scale(0.8)"><path d="M-8 0 L-3 -120 L3 -120 L8 0 Z" fill="#9FB3C4"/><rect x="-11" y="-70" width="22" height="8" rx="3" fill="#8AA1B4"/><rect x="-8" y="-98" width="16" height="6" rx="3" fill="#8AA1B4"/><line x1="0" y1="-120" x2="0" y2="-136" stroke="#9FB3C4" stroke-width="2"/></g>${label(16, n)}`,
      box: n => ({ x0: -Math.max(14, lw(n) / 2), y0: -110, x1: Math.max(14, lw(n) / 2), y1: 20 }),
    },
    temple_gate: {
      draw: n => `<g><path d="M-34 -30 Q0 -44 34 -30 L28 -24 H-28 Z" fill="#6E7F8C"/><rect x="-26" y="-24" width="52" height="5" fill="#C45A48"/><rect x="-22" y="-19" width="6" height="19" fill="#C45A48"/><rect x="16" y="-19" width="6" height="19" fill="#C45A48"/><ellipse cx="0" cy="-10" rx="7" ry="9" fill="#E8743B"/><rect x="-3" y="-20" width="6" height="3" fill="#6E7F8C"/></g>${label(16, n)}`,
      box: n => ({ x0: -Math.max(36, lw(n) / 2), y0: -42, x1: Math.max(36, lw(n) / 2), y1: 20 }),
    },
    dome: {
      draw: n => `<g><path d="M-36 0 Q-36 -30 0 -32 Q36 -30 36 0 Z" fill="#E4E7EA" stroke="#B9C7D3" stroke-width="2"/><path d="M-24 -18 Q0 -26 24 -18" fill="none" stroke="#B9C7D3" stroke-width="2"/><rect x="-40" y="0" width="80" height="6" rx="2" fill="#B9C7D3"/></g>${label(20, n)}`,
      box: n => ({ x0: -Math.max(40, lw(n) / 2), y0: -34, x1: Math.max(40, lw(n) / 2), y1: 24 }),
    },
    torii: {
      draw: n => `<g><ellipse cx="0" cy="0" rx="40" ry="14" fill="#DCEBD6"/><g fill="#7FB36F"><circle cx="-30" cy="-10" r="9"/><circle cx="30" cy="-10" r="9"/></g><path d="M-22 -40 Q0 -46 22 -40 L20 -35 H-20 Z" fill="#C45A48"/><rect x="-18" y="-31" width="36" height="4" fill="#C45A48"/><rect x="-15" y="-35" width="5" height="35" fill="#C45A48"/><rect x="10" y="-35" width="5" height="35" fill="#C45A48"/></g>${label(28, n, 11, '#4E7A43')}`,
      box: n => ({ x0: -Math.max(42, lw(n, 11) / 2), y0: -46, x1: Math.max(42, lw(n, 11) / 2), y1: 32 }),
    },
    bridge: {
      draw: n => `<g><rect x="-48" y="-6" width="96" height="5" fill="#9FB3C4"/><rect x="-26" y="-36" width="6" height="36" fill="#B9C7D3"/><rect x="20" y="-36" width="6" height="36" fill="#B9C7D3"/><path d="M-48 -8 Q-36 -10 -23 -34 Q0 -6 23 -34 Q36 -10 48 -8" fill="none" stroke="#8AA1B4" stroke-width="2"/><rect x="-48" y="0" width="96" height="6" fill="#BFDDE8"/></g>${label(20, n, 11)}`,
      box: n => ({ x0: -Math.max(50, lw(n, 11) / 2), y0: -38, x1: Math.max(50, lw(n, 11) / 2), y1: 24 }),
    },
  };

  // geo_tokyo.json の icon: TODO を割り当てる
  const TODO_MAP = { sensoji: 'temple_gate', tokyo_dome: 'dome', gyoen: 'park_trees', meiji_jingu: 'torii', ueno_park: 'park_trees', odaiba: 'bridge' };
  // 地図上の表示名（短く）
  const SHORT_NAME = { shinkansen: '新幹線', odaiba: 'レインボーブリッジ', ueno_park: '上野公園', arisugawa: '有栖川宮記念公園' };

  function iconFor(lm) {
    const key = lm.icon && lm.icon !== 'TODO' ? lm.icon : TODO_MAP[lm.id];
    return ICONS[key] || null;
  }

  const M = { ICONS, iconFor, SHORT_NAME };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.AtinnIcons = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
