# scripts/llm/freetoken-kv-ladder.ps1 -- Wachsender KV-Pool fuer FreeToken auf :1919.
#
# Windows-nativer Zwilling von freetoken-kv-ladder.sh (T016416, WSL-Exit).
#
# IDEE (2026-08-23): Statt statisch -NumTokens 131072 zu servieren (kostet
# dauerhaft Expert-Cache), klein starten und den KV-Pool stufig vergroessern,
# sobald eine Session tatsaechlich lang wird. Expert-Slots weichen dabei
# budget-konform -- sie sind nur LRU-Cache, die Gewichte bleiben im Host-RAM
# streambar. Kurz-Aufgaben behalten volle Decode-Geschwindigkeit, lange
# Aufgaben zahlen erst dann, wenn sie es sind.
#
# Der Client (opencode) friert limit.context beim Start ein -- deshalb gilt:
#   .opencode/agent-models.jsonc  ->  limit.context = LADDER_CEILING setzen!
# Die Stufen liegen immer UNTER der Decke, damit nie ein Request an der
# Engine-Kapazitaet scheitert ("Input sequence length exceeds").
#
# API-Kontrakt (api_server.py):
#   GET  /v1/cache/status  -> geometry: num_pages/page_size/moe_cache_size/
#                             unit_bytes/cache_budget_bytes
#   POST /v1/cache/rebuild {num_pages, moe_cache_size, mode:"if_idle"}
#                          -> wird abgelehnt, solange der Scheduler arbeitet;
#                             wir retry beim naechsten Poll.
#
# Portierungshinweise (T016416-WSL-Exit):
#   - Reines PowerShell, KEINE WSL-Abhaengigkeit. Logt auf STDOUT (Aufrufer
#     redirectet in eine Datei) statt nach /tmp/opencode.
#   - Integer-Arithmetik ueber [long], damit Bytes nicht in int32 ueberlaufen.
#   - ASCII-only (keine BOM, keine typografischen Zeichen) -- T002495-M7.
#
# Usage:
#   powershell -NoProfile -File freetoken-kv-ladder.ps1 -DryRun     # beobachten
#   powershell -NoProfile -File freetoken-kv-ladder.ps1             # aktiv
#   powershell -NoProfile -File freetoken-kv-ladder.ps1 -Once -Ceiling 131072
#
# Flags: -DryRun | -Once | -Interval S | -Ceiling T | -Threshold F | -MoeFloorFrac F
[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:1919",
    [int]$Interval = 5,
    [long]$Ceiling = 200000,
    [double]$Threshold = 0.5,
    [int]$HwmWindow = 60,
    [double]$MoeFloorFrac = 0.10,
    [switch]$DryRun,
    [switch]$Once
)

$ErrorActionPreference = "Stop"

# --- State-Snapshot: Geometrie + Einheitskosten + aktuelles Context-HWM ---
function Read-State {
    $Result = [ordered]@{
        pages = $null; page_size = 1; moe = $null; mamba_slots = $null
        kv_b = $null; moe_b = $null; mamba_b = $null; budget_b = $null
        state = $null; model = $null; ctx_seen = 0; error = $null
    }
    try {
        $St = Invoke-RestMethod -Uri "$BaseUrl/v1/cache/status" -TimeoutSec 5
    } catch {
        $Result.error = "status: $($_.Exception.Message)"
        return $Result
    }
    $G = $St.geometry
    if ($null -ne $G) {
        $U = $G.unit_bytes
        $Result.pages      = $G.num_pages
        $Result.page_size  = if ($null -eq $G.page_size) { 1 } else { $G.page_size }
        $Result.moe        = $G.moe_cache_size
        $Result.mamba_slots= $G.num_mamba_slots
        $Result.kv_b       = $U.kv_per_token
        $Result.moe_b      = $U.moe_per_expert
        $Result.mamba_b    = $U.mamba_per_slot
        $Result.budget_b   = $G.cache_budget_bytes
    }
    $Result.state = $St.state

    try {
        $Stats = Invoke-RestMethod -Uri "$BaseUrl/v1/stats" -TimeoutSec 5
        $Result.model = $Stats.model.id
    } catch { }

    # Context-HWM: Requests-Ring defensiv parsen (Feldnamen nicht fest verankert).
    try {
        $Reqs = Invoke-RestMethod -Uri "$BaseUrl/v1/requests?limit=32" -TimeoutSec 5
        $Entries = $Reqs.entries
        if ($null -eq $Entries) { $Entries = @() }
        $Vals = New-Object System.Collections.Generic.List[long]
        $hunt = {
            param($O)
            if ($O -is [System.Collections.IDictionary]) {
                foreach ($KV in $O.GetEnumerator()) {
                    $K = [string]$KV.Key
                    if ($KV.Value -is [long] -or $KV.Value -is [int] -or $KV.Value -is [double]) {
                        if ($K -match "prompt|input|context" -and $K -notmatch "total") {
                            $Vals.Add([long]$KV.Value) | Out-Null
                        }
                    } elseif ($KV.Value -is [System.Collections.IDictionary] -or $KV.Value -is [System.Collections.IEnumerable]) {
                        & $hunt $KV.Value
                    }
                }
            } elseif ($O -is [System.Collections.IEnumerable] -and -not ($O -is [string])) {
                foreach ($I in $O) { & $hunt $I }
            }
        }
        & $hunt $Entries
        if ($Vals.Count -gt 0) { $Result.ctx_seen = ($Vals | Measure-Object -Maximum).Maximum }
    } catch { }
    return $Result
}

