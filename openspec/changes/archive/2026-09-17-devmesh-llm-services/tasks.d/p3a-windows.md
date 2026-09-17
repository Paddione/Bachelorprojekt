<!-- Partial p3a-windows — target_files: scripts/mcp-gateway/start-windows.ps1, scripts/mcp-gateway/register-autostart.ps1, scripts/llm/start-gemma-server.ps1 -->

## Partial P3a: Windows-Clients (start-windows, Autostart, Gemma-Hinweis)

**Rolle:** impl. **depends_on:** `p2-supervisor-fleet`. Port 13005 existiert erst, wenn der
Supervisor bge-mcp startet und der `llm-services`-Service ihn anbietet.

**Ziel:** Auf Windows-Hosts erreichen die Clients llm-proxy (18235), mcp-postgres (13001) und bge-mcp
(13005) nur noch über einen Port-Forward auf `svc/llm-services` im devmesh-Cluster, aus fleet kommen
nur noch 18080 und 13002 (design.md D6). Dazu kommt der Fix T900190 in beiden PS1-Skripten. Der
WSL-Mechanismus und der Rückbau der WSL-Units stehen in `tasks.d/p3b-wsl-units.md`.

**Spec:** `openspec/changes/devmesh-llm-services/specs/mcp-gateway.md`, Requirement "Windows hosts
have a documented start mechanism for the local MCP servers" (zwei Szenarien).

### Befunde aus der Vorab-Prüfung (Stand `c33f8cf75`)

Befunde 1 und 2 gelten auch für P3b.

1. **13002 bleibt auf fleet.** `docs/agent-guide/registry/mcp.yaml` führt `github` (3002 → 13002)
   weiter als dev-pod-Server. proposal.md nennt github ausdrücklich als Non-Goal des Umzugs.
   Der fleet-Forward lautet damit `18080:8080 13002:3002`.
2. **8081/8093 entfallen, ohne Ersatz-Forward.** Direkte Nutzer von `127.0.0.1:8081`/`:8093`:
   - `scripts/bge-mcp/bge-mcp.service` nutzt sie nicht. Die Unit setzt `LLM_EMBED_URL` und
     `LLM_RERANKER_URL` bereits auf `127.0.0.1:18235` (T003205).
   - `scripts/llm/loadouts.json` (Rollenketten `embed`/`rerank`) nutzt sie. Diese Ketten liest nur
     der Proxy, und der läuft künftig im devmesh-Pod. Dort zeigt `127.0.0.1` ohnehin nicht auf
     den Forward. Die Registry-URLs sind Sache von P2 und der Migration (P1b).
   - `scripts/index-repo.ts` nutzt `localhost:8081` als Fallback. Vorher probiert es
     `LLM_EMBED_URL` und danach Cluster-DNS. Der Fallback wird von
     `tests/spec/llm-pipeline/index-repo-embed-port.bats` festgehalten, der bestehen bleibt (kein P5a/P5b-Ziel).
   - `scripts/knowledge/kalibrierung-retrieval.mjs` ist ein manuelles Kalibrierskript. Seine
     Defaults lassen sich per Env überschreiben.

   Entscheidung: Beide Forwards entfallen. Kein Dauer-Client braucht sie. Die zwei
   Ad-hoc-Werkzeuge erreichen bge über `LLM_EMBED_URL=http://127.0.0.1:18235`, weil
   `scripts/llm-proxy/bge-routes.mjs` die Routen `/v1/embeddings` und `/v1/rerank` bedient.
   Messbefehl:
   ```bash
   PRE=c33f8cf75
   git grep -n -E '127\.0\.0\.1:(8081|8093)|localhost:(8081|8093)' "$PRE" -- scripts .mcp.json .opencode docs/agent-guide/registry/mcp.yaml | wc -l   # Anker: > 0
   git grep -n -E "\['/v1/(embeddings|rerank)'" "$PRE" -- scripts/llm-proxy/bge-routes.mjs                      # 2 Treffer
   ```
3. **Hinweistext in `scripts/llm/start-gemma-server.ps1:449`** nennt `systemctl --user start
   llm-proxy`, eine Unit, die P3b löscht (Messbefehl in P3b, Befund 4).

### File Structure (dieses Partial)

S1: `.ps1` steht nicht in `s1.limits`, die Dateien sind ungated und nicht gebaselined
(`yq '.s1.limits' docs/code-quality/gates.yaml`). S4 greift nicht (Globs `scripts/*.sh`, `scripts/*.mjs`).

