"""グッドマンスリー (www.good-monthly.com) の物件一覧をスクレイピングして CSV に保存する。

使い方:
    python scraper/good_monthly.py --pref tokyo kanagawa saitama
    python scraper/good_monthly.py --pref tokyo --max-pages 2   # お試し
"""

import argparse
import csv
import datetime
import os
import sys
import time

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.good-monthly.com"
USER_AGENT = "Mozilla/5.0 (compatible; monthly-research-bot/1.0)"
# 一覧の並び順はリクエストごとにランダムに変わるため、乱数の種を固定してページ間の重複・漏れを防ぐ
RANDOM_NUMBER = 1

# 先頭 21 列はサンプル CSV (WM_*.csv) と同じ並び。以降はグッドマンスリー独自の追加列。
COLUMNS = [
    "プラン名", "住所", "最寄駅", "築年月", "間取り", "広さ", "キャンペーン",
    "ショート賃料", "ショート光熱費", "ショート清掃費",
    "ミドル賃料", "ミドル光熱費", "ミドル清掃費",
    "ロング賃料", "ロング光熱費", "ロング清掃費",
    "詳細URL", "画像URL", "間取りURL", "運営会社", "リンクURL",
    "物件番号", "都道府県",
    "スーパーショート賃料", "スーパーショート光熱費", "スーパーショート清掃費",
    "設備", "取得日時",
]

# 料金表の行見出し。「スーパーショート」は「ショート」より先に判定する。
PLANS = ["スーパーショート", "ショート", "ミドル", "ロング"]


def text(node, sep=""):
    return node.get_text(sep, strip=True) if node else ""


def dd_by_dt(section, label):
    for dl in section.select("div.detailTxt dl"):
        if text(dl.find("dt")) == label:
            return dl.find("dd")
    return None


def parse_listing(section, pref, fetched_at):
    row = {c: "" for c in COLUMNS}
    link = section.select_one("div.titArea h3 a")
    if not link:
        return None
    detail_url = BASE_URL + link["href"]
    row["プラン名"] = text(link)
    row["詳細URL"] = row["リンクURL"] = detail_url
    row["物件番号"] = link["href"].split("bukken_no=")[-1]
    row["都道府県"] = pref

    row["住所"] = text(dd_by_dt(section, "所在地"))
    row["最寄駅"] = text(dd_by_dt(section, "最寄駅"), " / ")
    row["築年月"] = text(dd_by_dt(section, "築年月"))
    row["間取り"] = text(dd_by_dt(section, "間取り"))
    row["広さ"] = text(dd_by_dt(section, "面積"))

    row["キャンペーン"] = " / ".join(
        text(a, " ") for a in section.select("div.campaignArea li a")
    )

    for img in section.select("ul.detailPhoto img"):
        src = BASE_URL + img["src"] if img["src"].startswith("/") else img["src"]
        if "/madorizu/" in src:
            row["間取りURL"] = src
        elif not row["画像URL"]:
            row["画像URL"] = src

    row["運営会社"] = text(section.select_one("div.company dt"))
    row["設備"] = " / ".join(text(li) for li in section.select("ul.icon li.on"))

    for tr in section.select("div.priceArea tr"):
        th = tr.find("th", class_="th01")
        tds = tr.find_all("td")
        if not th or len(tds) < 3:
            continue
        heading = text(th)
        values = [text(td) for td in tds[:3]]
        if heading == "料金":
            # 期間別ではなく一律料金の物件は、ショート・ミドル・ロングに同じ値を入れる
            plans = ["ショート", "ミドル", "ロング"]
        else:
            plans = [p for p in PLANS if heading.startswith(p)][:1]
        for plan in plans:
            row[f"{plan}賃料"], row[f"{plan}光熱費"], row[f"{plan}清掃費"] = values

    row["取得日時"] = fetched_at
    return row


def fetch(session, url, retries=3):
    for attempt in range(retries):
        try:
            res = session.get(url, timeout=30)
            res.raise_for_status()
            res.encoding = "utf-8"
            return res.text
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            wait = 5 * (attempt + 1)
            print(f"  取得失敗 ({e})。{wait}秒後に再試行します", file=sys.stderr)
            time.sleep(wait)


def scrape_pref(session, pref, delay, max_pages):
    fetched_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    page = 1
    last_page = None
    while True:
        url = f"{BASE_URL}/{pref}/search/list_pref.html?random_number={RANDOM_NUMBER}"
        if page > 1:
            url += f"&page_no={page}"
        soup = BeautifulSoup(fetch(session, url), "html.parser")

        if last_page is None:
            total = int(text(soup.select_one("div.paging span.style01")) or 0)
            last_page = max(1, -(-total // 30))
            if max_pages:
                last_page = min(last_page, max_pages)
            print(f"{pref}: {total}件 / {last_page}ページを取得します", file=sys.stderr)

        sections = soup.select("section.default")
        for section in sections:
            row = parse_listing(section, pref, fetched_at)
            if row:
                yield row

        print(f"  {pref} {page}/{last_page}ページ ({len(sections)}件)", file=sys.stderr)
        if page >= last_page or not sections:
            break
        page += 1
        time.sleep(delay)


def main():
    parser = argparse.ArgumentParser(description="グッドマンスリーの物件一覧を CSV に保存する")
    parser.add_argument("--pref", nargs="+", default=["tokyo"],
                        help="都道府県のローマ字 (例: tokyo kanagawa saitama)")
    parser.add_argument("--out", help="出力 CSV のパス (省略時は data/ に日時付きで保存)")
    parser.add_argument("--delay", type=float, default=1.0, help="ページ取得の間隔 (秒)")
    parser.add_argument("--max-pages", type=int, default=0, help="1都道府県あたりの最大ページ数 (0=全部)")
    args = parser.parse_args()

    out = args.out or os.path.join(
        "data", f"good-monthly_{datetime.datetime.now():%Y%m%d%H%M%S}.csv"
    )
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    seen = set()
    count = 0
    # utf-8-sig: Excel で開いても文字化けしないように BOM を付ける
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        for i, pref in enumerate(args.pref):
            if i:
                time.sleep(args.delay)
            for row in scrape_pref(session, pref, args.delay, args.max_pages):
                # 取得中に並びが変わると同じ物件が2回出ることがあるので除外
                if row["物件番号"] in seen:
                    continue
                seen.add(row["物件番号"])
                writer.writerow(row)
                count += 1

    print(f"{count}件を {out} に保存しました", file=sys.stderr)


if __name__ == "__main__":
    main()
