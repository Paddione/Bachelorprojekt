# scripts/mcp-gateway/register-autostart.ps1
# T900040 - registriert start-windows.ps1 als Task-Scheduler-Task (onlogon).
# Windows-Pendant zu `systemctl --user enable` fuer die Units unter
# scripts/bge-mcp/ und scripts/mcp-gateway/: dort startet systemd die
# Port-Forwards und den bge-mcp-Shim beim Login, hier der Aufgabenplaner.
#
# Muster uebernommen von scripts/llm/pk-devices/register-autostart.ps1: als
# PS1-Datei gibt es kein schtasks-Quoting-Problem mit Leerzeichen im Pfad.
#
# Aufruf (aus dem Repo-Root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mcp-gateway/register-autostart.ps1
# Erreichbar ueber: task mcp:autostart:register / task mcp:autostart:remove
#
# Der Repo-Pfad wird aus dem Skriptort abgeleitet und NICHT hartkodiert - der
# Task zeigt damit auf genau den Checkout, aus dem er registriert wurde.
#
# Vorbedingung: BGE_MCP_TOKEN muss beim Login aufloesbar sein. start-windows.ps1
# laedt ihn aus ~/.config/bge-mcp/server.env, sofern die Variable nicht in der
# Umgebung steht - deshalb reicht die Datei, eine Systemvariable ist nicht noetig.
param(
    [string]$TaskName = "PK-MCP-Gateway",
    # Standard: der Checkout, in dem dieses Skript liegt. Explizit setzbar, damit
    # sich der Autostart aus einem Worktree heraus auf den Haupt-Checkout
    # registrieren laesst - ein Worktree wird nach dem Merge geloescht, ein
    # Autostart-Eintrag darauf zeigte danach ins Leere.
    [string]$RepoRoot = "",
    [switch]$Remove
)

# schtasks schreibt Fehler nach stderr; mit ErrorActionPreference=Stop wuerde das
# als NativeCommandError abbrechen, bevor der Startup-Ordner-Fallback greift.
function Invoke-Schtasks {
    param([string[]]$SchtasksArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & schtasks @SchtasksArgs 2>&1 | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return $code
}

$ErrorActionPreference = "Stop"

# Startup-Ordner-Verknuepfung: rechtefreier Autostart-Pfad, siehe unten.
$startupCmd = Join-Path ([Environment]::GetFolderPath('Startup')) "$TaskName.cmd"

if ($Remove) {
    $done = $false
    if ((Invoke-Schtasks @('/query', '/tn', $TaskName)) -eq 0) {
        Invoke-Schtasks @('/delete', '/tn', $TaskName, '/f') | Out-Null
        Write-Host "Autostart-Task '$TaskName' entfernt."
        $done = $true
    }
    if (Test-Path $startupCmd) {
        Remove-Item $startupCmd -Force
        Write-Host "Autostart-Verknuepfung $startupCmd entfernt."
        $done = $true
    }
    if (-not $done) { Write-Host "Kein Autostart '$TaskName' gefunden - nichts zu tun." }
    exit 0
}

if (-not $RepoRoot) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
$target = Join-Path $RepoRoot "scripts\mcp-gateway\start-windows.ps1"

if (-not (Test-Path $target)) {
    Write-Host "FEHLER: $target existiert nicht."
    exit 1
}

$envFile = Join-Path $HOME ".config/bge-mcp/server.env"
if (-not (Test-Path $envFile) -and (-not $env:BGE_MCP_TOKEN)) {
    Write-Host "WARNUNG: Weder BGE_MCP_TOKEN noch $envFile vorhanden."
    Write-Host "         Der Task wird registriert, der Shim verweigert beim Login aber den Start."
}

$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$target`""

# Zuerst der Aufgabenplaner. Er ist der sauberere Mechanismus (sichtbar in
# taskschd.msc, eigener Lauf-Kontext), verlangt aber je nach Richtlinie erhoehte
# Rechte: auf pk-desktop antwortet schtasks mit "FEHLER: Zugriff verweigert",
# auch mit explizitem /ru. Deshalb faellt das Skript auf den Startup-Ordner
# zurueck - der liegt im eigenen Profil und braucht keinerlei Sonderrechte.
if ((Invoke-Schtasks @('/create', '/tn', $TaskName, '/tr', $tr, '/sc', 'onlogon', '/f')) -eq 0) {
    Write-Host "Autostart-Task '$TaskName' registriert (onlogon, Aufgabenplaner) fuer $target"
    Write-Host "Entfernen mit: -Remove (oder: task mcp:autostart:remove)"
    exit 0
}

Write-Host "Aufgabenplaner nicht verfuegbar (Zugriff verweigert) - weiche auf den Startup-Ordner aus."
$cmdBody = "@echo off`r`nstart `"`" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$target`"`r`n"
Set-Content -Path $startupCmd -Value $cmdBody -Encoding ASCII -NoNewline
Write-Host "Autostart-Verknuepfung angelegt: $startupCmd"
Write-Host "Entfernen mit: -Remove (oder: task mcp:autostart:remove)"
