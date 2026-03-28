# ═══════════════════════════════════════════════════════════════════
# setup-windows.ps1 — Homeoffice MVP Setup (Windows / Docker Desktop)
# ═══════════════════════════════════════════════════════════════════
# Windows-Pendant zu setup.sh: Docker Desktop, .env, Secrets, Firewall.
#
# Verwendung (als Administrator):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\setup-windows.ps1                      # Quickstart
#   .\scripts\setup-windows.ps1 -Action Firewall-Setup
#   .\scripts\setup-windows.ps1 -Action Firewall-Remove
#   .\scripts\setup-windows.ps1 -Action Firewall-Status
# ═══════════════════════════════════════════════════════════════════

#Requires -Version 5.1
param(
    [ValidateSet("Quickstart", "Firewall-Setup", "Firewall-Remove", "Firewall-Status")]
    [string]$Action = "Quickstart"
)

$ErrorActionPreference = "Stop"

# ── Farben & Ausgabe ────────────────────────────────────────────────
function Write-OK     { param([string]$Msg) Write-Host "  ✓ $Msg" -ForegroundColor Green }
function Write-Fail   { param([string]$Msg) Write-Host "  ✗ $Msg" -ForegroundColor Red }
function Write-Warn   { param([string]$Msg) Write-Host "  ⚠  $Msg" -ForegroundColor Yellow }
function Write-Info   { param([string]$Msg) Write-Host "  → $Msg" -ForegroundColor Blue }
function Write-Header { param([string]$Msg) Write-Host "`n▶ $Msg" -ForegroundColor Cyan }

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$EnvFile    = Join-Path $ProjectDir ".env"
$EnvExample = Join-Path $ProjectDir ".env.example"

function Test-IsAdmin {
    return ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}

# ═════════════════════════════════════════════════════════════════════
#  FIREWALL-FUNKTIONEN
# ═════════════════════════════════════════════════════════════════════
$FirewallRules = @(
    @{ Name = "Homeoffice MVP - HTTP";          Port = 80;    Protocol = "TCP" }
    @{ Name = "Homeoffice MVP - HTTPS";         Port = 443;   Protocol = "TCP" }
    @{ Name = "Homeoffice MVP - Jitsi JVB UDP"; Port = 10000; Protocol = "UDP" }
)

function Invoke-FirewallSetup {
    if (-not (Test-IsAdmin)) {
        Write-Fail "Administrator-Rechte erforderlich. PowerShell als Admin starten."
        exit 1
    }
    Write-Header "Firewall-Regeln anlegen"
    foreach ($rule in $FirewallRules) {
        $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        if ($existing) {
            Write-OK "$($rule.Name) existiert bereits"
        } else {
            New-NetFirewallRule `
                -DisplayName $rule.Name `
                -Direction Inbound `
                -Protocol $rule.Protocol `
                -LocalPort $rule.Port `
                -Action Allow `
                -Profile Any | Out-Null
            Write-OK "$($rule.Name) angelegt"
        }
    }
    Invoke-FirewallStatus
}

function Invoke-FirewallRemove {
    if (-not (Test-IsAdmin)) {
        Write-Fail "Administrator-Rechte erforderlich."
        exit 1
    }
    Write-Header "Firewall-Regeln entfernen"
    foreach ($rule in $FirewallRules) {
        $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        if ($existing) {
            Remove-NetFirewallRule -DisplayName $rule.Name
            Write-OK "$($rule.Name) entfernt"
        } else {
            Write-OK "$($rule.Name) war nicht vorhanden"
        }
    }
}

function Invoke-FirewallStatus {
    Write-Header "Firewall-Regeln Status"
    Get-NetFirewallRule |
        Where-Object { $_.DisplayName -like "Homeoffice MVP*" } |
        Select-Object DisplayName, Enabled, Direction, Action |
        Format-Table -AutoSize
}

# ═════════════════════════════════════════════════════════════════════
#  Sub-Befehl-Routing
# ═════════════════════════════════════════════════════════════════════
switch ($Action) {
    "Firewall-Setup"  { Invoke-FirewallSetup;  exit 0 }
    "Firewall-Remove" { Invoke-FirewallRemove; exit 0 }
    "Firewall-Status" { Invoke-FirewallStatus; exit 0 }
}

# ═════════════════════════════════════════════════════════════════════
#  QUICKSTART
# ═════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   Homeoffice MVP — Setup (Windows)           ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Admin-Check ──────────────────────────────────────────────────
Write-Header "Admin-Rechte prüfen"

