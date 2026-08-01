<#
.SYNOPSIS
  Schraenkt den eingehenden Zugriff auf die llama-server des GPU-Hosts auf das
  wg-Mesh ein (T002490). Idempotent.

.DESCRIPTION
  Am 2026-08-01 waren die vier bge-Server (8085/8086/8095/8096) ueber eine
  Windows-Firewall-Regel mit remote=Any, Profile Private+Public, TCP UND UDP,
  alle Ports eingehend freigegeben. Die Regelnamen ("TCP Query User{...}") weisen
  sie als Ergebnis des Windows-"Zugriff zulassen"-Popups aus. Die Endpunkte sind
  unauthentifiziert; der Bearer-Token schuetzt nur den vorgelagerten bge-mcp-Shim.

  WARUM NICHT `--host 127.0.0.1` IN DEN START-SKRIPTEN:
  k3d/llm-gpu.yaml verdrahtet die Server als EndpointSlice auf ${LLM_HOST_IP}
  (192.168.100.10, wg-mesh); dev und prod fleet greifen darueber zu. llama-server
  bindet nur EINE Adresse - Loopback (Shim) und wg-Mesh (Cluster) gleichzeitig
  gehen ausschliesslich ueber 0.0.0.0. Der Bind ist funktional notwendig; die
  Einschraenkung gehoert an den Perimeter.

  Das Skript legt eine gescopte Allow-Regel an und entfernt alle anderen
  eingehenden Regeln, die auf dieselbe Binary zeigen - sonst gewinnt bei mehreren
  passenden Allow-Regeln die weiteste.

.PARAMETER Program
  Vollstaendiger Pfad zur llama-server.exe, deren Regeln verwaltet werden.

.PARAMETER MeshSubnet
  Erlaubtes Quell-Subnetz. Default ist das wg-gpu-Mesh aus
  wireguard/wg-mesh-nodes.yaml (env mentolder).

.PARAMETER Ports
  Zu oeffnende TCP-Ports.

.EXAMPLE
  # Elevated ausfuehren:
  powershell -ExecutionPolicy Bypass -File scripts\llm\harden-gpu-firewall.ps1 `
    -Program 'C:\Users\PatrickKorczewski\llama-b10090-13.3\llama-server.exe'

.NOTES
  Diese Datei ist bewusst rein ASCII. Aus WSL geschriebene UTF-8-Dateien liest
  PowerShell 5.1 als CP1252; ein Em-Dash wird dabei zu einem typografischen
  Anfuehrungszeichen, das Strings zerlegt und das Skript unparsebar macht.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Program,

  [string]$MeshSubnet = '192.168.100.0/24',

  [int[]]$Ports = @(8085, 8086, 8095, 8096),

  [string]$RuleName = 'llama-bge-wg-mesh',

  [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
      ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Dieses Skript benoetigt Administratorrechte (Firewall-Regeln).'
}

if (-not (Test-Path $Program)) {
  throw "Binary nicht gefunden: $Program"
}

$leaf = Split-Path $Program -Leaf
$dir  = Split-Path $Program -Parent

function Get-RulesForProgram {
  # Der Vergleich laeuft ueber das Elternverzeichnis, weil mehrere llama-Builds
  # parallel installiert sind und alle dieselbe llama-server.exe heissen. Nur die
  # Regeln des uebergebenen Builds duerfen angefasst werden.
  Get-NetFirewallApplicationFilter |
    Where-Object { $_.Program -like "*$([System.IO.Path]::GetFileName($dir))*$leaf" } |
    ForEach-Object { $_ | Get-NetFirewallRule } |
    Where-Object { $_.Direction -eq 'Inbound' }
}

Write-Output '=== VORHER ==='
Get-RulesForProgram | ForEach-Object {
  $a = $_ | Get-NetFirewallAddressFilter
  $p = $_ | Get-NetFirewallPortFilter
  '{0} | {1} | remote={2} | {3}/{4} | name={5}' -f `
    $_.DisplayName, $_.Action, ($a.RemoteAddress -join ','), $p.Protocol, ($p.LocalPort -join ','), $_.Name
}

if ($WhatIfOnly) {
  Write-Output "WhatIf: wuerde '$RuleName' fuer TCP $($Ports -join ',') aus $MeshSubnet anlegen und uebrige Inbound-Regeln dieses Builds entfernen."
  return
}

if (Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -Name $RuleName
}
New-NetFirewallRule -Name $RuleName `
  -DisplayName 'llama-server bge (wg-mesh only)' `
  -Direction Inbound -Action Allow -Protocol TCP `
  -LocalPort $Ports -RemoteAddress $MeshSubnet -Program $Program `
  -Profile Any -Enabled True | Out-Null
Write-Output "angelegt: $RuleName (TCP $($Ports -join ','), remote=$MeshSubnet)"

Get-RulesForProgram | Where-Object { $_.Name -ne $RuleName } | ForEach-Object {
  Write-Output ("entferne weiter gefasste Altregel: {0} ({1})" -f $_.DisplayName, $_.Name)
  Remove-NetFirewallRule -Name $_.Name
}

Write-Output '=== NACHHER ==='
Get-RulesForProgram | ForEach-Object {
  $a = $_ | Get-NetFirewallAddressFilter
  $p = $_ | Get-NetFirewallPortFilter
  '{0} | {1} | remote={2} | {3}/{4}' -f `
    $_.DisplayName, $_.Action, ($a.RemoteAddress -join ','), $p.Protocol, ($p.LocalPort -join ',')
}
