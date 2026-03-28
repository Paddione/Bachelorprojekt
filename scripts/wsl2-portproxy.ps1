# ═══════════════════════════════════════════════════════════════════
# Homeoffice MVP — WSL2 Port-Proxy einrichten / entfernen
# Nur nötig wenn Docker in WSL2 läuft (nicht bei Docker Desktop).
# Als Administrator ausführen.
#
# Verwendung:
#   .\scripts\wsl2-portproxy.ps1 -Action Setup    Proxy anlegen
#   .\scripts\wsl2-portproxy.ps1 -Action Remove   Proxy entfernen
#   .\scripts\wsl2-portproxy.ps1 -Action Status   Proxy anzeigen
# ═══════════════════════════════════════════════════════════════════

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Setup", "Remove", "Status")]
    [string]$Action
)

$Ports = @(80, 443, 10000)

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-WslIp {
    $ip = (wsl hostname -I 2>$null)
    if (-not $ip) {
        Write-Error "WSL2 laeuft nicht oder ist nicht erreichbar."
        exit 1
    }
    return $ip.Trim().Split(" ")[0]
}

function Invoke-Setup {
    if (-not (Test-Admin)) {
        Write-Error "Administrator-Rechte erforderlich."
        exit 1
    }

    $wslIp = Get-WslIp
    Write-Host "WSL2-IP: $wslIp" -ForegroundColor Cyan
    Write-Host "Port-Proxy einrichten ..." -ForegroundColor Cyan

    foreach ($port in $Ports) {
        netsh interface portproxy add v4tov4 `
            listenport=$port `
            listenaddress=0.0.0.0 `
            connectport=$port `
            connectaddress=$wslIp | Out-Null
        Write-Host "  + Port $port -> WSL2 ($wslIp)" -ForegroundColor Yellow
    }
    Write-Host ""
    Invoke-Status
}

function Invoke-Remove {
    if (-not (Test-Admin)) {
        Write-Error "Administrator-Rechte erforderlich."
        exit 1
    }
    Write-Host "Port-Proxy entfernen ..." -ForegroundColor Cyan
    foreach ($port in $Ports) {
        netsh interface portproxy delete v4tov4 `
            listenport=$port `
            listenaddress=0.0.0.0 2>$null | Out-Null
        Write-Host "  - Port $port entfernt" -ForegroundColor Yellow
    }
}

function Invoke-Status {
    Write-Host "Aktuelle Port-Proxy-Regeln:" -ForegroundColor Cyan
    Write-Host ""
    netsh interface portproxy show all
}

switch ($Action) {
    "Setup"  { Invoke-Setup }
    "Remove" { Invoke-Remove }
    "Status" { Invoke-Status }
}
