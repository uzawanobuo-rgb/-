#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CLI版: 全国定点.xlsx 更新スクリプト

使い方:
  python update_zenkoku_teiten_cli.py 全国定点.xlsx FixedPointYYYYMMDDhhmmss.xlsx [...]

出力:
  同じフォルダに 全国定点_updated.xlsx を保存する。
"""
import sys
from core.updater import update_master


def main():
    if len(sys.argv) < 3:
        print("使い方: python update_zenkoku_teiten_cli.py 全国定点.xlsx FixedPoint....xlsx [...]")
        sys.exit(1)

    master_path = sys.argv[1]
    raw_paths = sys.argv[2:]

    with open(master_path, "rb") as f:
        master_bytes = f.read()

    raw_files = []
    for p in raw_paths:
        with open(p, "rb") as f:
            raw_files.append((p.split("/")[-1].split("\\")[-1], f.read()))

    updated_bytes, log = update_master(master_bytes, raw_files)

    for line in log:
        print(line)

    out_path = master_path.replace(".xlsx", "_updated.xlsx")
    with open(out_path, "wb") as f:
        f.write(updated_bytes)
    print(f"\n完了: {out_path} に保存しました。")


if __name__ == "__main__":
    main()
