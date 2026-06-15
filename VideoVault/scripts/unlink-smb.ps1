Param(
  [string]$MountDir = "Bibliothek"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot/.."
$target = Join-Path $repoRoot $MountDir

if (-not (Test-Path $target)) {
  Write-Host "[smb] $target not found; nothing to remove"
  exit 0
}

Write-Host "[smb] Removing link $target"
try {
  Remove-Item -Path $target -Force
} catch {
  # try via cmd
  cmd /c "rmdir $target" | Out-Null
}

exit 0

