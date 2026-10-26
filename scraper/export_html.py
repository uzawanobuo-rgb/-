"""競合レポートを、データ込みの1つの HTML ファイルに書き出す。

ブラウザで開くだけで、ネット接続やログインなしにレポートを見られる。
データ (build_report.py の出力 CSV) は gzip + base64 で埋め込み、開いたときに展開する。

使い方:
    python scraper/export_html.py --data report --d3 d3.min.js --out 競合レポート.html
"""

import argparse
import base64
import datetime
import glob
import gzip
import json
import os

# レポート画面 (report/dashboard.html) が使う dash の機能を、ファイル単体で動くように置き換える
SHIM = r"""
(() => {
  const params = __PARAMS__;
  const defaults = JSON.parse(JSON.stringify(params));
  const texts = {};
  const parsed = {};
  const fns = [];
  const run = () => { for (const fn of fns) fn(); };
  window.dash = {
    // 開いている画面の配色 (ライト / ダーク) の値を、その都度読む
    get colors() {
      const css = getComputedStyle(document.documentElement);
      return [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css.getPropertyValue(`--series-${i}`).trim());
    },
    data(id) {
      if (!(id in texts)) return { status: 'loading', data: [] };
      if (!parsed[id]) parsed[id] = d3.csvParse(texts[id]);
      return { status: 'ok', data: parsed[id], columns: parsed[id].columns };
    },
    params: () => params,
    setParams(p) { Object.assign(params, p); run(); },
    resetParams() { for (const k of Object.keys(params)) delete params[k]; Object.assign(params, JSON.parse(JSON.stringify(defaults))); run(); },
    onData(fn) { fns.push(fn); fn(); },
    setLink(name) { history.replaceState(null, '', '#' + name); },
  };
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 150); });
  window.__loadData = async () => {
    for (const el of document.querySelectorAll('script[type="application/gzip+base64"]')) {
      const bytes = Uint8Array.from(atob(el.textContent.trim()), (c) => c.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      texts[el.dataset.id] = await new Response(stream).text();
    }
    run();
  };
})();
"""

STYLE = """
:root {
  --font-anthropic-sans: "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif;
  --font-anthropic-serif: "Hiragino Mincho ProN", "Noto Serif JP", "Yu Mincho", serif;
  --cds-gap-xs: 4px; --cds-gap-sm: 8px; --cds-gap-md: 16px; --cds-gap-lg: 24px;
  --cds-pad-xs: 4px; --cds-pad-sm: 8px; --cds-pad-md: 12px; --cds-pad-lg: 20px;
  --cds-radius: 8px;
  --cds-font-size-caption: 12px; --cds-font-size-body: 14px; --cds-font-size-heading: 16px; --cds-font-size-title: 26px;
  --cds-font-weight-medium: 600;
  --cds-dur-slow: 300ms;
  --color-bg: #f6f7f9; --color-panel: #ffffff; --color-fg: #1d2129; --color-fg-muted: #5f6673;
  --color-border-line: #dde1e7; --color-ok: #1f7a46; --color-bad: #c0392b;
  --cds-surface-popover: #ffffff; --cds-border: #d3d8df; --cds-shadow-popover: 0 6px 20px rgba(20, 28, 40, .14);
  --cds-text-secondary: #5f6673;
  --cds-chart-grid: #e7eaee; --cds-chart-axis: #b9c0ca; --cds-chart-reference: #8a93a0;
  --series-1: #3b6fd8; --series-2: #e0892e; --series-3: #2f9b62; --series-4: #8c5bd1;
  --series-5: #d6497a; --series-6: #1f9fae; --series-7: #b7952b; --series-8: #6b7684;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1c1f24; --color-panel: #262a31; --color-fg: #e8eaee; --color-fg-muted: #a1a8b3;
    --color-border-line: #3a404a; --color-ok: #5cc98b; --color-bad: #f07b6e;
    --cds-surface-popover: #2e333b; --cds-border: #454c57; --cds-shadow-popover: 0 6px 20px rgba(0, 0, 0, .4);
    --cds-text-secondary: #a1a8b3;
    --cds-chart-grid: #333943; --cds-chart-axis: #555d69; --cds-chart-reference: #7d8693;
    --series-1: #6f9bf0; --series-2: #f0a85a; --series-3: #5cc98b; --series-4: #b18ef0;
    --series-5: #f07ba6; --series-6: #4cc3d1; --series-7: #d9bb55; --series-8: #9aa3b0;
    color-scheme: dark;
  }
}
html, body { margin: 0; background: var(--color-bg); color: var(--color-fg); font-family: var(--font-anthropic-sans); font-size: 14px; }
#dash-root { max-width: 1280px; margin-inline: auto; padding: 24px max(16px, 3vw) 48px; }
.dash-skeleton { color: transparent !important; background: color-mix(in srgb, var(--color-fg-muted) 12%, transparent); border-radius: var(--cds-radius); }
.mr-foot { margin-top: 32px; color: var(--color-fg-muted); font-size: 12px; }
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="report", help="build_report.py の出力フォルダ")
    parser.add_argument("--page", default="report/dashboard.html")
    parser.add_argument("--d3", required=True, help="d3 v7 の d3.min.js")
    parser.add_argument("--out", required=True)
    parser.add_argument("--site", default="wm", help="開いたときのサイト (wm / gm)")
    args = parser.parse_args()

    blobs = []
    for path in sorted(glob.glob(os.path.join(args.data, "*.csv"))):
        name = os.path.splitext(os.path.basename(path))[0]
        with open(path, "rb") as f:
            data = base64.b64encode(gzip.compress(f.read(), 9)).decode()
        blobs.append(f'<script type="application/gzip+base64" data-id="{name}">{data}</script>')

    params = {"site": args.site, "area": "kanto", "page": "price", "co": None, "pref": [], "city": [],
              "layout": [], "size": [], "line": [], "station": [], "from": None, "to": None}
    with open(args.page, encoding="utf-8") as f:
        page = f.read()
    with open(args.d3, encoding="utf-8") as f:
        d3 = f.read()
    made = datetime.datetime.now().strftime("%Y/%m/%d %H:%M")

    html = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>マンスリー競合レポート</title>
<style>{STYLE}</style>
<script>{d3}</script>
<script>{SHIM.replace("__PARAMS__", json.dumps(params, ensure_ascii=False))}</script>
</head>
<body>
<div id="dash-root">
{page}
<p class="mr-foot">{made} 作成。データはこのファイルに含まれています。</p>
</div>
{chr(10).join(blobs)}
<script>window.__loadData();</script>
</body>
</html>
"""
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"{args.out} ({os.path.getsize(args.out) / 1e6:.1f}MB)")


if __name__ == "__main__":
    main()
