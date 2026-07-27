<#
.SYNOPSIS
  Registriert Windows Scheduled Tasks fuer die drei llama.cpp-Server.
.DESCRIPTION
  Erstellt/aktualisiert drei Scheduled Tasks fuer den automatischen Start der
  Embedding-, Rerank- und Bonsai-Server beim Systemstart. Idempotent: bereits
  vorhandene Tasks werden aktualisiert statt dupliziert.
  Tasks laufen als SYSTEM mit hoechsten Rechten und werden bei Fehlern bis zu
  3 Mal im Abstand von 1 Minute neu gestartet.
.TASK 1
  Name: LlamaBonsaiServer
  Command: %UserProfile%\llama-bonsai-cuda13.3\bin\llama-server.exe  (PrismML-Fork)
  Args: -m ...\prism-ml\...\Ternary-Bonsai-8B-Q2_0.gguf -c 65536 -np 1 ...
  Achtung: Fork-Build und Q2_0 sind Pflicht, siehe Kommentar am Eintrag (T002274).
.TASK 2
  Name: LlamaEmbedServer
  Command: %UserProfile%\llama-b10090-13.3\llama-server.exe
  Args: -m ...\bge-m3-Q8_0.gguf --embedding --pooling cls ...
.TASK 3
  Name: LlamaRerankServer
  Command: %UserProfile%\llama-b10090-13.3\llama-server.exe
  Args: -m ...\bge-reranker-v2-m3-Q8_0.gguf --reranking ...
.EXAMPLE
  .\scripts\llm\register-scheduled-tasks.ps1
#>

