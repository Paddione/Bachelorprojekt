@echo off
REM Einmaliger SSH-Bootstrap fuer PK-Geraete (pk-ssh-bootstrap.ps1).
REM Doppelklick startet PowerShell mit Bypass und fordert Admin-Rechte an.
REM (ExecutionPolicy wird nur fuer DIESEN Aufruf umgangen, nicht dauerhaft geaendert.)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0pk-ssh-bootstrap.ps1\"'"
pause
