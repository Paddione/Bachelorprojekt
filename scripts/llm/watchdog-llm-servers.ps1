<#
.SYNOPSIS
  Haelt die drei LLM-Server des Stacks am Leben und startet tote neu.
.DESCRIPTION
  Der Autostart (install-startup-autostart.ps1) startet die Server EINMAL bei der
  Anmeldung. Stirbt danach einer - OOM auf der Karte, Treiber-Reset, Absturz beim
  Laden eines zu grossen Prompts - bleibt er tot, bis jemand es bemerkt. Genau das
  war T002335: unter \Llama\ war kein Scheduled Task registriert, und es gab keine
  zweite Instanz, die den Ausfall haette sehen koennen.

  WARUM KEIN SCHEDULED TASK (T002276, weiterhin gueltig): Der Host ist
  AzureAD-gejoined und MDM-verwaltet. Tasks unter \Llama\ wurden als "ERFOLGREICH
  erstellt" gemeldet und waren Minuten spaeter verschwunden; nicht-elevated
  scheitert die Erstellung direkt. Der Watchdog laeuft deshalb als gewoehnlicher
  Hintergrundprozess aus dem Startup-Ordner, nicht als Task.

  WARUM Start-Process UND NICHT Start-Job: Ein Job haengt an der PowerShell-
  Sitzung, die ihn erzeugt hat. Endet die Sitzung, stirbt der Server mit - das war
  der dritte Befund aus T002276. Der Watchdog wiederholt den Fehler nicht.

  ZWEI BEDINGUNGEN, BEVOR EIN SERVER ALS TOT GILT: HTTP-Health UND ein lauschender
  Prozess auf dem Port. Antwortet /health nicht, wird neu gestartet. Antwortet
  /health, ohne dass ein Listener gefunden wird, wird nur gewarnt - das ist das
  Zeitfenster, in dem ein gerade gestarteter Server schon antwortet, die
  Verbindungstabelle den Listener aber noch nicht fuehrt. Ein Restart waere dort
  ein Eigentor: er wuerde den gesunden Server abschiessen.
.PARAMETER PollSeconds
  Abfrageintervall der Hauptschleife. Default 60.
.PARAMETER NoLoop
  Nur einen Durchlauf pruefen und beenden - fuer manuelle Kontrolle und Tests.
.PARAMETER Uninstall
  Beendet eine laufende Watchdog-Instanz (ueber die Pid-Datei) und raeumt sie weg.
.PARAMETER LlamaDir
  Verzeichnis fuer Log- und Pid-Datei. Default ist das Gemma-Buildverzeichnis.
.PARAMETER RepoRoot
  Wurzel des Repos aus Windows-Sicht (UNC-Pfad nach WSL).
.EXAMPLE
  .\scripts\llm\watchdog-llm-servers.ps1 -NoLoop
.EXAMPLE
  .\scripts\llm\watchdog-llm-servers.ps1 -Uninstall
#>

param(
  [int]$PollSeconds = 60,
  [switch]$NoLoop,
  [switch]$Uninstall,
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-bonsai-cuda13.3",
  [string]$RepoRoot = '\\wsl$\k3d-dev\home\patrick\Bachelorprojekt'
)

$ErrorActionPreference = 'Continue'

$LogFile = Join-Path $LlamaDir 'watchdog-llm-servers.log'
$PidFile = Join-Path $LlamaDir 'watchdog.pid'
$LlmDir  = Join-Path $RepoRoot 'scripts\llm'

# SSOT dafuer, welche Server zum Stack gehoeren. Die Gemma-Argumente stehen NUR
# hier und in install-startup-autostart.ps1 - nicht ein drittes Mal im
# Startskript-Default. T002276 entstand aus genau so einer Duplikation.
# Warum 262144/q8_0/1 Slot: gemessen unter T002297 - 262144 ist n_ctx_train,
# q8_0 ist schneller als q4_0 (146,9 vs 138,0 t/s) und ein Slot maximiert den
# Praefix-Reuse. -NoWait, weil der Watchdog selbst auf Health wartet.
# gpt-oss-20b (:8097) fehlt bewusst: zwei Chat-Server passen nicht auf die Karte.
$Servers = @(
  @{ Name = 'bge-m3';   Port = 8095; Script = 'start-embed-server.ps1';  Args = '-NoWait' },
  @{ Name = 'Reranker'; Port = 8096; Script = 'start-rerank-server.ps1'; Args = '-NoWait' },
  @{ Name = 'Gemma';    Port = 8091; Script = 'start-gemma-server.ps1';  Args = '-Ctx 262144 -Slots 1 -KvType q8_0 -NoWait' }
)

# Write-Host, NICHT Write-Output: Write-Output schreibt in den Success-Stream und
# waere damit Teil des Rueckgabewerts jeder aufrufenden Funktion. Gemessen am
# 2026-07-28: Invoke-WatchdogCycle lieferte statt der Zahl ein Array aus allen
# Log-Zeilen plus der Zahl. Der Vergleich '$alive -eq $Servers.Count' wirkt auf
# Arrays als FILTER und war zufaellig wahr - bei einem echten Ausfall haette er
# still falsch entschieden. Log gehoert nie in den Datenpfad.
function Write-WatchdogLog {
  param([string]$Message, [string]$Level = 'INFO', [string]$Server = 'watchdog')
  $line = '[{0}] {1} {2}: {3}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Server, $Message
  Write-Host $line
  try { Add-Content -Path $LogFile -Value $line -Encoding utf8 -ErrorAction Stop }
  catch { Write-Host "[watchdog] Log nicht schreibbar ($LogFile): $($_.Exception.Message)" }
}

function Get-HealthStatus {
  param([int]$Port)
  try {
    $r = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 5 -ErrorAction Stop
    return ($r.status -eq 'ok')
  } catch {
    return $false
  }
}

