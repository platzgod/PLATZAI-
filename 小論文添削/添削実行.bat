@echo off
chcp 65001 > nul
rem このファイルと同じフォルダ（CLAUDE.md がある場所）で Claude Code を実行する
cd /d "%~dp0"
if not exist "添削後" mkdir "添削後"
claude -p "CLAUDE.md の手順に従って、添削前フォルダの未処理ファイルをすべて添削して納品してください" --allowedTools "Read,Write,Edit,Bash,WebSearch,WebFetch" > "添削後\実行ログ.txt" 2>&1
