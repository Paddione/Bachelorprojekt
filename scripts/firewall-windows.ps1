# ═══════════════════════════════════════════════════════════════════
# Homeoffice MVP — Windows-Firewall einrichten / entfernen
# Als Administrator ausführen (Win + X → PowerShell (Administrator))
#
# Verwendung:
#   .\scripts\firewall-windows.ps1 -Action Setup    Regeln anlegen
#   .\scripts\firewall-windows.ps1 -Action Remove   Regeln entfernen
#   .\scripts\firewall-windows.ps1 -Action Status   Regeln anzeigen
# ═══════════════════════════════════════════════════════════════════

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Setup", "Remove", "Status")]
    [string]$Action
)

$Rules = @(
    @{ Name = "Homeoffice MVP - HTTP";          Port = 80;    Protocol = "TCP" }
    @{ Name = "Homeoffice MVP - HTTPS";         Port = 443;   Protocol = "TCP" }
    @{ Name = "Homeoffice MVP - Jitsi JVB UDP"; Port = 10000; Protocol = "UDP" }
)

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Setup {
    if (-not (Test-Admin)) {
        Write-Error "Administrator-Rechte erforderlich. PowerShell als Admin starten."
        exit 1
    }
    Write-Host "Firewall-Regeln anlegen ..." -ForegroundColor Cyan
    foreach ($rule in $Rules) {
        $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "  OK $($rule.Name) existiert bereits" -ForegroundColor Green
        } else {
            New-NetFirewallRule `
                -DisplayName $rule.Name `
                -Direction Inbound `
                -Protocol $rule.Protocol `
                -LocalPort $rule.Port `
                -Action Allow `
                -Profile Any | Out-Null
            Write-Host "  +  $($rule.Name) angelegt" -ForegroundColor Yellow
        }
    }
    Write-Host ""
    Invoke-Status
}

function Invoke-Remove {
    if (-not (Test-Admin)) {
        Write-Error "Administrator-Rechte erforderlich. PowerShell als Admin starten."
        exit 1
    }
    Write-Host "Firewall-Regeln entfernen ..." -ForegroundColor Cyan
    foreach ($rule in $Rules) {
        $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        if ($existing) {
            Remove-NetFirewallRule -DisplayName $rule.Name
            Write-Host "  -  $($rule.Name) entfernt" -ForegroundColor Yellow
        } else {
            Write-Host "  OK $($rule.Name) war nicht vorhanden" -ForegroundColor Green
        }
    }
}

function Invoke-Status {
    Write-Host "Homeoffice MVP Firewall-Regeln:" -ForegroundColor Cyan
    Write-Host ""
    Get-NetFirewallRule |
        Where-Object { $_.DisplayName -like "Homeoffice MVP*" } |
        Select-Object DisplayName, Enabled, Direction, Action |
        Format-Table -AutoSize
}

switch ($Action) {
    "Setup"  { Invoke-Setup }
    "Remove" { Invoke-Remove }
    "Status" { Invoke-Status }
}