| Datei | Aktion | Ist | S1 |
|---|---|---|---|
| `scripts/mcp-gateway/start-windows.ps1` | Neu schreiben | 137 | ungated, Ziel < 130 |
| `scripts/mcp-gateway/register-autostart.ps1` | T900190-Fix, Token-Warnung raus | 94 | ungated |
| `scripts/llm/start-gemma-server.ps1` | Hinweiszeile 449 | 463 | ungated, netto 0 |

### Interfaces

- **Consumes (P1b/P2):** Service `llm-services` im Namespace `workspace` des Contexts `devmesh`
  mit den Ports 18235, 13001 und 13005 (design.md Datenfluss).
- **Consumes (fleet):** `svc/dev-pod` in `workspace-dev` mit 8080 (mcp-kubernetes) und 3002 (github).
- **Produces:** Loopback-Ports 18080, 13002, 18235, 13001 und 13005 über `start-windows.ps1`. Pro
  Host liefert genau ein Mechanismus sie: Windows (dieses Partial) oder WSL (P3b).
- **Vertrag für den P5a-Guard `tests/spec/mcp-gateway/start-windows-unc.bats`:** Beide PS1-Skripte
  enthalten `.ProviderPath` und kein `)).Path`.

**Konventionen PS1 (`scripts/llm/CLAUDE.md`):** reines ASCII, kein BOM, keine Umlaute und kein
Gedankenstrich. Vor dem Abschluss läuft ein Parser-Check. `start-windows.ps1` enthält heute ein
Nicht-ASCII-Zeichen (Zeile 47, Gedankenstrich), das mit dem Neuschreiben verschwindet.

**Gemeinsame Prüfbefehle** (in den Tasks referenziert als `PS1-CHECK`):

```bash
# PS1-CHECK <datei>...: ASCII, kein BOM, Parser fehlerfrei (Windows-PowerShell 5.1 aus WSL)
ps1_check() {
  for f in "$@"; do
    if LC_ALL=C grep -nP '[^\x00-\x7F]' "$f"; then echo "FAIL non-ascii: $f"; return 1; fi
    [ "$(head -c3 "$f" | od -An -tx1 | tr -d ' ')" != "efbbbf" ] || { echo "FAIL BOM: $f"; return 1; }
    w=$(wslpath -w "$f")
    powershell.exe -NoProfile -Command "\$t=\$null; \$e=\$null; [void][System.Management.Automation.Language.Parser]::ParseFile('$w',[ref]\$t,[ref]\$e); if (\$e) { \$e | ForEach-Object { \$_.ToString() }; exit 1 }; 'parse ok: $f'" || return 1
  done
}
```

---

### Task P3a.1: Fix T900190 (`.ProviderPath`) in beiden PS1-Skripten

**Files:** Modify `scripts/mcp-gateway/register-autostart.ps1`, `scripts/mcp-gateway/start-windows.ps1`
(dort fließt der Fix in das Neuschreiben aus P3a.2 ein).

