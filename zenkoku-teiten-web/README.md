# 全国定点 更新ツール

日次で出力される FixedPoint ローデータ(`FixedPointYYYYMMDDhhmmss.xlsx`)から
稼働率・売上・稼働部屋数を抽出し、`全国定点.xlsx` の該当セルへ自動反映する
Webアプリ / CLIツールです。

- Webアプリ: ブラウザでファイルをアップロード→ボタンを押す→更新済みファイルをダウンロード
- CLI: コマンドラインから同じ処理を実行

## フォルダ構成

```
zenkoku-teiten-web/
├── app.py                       # Streamlit Webアプリ本体
├── update_zenkoku_teiten_cli.py # コマンドライン版
├── core/
│   └── updater.py               # 更新ロジック本体(Web/CLI共通)
├── requirements.txt
├── .gitignore
└── README.md
```

---

## 1. ローカルで動かす

```bash
# 1. このフォルダに移動
cd zenkoku-teiten-web

# 2. (推奨) 仮想環境を作る
python -m venv venv
source venv/bin/activate      # Windowsは venv\Scripts\activate

# 3. 依存パッケージをインストール
pip install -r requirements.txt

# 4a. Webアプリとして起動
streamlit run app.py
# → ブラウザが自動で開きます (http://localhost:8501)

# 4b. あるいはCLIとして実行
python update_zenkoku_teiten_cli.py 全国定点.xlsx FixedPoint20260817224857.xlsx
```

---

## 2. このリポジトリでの位置づけ

このフォルダ(`zenkoku-teiten-web/`)は既存リポジトリのサブフォルダとして追加されています
(独立した別リポジトリではありません)。すでにpush済みなので、追加のgit操作は不要です。

もし将来的に完全に独立したリポジトリへ分離したい場合は、以下の手順で行えます。

```bash
# リポジトリのルートで実行
git subtree split --prefix=zenkoku-teiten-web -b zenkoku-teiten-web-only
# 空の新規リポジトリを作成した上で
git push https://github.com/<ユーザー名>/<新リポジトリ名>.git zenkoku-teiten-web-only:main
```

---

## 3. Web上で操作できるようにする(デプロイ)

コードをGitHubに上げただけではまだ「あなたのPC上でしか動かない」状態です。
誰でもブラウザからアクセスできるようにするには、どこかのサーバー上で
`streamlit run app.py` を常時動かしておく必要があります。おすすめは以下です。

### おすすめ: Streamlit Community Cloud (無料・最短)

1. https://share.streamlit.io にアクセスし、GitHubアカウントでログイン
2. 「New app」→ このリポジトリを選択
3. Main file path に `zenkoku-teiten-web/app.py` を指定（サブフォルダ内にあるため）
4. 「Deploy」をクリック

数分で `https://<何か>.streamlit.app` のようなURLが発行され、
そのURLにアクセスするだけで誰でも(URLを知っている人なら)このツールを使えるようになります。

> 社内データを扱うため、リポジトリは Private にし、Streamlit Cloud側の
> アプリ公開設定も「限定公開(Private)」にしておくことを推奨します
> (Streamlit Community CloudのPrivateアプリ機能、または後述の代替サービスをご検討ください)。

### 代替: Render / Railway など

社内限定でしっかりアクセス制限をかけたい場合は、Render や Railway などの
PaaSにDockerまたはPythonアプリとしてデプロイする方法もあります。
その場合は追加で `Procfile` や `Dockerfile` が必要になるので、
「Renderにデプロイしたい」など要望があれば追加で作成します。

---

## 4. 仕様メモ

- 対象シートは `全国定点.xlsx` 内の `YYYY年M月` シートが**あらかじめ存在している**前提です
  (月が変わったときの新シート自動作成は未対応)。
- 稼働率(D,F,H,J列)は毎回絶対値で上書きし、当日伸び列(E,G,I,K)は差分値として書き込みます。
- 売上(O,R,U,X列)・稼働部屋数(AC,AF,AI,AL列)も絶対値で上書きします。
- 全国合計(SUM)・予算差異・MM単価などの既存の数式セルは変更しません。
- 複数のFixedPointファイルをまとめて渡した場合、ファイル名の日付順に自動処理します。
