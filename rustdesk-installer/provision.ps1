# provision.ps1 — runs as a deferred custom action after the official RustDesk
# MSI is installed. Waits for the RustDesk service to reach 'Running' (race: the
# chained MSI starts it asynchronously), then applies the baked-in server config
# + unattended password via the official CLI.
#
# __RUSTDESK_CONFIG__ and __RUSTDESK_PASSWORD__ are replaced at build time by the
# CI workflow (never committed with real values). The password is never read
# back, logged, or echoed — only applied.
$ErrorActionPreference = 'Stop'

$exe = Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe'
if (-not (Test-Path $exe)) { $exe = Join-Path ${env:ProgramFiles(x86)} 'RustDesk\rustdesk.exe' }
if (-not (Test-Path $exe)) { Write-Error "rustdesk.exe not found after install"; exit 1 }

# The official MSI installs + starts the RustDesk service asynchronously; poll
# until it is Running (max 120s) so --config / --password land on a live client.
$deadline = (Get-Date).AddSeconds(120)
do {
  $svc = Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -eq 'Running') { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if (-not $svc -or $svc.Status -ne 'Running') { Write-Error 'RustDesk service not Running'; exit 1 }

# Apply the relay/server config (opaque exported config-string) and the shared
# unattended-access password. Values are baked in at build time by the CI job.
& $exe --config '__RUSTDESK_CONFIG__'
if ($LASTEXITCODE -ne 0) { Write-Error "rustdesk --config failed ($LASTEXITCODE)"; exit $LASTEXITCODE }
& $exe --password '__RUSTDESK_PASSWORD__'
exit $LASTEXITCODE
