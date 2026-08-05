#!/bin/bash
cd "$(dirname "$0")"

if ! command -v python3 &> /dev/null; then
    echo "Python3が見つかりません。https://www.python.org/downloads/ からインストールしてください。"
    read -p "Enterキーで終了..."
    exit 1
fi

if [ ! -d venv ]; then
    echo "初回セットアップ中..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo "ブラウザが自動で開きます。閉じるにはこのウィンドウを閉じてください。"
python3 app.py
