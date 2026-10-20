@echo off
chcp 65001 > nul
cd /d %~dp0
if not exist .env (
  echo [注意] .env ファイルがありません。.env.example をコピーして .env を作り、APIキーを書き込んでください。
  pause
  exit /b
)
if not exist node_modules (
  echo はじめての起動なので、必要な部品をインストールします...
  call npm install
)
start "" http://localhost:3000
node server.js
pause
