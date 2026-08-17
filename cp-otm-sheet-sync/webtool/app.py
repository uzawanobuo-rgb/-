#!/usr/bin/env python3
"""Local web tool for syncing OTM campaign data into the CP 'おためし' sheet.

Run:
    pip install -r requirements.txt
    python app.py
Then open http://127.0.0.1:5000/ in a browser.

Uses openpyxl server-side so the output .xlsm keeps its VBA macros and
formatting intact (a pure browser/JS tool cannot do this).
"""
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, render_template_string, request, send_from_directory, abort

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sync_core import sync  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "_uploads"
OUTPUT_DIR = BASE_DIR / "_outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32MB

# In-memory store of the last few run reports, keyed by a random token.
REPORTS = {}
# Download filename for each token, timestamped so repeated runs don't overwrite each other.
DOWNLOAD_NAMES = {}

FORM_PAGE = """
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>価格一括更新ファイル × 【全国】おためし入居キャンペーン 同期ツール</title>
<style>
  body { font-family: -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 1.4rem; }
  .field { margin-bottom: 16px; }
  label { display: block; font-weight: bold; margin-bottom: 4px; }
  .hint { color: #666; font-size: 0.85rem; margin-top: 2px; }
  button { background: #2c5aa0; color: #fff; border: none; padding: 10px 20px; border-radius: 4px; font-size: 1rem; cursor: pointer; }
  button:hover { background: #204a87; }
  .error { color: #c0392b; background: #fdecea; padding: 10px; border-radius: 4px; margin-bottom: 16px; }
  .box { background: #f7f7f9; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; }
</style>
</head>
<body>
  <h1>価格一括更新ファイル × 【全国】おためし入居キャンペーン 同期ツール</h1>
  <p>価格一括更新ファイル(.xlsm)の「おためし」シートに、【全国】おためし入居キャンペーンファイル(.xls)の最新シートの内容を反映します。</p>
  {% if error %}<div class="error">{{ error }}</div>{% endif %}
  <form method="post" enctype="multipart/form-data" class="box">
    <div class="field">
      <label>【全国】おためし入居キャンペーンファイル (.xls)</label>
      <input type="file" name="otm_file" accept=".xls" required>
      <div class="hint">一番左（最新日付）のシートが自動的に使われます。</div>
    </div>
    <div class="field">
      <label>価格一括更新ファイル (.xlsm)</label>
      <input type="file" name="cp_file" accept=".xlsm" required>
      <div class="hint">「おためし」シートが更新されます。他のシート・マクロはそのまま保持されます。</div>
    </div>
    <div class="field">
      <label>プラン・キャンペーン一覧 (.csv)</label>
      <input type="file" name="plan_csv_file" accept=".csv" required>
      <div class="hint">
        「おためし入居キャンペーン」と「おためし入居キャンペーン②」が両方存在する物件を判定し、更新対象から除外するために使用します。<br>
        ダウンロード: <a href="http://magi2.atinn.jp/SimpleOutputCsv/plan" target="_blank" rel="noopener">http://magi2.atinn.jp/SimpleOutputCsv/plan</a>
      </div>
    </div>
    <button type="submit">同期を実行</button>
  </form>
</body>
</html>
"""

