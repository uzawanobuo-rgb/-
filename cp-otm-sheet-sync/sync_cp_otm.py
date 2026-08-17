#!/usr/bin/env python3
"""CLI: sync OTM campaign data into the CP 'おためし' sheet.

Usage:
    python sync_cp_otm.py <OTM.xls> <CP.xlsm> <plan_campaign.csv> <output.xlsm>
"""
import sys

from sync_core import sync


def main():
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)

    otm_path, cp_path, plan_csv_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

    cp_wb, report = sync(otm_path, cp_path, plan_csv_path)
    cp_wb.save(out_path)

    print(f"OTM latest sheet: {report['otm_sheet_name']}")
    print(f"skipped rows (no dates): {report['skipped_rows']}\n")

    s = report["shinki"]
    print(f"①新規依頼 matched: {len(s['matched'])} / {s['total']}")
    for m in s["matched"]:
        if m["how"] != "exact":
            print(f"  [{m['how']}] {m['name']!r} -> row {m['row']}")
    print(f"①新規依頼 unmatched: {s['unmatched']}")

    h = report["henkou"]
    print(f"②期間変更 matched: {len(h['matched'])} / {h['total']}")
    for m in h["matched"]:
        if m["how"] != "exact":
            print(f"  [{m['how']}] {m['name']!r} -> row {m['row']}")
    print(f"②期間変更 unmatched: {h['unmatched']}")

    if report["ambiguous"]:
        print("\nAMBIGUOUS (multiple CP rows share the symbol-stripped name; skipped, needs manual review):")
        for a in report["ambiguous"]:
            print(f"  [{a['type']}] {a['name']!r} -> candidate rows {a['candidate_rows']}")

    if report["excluded_campaign2"]:
        print("\nEXCLUDED - campaign② conflict (plan has both おためし入居キャンペーン and キャンペーン② rows; update skipped):")
        for e in report["excluded_campaign2"]:
            print(f"  [{e['type']}] {e['name']!r} (CP: {e['cp_name']!r}) -> row {e['row']}")

    if report["excluded_deletion"]:
        print("\nEXCLUDED - 登録削除 (below the 登録削除 marker; not a period change, update skipped):")
        for e in report["excluded_deletion"]:
            print(f"  {e['name']!r} (CP: {e['cp_name']!r}) -> row {e['row']}")
    if report["deletion_unmatched"]:
        print(f"登録削除 unmatched (no CP plan name found): {report['deletion_unmatched']}")

    if report["excluded_missing_rate"]:
        print("\nEXCLUDED - 情報不足 (①新規依頼 with blank 賃料/RC割引率; update skipped):")
        for e in report["excluded_missing_rate"]:
            print(f"  {e['name']!r} (CP: {e['cp_name']!r}) -> row {e['row']}")

    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