Reproduktion (belegt am 2026-09-16):

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '\\wsl.localhost\k3d-dev\home\patrick\Bachelorprojekt\scripts\mcp-gateway\start-windows.ps1'
# node: Cannot find module '\\wsl.localhost\...\Microsoft.PowerShell.Core\FileSystem::\wsl.localhost\...\server.mjs'
```

- [x] **Schritt 1:** `register-autostart.ps1` Zeile 63:

```powershell
# [T900190] .ProviderPath statt .Path: unter \\wsl.localhost\... liefert .Path den
# Provider-Praefix Microsoft.PowerShell.Core\FileSystem::, den schtasks und node nicht aufloesen.
if (-not $RepoRoot) { $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).ProviderPath }
```

- [x] **Schritt 2:** In `register-autostart.ps1` entfällt die Token-Vorbedingung, weil
  `start-windows.ps1` keinen lokalen Shim mehr startet. Die Kopfzeilen 3–5 und 17–19 werden
  ersetzt:

```powershell
# Windows-Pendant zu `systemctl --user enable` fuer mcp-gateway.service und
# devmesh-forward.service: dort startet systemd die Port-Forwards beim Login,
# hier der Aufgabenplaner.
```

```powershell
# Vorbedingung: kubectl mit den Kontexten fleet und devmesh. Tokens braucht der
# Autostart nicht; start-windows.ps1 startet nur Port-Forwards.
```

Der Block `$envFile = ...` bis zur zweiten `WARNUNG`-Zeile (Zeilen 71–75) wird gelöscht.

- [x] **Schritt 3: Prüfen**

```bash
grep -c 'ProviderPath' scripts/mcp-gateway/register-autostart.ps1 scripts/mcp-gateway/start-windows.ps1   # je >= 1
grep -n ')).Path' scripts/mcp-gateway/*.ps1 ; echo "rc=$?"                                                   # rc=1
w=$(wslpath -w "$PWD/scripts/mcp-gateway")
powershell.exe -NoProfile -Command "(Resolve-Path (Join-Path '$w' '..\..')).ProviderPath"
# erwartet: \\wsl.localhost\k3d-dev\...\devmesh-llm-services-T900191 ohne 'Microsoft.PowerShell.Core'
ps1_check scripts/mcp-gateway/register-autostart.ps1
```

### Task P3a.2: `start-windows.ps1` neu schreiben (reine Forwards, fleet + devmesh)

**Files:** Modify `scripts/mcp-gateway/start-windows.ps1` (ganze Datei ersetzen).

- [x] **Schritt 1: Datei ersetzen**

```powershell
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
```

Hinweis: Die Konsolenmeldung nennt die Default-Ports. Wer Parameter überschreibt, sieht dort
weiter die Defaults. Die Probe-Liste nutzt die übergebenen Werte.

- [x] **Schritt 2: Prüfen** (kein Live-Start. Das Skript würde dauerhafte Forwards öffnen und mit
  den WSL-Units kollidieren. Der Live-Nachweis steht in der Operator-Checkliste P3a.4.)

```bash
ps1_check scripts/mcp-gateway/start-windows.ps1
grep -c 'svc/llm-services' scripts/mcp-gateway/start-windows.ps1                    # 1
grep -n -E 'server\.mjs|8081|8093|BGE_MCP_TOKEN' scripts/mcp-gateway/start-windows.ps1 | grep -v '^[0-9]*:#'; echo "rc=$?"   # rc=1
wc -l scripts/mcp-gateway/start-windows.ps1                                         # < 130
```

### Task P3a.3: Hinweistext in `start-gemma-server.ps1`

**Files:** Modify `scripts/llm/start-gemma-server.ps1`.

- [x] **Schritt 1:** `start-gemma-server.ps1` Zeilen 448–449, netto zeilenneutral:

```powershell
    Write-Output "'gemma-4-12b'. Der Proxy laeuft im devmesh-Pod llm-services; lokal erreichbar"
    Write-Output "  ueber devmesh-forward.service (WSL) bzw. task mcp:start-windows (Windows)."
```

- [x] **Schritt 2: Prüfen**

```bash
ps1_check scripts/llm/start-gemma-server.ps1
grep -c 'systemctl --user start llm-proxy' scripts/llm/start-gemma-server.ps1                # 0
```

### Task P3a.4: Operator-Checkliste Windows-Host (manuell, nicht automatisiert)

Läuft nach dem Merge, sobald P1b/P2 in devmesh deployt sind
(`kubectl --context devmesh -n workspace get svc llm-services` zeigt drei Ports). Pro Host gilt
**entweder** dieser Block **oder** der WSL-Block aus P3b.7.

- [ ] Auf der WSL-Seite desselben Rechners sind `mcp-gateway.service` und
  `devmesh-forward.service` deaktiviert (`systemctl --user is-enabled …` → `disabled`).
- [ ] `task mcp:autostart:register` (bzw. PowerShell `-File scripts\mcp-gateway\register-autostart.ps1`
  aus dem Haupt-Checkout, nicht aus einem Worktree).
- [ ] Neu anmelden oder `task mcp:start-windows` einmal im Vordergrund starten und die Meldung
  `Forwards bereit` abwarten.
- [ ] Nachweis: `Test-NetConnection 127.0.0.1 -Port <p>` für 18080, 13002, 18235, 13001 und 13005
  liefert `TcpTestSucceeded : True`. Ein MCP-`initialize` gegen 13005 mit `BGE_MCP_TOKEN` wird
  beantwortet (Spec-Szenario 1).

### Task P3a.5: Partial-Verifikation

```bash
ps1_check scripts/mcp-gateway/start-windows.ps1 scripts/mcp-gateway/register-autostart.ps1 scripts/llm/start-gemma-server.ps1
grep -c 'ProviderPath' scripts/mcp-gateway/start-windows.ps1 scripts/mcp-gateway/register-autostart.ps1   # je >= 1
node scripts/code-quality/check.mjs | tail -3        # 0 blocking
```

Der Guard `start-windows-unc.bats` (P5a) wird mit diesem Partial grün. Die abschließenden Gates
`task test:changed`, `task freshness:regenerate` und `task freshness:check` laufen im Final-Task
der `tasks.md` nach P5b.
