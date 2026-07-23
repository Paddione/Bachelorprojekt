<#
.SYNOPSIS
  Registriert Windows Scheduled Tasks für die drei llama.cpp-Server.
.DESCRIPTION
  Erstellt/aktualisiert drei Scheduled Tasks für den automatischen Start der
  Embedding-, Rerank- und Bonsai-Server beim Systemstart. Idempotent: bereits
  vorhandene Tasks werden aktualisiert statt dupliziert.
  Tasks laufen als SYSTEM mit höchsten Rechten und werden bei Fehlern bis zu
  3 Mal im Abstand von 1 Minute neu gestartet.
.TASK 1
  Name: LlamaBonsaiServer
  Command: %UserProfile%\llama-b10090-13.3\llama-server.exe
  Args: -m ...\Ternary-Bonsai-8B-TQ2_0.gguf -c 131072 -np 4 ...
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
    Description = "Ternary-Bonsai-8B mit 4 Slots (Factory-Orchestrator)"
    Exe = "$env:UserProfile\llama-b10090-13.3\llama-server.exe"
    Args = "-m `"$env:UserProfile\.lmstudio\models\gpustack\Ternary-Bonsai-8B-TQ2_0.gguf`" -c 131072 -np 4 --cache-ram 24576 -ngl 99 -fa on -ctk q4_0 -ctv q4_0 --jinja --temp 0.7 --top-p 0.95 --top-k 20 --min-p 0 --host 0.0.0.0 --port 8093"
  }
  @{
    Name = "LlamaEmbedServer"
    Description = "bge-m3 Embedding-Server (Port 8095)"
    Exe = "$env:UserProfile\llama-b10090-13.3\llama-server.exe"
    Args = "-m `"$env:UserProfile\.lmstudio\models\gpustack\bge-m3-GGUF\bge-m3-Q8_0.gguf`" --embedding --pooling cls --embd-normalize 2 -c 8192 -ngl 99 -fa on --host 0.0.0.0 --port 8095"
  }
  @{
    Name = "LlamaRerankServer"
    Description = "bge-reranker-v2-m3 Rerank-Server (Port 8096)"
    Exe = "$env:UserProfile\llama-b10090-13.3\llama-server.exe"
    Args = "-m `"$env:UserProfile\.lmstudio\models\gpustack\bge-reranker-v2-m3-GGUF\bge-reranker-v2-m3-Q8_0.gguf`" --reranking -c 8192 -ngl 99 -fa on --host 0.0.0.0 --port 8096"
  }
)

$SchTasks = "$env:SystemRoot\System32\schtasks.exe"

foreach ($Task in $Tasks) {
  $Name = $Task.Name
  $Desc = $Task.Description
  $Exe = $Task.Expr
  $Args = $Task.Args

  # Prüfe ob Task bereits existiert
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

  # Restart-Einstellungen (gelten für Neu- und Update-Fall)
  # Maximale Ausführungsdauer: 1 Tag (damit Task nicht nach 72h stirbt)
  & $SchTasks /change /tn "Llama\$Name" /Z 1:00:00 2>&1 | Out-Null

  # Restart bei Fehler: 3 Versuche, 1 Min Abstand
  # schtasks /change hat kein direktes Restart-Interface — via XML
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

  Write-Host "  ✓ Llama\$Name registered. Next start: At system startup."
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
