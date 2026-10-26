# グッドマンスリー スクレイパー

[グッドマンスリー](https://www.good-monthly.com/) の都道府県別物件一覧（`/{都道府県}/search/list_pref.html`）から物件情報を集めて CSV に保存します。

## 準備

```sh
pip install -r requirements.txt
```

## 使い方

```sh
# 東京・神奈川・埼玉をまとめて取得（data/good-monthly_YYYYMMDDhhmmss.csv に保存）
python scraper/good_monthly.py --pref tokyo kanagawa saitama

# お試し：各都道府県 2 ページだけ
python scraper/good_monthly.py --pref tokyo --max-pages 2

# 出力先を指定
python scraper/good_monthly.py --pref chiba --out chiba.csv
```

| オプション | 内容 | 既定値 |
|---|---|---|
| `--pref` | 都道府県のローマ字（サイトの URL と同じ。`tokyo` `kanagawa` `saitama` `chiba` `osaka` など） | `tokyo` |
| `--out` | 出力 CSV のパス | `data/good-monthly_日時.csv` |
| `--delay` | ページ取得の間隔（秒）。サイトに負荷をかけないよう 1 秒以上を推奨 | `1.0` |
| `--max-pages` | 1 都道府県あたりの最大ページ数（0 = 全ページ） | `0` |

1 ページ 30 件なので、東京（約 13,500 件）は約 450 ページ・15 分ほどかかります。

## 出力する列

先頭 21 列は既存のサンプル CSV（WM_*.csv）と同じ並びです。

プラン名, 住所, 最寄駅, 築年月, 間取り, 広さ, キャンペーン, ショート賃料/光熱費/清掃費, ミドル賃料/光熱費/清掃費, ロング賃料/光熱費/清掃費, 詳細URL, 画像URL, 間取りURL, 運営会社, リンクURL

続けて次の列を追加しています。

物件番号, 都道府県, スーパーショート賃料/光熱費/清掃費, 設備（「あり」の設備のみ）, 取得日時

- 料金が期間別でなく一律（「料金」1 行）の物件は、ショート・ミドル・ロングに同じ値を入れます。
- 文字コードは BOM 付き UTF-8 です（Excel でそのまま開けます）。

## 仕組みのメモ

- 一覧の並び順はアクセスのたびにランダムに変わるため、URL に `random_number` を付けて並びを固定しています。これがないとページ間で重複や取りこぼしが出ます。
- 一覧ページだけで必要な項目がそろうので、詳細ページにはアクセスしません。