if (Test-IsAdmin) {
    Write-OK "Läuft als Administrator"
} else {
    Write-Warn "Kein Administrator — einige Installationen könnten fehlschlagen"
    Write-Info "Empfehlung: PowerShell als Administrator starten"
}

# ── 2. Abhängigkeiten ──────────────────────────────────────────────
Write-Header "Abhängigkeiten prüfen"

$HasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
if ($HasWinget) { Write-OK "winget gefunden" }
else {
    Write-Warn "winget nicht gefunden"
    Write-Info "https://aka.ms/getwinget"
}

# Git
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-OK "git gefunden: $(git --version)"
} elseif ($HasWinget) {
    Write-Info "Installiere git via winget..."
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                 [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Get-Command git -ErrorAction SilentlyContinue) { Write-OK "git installiert" }
    else { Write-Fail "git nicht verfügbar — https://git-scm.com/download/win" }
} else {
    Write-Fail "git nicht gefunden — https://git-scm.com/download/win"
}

# ── 3. Docker Desktop ──────────────────────────────────────────────
Write-Header "Docker Desktop prüfen"

$DockerRunning = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
        $dockerVer = docker --version 2>$null
        Write-OK "Docker: $dockerVer"
        $null = docker info 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Docker Daemon erreichbar"
            $DockerRunning = $true
        } else {
            Write-Fail "Docker Daemon nicht erreichbar"
        }
    } catch { Write-Fail "Docker nicht erreichbar" }
}

if (-not $DockerRunning) {
    $DockerDesktopPath = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"

    if (Test-Path $DockerDesktopPath) {
        Write-Warn "Docker Desktop installiert aber nicht gestartet"
        Write-Info "Starte Docker Desktop..."
        Start-Process $DockerDesktopPath
        Write-Info "Warte auf Docker Desktop..."
        $timeout = 120; $elapsed = 0
        while ($elapsed -lt $timeout) {
            Start-Sleep -Seconds 5; $elapsed += 5
            try {
                $null = docker info 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-OK "Docker Desktop gestartet"
                    $DockerRunning = $true; break
                }
            } catch {}
            Write-Host "    Warte... ($elapsed s / $timeout s)" -ForegroundColor DarkGray
        }
        if (-not $DockerRunning) {
            Write-Fail "Docker Desktop startet nicht. Bitte manuell starten."
            exit 1
        }
    } elseif ($HasWinget) {
        Write-Info "Installiere Docker Desktop via winget..."
        winget install --id Docker.DockerDesktop -e --accept-source-agreements --accept-package-agreements
        Write-Warn "Docker Desktop installiert. PC NEUSTARTEN und Script erneut ausführen."
        Read-Host "Enter zum Beenden"
        exit 0
    } else {
        Write-Fail "Docker Desktop manuell installieren:"
        Write-Info "https://docs.docker.com/desktop/install/windows-install/"
        exit 1
    }
}

# Docker Compose v2
try {
    $composeVer = docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) { Write-OK "Docker Compose v2: $composeVer" }
    else { Write-Fail "Docker Compose v2 fehlt — Docker Desktop aktualisieren"; exit 1 }
} catch { Write-Fail "Docker Compose v2 nicht verfügbar"; exit 1 }

# ── 4. .env + Secrets ──────────────────────────────────────────────
Write-Header ".env konfigurieren"

$SkipEnv = $false
if (Test-Path $EnvFile) {
    Write-Warn ".env existiert bereits"
    $answer = Read-Host "  Überschreiben? [j/N]"
    if ($answer -ne "j") { Write-Info "Behalte bestehende .env"; $SkipEnv = $true }
}

