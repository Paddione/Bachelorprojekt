# PK-Host Portproxy-Setup - EINMALIG auf dem WSL-Host (PK-Desktop) ausfuehren
# =====================================================================
# Die WSL-VM erreicht das Geraete-LAN nicht direkt (NAT). Dieses Script
# richtet netsh-Portproxies ein, damit WSL die Geraete ueber den Host
# erreicht:
#   127.0.0.1:2201 -> PK-L-1  :22   (Laptop)
#   127.0.0.1:2202 -> PK-Tablet:22  (Tablet)
# Portproxies sind nicht persistent ueber Reboots - deshalb registriert
# das Script einen Task, der sie bei jedem Login neu anlegt.
#
# Voraussetzungen:
#   - sshd laeuft auf beiden Geraeten (pk-ssh-bootstrap.ps1 dort ausgefuehrt)
#   - Port 22 auf beiden Geraeten vom Host aus erreichbar
#     (Pruef: Test-NetConnection <geraete-ip> -Port 22)
# Aufruf: run-host-portproxy.cmd (Doppelklick, UAC) oder als Admin:
#   powershell -ExecutionPolicy Bypass -File pk-host-portproxy-setup.ps1
# =====================================================================

param(
    [string]$LaptopIp  = "10.1.0.82",   # IP des PK-L-1 (falls anders: hier anpassen)
    [string]$TabletIp  = "10.1.0.83"    # IP des PK-Tablet (falls anders: hier anpassen)
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "FEHLER: Als Administrator ausfuehren (run-host-portproxy.cmd nutzt den UAC-Prompt)."
    exit 1
}

Write-Host "[1/3] Alte Portproxies entfernen (idempotent) ..."
netsh interface portproxy delete v4tov4 listenport=2201 listenaddress=127.0.0.1 2>$null | Out-Null
netsh interface portproxy delete v4tov4 listenport=2202 listenaddress=127.0.0.1 2>$null | Out-Null

Write-Host "[2/3] Portproxies anlegen ..."
netsh interface portproxy add v4tov4 listenport=2201 listenaddress=127.0.0.1 connectport=22 connectaddress=$LaptopIp | Out-Null
netsh interface portproxy add v4tov4 listenport=2202 listenaddress=127.0.0.1 connectport=22 connectaddress=$TabletIp | Out-Null

Write-Host "[3/3] Persistenz-Task registrieren (onlogon) ..."
$setupPath = Join-Path $PSScriptRoot "pk-host-portproxy-setup.ps1"
$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$setupPath`" -LaptopIp $LaptopIp -TabletIp $TabletIp"
schtasks /create /tn "PK-Portproxy-Setup" /tr $action /sc onlogon /ru SYSTEM /rl highest /f | Out-Null

Write-Host ""
Write-Host "=========================================================="
Write-Host " FERTIG. WSL erreicht die Geraete jetzt ueber:"
Write-Host "   ssh -p 2201 <user>@127.0.0.1   (PK-L-1)"
Write-Host "   ssh -p 2202 <user>@127.0.0.1   (PK-Tablet)"
Write-Host "=========================================================="
