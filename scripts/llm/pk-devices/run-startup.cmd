@echo off
REM Startet das jeweilige Startup-Script (pk-tablet-startup.ps1 bzw.
REM pk-l-1-startup.ps1) mit umgangener ExecutionPolicy.
REM Aufruf: run-startup.cmd <script-name>  (z. B. run-startup.cmd pk-tablet-startup.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0%~1"
pause
