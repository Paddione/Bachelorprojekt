# scripts/mcp-gateway/start-windows.ps1
# T900039 - Windows-Pendant zu den systemd-user-Units unter scripts/bge-mcp/
# und scripts/mcp-gateway/. Auf Linux/WSL uebernehmen bge-mcp.service,
# bge-forward-embed.service und bge-forward-rerank.service diese Aufgabe
# (siehe dort). Auf Windows gibt es kein systemd --user, deshalb dieses
# Skript: es startet dieselben kubectl-Port-Forwards gegen den fleet-Cluster
# und danach den bge-mcp-Shim (scripts/bge-mcp/server.mjs) im Vordergrund.
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mcp-gateway/start-windows.ps1
#
# Erreichbar ueber: task mcp:start-windows (Taskfile.yml).
#
# Vorbedingungen:
#   - kubectl mit funktionierendem fleet-Kontext (kubectl config get-contexts)
#   - BGE_MCP_TOKEN in der Umgebung gesetzt; der Shim verweigert sonst den
#     Start (siehe scripts/bge-mcp/server.mjs).
#
# Das Skript beendet die Port-Forwards, sobald der Shim-Prozess endet
# (Strg+C oder Fehler), damit keine verwaisten kubectl-Prozesse zurueckbleiben.

param(
    [string]$KubeContext = "fleet",
    [string]$Namespace = "workspace",
    [int]$MonolithPort1 = 18080,
    [int]$MonolithPort2 = 13000,
    [int]$MonolithPort3 = 13001,
    [int]$MonolithPort4 = 13002,
    [int]$EmbedPort = 8081,
    [int]$RerankPort = 8093,
    [int]$BgeMcpPort = 13005
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

if (-not $env:BGE_MCP_TOKEN -or $env:BGE_MCP_TOKEN.Trim() -eq "") {
    Write-Host "FEHLER: BGE_MCP_TOKEN ist nicht gesetzt. Der bge-mcp-Shim verweigert ohne Token den Start."
    Write-Host 'Setzen mit: $env:BGE_MCP_TOKEN = "<token>"'
    exit 1
}

function Start-PortForward {
    param(
        [string]$KContext,
        [string]$Ns,
        [string]$Service,
        [string[]]$Ports
    )
    Write-Host "Starte Port-Forward: $Service ($($Ports -join ' ')) in Namespace $Ns ..."
    return Start-Job -ScriptBlock {
        param($ctx, $ns, $svc, $ports)
        & kubectl --context $ctx port-forward -n $ns $svc @ports
    } -ArgumentList $KContext, $Ns, $Service, $Ports
}

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSec = 60)
    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        $ok = Test-NetConnection -ComputerName "127.0.0.1" -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
        if ($ok) { return $true }
        Start-Sleep -Seconds 1
        $elapsed++
    }
    return $false
}

$forwardJobs = @()
$forwardJobs += Start-PortForward -KContext $KubeContext -Ns "default" -Service "svc/claude-code-mcp-monolith" `
    -Ports @("${MonolithPort1}:8080", "${MonolithPort2}:3000", "${MonolithPort3}:3001", "${MonolithPort4}:3002")
$forwardJobs += Start-PortForward -KContext $KubeContext -Ns $Namespace -Service "svc/llm-gateway-embed" `
    -Ports @("${EmbedPort}:8081")
$forwardJobs += Start-PortForward -KContext $KubeContext -Ns $Namespace -Service "svc/llm-gateway-rerank" `
    -Ports @("${RerankPort}:8081")

Write-Host "Warte auf Port-Forwards (embed/rerank) ..."
$ready = (Wait-ForPort -Port $EmbedPort) -and (Wait-ForPort -Port $RerankPort)
if (-not $ready) {
    Write-Host "FEHLER: Port-Forwards fuer llm-gateway-embed/-rerank sind nicht rechtzeitig bereit."
    $forwardJobs | Stop-Job -ErrorAction SilentlyContinue
    $forwardJobs | Remove-Job -ErrorAction SilentlyContinue
    exit 1
}

$env:LLM_EMBED_URL = "http://127.0.0.1:$EmbedPort"
$env:LLM_RERANKER_URL = "http://127.0.0.1:$RerankPort"
$env:BGE_MCP_PORT = "$BgeMcpPort"

Write-Host "Starte bge-mcp-Shim auf Port $BgeMcpPort ..."
try {
    node "$RepoRoot\scripts\bge-mcp\server.mjs"
}
finally {
    Write-Host "Beende Port-Forwards ..."
    $forwardJobs | Stop-Job -ErrorAction SilentlyContinue
    $forwardJobs | Remove-Job -ErrorAction SilentlyContinue
}
