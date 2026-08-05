@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo Pythonが見つかりません。
    echo https://www.python.org/downloads/ からインストールしてください。
    echo インストール時に「Add python.exe to PATH」に必ずチェックを入れてください。
    pause
    exit /b 1
)

if not exist venv (
    echo 初回セットアップ中...
    python -m venv venv
)

call venv\Scripts\activate.bat
pip install -q -r requirements.txt

echo ブラウザが自動で開きます。閉じるにはこのウィンドウを閉じてください。
python app.py

pause
