# scripts/mcp-gateway/start-windows.ps1
# T900039, T900191 - Windows-Pendant zu mcp-gateway.service und devmesh-forward.service.
# Startet zwei kubectl-Port-Forwards und haelt sie am Leben, bis Strg+C:
#   fleet   workspace-dev  svc/dev-pod       18080 (mcp-kubernetes), 13002 (github)
#   devmesh workspace      svc/llm-services  18235 (llm-proxy), 13001 (mcp-postgres), 13005 (bge-mcp)
# Kein lokaler Node-Prozess mehr: llm-proxy, mcp-postgres und bge-mcp laufen im
# devmesh-Pod llm-services. Die frueheren Forwards 8081/8093 (bge-embed/-rerank)
# entfallen, der Proxy erreicht bge dort ueber Cluster-DNS.
#
# Aufruf:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mcp-gateway/start-windows.ps1
# Erreichbar ueber: task mcp:start-windows. Autostart: task mcp:autostart:register.
#
# AUSSCHLUSS: Windows- und WSL-Mechanismus schliessen sich aus. Mit
# networkingMode=mirrored teilen Windows und WSL den Loopback. Laufen hier und in
# WSL (mcp-gateway.service, devmesh-forward.service) dieselben Forwards, scheitert
# der zweite mit "address already in use". Pro Host genau einen Mechanismus aktivieren.
#
# Vorbedingung: kubectl mit den Kontexten fleet und devmesh (kubectl config get-contexts).
# Tokens braucht dieses Skript nicht; die Clients senden sie selbst an die Server.
#
# Ein beendeter Forward (Pod-Neustart, Netzabriss) wird nach 3 s neu gestartet.
# Strg+C beendet alle Forwards, damit keine verwaisten kubectl-Prozesse bleiben.

param(
    [string]$FleetContext = "fleet",
    [string]$DevmeshContext = "devmesh",
    [int]$KubernetesPort = 18080,
    [int]$GithubPort = 13002,
    [int]$ProxyPort = 18235,
    [int]$PostgresPort = 13001,
    [int]$BgeMcpPort = 13005,
    [int]$ReadyTimeoutSec = 60
)

$ErrorActionPreference = "Stop"

# [T900190] .ProviderPath statt .Path: unter \\wsl.localhost\... liefert .Path den
# Provider-Praefix Microsoft.PowerShell.Core\FileSystem::.
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).ProviderPath
Set-Location $RepoRoot

$forwards = @(
    @{ Name = "fleet"; Context = $FleetContext; Ns = "workspace-dev"; Service = "svc/dev-pod";
       Ports = @("${KubernetesPort}:8080", "${GithubPort}:3002"); Probe = @($KubernetesPort, $GithubPort) },
    @{ Name = "devmesh"; Context = $DevmeshContext; Ns = "workspace"; Service = "svc/llm-services";
       Ports = @("${ProxyPort}:18235", "${PostgresPort}:13001", "${BgeMcpPort}:13005");
       Probe = @($ProxyPort, $PostgresPort, $BgeMcpPort) }
)

function Start-PortForward {
    param([hashtable]$Spec)
    Write-Host "Starte Port-Forward $($Spec.Name): $($Spec.Service) ($($Spec.Ports -join ' ')) in $($Spec.Ns) ..."
    return Start-Job -ScriptBlock {
        param($ctx, $ns, $svc, $ports)
        & kubectl --context $ctx port-forward -n $ns $svc @ports
    } -ArgumentList $Spec.Context, $Spec.Ns, $Spec.Service, $Spec.Ports
}

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSec)
    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        $ok = Test-NetConnection -ComputerName "127.0.0.1" -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
        if ($ok) { return $true }
        Start-Sleep -Seconds 1
        $elapsed++
    }
    return $false
}

function Stop-AllForwards {
    param([hashtable]$Jobs)
    Write-Host "Beende Port-Forwards ..."
    $Jobs.Values | Stop-Job -ErrorAction SilentlyContinue
    $Jobs.Values | Remove-Job -Force -ErrorAction SilentlyContinue
}

$jobs = @{}
foreach ($f in $forwards) { $jobs[$f.Name] = Start-PortForward -Spec $f }

try {
    foreach ($f in $forwards) {
        foreach ($p in $f.Probe) {
            if (-not (Wait-ForPort -Port $p -TimeoutSec $ReadyTimeoutSec)) {
                Write-Host "FEHLER: Port $p ($($f.Name), $($f.Service)) ist nach $ReadyTimeoutSec s nicht bereit."
                Receive-Job $jobs[$f.Name] -ErrorAction SilentlyContinue | Write-Host
                exit 1
            }
        }
    }
    Write-Host "Forwards bereit: 18080/13002 (fleet), 18235/13001/13005 (devmesh). Strg+C beendet sie."

    while ($true) {
        foreach ($f in $forwards) {
            $j = $jobs[$f.Name]
            if ($j.State -ne "Running") {
                Receive-Job $j -ErrorAction SilentlyContinue | Write-Host
                Remove-Job $j -Force -ErrorAction SilentlyContinue
                Write-Host "Forward $($f.Name) beendet ($($j.State)), Neustart in 3 s ..."
                Start-Sleep -Seconds 3
                $jobs[$f.Name] = Start-PortForward -Spec $f
            }
        }
        Start-Sleep -Seconds 5
    }
}
finally {
    Stop-AllForwards -Jobs $jobs
}