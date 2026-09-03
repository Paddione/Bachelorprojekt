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

# [T900040] Windows-Pendant zu EnvironmentFile= der systemd-Unit: fehlt der Token
# in der Umgebung, wird er aus ~/.config/<service>/server.env nachgeladen. Das ist
# dieselbe Datei, aus der mcp-sync.sh den Authorization-Header aufloest - ohne
# diesen Fallback muesste der Wert bei jedem Start von Hand gesetzt werden.
# [T900052] Erweitert um FACTORY_MCP_TOKEN, MCP_POSTGRES_TOKEN und
# MCP_KUBERNETES_TOKEN — alle drei werden vom Shared Guard (mcp-http-security.mjs)
# als Pflicht-Token gefordert.
function Load-TokenFromEnv {
    param(
        [string]$EnvKey,
        [string]$ServiceName
    )
    $currentValue = [Environment]::GetEnvironmentVariable($EnvKey)
    if ($currentValue -and $currentValue.Trim() -ne "") { return $true }
    $envFile = Join-Path $HOME ".config/$ServiceName/server.env"
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) {
            if ($line -match "^\s*$([regex]::Escape($EnvKey))\s*=\s*(.+?)\s*$") {
                [Environment]::SetEnvironmentVariable($EnvKey, $Matches[1].Trim('"').Trim("'"), "Process")
                Write-Host "$EnvKey aus $envFile geladen."
                return $true
            }
        }
    }
    return $false
}

# Token laden (BGE_MCP_TOKEN ist Pflicht fuer den Shim; die anderen sind
# Pflicht fuer die jeweiligen Server, werden aber erst beim Start geprueft).
if (-not (Load-TokenFromEnv "BGE_MCP_TOKEN" "bge-mcp")) {
    Write-Host "FEHLER: BGE_MCP_TOKEN ist weder gesetzt noch in ~/.config/bge-mcp/server.env zu finden."
    Write-Host 'Setzen mit: $env:BGE_MCP_TOKEN = "<token>"'
    exit 1
}

# Fuer die guarded Server (werden beim Start via requireToken geprueft)
Load-TokenFromEnv "FACTORY_MCP_TOKEN" "factory-mcp-node" | Out-Null
Load-TokenFromEnv "MCP_POSTGRES_TOKEN" "mcp-postgres" | Out-Null
Load-TokenFromEnv "MCP_KUBERNETES_TOKEN" "mcp-cors-proxy" | Out-Null

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
