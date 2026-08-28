# -*- coding: utf-8 -*-
"""
全国定点.xlsx 更新Webアプリ (Streamlit)

ローカル起動:
    pip install -r requirements.txt
    streamlit run app.py

デプロイ:
    README.md を参照(Streamlit Community Cloud への無料デプロイ手順あり)
"""

import streamlit as st
from datetime import datetime
from core.updater import update_master, parse_date_from_filename, UpdateError

st.set_page_config(page_title="全国定点 更新ツール", page_icon="📊", layout="centered")

st.title("📊 全国定点.xlsx 更新ツール")
st.write(
    "マスターファイル(全国定点.xlsx)と、日次のFixedPointローデータを"
    "アップロードすると、稼働率・売上・稼働部屋数を自動反映した"
    "更新済みファイルを生成します。"
)

st.markdown("---")

master_file = st.file_uploader(
    "① マスターファイル(全国定点.xlsx)をアップロード",
    type=["xlsx"],
    accept_multiple_files=False,
)

raw_files = st.file_uploader(
    "② FixedPointローデータ(1件以上、複数選択可)をアップロード",
    type=["xlsx"],
    accept_multiple_files=True,
)

if raw_files:
    st.write("アップロードされたrawファイル:")
    problems = []
    for f in raw_files:
        try:
            d = parse_date_from_filename(f.name)
            st.write(f"- {f.name} → 日付: {d.strftime('%Y-%m-%d')}")
        except UpdateError as e:
            problems.append(str(e))
            st.error(f"- {f.name} → {e}")
    if problems:
        st.warning(
            "ファイル名に日付(FixedPointYYYYMMDDhhmmss.xlsx形式)が含まれていない"
            "ファイルがあります。該当ファイルは処理できません。"
        )

st.markdown("---")

run = st.button("🚀 更新を実行", type="primary", disabled=not (master_file and raw_files))

if run:
    with st.spinner("処理中..."):
        try:
            master_bytes = master_file.getvalue()
            raw_payload = [(f.name, f.getvalue()) for f in raw_files]
            updated_bytes, log = update_master(master_bytes, raw_payload)
        except UpdateError as e:
            st.error(f"エラー: {e}")
        except Exception as e:  # noqa: BLE001
            st.error(f"予期しないエラーが発生しました: {e}")
        else:
            st.success("更新が完了しました。")
            with st.expander("更新ログを表示", expanded=True):
                for line in log:
                    st.text(line)

            out_name = f"全国定点_updated_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            st.download_button(
                "📥 更新済みファイルをダウンロード",
                data=updated_bytes,
                file_name=out_name,
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

st.markdown("---")
with st.expander("ℹ️ 仕様・注意事項"):
    st.markdown(
        """
- 対象シートは `YYYY年M月` 形式で、あらかじめマスターファイル内に存在している必要があります
  (月が変わる際のシート自動作成には未対応です)。
- 稼働率(D,F,H,J列)は毎回絶対値で上書きし、当日伸び列は差分値として書き込みます。
  売上・稼働部屋数列も絶対値で上書きします。それ以外(SUM・予算差異・MM単価などの数式)は変更しません。
- 複数のrawファイルをまとめてアップロードした場合、ファイル名の日付順に自動で処理します。
- 生成されるファイルは上書き保存ではなく、新しいファイル名でダウンロードされます。
        """
    )
