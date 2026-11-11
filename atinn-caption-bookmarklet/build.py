"""bookmarklet.js から配布用ページ index.html を作る。  使い方: python3 build.py"""
import pathlib, urllib.parse, html

here = pathlib.Path(__file__).parent
src = (here / 'bookmarklet.js').read_text(encoding='utf-8')
code = '\n'.join(l.strip() for l in src.splitlines() if l.strip() and not l.strip().startswith('//'))
href = 'javascript:' + urllib.parse.quote(code, safe="()';,/:!*~-_.")
tpl = (here / 'template.html').read_text(encoding='utf-8')
(here / 'index.html').write_text(tpl.replace('{{HREF}}', html.escape(href, quote=True)).replace('{{HREF_TEXT}}', html.escape(href)), encoding='utf-8')
print('index.html を作成しました（%d 文字）' % len(href))