# --- Ziel-Partition: KV auf naechste Stufe, MoE budget-konform zurueck ------
function Plan-Step {
    param($S)
    if ($S.error) {
        return @{ action = "wait"; why = $S.error }
    }
    $Ps = if ($null -eq $S.page_size -or $S.page_size -lt 1) { 1 } else { [long]$S.page_size }
    $kvNow   = [long]($S.pages) * $Ps
    $need    = [long]$S.ctx_seen -gt [long]($Threshold * $kvNow)

    $Budget = [long]$S.budget_b
    $Kb = [long]$S.kv_b; $Mb = [long]$S.moe_b; $Sb = [long]$S.mamba_b
    $Fixed = [long]$S.mamba_slots * $Sb
    $MoeMaxFit = if ($Mb -gt 0) { [math]::Max(0, [long](($Budget - $Fixed - $kvNow * $Kb) / $Mb)) } else { 0 }
    $MoeFloor = [math]::Max(1, [long]($S.moe * $MoeFloorFrac))

    if (-not $need -or $Kb -le 0 -or $Budget -le 0) {
        return @{ action = "hold"; kv_now = $kvNow; ctx_seen = $S.ctx_seen; thr_at = [long]($Threshold * $kvNow) }
    }
    # Ziel: verdoppeln, Decke respektieren, hart budget-konform.
    $Target = [math]::Min($Ceiling, $kvNow * 2)
    $Target = [math]::Min($Target, [long](($Budget - $Fixed - $MoeFloor * $Mb) / $Kb))
    if ($Target -le $kvNow) {
        return @{ action = "cap"; kv_now = $kvNow; why = "kein VRAM-Spielraum ueber Floor" }
    }
    $MoeNew = [math]::Max($MoeFloor, [math]::Min([long]$S.moe, [long](($Budget - $Fixed - $Target * $Kb) / $Mb)))
    return @{
        action = "grow"; from = $kvNow; to = $Target
        moe_from = [long]$S.moe; moe_to = $MoeNew
        frees_gb = [math]::Round((([long]$S.moe - $MoeNew) * $Mb) / 1e9, 2)
    }
}

# --- Anwenden: POST /v1/cache/rebuild ---------------------------------------
function Invoke-Rebuild {
    param([long]$NumPages, [long]$MoeCacheSize)
    if ($DryRun) {
        Write-Output "DRY-RUN wuerde setzen: num_pages=$NumPages moe=$MoeCacheSize"
        return
    }
    $Body = @{ num_pages = $NumPages; moe_cache_size = $MoeCacheSize; mode = "if_idle" } | ConvertTo-Json
    try {
        $Resp = Invoke-RestMethod -Uri "$BaseUrl/v1/cache/rebuild" -Method Post -ContentType "application/json" -Body $Body -TimeoutSec 310
        if ($Resp.status -eq "ok") {
            Write-Output "OK   Pool neu gesetzt: kv_tokens=$NumPages moe_slots=$MoeCacheSize"
        } else {
            $Err = if ($null -ne $Resp.error) { $Resp.error } else { "unbekannt" }
            Write-Output "REJECT -- Scheduler busy oder Floor verletzt; Retry naechster Poll: $Err"
        }
    } catch {
        Write-Output "REJECT (HTTP-Fehler) -- Retry naechster Poll: $($_.Exception.Message)"
    }
}

Write-Output "FreeToken KV-Ladder startet: base=$BaseUrl ceiling=$Ceiling threshold=$Threshold interval=${Interval}s dry_run=$DryRun"
Write-Output "WICHTIG: .opencode/agent-models.jsonc limit.context muss >= $Ceiling sein (Plugin liest sie beim opencode-Start)."

$OnceCap = 0
while ($true) {
    $State = Read-State
    $Plan  = Plan-Step $State
    switch ($Plan.action) {
        "grow" {
            Write-Output "WACHSTUM: ctx-HWM hat Schwelle erreicht -> kv -> $($Plan.to) (moe -> $($Plan.moe_to), gibt $($Plan.frees_gb) GB frei)"
            Invoke-Rebuild -NumPages $Plan.to -MoeCacheSize $Plan.moe_to
        }
        "cap" {
            $OnceCap = $OnceCap + 1
            if ($OnceCap -le 1) { Write-Output "GRENZE: $($Plan.why)" }
        }
        "hold" { }   # ruhig bleiben, kein Spam
        default {
            Write-Output "WARTE: $($Plan | ConvertTo-Json -Compress)"
        }
    }
    if ($Once) {
        Write-Output "ONCE: state=$($State | ConvertTo-Json -Compress)"
        Write-Output "ONCE: plan=$($Plan | ConvertTo-Json -Compress)"
        Write-Output "--once: fertig."
        break
    }
    Start-Sleep -Seconds $Interval
}
