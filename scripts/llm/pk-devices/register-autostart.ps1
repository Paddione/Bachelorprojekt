# register-autostart.ps1 - registriert das LM-Studio-Startup-Script als
# Task-Scheduler-Task (onlogon). Wird vom deploy-to-devices.sh per ssh
# aufgerufen, weil schtasks-Quoting ueber die cmd-Remote-Shell unzuverlaessig
# ist (Leerzeichen zerfallen). Als PS1-Datei gibt es kein Quoting-Problem.
#
# Aufruf auf dem Geraet:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\pk-device\register-autostart.ps1 -ScriptName pk-l-1-startup.ps1
param(
    [string]$ScriptName = "pk-l-1-startup.ps1"
)

$ErrorActionPreference = "Stop"

$target = "C:\pk-device\$ScriptName"
if (-not (Test-Path $target)) {
    Write-Host "FEHLER: $target existiert nicht - erst deployen."
    exit 1
}

$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$target`""
schtasks /create /tn "PK-Startup-LLM" /tr $tr /sc onlogon /f | Out-Null
Write-Host "Autostart-Task 'PK-Startup-LLM' registriert (onlogon) fuer $ScriptName"
