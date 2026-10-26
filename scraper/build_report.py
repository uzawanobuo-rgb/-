"""スクレイピング結果 (data/snapshots/<サイト>/YYYY-MM-DD.csv) からレポート用のデータを作る。

サイトごとにフォルダを分ける: gm = グッドマンスリー、wm = ウィークリーマンション。
どちらもスクレイパーが出す CSV と同じ列 (プラン名, 住所, 最寄駅, ...) を読む。

使い方:
    python scraper/build_report.py --snapshots data/snapshots --out report

出力:
    report/listings_<サイト>_<エリア>.csv
        最新日の物件ごとのデータ (前日との差額つき)
    report/trend.csv
        日付 × サイト × エリア × 都道府県 × 掲載会社 ごとの利用料の合計と件数 (料金推移グラフ用)
"""

import argparse
import csv
import glob
import os
import re
from collections import defaultdict

AREAS = {
    "kanto": ["東京都", "神奈川県", "埼玉県", "千葉県"],
    "tokai": ["愛知県", "岐阜県", "三重県", "静岡県"],
    "kansai": ["大阪府", "京都府", "兵庫県", "奈良県", "滋賀県", "和歌山県"],
}
PREF_AREA = {p: a for a, prefs in AREAS.items() for p in prefs}

# 運営会社名 → レポートでの表示名。ここにない会社は「株式会社」などを外した名前で出す。
COMPANY_ALIASES = {
    "株式会社アットイン": "アットイン",
    "株式会社One Life": "OneLife",
    "株式会社BraTTo": "BraTTo",
    "株式会社マイナビ": "マイナビ",
    "株式会社トラストインフィニティー": "トラスト",
    "ユーアンドアールホテルマネジメント（株）　総合受付": "ユーアンドアール",
    "株式会社リブ・マックス": "リブ・マックス",
    "matsuri technologies株式会社": "matsuri",
    "ＧＶ－Ｒｅｎｔ株式会社": "GV-Rent",
    "株式会社stoked life": "stokedlife",
    "株式会社リアルエスト": "リアルエスト",
    "アパルトマンエージェント株式会社": "アパルトマン",
    "グッドステイ　全国エリア受付": "グッドステイ",
    "大東建託リーシング株式会社": "大東建託リーシング",
    "グッドルーム株式会社": "グッドルーム",
}

CITY_RE = re.compile(
    r"^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)"
    r"((?:横浜|川崎|相模原|さいたま|千葉|名古屋|静岡|浜松|大阪|堺|京都|神戸)市.+?区"
    r"|.+?郡.+?[町村]|.+?[市区町村])"
)
# 「線」で終わる路線名を優先し、なければ「鉄道」などで区切る (例: 埼玉高速鉄道川口元郷駅)
STATION_RES = [
    re.compile(r"^(.+?(?:線|ライン|ライナー|エクスプレス|ゆりかもめ|モノレール|トラム))(.+?)駅(?:\s|$)"),
    re.compile(r"^(.+?鉄道)(.+?)駅(?:\s|$)"),
]
WALK_RE = re.compile(r"徒歩(\d+)分")


def short_company(name):
    name = name.strip()
    if name in COMPANY_ALIASES:
        return COMPANY_ALIASES[name]
    for word in ["株式会社", "（株）", "(株)", "有限会社"]:
        name = name.replace(word, "")
    # 全角スペース以降（部署名など）と【】の補足を外す
    name = re.sub(r"【.*?】", "", name.strip().split("　")[0]).strip()
    return name or "不明"


def parse_station(text):
    # グッドマンスリーは「 / 」区切り、ウィークリーマンションはタブ区切り
    first = re.split(r" / |\t", text)[0].strip()
    for regex in STATION_RES:
        m = regex.match(first)
        if m:
            walk = WALK_RE.search(first) if "バス" not in first else None
            return m.group(1), m.group(2), int(walk.group(1)) if walk else None
    return "", "", None


def daily_fee(text):
    """「3,500円/日105,000円/月」→ 3500。日額がなければ月額 / 30。「賃料に含む」や記載なしは 0。"""
    if not text or text == "賃料に含む":
        return 0
    m = re.search(r"([\d,]+)円～?/日", text)
    if m:
        return int(m.group(1).replace(",", ""))
    m = re.search(r"([\d,]+)円～?/月", text)
    if m:
        return round(int(m.group(1).replace(",", "")) / 30)
    return 0


