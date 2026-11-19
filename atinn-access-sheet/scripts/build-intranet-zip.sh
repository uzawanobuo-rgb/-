#!/usr/bin/env bash
# 社内サーバー（http://magi2.atinn.jp/access-sheet/）差し替え用の ZIP を作る
#   bash atinn-access-sheet/scripts/build-intranet-zip.sh [コミット（既定 HEAD）] [出力先.zip]
# ZIP の中身：access-sheet/ に index.html・view.html・css・js・img・vendor と 設置メモ.txt（intranet/設置メモ.txt）
# 作ったら README の「社内サーバー版」の表に、渡した日とコミットを書き足す
set -euo pipefail
REV="${1:-HEAD}"
REPO="$(git rev-parse --show-toplevel)"
SHORT="$(git -C "$REPO" rev-parse --short "$REV")"
OUT="${2:-$PWD/アクセス案内シート_社内サーバー用_$(date +%Y%m%d)_${SHORT}.zip}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git -C "$REPO" archive "$REV" atinn-access-sheet | tar -x -C "$WORK"
mkdir "$WORK/access-sheet"
(cd "$WORK/atinn-access-sheet" && cp -r index.html view.html css js img vendor ../access-sheet/)
git -C "$REPO" show "$REV:atinn-access-sheet/intranet/設置メモ.txt" > "$WORK/access-sheet/設置メモ.txt"
rm -f "$OUT"
(cd "$WORK" && zip -qr "$OUT" access-sheet)
echo "作成：$OUT（コミット $SHORT、$(grep -o 'v=[0-9]*' "$WORK/access-sheet/index.html" | head -1)）"
