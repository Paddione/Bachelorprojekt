# bats runner for Windows — calls Git Bash so the shebang works.
# Usage: tests\run-bats.ps1 [tests/spec/...] [extra bats args...]
param([string[]]$Args)
$BATS_DIR = Join-Path $PSScriptRoot "unit\lib\bats-core\bin"
& "C:\Program Files\Git\bin\bash.exe" (Join-Path $BATS_DIR "lib\bats-core\bin\bats") $Args
