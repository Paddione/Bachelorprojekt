# PK-Device SSH Bootstrap - EINMALIG auf diesem Geraet ausfuehren
# =====================================================================
# Ausfuehrung: Datei kopieren, dann Win+X -> Terminal (Administrator) ->
#   powershell -ExecutionPolicy Bypass -File <Pfad>\pk-ssh-bootstrap.ps1
# ODER: Rechtsklick -> "Mit PowerShell ausfuehren" in einer Admin-Shell.
#
# Was das Script tut:
#   1. OpenSSH-Server installieren (Windows-Capability)
#   2. sshd-Dienst auf Automatic stellen und starten
#   3. Firewall-Regel fuer Port 22 anlegen
#   4. Public Key der WSL-Maschine (PK-Desktop) hinterlegen
# Danach kann die WSL-Maschine sich per SSH verbinden und die
# Startup-Scripts selbst ablegen und registrieren.
# =====================================================================

$ErrorActionPreference = "Stop"

# --- Admin-Check ------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "FEHLER: Als Administrator ausfuehren (Win+X -> Terminal (Administrator))."
    exit 1
}

# --- 1/4: OpenSSH-Server installieren ---------------------------------
Write-Host "[1/4] OpenSSH-Server installieren ..."
$cap = Get-WindowsCapability -Online | Where-Object { $_.Name -like 'OpenSSH.Server*' }
if ($cap -and $cap.State -ne 'Installed') {
    Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Out-Null
    Write-Host "  installiert."
} else {
    Write-Host "  bereits vorhanden."
}

# --- 2/4: sshd-Dienst -------------------------------------------------
Write-Host "[2/4] sshd-Dienst starten (Automatic) ..."
Set-Service -Name sshd -StartupType Automatic
Start-Service -Name sshd
Write-Host "  laeuft."

# --- 3/4: Firewall ----------------------------------------------------
Write-Host "[3/4] Firewall-Regel fuer Port 22 ..."
if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
        -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    Write-Host "  Regel angelegt."
} else {
    Write-Host "  Regel existiert."
}

# --- 4/4: Authorized Key ----------------------------------------------
Write-Host "[4/4] Public Key hinterlegen ..."
$keyLine = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM0v5tWJfsMAFno233JIC2Ovrc032XuZYKZfzxzUchDP claude-wsl@PK-Desktop"

# Administratoren-Pfad (gilt bei Admin-Konten, inkl. Microsoft-Konten)
$adminKeyFile = "C:\ProgramData\ssh\administrators_authorized_keys"
if (-not (Test-Path $adminKeyFile)) { New-Item -Path $adminKeyFile -ItemType File -Force | Out-Null }
if (-not (Select-String -Path $adminKeyFile -Pattern 'claude-wsl@PK-Desktop' -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content -Path $adminKeyFile -Value $keyLine
}
icacls $adminKeyFile /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null

# User-Pfad (greift bei nicht-administrativer Anmeldung ueber ssh)
$userKeyDir = Join-Path $env:USERPROFILE ".ssh"
$userKeyFile = Join-Path $userKeyDir "authorized_keys"
if (-not (Test-Path $userKeyDir)) { New-Item -Path $userKeyDir -ItemType Directory -Force | Out-Null }
if (-not (Select-String -Path $userKeyFile -Pattern 'claude-wsl@PK-Desktop' -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content -Path $userKeyFile -Value $keyLine
}
Write-Host "  Key hinterlegt."

# --- Abschluss: Zugangsdaten ausgeben --------------------------------
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } |
    Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "=========================================================="
Write-Host " FERTIG. Zugang fuer die WSL-Maschine (PK-Desktop):"
Write-Host "   ssh $env:USERNAME@$ip"
Write-Host " IP dieses Geraets: $ip"
Write-Host "=========================================================="