def rent_daily(text):
    """賃料は記載がなければ None (平均から外す)。"""
    if not re.search(r"\d", text or ""):
        return None
    return daily_fee(text)


def usage_fee(row, plan):
    rent = rent_daily(row[f"{plan}賃料"])
    if rent is None:
        return None
    return rent + daily_fee(row[f"{plan}光熱費"])


def size_band(text):
    m = re.search(r"([\d.]+)m", text or "")
    if not m:
        return "不明"
    area = float(m.group(1))
    if area < 15:
        return "～15㎡"
    if area >= 60:
        return "60㎡以上"
    low = int(area // 5 * 5)
    return f"{low}～{low + 5}㎡"


def layout(text):
    text = re.sub(r"[～(（].*$", "", text or "").strip()
    return text or "不明"


def load_snapshot(path):
    listings = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            m = CITY_RE.match(row["住所"])
            pref = m.group(1) if m else ""
            if pref not in PREF_AREA:
                continue
            line, station, walk = parse_station(row["最寄駅"])
            bukken = row.get("物件番号") or re.search(r"bukken_no=(\d+)", row["詳細URL"]).group(1)
            listings[bukken] = {
                "id": bukken,
                "name": row["プラン名"],
                "company": short_company(row["運営会社"]),
                "area": PREF_AREA[pref],
                "pref": pref,
                "city": m.group(2),
                "line": line,
                "station": station,
                "walk": walk,
                "layout": layout(row["間取り"]),
                "size": size_band(row["広さ"]),
                "cp": 1 if row["キャンペーン"] else 0,
                "s": usage_fee(row, "ショート"),
                "m": usage_fee(row, "ミドル"),
                "l": usage_fee(row, "ロング"),
            }
    return listings


def build_site(site, paths, out_dir, trend):
    snapshots = {}
    for path in paths:
        date = os.path.splitext(os.path.basename(path))[0]
        snapshots[date] = load_snapshot(path)
        groups = defaultdict(lambda: {"n": 0, "s": [], "m": [], "l": []})
        for x in snapshots[date].values():
            g = groups[(x["area"], x["pref"], x["company"])]
            g["n"] += 1
            for plan in "sml":
                if x[plan] is not None:
                    g[plan].append(x[plan])
        for (area, pref, company), g in sorted(groups.items()):
            row = {"date": date, "site": site, "area": area, "pref": pref, "company": company, "n": g["n"]}
            for plan in "sml":
                row[f"{plan}_sum"] = sum(g[plan])
                row[f"{plan}_n"] = len(g[plan])
            trend.append(row)

    # 最新日の物件一覧 (前日との差額つき)
    dates = sorted(snapshots)
    latest = snapshots[dates[-1]]
    prev = snapshots[dates[-2]] if len(dates) > 1 else {}
    columns = ["id", "name", "company", "pref", "city", "line", "station", "walk",
               "layout", "size", "cp", "s", "m", "l", "prev_s", "diff", "rate"]
    for area in AREAS:
        rows = []
        for x in latest.values():
            if x["area"] != area:
                continue
            row = {c: x.get(c) for c in columns}
            before = prev.get(x["id"], {}).get("s")
            if before is not None and x["s"] is not None:
                row["prev_s"] = before
                row["diff"] = x["s"] - before
                row["rate"] = round((x["s"] - before) / before, 4) if before else ""
            # 表示に使う長さに切り詰めてファイルを小さくする
            row["name"] = x["name"][:80]
            rows.append(row)
        with open(os.path.join(out_dir, f"listings_{site}_{area}.csv"), "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
        print(f"{site} {area}: {len(rows)}件")
    print(f"{site} 日付: {', '.join(dates)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshots", default="data/snapshots")
    parser.add_argument("--out", default="report")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)

    trend = []
    for site_dir in sorted(glob.glob(os.path.join(args.snapshots, "*"))):
        paths = sorted(glob.glob(os.path.join(site_dir, "*.csv")))
        if paths:
            build_site(os.path.basename(site_dir), paths, args.out, trend)
    if not trend:
        raise SystemExit(f"{args.snapshots}/<サイト>/ に CSV がありません")

    with open(os.path.join(args.out, "trend.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(trend[0].keys()))
        writer.writeheader()
        writer.writerows(trend)


if __name__ == "__main__":
    main()