function Get-ListenerPid {
  param([int]$Port)
  try {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess }
  } catch { }
  return 0
}

function Test-ServerAlive {
  param([int]$Port, [string]$Name)
  $healthy = Get-HealthStatus -Port $Port
  $listener = Get-ListenerPid -Port $Port
  if ($healthy -and $listener -eq 0) {
    # Kein Restart: der Server antwortet. Fehlt nur der Listener-Eintrag, ist das
    # das Startfenster - ihn hier abzuschiessen waere schlimmer als das Symptom.
    Write-WatchdogLog -Server $Name -Level 'WARN' `
      -Message "health ok, aber kein Listener auf :$Port gefunden - kein Restart (moegliche Startphase)"
    return $true
  }
  return $healthy
}

function Invoke-ServerRestart {
  param([int]$Port, [string]$Name, [string]$Script, [string]$ScriptArgs, [string]$Reason)

  $oldPid = Get-ListenerPid -Port $Port
  if ($oldPid -gt 0) {
    Write-WatchdogLog -Server $Name -Level 'RESTART' -Message "raeume Port :$Port (PID $oldPid)"
    & taskkill.exe /F /PID $oldPid 2>&1 | Out-Null
    Start-Sleep -Seconds 2
  } else {
    Write-WatchdogLog -Server $Name -Level 'RESTART' -Message "kein Prozess auf :$Port - Kaltstart"
  }

  $scriptPath = Join-Path $LlmDir $Script
  if (-not (Test-Path $scriptPath)) {
    Write-WatchdogLog -Server $Name -Level 'ERROR' -Message "Startskript nicht erreichbar: $scriptPath"
    return $false
  }

  $psArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $scriptPath)
  if ($ScriptArgs -ne '') { $psArgs += $ScriptArgs.Split(' ') }
  # Start-Process, nicht Start-Job (T002276): der Server muss die Watchdog-Sitzung
  # ueberleben. Das Startskript bekommt -NoWait, den Health-Poll macht der Watchdog.
  Start-Process -FilePath 'powershell.exe' -ArgumentList $psArgs -WindowStyle Hidden | Out-Null

  # 240s analog zu den Startskripten - Gemma laedt bei 262144 Kontext spuerbar lange.
  $deadline = (Get-Date).AddSeconds(240)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    if (Get-HealthStatus -Port $Port) {
      $newPid = Get-ListenerPid -Port $Port
      Write-WatchdogLog -Server $Name -Level 'RESTART' `
        -Message "neu gestartet - alte PID $oldPid, Grund: $Reason, neue PID $newPid"
      return $true
    }
  }
  Write-WatchdogLog -Server $Name -Level 'ERROR' `
    -Message "nach 240s nicht healthy (alte PID $oldPid, Grund: $Reason)"
  return $false
}

function Invoke-WatchdogCycle {
  $alive = 0
  foreach ($s in $Servers) {
    # T002264 als Mahnung: dort wurde ein nicht existenter Hashtable-Key gelesen,
    # PowerShell lieferte still $null und alle Eintraege liefen leer los.
    foreach ($key in @('Name', 'Port', 'Script', 'Args')) {
      if (-not $s.ContainsKey($key)) {
        Write-WatchdogLog -Level 'ERROR' -Message "Server-Eintrag ohne '$key'-Key: $($s | Out-String)"
        exit 1
      }
    }
    if (Test-ServerAlive -Port $s.Port -Name $s.Name) {
      $alive++
    } else {
      if (Invoke-ServerRestart -Port $s.Port -Name $s.Name -Script $s.Script `
            -ScriptArgs $s.Args -Reason 'health check failed') { $alive++ }
    }
  }
  $total = $Servers.Count
  Write-WatchdogLog -Message "summary: $alive/$total Server healthy"
  return $alive
}

# ---- Uninstall ---------------------------------------------------------------
if ($Uninstall) {
  if (Test-Path $PidFile) {
    $wpid = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($wpid -match '^\d+$') {
      $proc = Get-Process -Id ([int]$wpid) -ErrorAction SilentlyContinue
      if ($proc) {
        Stop-Process -Id ([int]$wpid) -Force -ErrorAction SilentlyContinue
        Write-WatchdogLog -Message "Watchdog-Instanz PID $wpid beendet"
      } else {
        Write-WatchdogLog -Message "Pid-Datei zeigte auf PID $wpid - laeuft nicht mehr"
      }
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Output "Entfernt: $PidFile"
  } else {
    Write-Output "Nichts zu entfernen - $PidFile existiert nicht."
  }
  exit 0
}

# ---- Lauf --------------------------------------------------------------------
if (-not (Test-Path $LlamaDir)) {
  Write-Output "FAILED: LlamaDir nicht erreichbar: $LlamaDir"
  exit 1
}

Set-Content -Path $PidFile -Value $PID -Encoding ascii -ErrorAction SilentlyContinue

$alive = Invoke-WatchdogCycle
if ($alive -eq $Servers.Count) {
  Write-WatchdogLog -Message 'initial health check passed'
}

if ($NoLoop) {
  # Exit 1 nur, wenn ALLE tot sind - ein einzelner Ausfall ist der Normalfall,
  # den der Watchdog gerade behoben hat, und darf den Aufrufer nicht alarmieren.
  if ($alive -eq 0) { exit 1 }
  exit 0
}

while ($true) {
  Start-Sleep -Seconds $PollSeconds
  $alive = Invoke-WatchdogCycle
  if ($alive -eq 0) {
    Write-WatchdogLog -Level 'ERROR' -Message 'ALLE Server tot und nicht wiederherstellbar - beende mit Exit 1'
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    exit 1
  }
}
