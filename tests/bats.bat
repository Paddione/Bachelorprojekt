@echo off
REM bats runner for Windows — calls Git Bash so the #! shebang works.
REM Usage: tests\bats.bat tests/spec/fleet-operations/penpot-manifests.bats
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
call "C:\Program Files\Git\bin\bash.exe" "%SCRIPT_DIR%\unit\lib\bats-core\bin\bats" %*
