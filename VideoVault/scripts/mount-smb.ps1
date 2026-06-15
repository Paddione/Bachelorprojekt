Param(
  [string]$EnvFile = "env/.env-smb.local"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Load-Env($path) {
  if (-Not (Test-Path $path)) { return @{} }
  $map = @{}
  Get-Content $path | ForEach-Object {
    if ($_ -match '^(\s*#|\s*$)') { return }
    $kv = $_ -split '=', 2
    if ($kv.Length -eq 2) { $map[$kv[0]] = $kv[1] }
  }
  return $map
}

$envMap = @{}
if (Test-Path $EnvFile) {
  $envMap = Load-Env $EnvFile
} elseif (Test-Path "env/.env-smb") {
  $envMap = Load-Env "env/.env-smb"
} elseif (Test-Path "env/.env-smb.example") {
  $envMap = Load-Env "env/.env-smb.example"
}

$SMB_HOST = $envMap['SMB_HOST']
$SMB_SHARE = $envMap['SMB_SHARE']
$SMB_SUBPATH = $envMap['SMB_SUBPATH']
$MOUNT_DIR = if ($envMap['MOUNT_DIR']) { $envMap['MOUNT_DIR'] } else { 'Bibliothek' }

if (-not $SMB_HOST -or -not $SMB_SHARE) {
  Write-Error "[smb] Please set SMB_HOST and SMB_SHARE in env/.env-smb.local (see env/.env-smb.example)"
}

$repoRoot = Resolve-Path "$PSScriptRoot/.."
$target = Join-Path $repoRoot $MOUNT_DIR
if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target | Out-Null }

$unc = "\\$SMB_HOST\$SMB_SHARE"
if ($SMB_SUBPATH) { $unc = "$unc\$SMB_SUBPATH" }

Write-Host "[smb] Linking $unc -> $target"

try {
  # Prefer symbolic link (works with Developer Mode or admin privileges)
  New-Item -ItemType SymbolicLink -Path $target -Target $unc -Force | Out-Null
  Write-Host "[smb] Created symbolic link at $target"
} catch {
  Write-Warning "[smb] SymbolicLink failed: $($_.Exception.Message). Trying junction..."
  # Fallback to junction (directory link)
  cmd /c "rmdir $target 2>nul & mklink /J $target $unc" | Out-Null
  Write-Host "[smb] Created junction at $target"
}

exit 0