if (-not $SkipEnv) {
    Copy-Item $EnvExample $EnvFile -Force
    Write-OK ".env aus .env.example erstellt"

    Write-Host ""
    Write-Host "  Projekt-Konfiguration" -ForegroundColor White
    Write-Host "  ─────────────────────" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "  Projektname für DuckDNS (z.B. bachelorprojekt)" -ForegroundColor Gray
    $ProjectName = Read-Host "  Projektname"
    if ([string]::IsNullOrWhiteSpace($ProjectName)) { $ProjectName = "bachelorprojekt" }

    Write-Host ""
    Write-Host "  DuckDNS Token von https://www.duckdns.org" -ForegroundColor Gray
    $DuckDnsToken = Read-Host "  Token"
    if ([string]::IsNullOrWhiteSpace($DuckDnsToken)) { Write-Fail "Token erforderlich!"; exit 1 }

    Write-Host ""
    $AcmeEmail = Read-Host "  E-Mail (Let's Encrypt)"
    if ([string]::IsNullOrWhiteSpace($AcmeEmail)) { Write-Fail "E-Mail erforderlich!"; exit 1 }

    Write-Host ""
    $DefaultJvb = "$ProjectName-meet.duckdns.org"
    $JvbIp = Read-Host "  JVB IP/Domain [Enter=$DefaultJvb]"
    if ([string]::IsNullOrWhiteSpace($JvbIp)) { $JvbIp = $DefaultJvb }

    # Secrets generieren
    Write-Header "Secrets generieren"
    function New-Secret {
        $bytes = New-Object byte[] 24
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        return [Convert]::ToBase64String($bytes) -replace '[/+=]','' | ForEach-Object { $_.Substring(0, [Math]::Min(32, $_.Length)) }
    }

    $Secrets = @{
        KEYCLOAK_DB_PASSWORD     = New-Secret; KEYCLOAK_ADMIN_PASSWORD = New-Secret
        MATTERMOST_DB_PASSWORD   = New-Secret; MATTERMOST_OIDC_SECRET  = New-Secret
        NEXTCLOUD_OIDC_SECRET    = New-Secret; NEXTCLOUD_DB_PASSWORD   = New-Secret
        NEXTCLOUD_ADMIN_PASSWORD = New-Secret; LLDAP_JWT_SECRET        = New-Secret
        LLDAP_LDAP_USER_PASS     = New-Secret; LLDAP_DB_PASSWORD       = New-Secret
        JICOFO_AUTH_PASSWORD     = New-Secret; JVB_AUTH_PASSWORD        = New-Secret
    }
    Write-OK "12 Secrets generiert"

    # Werte schreiben
    Write-Header "Werte in .env schreiben"
    $content = Get-Content $EnvFile -Raw

    $content = $content -replace "(?m)^MM_DOMAIN=.*",    "MM_DOMAIN=$ProjectName-chat.duckdns.org"
    $content = $content -replace "(?m)^KC_DOMAIN=.*",    "KC_DOMAIN=$ProjectName-auth.duckdns.org"
    $content = $content -replace "(?m)^NC_DOMAIN=.*",    "NC_DOMAIN=$ProjectName-files.duckdns.org"
    $content = $content -replace "(?m)^JITSI_DOMAIN=.*", "JITSI_DOMAIN=$ProjectName-meet.duckdns.org"
    $content = $content -replace "(?m)^LLDAP_DOMAIN=.*", "LLDAP_DOMAIN=$ProjectName-ldap.duckdns.org"
    $content = $content -replace "(?m)^DUCKDNS_TOKEN=.*",      "DUCKDNS_TOKEN=$DuckDnsToken"
    $content = $content -replace "(?m)^DUCKDNS_SUBDOMAINS=.*", "DUCKDNS_SUBDOMAINS=$ProjectName-chat,$ProjectName-auth,$ProjectName-files,$ProjectName-meet,$ProjectName-ldap"
    $content = $content -replace "(?m)^JVB_ADVERTISE_IPS=.*",  "JVB_ADVERTISE_IPS=$JvbIp"
    $content = $content -replace "(?m)^JITSI_XMPP_SUFFIX=.*", "JITSI_XMPP_SUFFIX=$ProjectName-meet.duckdns.org"
    $content = $content -replace "(?m)^ACME_EMAIL=.*",         "ACME_EMAIL=$AcmeEmail"
    $content = $content -replace "(?m)^LLDAP_BASE_DOMAIN=.*",  "LLDAP_BASE_DOMAIN=$ProjectName-ldap"
    $content = $content -replace "(?m)^LLDAP_BASE_TLD=.*",     "LLDAP_BASE_TLD=duckdns"

    foreach ($key in $Secrets.Keys) {
        $content = $content -replace "(?m)^${key}=.*", "${key}=$($Secrets[$key])"
    }

    [System.IO.File]::WriteAllText($EnvFile, $content, [System.Text.UTF8Encoding]::new($false))
    Write-OK "Alle Werte geschrieben"
}

# ── 5. Datenverzeichnisse ─────────────────────────────────────────
Write-Header "Datenverzeichnisse"