RESULT_PAGE = """
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>同期結果</title>
<style>
  body { font-family: -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #222; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 0.9rem; }
  th { background: #f0f0f0; }
  .ok { color: #1a7a2e; font-weight: bold; }
  .warn { color: #b8860b; font-weight: bold; }
  .none { color: #999; }
  .download { display: inline-block; margin-top: 20px; background: #2c5aa0; color: #fff; padding: 10px 20px; border-radius: 4px; text-decoration: none; }
  .download:hover { background: #204a87; }
  a.back { display: inline-block; margin-top: 20px; margin-left: 12px; }
</style>
</head>
<body>
  <h1>同期結果</h1>
  <p>【全国】おためし入居キャンペーン 使用シート: <strong>{{ report.otm_sheet_name }}</strong></p>

  <h2>①新規依頼: {{ report.shinki.matched|length }} / {{ report.shinki.total }} 件マッチ</h2>
  {% if report.shinki.matched %}
  <table>
    <tr><th>物件名</th><th>価格一括更新ファイル行</th><th>照合方法</th></tr>
    {% for m in report.shinki.matched %}
    <tr><td>{{ m.name }}</td><td>{{ m.row }}</td>
      <td class="{{ 'warn' if m.how != 'exact' else 'ok' }}">{{ '記号を除いて照合' if m.how != 'exact' else '完全一致' }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}
  {% if report.shinki.unmatched %}
  <p class="warn">未マッチ: {{ report.shinki.unmatched|join(', ') }}</p>
  {% endif %}

  <h2>②期間変更: {{ report.henkou.matched|length }} / {{ report.henkou.total }} 件マッチ</h2>
  {% if report.henkou.matched %}
  <table>
    <tr><th>物件名</th><th>価格一括更新ファイル行</th><th>照合方法</th></tr>
    {% for m in report.henkou.matched %}
    <tr><td>{{ m.name }}</td><td>{{ m.row }}</td>
      <td class="{{ 'warn' if m.how != 'exact' else 'ok' }}">{{ '記号を除いて照合' if m.how != 'exact' else '完全一致' }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}
  {% if report.henkou.unmatched %}
  <p class="warn">未マッチ: {{ report.henkou.unmatched|join(', ') }}</p>
  {% endif %}

  {% if report.ambiguous %}
  <h2>あいまい一致（自動更新せず・要確認）</h2>
  <table>
    <tr><th>種別</th><th>物件名（キャンペーン側）</th><th>候補行（価格一括更新ファイル）</th></tr>
    {% for a in report.ambiguous %}
    <tr><td>{{ a.type }}</td><td>{{ a.name }}</td><td>{{ a.candidate_rows|join(', ') }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}

  {% if report.excluded_campaign2 %}
  <h2>更新対象外（おためし入居キャンペーン②が存在・要確認）</h2>
  <p class="warn">プラン・キャンペーン一覧に「おためし入居キャンペーン」と「おためし入居キャンペーン②」の両方が存在し、どちらの更新か判別できないため、自動更新の対象から外しています。</p>
  <table>
    <tr><th>種別</th><th>物件名</th><th>価格一括更新ファイル行</th></tr>
    {% for e in report.excluded_campaign2 %}
    <tr><td>{{ e.type }}</td><td>{{ e.cp_name }}</td><td>{{ e.row }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}

  {% if report.excluded_deletion %}
  <h2>更新対象外（登録削除のため）</h2>
  <p class="warn">【全国】おためし入居キャンペーンファイルの「登録削除」欄以下に記載されていた物件です。期間変更ではなく削除の連絡のため、自動更新の対象から外しています。</p>
  <table>
    <tr><th>物件名</th><th>価格一括更新ファイル行</th></tr>
    {% for e in report.excluded_deletion %}
    <tr><td>{{ e.cp_name }}</td><td>{{ e.row }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}
  {% if report.deletion_unmatched %}
  <p class="warn">登録削除・未マッチ: {{ report.deletion_unmatched|join(', ') }}</p>
  {% endif %}

  {% if report.excluded_missing_rate %}
  <h2>更新対象外（賃料・清掃費の割引率が未記載のため）</h2>
  <p class="warn">①新規依頼で、V列（賃料：割引率）またはW列（RC：割引率）が空欄のため、情報不足として自動更新の対象から外しています。</p>
  <table>
    <tr><th>物件名</th><th>価格一括更新ファイル行</th></tr>
    {% for e in report.excluded_missing_rate %}
    <tr><td>{{ e.cp_name }}</td><td>{{ e.row }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}

  <a class="download" href="/download/{{ token }}">更新後のファイルをダウンロード</a>
  <a class="back" href="/">← もう一度実行する</a>
</body>
</html>
"""


@app.get("/")
def index():
    return render_template_string(FORM_PAGE, error=None)


@app.post("/")
def run_sync():
    otm_file = request.files.get("otm_file")
    cp_file = request.files.get("cp_file")
    plan_csv_file = request.files.get("plan_csv_file")
    if (
        not otm_file or not otm_file.filename
        or not cp_file or not cp_file.filename
        or not plan_csv_file or not plan_csv_file.filename
    ):
        return render_template_string(
            FORM_PAGE,
            error="【全国】おためし入居キャンペーンファイル・価格一括更新ファイル・プラン・キャンペーン一覧の3つすべてを選択してください。",
        )

    token = uuid.uuid4().hex
    otm_path = UPLOAD_DIR / f"{token}_otm.xls"
    cp_path = UPLOAD_DIR / f"{token}_cp.xlsm"
    plan_csv_path = UPLOAD_DIR / f"{token}_plan.csv"
    otm_file.save(otm_path)
    cp_file.save(cp_path)
    plan_csv_file.save(plan_csv_path)

    try:
        cp_wb, report = sync(str(otm_path), str(cp_path), str(plan_csv_path))
    except Exception as e:
        return render_template_string(FORM_PAGE, error=f"処理中にエラーが発生しました: {e}")
    finally:
        otm_path.unlink(missing_ok=True)
        cp_path.unlink(missing_ok=True)
        plan_csv_path.unlink(missing_ok=True)

    out_name = f"{token}.xlsm"
    cp_wb.save(OUTPUT_DIR / out_name)
    REPORTS[token] = report
    timestamp = datetime.now().strftime("%Y%m%d %H%M")
    DOWNLOAD_NAMES[token] = f"【更新後{timestamp}】CP価格一括更新ファイル.xlsm"

    return render_template_string(RESULT_PAGE, report=report, token=token)


@app.get("/download/<token>")
def download(token):
    if token not in REPORTS:
        abort(404)
    return send_from_directory(
        OUTPUT_DIR,
        f"{token}.xlsm",
        as_attachment=True,
        download_name=DOWNLOAD_NAMES.get(token, "価格一括更新ファイル.xlsm"),
    )


if __name__ == "__main__":
    import threading
    import webbrowser

    threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:5000/")).start()
    app.run(host="127.0.0.1", port=5000, debug=False)
