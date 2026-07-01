@echo off
setlocal enabledelayedexpansion
rem Batch port of the former provision.ps1 (T001424): runs as a Burn ExePackage
rem after the official RustDesk MSI is chained-installed. Waits for the RustDesk
rem service to reach Running (race: the chained package starts it async), then
rem applies the baked-in server config + unattended password via the official CLI.
rem __RUSTDESK_CONFIG__ and __RUSTDESK_PASSWORD__ are replaced at build time by
rem the CI workflow (never committed with real values). The password is never
rem read back, logged, or echoed here — only passed once to rustdesk.exe.

set "EXE=%ProgramFiles%\RustDesk\rustdesk.exe"
if not exist "%EXE%" set "EXE=%ProgramFiles(x86)%\RustDesk\rustdesk.exe"
if not exist "%EXE%" (
  echo rustdesk.exe not found after install
  exit /b 1
)

set /a TRIES=60
:waitloop
sc query RustDesk | find "RUNNING" >nul
if not errorlevel 1 goto running
set /a TRIES-=1
if %TRIES% LEQ 0 (
  echo RustDesk service not Running
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto waitloop

:running
"%EXE%" --config "__RUSTDESK_CONFIG__"
if errorlevel 1 exit /b %errorlevel%
"%EXE%" --password "__RUSTDESK_PASSWORD__"
exit /b %errorlevel%
