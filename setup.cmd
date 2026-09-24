@echo off
rem Qanvas setup for Windows: double-click or run from a terminal.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
pause
