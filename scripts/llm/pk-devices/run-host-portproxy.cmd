@echo off
REM Portproxy-Setup auf dem WSL-Host (einmalig). Doppelklick -> UAC-Prompt.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0pk-host-portproxy-setup.ps1\"'"
pause
