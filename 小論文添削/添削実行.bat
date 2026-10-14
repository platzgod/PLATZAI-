@echo off
rem Manual run: correct pending submissions now (same as the scheduled task)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run.ps1"
pause
