@echo off
rem First-time setup: check prerequisites and register the scheduled task
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\setup.ps1"
pause
