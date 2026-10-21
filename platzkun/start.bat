@echo off
chcp 65001 > nul
cd /d %~dp0
if not exist .env (
  echo .env ファイルがないので、お試しモード（料金なし）で起動します。
)
if not exist node_modules (
  echo はじめての起動なので、必要な部品をインストールします...
  call npm install
)
start "" http://localhost:3000
node server.js
pause
