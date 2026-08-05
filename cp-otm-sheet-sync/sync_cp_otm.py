#!/usr/bin/env python3
"""CLI: sync OTM campaign data into the CP 'おためし' sheet.

Usage:
    python sync_cp_otm.py <OTM.xls> <CP.xlsm> <output.xlsm>
"""
import sys

from sync_core import sync


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    otm_path, cp_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

    cp_wb, report = sync(otm_path, cp_path)
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

    print(f"\nSaved: {out_path}")


if __name__ == "__main__":
    main()
