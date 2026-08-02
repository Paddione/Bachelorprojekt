<#
.SYNOPSIS
  Registriert Windows Scheduled Tasks fuer die beiden bge llama.cpp-Server
  (Embedding/Rerank).
.DESCRIPTION
  Erstellt/aktualisiert Scheduled Tasks fuer den automatischen Start der
  Embedding- und Rerank-Server beim Systemstart. Idempotent: bereits
  vorhandene Tasks werden aktualisiert statt dupliziert.
  Tasks laufen als SYSTEM mit hoechsten Rechten und werden bei Fehlern bis zu
  3 Mal im Abstand von 1 Minute neu gestartet.
.EXAMPLE
  .\scripts\llm\register-scheduled-tasks.ps1
#>

# T002276: die Tasks zeigen jetzt auf die START-SKRIPTE statt auf llama-server.exe
# mit vollstaendiger Argumentliste. Zwei Gruende:
#
# 1. schtasks erlaubt fuer /tr maximal 261 Zeichen. Gemessen am 2026-07-27:
#    Bonsai brauchte 338, Embed 262 - beide wurden abgewiesen mit "FEHLER: Der
#    Wert fuer die Option /tr darf nicht mehr als 261 Zeichen enthalten."
#    Ein Aufruf des Skripts liegt weit darunter.
# 2. Die Argumente lagen doppelt vor: hier UND im jeweiligen Startskript. Genau
#    davor warnte der Kommentar aus T002274 - und genau das war bei
#    start-embeddings.ps1 die Ursache dafuer, dass die -b/-ub-Flags fehlten
#    (T002260). Jetzt gibt es nur eine Wahrheit: das Startskript.
#
# HINWEIS: auf diesem Host ist der Task-Weg policy-beschraenkt (siehe T002276) -
# elevated meldet Erfolg ohne Persistenz, nicht-elevated verweigert den Zugriff.
# Das Skript bleibt fuer Umgebungen ohne diese Beschraenkung bzw. nach einer
# Intune-Freigabe.
$Tasks = @(
  @{
    Name = "LlamaEmbedServer"
    Description = "bge-m3 Embedding-Server (Port 8095)"
    Script = "$PSScriptRoot\start-embed-server.ps1"
  }
  @{
    Name = "LlamaRerankServer"
    Description = "bge-reranker-v2-m3 Rerank-Server (Port 8096)"
    Script = "$PSScriptRoot\start-rerank-server.ps1"
  }
)

$SchTasks = "$env:SystemRoot\System32\schtasks.exe"
$PwSh = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$failed = 0

foreach ($Task in $Tasks) {
  $Name = $Task.Name
  $Script = $Task.Script

  if (-not (Test-Path $Script)) {
    Write-Host "SKIP Llama\$Name - Startskript nicht gefunden: $Script"
    $failed++
    continue
  }

  # /tr zeigt auf das Startskript. -WindowStyle Hidden, damit beim Systemstart
  # kein Fenster erscheint.
  $tr = ('"{0}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}"' -f $PwSh, $Script)
  if ($tr.Length -gt 261) {
    Write-Host "SKIP Llama\$Name - /tr waere $($tr.Length) Zeichen (Limit 261)."
    $failed++
    continue
  }

  # T002276: Ausgabe wird NICHT mehr nach Out-Null geschickt und $LASTEXITCODE
  # wird geprueft. Vorher meldete das Skript dreimal "[ok] registered", obwohl
  # kein einziger Task entstand - schtasks-Fehler waren unsichtbar.
  $existing = & $SchTasks /query /tn "Llama\$Name" /fo LIST 2>&1
  $exists = ($LASTEXITCODE -eq 0)

  if ($exists) {
    Write-Host "Updating existing task: Llama\$Name ..."
    $out = & $SchTasks /change /tn "Llama\$Name" /tr $tr /rl HIGHEST 2>&1
  } else {
    Write-Host "Creating task: Llama\$Name ..."
    $out = & $SchTasks /create /tn "Llama\$Name" /tr $tr /sc ONSTART /delay 0000:30 /ru SYSTEM /rl HIGHEST /f 2>&1
  }

  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED Llama\$Name (exit $LASTEXITCODE):"
    $out | ForEach-Object { Write-Host "    $_" }
    $failed++
    continue
  }

  # Verifizieren, dass der Task WIRKLICH existiert. Auf MDM-verwalteten Hosts
  # meldet schtasks Erfolg, und der Task ist Sekunden spaeter verschwunden
  # (T002276) - eine Erfolgsmeldung allein ist hier kein Beweis.
  Start-Sleep -Milliseconds 500
  & $SchTasks /query /tn "Llama\$Name" /fo LIST > $null 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED Llama\$Name - schtasks meldete Erfolg, der Task existiert aber nicht."
    Write-Host "    Auf MDM-verwalteten Rechnern entfernt eine Policy ihn womoeglich wieder."
    $failed++
    continue
  }

  Write-Host "  [ok] Llama\$Name registriert und verifiziert."
  Write-Host "  Startet: $Script"
}

Write-Host ""
if ($failed -eq 0) {
  Write-Host "Alle $($Tasks.Count) Tasks registriert. Pruefen:"
  Write-Host "  schtasks /query /fo LIST | findstr /i Llama"
  Write-Host ""
  Write-Host "Manuell starten:"
  foreach ($t in $Tasks) { Write-Host ("  schtasks /run /tn " + '"Llama\' + $t.Name + '"') }
} else {
  Write-Host "$failed von $($Tasks.Count) Tasks NICHT registriert - siehe Meldungen oben."
  exit 1
}