$StoragePath = "./data"
foreach ($line in (Get-Content $EnvFile -ErrorAction SilentlyContinue)) {
    if ($line -match "^STORAGE_PATH=(.+)$") { $StoragePath = $Matches[1] }
}
if ($StoragePath.StartsWith("./") -or $StoragePath -eq ".") {
    $StoragePath = Join-Path $ProjectDir ($StoragePath -replace "^\./", "")
}
if (-not [System.IO.Path]::IsPathRooted($StoragePath)) {
    $StoragePath = Join-Path $ProjectDir $StoragePath
}

@(
    (Join-Path $StoragePath "traefik\letsencrypt"),
    (Join-Path $StoragePath "mattermost"),
    (Join-Path $StoragePath "nextcloud")
) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}
Write-OK "Datenverzeichnisse: $StoragePath"

$AcmeJson = Join-Path $StoragePath "traefik\letsencrypt\acme.json"
if (-not (Test-Path $AcmeJson)) { New-Item -ItemType File -Path $AcmeJson -Force | Out-Null }
Write-OK "acme.json erstellt"

# ── 6. Firewall ───────────────────────────────────────────────────
Write-Header "Firewall prüfen"

if (Test-IsAdmin) {
    foreach ($rule in $FirewallRules) {
        $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        if ($existing) {
            Write-OK "$($rule.Name) vorhanden"
        } else {
            Write-Info "Erstelle $($rule.Name)..."
            New-NetFirewallRule `
                -DisplayName $rule.Name `
                -Direction Inbound `
                -Protocol $rule.Protocol `
                -LocalPort $rule.Port `
                -Action Allow `
                -Profile Any | Out-Null
            Write-OK "$($rule.Name) angelegt"
        }
    }
} else {
    Write-Warn "Firewall-Check übersprungen (kein Admin)"
    Write-Info "Regeln anlegen mit: .\scripts\setup-windows.ps1 -Action Firewall-Setup"
}

# ── 7. Compose-Validierung ────────────────────────────────────────
Write-Header "docker compose config"

Push-Location $ProjectDir
try {
    $null = docker compose config --quiet 2>$null
    if ($LASTEXITCODE -eq 0) { Write-OK "docker compose config valide" }
    else { Write-Warn "Validierung fehlgeschlagen — .env prüfen" }
} catch { Write-Warn "Validierung fehlgeschlagen" }
Pop-Location

# ── 8. Stack starten ──────────────────────────────────────────────
Write-Host ""
Write-Host "  ══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "    Konfiguration abgeschlossen!" -ForegroundColor White
Write-Host "  ══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$envVars = @{}
foreach ($line in (Get-Content $EnvFile)) {
    if ($line -match "^([A-Z_]+)=(.+)$") { $envVars[$Matches[1]] = $Matches[2] }
}

Write-Host "  Dienste:" -ForegroundColor White
Write-Host "    Chat:     https://$($envVars['MM_DOMAIN'])" -ForegroundColor Cyan
Write-Host "    Auth:     https://$($envVars['KC_DOMAIN'])" -ForegroundColor Cyan
Write-Host "    Dateien:  https://$($envVars['NC_DOMAIN'])" -ForegroundColor Cyan
Write-Host "    Meeting:  https://$($envVars['JITSI_DOMAIN'])" -ForegroundColor Cyan
Write-Host "    LDAP:     https://$($envVars['LLDAP_DOMAIN'])" -ForegroundColor Cyan
Write-Host ""

$startAnswer = Read-Host "  Stack jetzt starten? [J/n]"
if ($startAnswer -ne "n") {
    Write-Header "Stack starten"
    Push-Location $ProjectDir
    docker compose up -d
    Pop-Location
    Write-Host ""
    Write-OK "Stack gestartet!"
    Write-Host ""
    Write-Host "  Befehle:" -ForegroundColor White
    Write-Host "    docker compose ps        — Status" -ForegroundColor Cyan
    Write-Host "    docker compose logs -f   — Logs" -ForegroundColor Cyan
    Write-Host "    docker compose down      — Stoppen" -ForegroundColor Cyan
    Write-Host ""
    Write-Warn "SSL braucht 1-2 Min, Keycloak 30-60 Sek."
    Write-Host ""
    Write-Host "  Alle 5 DuckDNS-Subdomains auf https://www.duckdns.org anlegen!" -ForegroundColor Yellow
} else {
    Write-Info "Manuell: cd $ProjectDir; docker compose up -d"
}

Write-Host ""