$Tasks = @(
  @{
    Name = "LlamaBonsaiServer"
    Description = "Ternary-Bonsai-8B, 1 Slot (Factory-Orchestrator)"
    # T002274: dieser Eintrag beschrieb eine Konfiguration, die nicht
    # funktioniert und im interaktiven Startskript bereits verworfen wurde.
    # Drei unabhaengige Probleme, alle behoben:
    #
    # 1. MODELL: stand auf ...\gpustack\Ternary-Bonsai-8B-TQ2_0.gguf - diese
    #    Datei existiert nicht (geprueft 2026-07-27). Vorhanden ist der
    #    prism-ml-Q2_0-Build. Der Task waere sofort gescheitert.
    # 2. FORMAT + BUILD: TQ2_0 hat im PrismML-Fork KEINE CUDA-Kernel
    #    (T002111: grep -ril TQ2_0 ggml/src/ggml-cuda/ -> 0 Dateien, Q2_0 -> 8),
    #    im Upstream-Build ebenso nicht. Gemessen mit TQ2_0: Prompt 54 tok/s,
    #    Generierung 12,8 tok/s, GPU 10-12 %, 7,7 von 8 CPU-Threads am Anschlag.
    #    Mit Q2_0 auf dem Fork-Build: Prompt 6355 tok/s, Generierung 234 tok/s.
    #    Deshalb Fork-Build (llama-bonsai-cuda13.3\bin) statt b10090.
    # 3. SLOTS: -np 4 ist die nach T002102 bewusst verworfene Variante. Unter
    #    echter 3-4x-Last blieben fertig generierte Slots unfreigegeben, einmal
    #    stiller Server-Crash. Serialisierung liegt seitdem im scripts/llm-proxy
    #    (FIFO), der Server faehrt EINEN Slot mit dem vollen Kontext exklusiv.
    #    Ausserdem passt -c 131072 -np 4 nicht ins VRAM-Budget, wenn bge-m3 und
    #    der Reranker mitlaufen (die belegen zusammen 1,3 GB).
    #
    # KV-Quant q8_0 statt q4_0: 2026-07-23 gegeneinander gemessen, q8_0 war in
    # BEIDEN Dimensionen besser (+3 % Prompt, +9 % Generierung) und gilt als
    # nahezu verlustfrei. --metrics ergaenzt, weil ohne den Prometheus-Endpoint
    # genau die oben genannte CPU-Regression unsichtbar blieb.
    #
    # SSOT fuer diese Argumente ist start-bonsai-parallel.ps1 auf dem GPU-Host.
    # Bei Aenderungen dort MUSS dieser Eintrag mitgezogen werden - zwei
    # Wahrheiten sind genau das Muster, das bei start-embeddings.ps1 die
    # -b/-ub-Flags verschluckt hat (T002260).
    Exe = "$env:UserProfile\llama-bonsai-cuda13.3\bin\llama-server.exe"
    Args = "-m `"$env:UserProfile\.lmstudio\models\prism-ml\Ternary-Bonsai-8B-gguf\Ternary-Bonsai-8B-Q2_0.gguf`" -c 65536 -np 1 --cache-ram 24576 -ngl 99 -fa on -ctk q8_0 -ctv q8_0 --jinja --temp 0.7 --top-p 0.95 --top-k 20 --min-p 0 --metrics --host 0.0.0.0 --port 8093"
  }
  @{
    Name = "LlamaEmbedServer"
    Description = "bge-m3 Embedding-Server (Port 8095)"
    Exe = "$env:UserProfile\llama-b10090-13.3\llama-server.exe"
    # T002260: -b/-ub 8192 sind PFLICHT. bge-m3 ist nicht-kausal, llama.cpp kann
    # eine Sequenz nicht ueber mehrere physische Batches splitten -> ohne -ub
    # gilt der Default 512 und jeder laengere Input scheitert mit
    # "input (N tokens) is too large to process". -c allein genuegt NICHT.
    Args = "-m `"$env:UserProfile\.lmstudio\models\gpustack\bge-m3-GGUF\bge-m3-Q8_0.gguf`" --embedding --pooling cls --embd-normalize 2 -c 8192 -b 8192 -ub 8192 -ngl 99 -fa on --host 0.0.0.0 --port 8095"
  }
  @{
    Name = "LlamaRerankServer"
    Description = "bge-reranker-v2-m3 Rerank-Server (Port 8096)"
    Exe = "$env:UserProfile\llama-b10090-13.3\llama-server.exe"
    # T002260: -b/-ub 8192 sind PFLICHT, gleiche Begruendung wie beim
    # Embed-Server. Beim Cross-Encoder gilt die Grenze fuer Query+Dokument
    # zusammen - realistische Dokumente ab ~1500 Zeichen reissen 512 Tokens.
    Args = "-m `"$env:UserProfile\.lmstudio\models\gpustack\bge-reranker-v2-m3-GGUF\bge-reranker-v2-m3-Q8_0.gguf`" --reranking -c 8192 -b 8192 -ub 8192 -ngl 99 -fa on --host 0.0.0.0 --port 8096"
  }
)

$SchTasks = "$env:SystemRoot\System32\schtasks.exe"

foreach ($Task in $Tasks) {
  $Name = $Task.Name
  $Desc = $Task.Description
  # T002264: stand hier als $Task.Expr - ein Key dieses Namens existiert nicht,
  # PowerShell liefert dafuer still $null (kein Set-StrictMode). Jede Task wurde
  # damit als /tr "" <args> registriert, also mit LEEREM Executable-Pfad, und
  # konnte nichts starten. Das ist der Grund, warum es faktisch keine
  # Server-Persistenz gab, obwohl das Skript existierte.
  $Exe = $Task.Exe
  $Args = $Task.Args

  # Pruefe ob Task bereits existiert
  $Existing = & $SchTasks /query /tn "Llama\$Name" /fo LIST 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Updating existing task: Llama\$Name..."
    & $SchTasks /change /tn "Llama\$Name" /tr "`"$Exe`" $Args" /rl HIGHEST 2>&1 | Out-Null
  } else {
    Write-Host "Creating task: Llama\$Name..."
    & $SchTasks /create /tn "Llama\$Name" /tr "`"$Exe`" $Args" `
      /sc ONSTART /delay 0000:00 `
      /ru SYSTEM /rl HIGHEST `
      /f 2>&1 | Out-Null

    # Restart-Einstellungen
    & $SchTasks /change /tn "Llama\$Name" /rl HIGHEST /DELAY 0000:30 2>&1 | Out-Null
  }

  # Restart-Einstellungen (gelten fuer Neu- und Update-Fall)
  # Maximale Ausfuehrungsdauer: 1 Tag (damit Task nicht nach 72h stirbt)
  & $SchTasks /change /tn "Llama\$Name" /Z 1:00:00 2>&1 | Out-Null

  # Restart bei Fehler: 3 Versuche, 1 Min Abstand
  # schtasks /change hat kein direktes Restart-Interface - via XML
  $TaskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Settings>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
</Task>
"@
  $XmlPath = [System.IO.Path]::GetTempFileName()
  $TaskXml | Out-File -Encoding UTF8 -FilePath $XmlPath
  & $SchTasks /change /tn "Llama\$Name" /XML $XmlPath 2>&1 | Out-Null
  Remove-Item $XmlPath -Force

  Write-Host "  [ok] Llama\$Name registered. Next start: At system startup."
  Write-Host "  Executable: $Exe"
}

Write-Host ""
Write-Host "All 3 tasks registered. Verify:"
Write-Host "  schtasks /query /fo LIST | findstr /i Llama"
Write-Host ""
Write-Host "To trigger a manual start:"
Write-Host "  schtasks /run /tn LlamaBonsaiServer"
Write-Host "  schtasks /run /tn LlamaEmbedServer"
Write-Host "  schtasks /run /tn LlamaRerankServer"
