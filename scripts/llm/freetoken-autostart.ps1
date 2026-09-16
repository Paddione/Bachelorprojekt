# scripts/llm/freetoken-autostart.ps1 -- FreeToken beim Logon starten (T900189).
#
# WARUM ES DAS GIBT: Der Engine-Start war bis hierher ein Handgriff. Am
# 2026-09-16 lief dadurch auf diesem Host GAR KEINE lokale Generierungs-Inferenz
# -- :1919 tot, :1929 tot, und der Proxy routete auf den ebenfalls toten :8094.
# Aufgefallen ist das niemandem, weil nichts den Zustand behauptet hat.
#
# WARUM DIE SKRIPTE KOPIERT WERDEN: Der Task darf nicht auf einen
# \\wsl.localhost-Pfad zeigen. Sonst haengt der Start der windows-nativen
# Inferenz daran, dass WSL laeuft -- das Gegenteil des Ziels. Registriert wird
# deshalb eine Kopie unter %LOCALAPPDATA%\FreeToken\bin\, und -Register ist der
# Weg, sie nach einer Repo-Aenderung aufzufrischen.
#
# Kein Windows-Dienst: der GPU-Zugriff aus Session 0 ist fragiler als der Gewinn,
# und ein Logon-Trigger deckt den Einzelplatz-Host ab, um den es hier geht.
#
# Usage (aus WSL):
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/freetoken-autostart.ps1 -Register
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/freetoken-autostart.ps1 -Status
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/freetoken-autostart.ps1 -Unregister

param(
    [switch]$Register,
    [switch]$Unregister,
    [switch]$Status,
    [string]$Profile = "qwen-200k",
    [string]$TaskName = "FreeToken-Serve"
)

$ErrorActionPreference = "Stop"

$BinDir     = "$env:LOCALAPPDATA\FreeToken\bin"
$TargetPs1  = "$BinDir\restart-freetoken.ps1"
$SourceDir  = $PSScriptRoot

function Say($msg) { Write-Host ("[freetoken-autostart] " + $msg) }

if ($Status) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) { Say "Task '$TaskName' ist NICHT registriert."; exit 1 }
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Say ("Task:        " + $task.TaskName + " (" + $task.State + ")")
    Say ("Aktion:      " + ($task.Actions | ForEach-Object { $_.Execute + " " + $_.Arguments }))
    Say ("Letzter Lauf: " + $info.LastRunTime + " rc=" + $info.LastTaskResult)
    Say ("Naechster Lauf: " + $info.NextRunTime)
    # Der Task-Zustand sagt nichts ueber die Engine. Gemessen wird der Port.
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:1919/v1/models" -TimeoutSec 3
        Say ("Engine :1919 antwortet, Modelle: " + (($r.data | ForEach-Object { $_.id }) -join ", "))
    } catch {
        Say "Engine :1919 antwortet NICHT -- Task registriert heisst nicht, dass sie laeuft."
    }
    exit 0
}

if ($Unregister) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Say "Task '$TaskName' entfernt."
    } else {
        Say "Task '$TaskName' war nicht registriert."
    }
    exit 0
}

if (-not $Register) { throw "Einen Modus waehlen: -Register, -Status oder -Unregister." }

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# restart-freetoken.ps1 startet die KV-Ladder als eigenen Prozess und erwartet sie
# im selben Verzeichnis ($PSScriptRoot). Beide Dateien muessen also mitkommen --
# sonst laeuft der Server mit dem Start-KV-Pool statt der kalibrierten Decke.
foreach ($f in @("restart-freetoken.ps1", "freetoken-kv-ladder.ps1")) {
    $src = Join-Path $SourceDir $f
    if (-not (Test-Path $src)) { throw "Quelldatei fehlt: $src" }
    Copy-Item $src (Join-Path $BinDir $f) -Force
    Say "kopiert: $f"
}

if ($TargetPs1 -notmatch '^[A-Za-z]:\\') {
    throw "Zielpfad ist kein lokaler Windows-Pfad: $TargetPs1"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$TargetPs1`" -Profile $Profile")
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# ExecutionTimeLimit 0 = kein Zeitlimit: der Task IST der Serverprozess, kein Job.
# RestartCount deckt den Fall ab, dass die Engine nach einem Treiber-Reset stirbt.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1))

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Startet die FreeToken-Engine (ft serve) beim Logon -- Profil $Profile, T900189." `
    -Force | Out-Null

Say "Task '$TaskName' registriert (Profil $Profile, Trigger: Logon von $env:USERNAME)."
Say "Pruefen mit: -Status"
