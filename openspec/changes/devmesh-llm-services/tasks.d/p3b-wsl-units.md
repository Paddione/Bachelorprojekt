<!-- Partial p3b-wsl-units — target_files: scripts/mcp-gateway/mcp-gateway.service, scripts/mcp-gateway/devmesh-forward.service, scripts/mcp-gateway/mcp-gateway-watchdog.service, scripts/mcp-gateway/mcp-gateway-watchdog.timer, scripts/mcp-gateway/watchdog-check.sh, scripts/mcp-gateway/probe.sh, scripts/mcp-gateway/start-mcp-unified.sh, scripts/bge-mcp/check-client-env.sh, scripts/dev-host-units/install.sh, scripts/dev-host-units/uninstall.sh, scripts/dev-host-units/README.md, Taskfile.yml, taskfiles/Taskfile.agents.yml, taskfiles/Taskfile.llm.yml, scripts/bge-mcp/bge-mcp.service (delete), scripts/bge-mcp/bge-forward-embed.service (delete), scripts/bge-mcp/bge-forward-rerank.service (delete), scripts/llm-proxy/llm-proxy.service (delete), scripts/llm-proxy/llm-proxy-lan.service (delete), scripts/mcp-gateway/mcp-postgres-local.service (delete), scripts/mcp-gateway/k3d-postgres-forward.service (delete) -->

## Partial P3b: WSL-Forwards, Watchdog, Taskfiles und Unit-Rückbau

**Rolle:** impl. **depends_on:** `p2-supervisor-fleet`.

**Ziel:** Auf WSL-Hosts liefern `mcp-gateway.service` (fleet 18080/13002) und die neue
`devmesh-forward.service` (devmesh 18235/13001/13005) die Loopback-Ports; die alten WSL-Units
werden gelöscht (design.md D6, D7). Windows: `tasks.d/p3a-windows.md`.
**Spec:** `specs/mcp-gateway.md` (Forward-Vertrag).

### Befunde aus der Vorab-Prüfung (Stand `c33f8cf75`)

Befunde 1–2 (13002 bleibt auf fleet, 8081/8093 entfallen ohne Ersatz) stehen in P3a.

3. **`scripts/mcp-gateway/mcp-postgres-local.mjs` bleibt bestehen**, nur die Unit wird gelöscht.
   Drei Guards starten das Modul (`mcp-postgres-multistatement.bats`,
   `mcp-postgres-readonly-role.bats`, `native-server-startup-token.bats`), der SSOT-Spec
   `openspec/specs/mcp-gateway.md` verlangt es dreimal.
   ```bash
   PRE=c33f8cf75
   git grep -l 'mcp-postgres-local.mjs' "$PRE" -- tests openspec/specs | wc -l   # erwartet 4
   ```
4. **Weitere Referenzen auf die gelöschten Units:** `scripts/dev-host-units/{install.sh,uninstall.sh,README.md}`
   (llm-proxy-lan), `scripts/llm/start-gemma-server.ps1:449` (P3a),
   `scripts/bge-mcp/check-client-env.sh:78` und ein Kommentar in `Taskfile.yml:2130`. Stehen bleibt
   nur der historische Kommentar in `scripts/semantic-code-search/pgvector-forward.service:11`;
   `components/website/src/lib/bge-router.ts:35` liegt außerhalb dieses Partials.
   ```bash
   PRE=c33f8cf75
   git grep -n -E 'bge-mcp\.service|bge-forward-(embed|rerank)|llm-proxy(-lan)?\.service|k3d-postgres-forward|mcp-postgres-local\.service' "$PRE" -- scripts Taskfile.yml taskfiles ':!scripts/*/*.service' | wc -l   # Anker: > 0
   ```
5. **Taskfile-Aufräumung.** `taskfiles/Taskfile.llm.yml` verliert `proxy:install-service`,
   `proxy:uninstall-service` und `proxy:service-status` (hängen an `llm-proxy.service`).
   `proxy:start|stop|status|logs` bleiben (starten `node` ohne Unit; genutzt von
   `Taskfile.sdlc.yml`, geprüft von `tests/spec/sdlc-isolation/{sdlc-up-command,llm-up-health}.bats`).
   `taskfiles/Taskfile.agents.yml` gehört ausschließlich P3b, inklusive der früher in P2.4
   geplanten `mcp-gateway:*`-Tasks. `taskfiles/Taskfile.devmesh.yml` gehört P1b.

### File Structure (dieses Partial)

S1: `.service`, `.timer`, `.yml`, `.md` sind ungated und nicht gebaselined; `.sh` hat das statische
Limit 800 (Budget = 800 − Ist). S4-Globs (`scripts/*.sh`, `scripts/*.mjs`) treffen kein Ziel.

| Datei | Aktion | Ist | S1-Budget |
|---|---|---|---|
| `scripts/mcp-gateway/mcp-gateway.service` | Header + ExecStart | 26 | ungated |
| `scripts/mcp-gateway/devmesh-forward.service` | Neu | 0 | ungated, Ziel ca. 30 |
| `scripts/mcp-gateway/mcp-gateway-watchdog.{service,timer}` | Header | 28/22 | ungated |
| `scripts/mcp-gateway/watchdog-check.sh` | devmesh-Kette | 82 | 718 |
| `scripts/mcp-gateway/probe.sh` | Kommentar | 99 | 701 |
| `scripts/mcp-gateway/start-mcp-unified.sh` | devmesh-Forward | 295 | 505 |
| `scripts/bge-mcp/check-client-env.sh` | Hinweistext | 114 | 686 |
| `scripts/dev-host-units/install.sh` / `uninstall.sh` | llm-proxy-lan raus | 47/15 | 753/785 |
| `scripts/dev-host-units/README.md` | Tabellenzeile + Absatz | 43 | ungated |
| `Taskfile.yml` | zwei `desc`, ein Kommentar | 5598 | ungated, netto 0 |
| `taskfiles/Taskfile.agents.yml` | bge-Units → devmesh-forward | 564 | ungated |
| `taskfiles/Taskfile.llm.yml` | drei Tasks löschen | 307 | ungated, ca. −100 |
| sieben WSL-Units (Liste in P3b.5) | löschen | – | – |

```bash
PRE=c33f8cf75
yq '.s1.limits' docs/code-quality/gates.yaml; grep -n -A8 '^s4:' docs/code-quality/gates.yaml
for f in scripts/mcp-gateway/{watchdog-check,probe,start-mcp-unified}.sh scripts/bge-mcp/check-client-env.sh \
         scripts/dev-host-units/{install,uninstall}.sh; do
  echo "$f $(wc -l < "$f") $(jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json)"
done
```

### Interfaces

- **Consumes (P1b/P2):** Service `llm-services` im Namespace `workspace` des Contexts `devmesh`
  mit den Ports 18235, 13001 und 13005, Pod-Label `app=llm-services` (Watchdog-Selektor; bei
  Abweichung wird `watchdog-check.sh` angeglichen, nicht das Manifest).
- **Consumes (fleet):** `svc/dev-pod` in `workspace-dev` mit 8080 (mcp-kubernetes) und 3002 (github).
- **Produces:** Loopback-Ports 18080, 13002, 18235, 13001 und 13005 über
  `mcp-gateway.service` + `devmesh-forward.service`. Pro Host liefert genau ein Mechanismus sie:
  WSL (dieses Partial) oder Windows (P3a).

**Gemeinsamer Prüfbefehl** (in den Tasks referenziert als `UNIT-CHECK`):

```bash
# UNIT-CHECK <datei>...: systemd-Syntax (Warnungen zu fehlenden Binaries sind zulaessig, Syntaxfehler nicht)
unit_check() { for f in "$@"; do systemd-analyze --user verify "$f" 2>&1 | grep -viE 'not executable|No such file' || true; done; }
```

---

### Task P3b.1: WSL-Units: `devmesh-forward.service` neu, `mcp-gateway.service` nur noch fleet

**Files:** Create `scripts/mcp-gateway/devmesh-forward.service`. Modify
`scripts/mcp-gateway/mcp-gateway.service`.

- [x] **Schritt 1: `devmesh-forward.service` anlegen**

```ini
# scripts/mcp-gateway/devmesh-forward.service
# T900191 - systemd USER service. Long-running `kubectl port-forward` auf
# svc/llm-services im devmesh-Cluster (Namespace workspace):
#   llm-proxy     127.0.0.1:18235
#   mcp-postgres  127.0.0.1:13001
#   bge-mcp       127.0.0.1:13005
# Die drei Dienste laufen seit T900191 ausschliesslich im devmesh-Pod llm-services.
#
# WARUM EINE EIGENE UNIT: kubectl port-forward bindet an einen Pod und endet bei
# dessen Neustart. Als eigene Unit greift Restart=always genau auf diesen Prozess
# (Muster T002604). mcp-gateway.service haelt parallel den fleet-Forward (18080, 13002).
#
# AUSSCHLUSS: nicht parallel zu scripts/mcp-gateway/start-windows.ps1 betreiben.
# Mit networkingMode=mirrored teilen Windows und WSL den Loopback; der zweite
# Forward scheitert mit "address already in use".
#
# Installation: task agents:mcp:install, oder manuell:
#   systemctl --user link "$PWD/scripts/mcp-gateway/devmesh-forward.service"
#   systemctl --user enable --now devmesh-forward.service
# Liveness: mcp-gateway-watchdog.timer (Probe 13001, Neustart dieser Unit).
[Unit]
Description=Port-forward devmesh llm-services (llm-proxy :18235, mcp-postgres :13001, bge-mcp :13005)
Documentation=file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md
After=network-online.target
# Kein Ratenlimit-Abbruch: bei einem Rollout endet der Forward mehrfach in kurzer Folge.
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=/usr/local/bin/kubectl --context devmesh port-forward -n workspace svc/llm-services 18235:18235 13001:13001 13005:13005
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

- [x] **Schritt 2: `mcp-gateway.service` anpassen.** Die Kopfzeilen 1–12 ("Toter Zustand") werden ersetzt.

```ini
# scripts/mcp-gateway/mcp-gateway.service
# mcp-gateway - systemd USER service. Long-running `kubectl port-forward` auf
# svc/dev-pod (fleet, Namespace workspace-dev) [T900107]:
#   mcp-kubernetes 127.0.0.1:18080, github 127.0.0.1:13002.
# [T900191] 13001 (mcp-postgres) und 18235 (llm-proxy) kommen nicht mehr aus
# fleet, sondern aus devmesh ueber devmesh-forward.service.
#
# AUSSCHLUSS: nicht parallel zu scripts/mcp-gateway/start-windows.ps1 betreiben
# (networkingMode=mirrored, gemeinsamer Loopback, "address already in use").
# Installiert via `task agents:mcp-gateway:install` (Symlink nach ~/.config/systemd/user/).
```

`Description` und `ExecStart`:

```ini
Description=MCP gateway port-forward fleet dev-pod (mcp-kubernetes :18080, github :13002)
ExecStart=/usr/local/bin/kubectl --context fleet port-forward -n workspace-dev svc/dev-pod 18080:8080 13002:3002
```

- [x] **Schritt 3: Prüfen**

```bash
unit_check scripts/mcp-gateway/devmesh-forward.service scripts/mcp-gateway/mcp-gateway.service
grep -c 'svc/llm-services 18235:18235 13001:13001 13005:13005' scripts/mcp-gateway/devmesh-forward.service   # 1
grep -n -E '13001|18235' scripts/mcp-gateway/mcp-gateway.service | grep -v '^[0-9]*:#'; echo "rc=$?"          # rc=1
```

### Task P3b.2: Watchdog-Kette auf devmesh-forward umstellen

**Files:** Modify `scripts/mcp-gateway/watchdog-check.sh`, `scripts/mcp-gateway/probe.sh`,
`scripts/mcp-gateway/mcp-gateway-watchdog.service`, `scripts/mcp-gateway/mcp-gateway-watchdog.timer`.

- [x] **Schritt 1: `watchdog-check.sh`.** Kopfkommentar, Zeilen 8–11:

```bash
# Zwei Ketten werden getrennt geprueft:
#   - Gateway-Kette:  18080 → mcp-gateway.service (fleet dev-pod)
#   - devmesh-Kette:  13001 → devmesh-forward.service (devmesh llm-services, T900191)
#     Derselbe kubectl-Prozess traegt auch 18235 und 13005; 13001 steht stellvertretend.
```

Der Postgres-Zweig (Zeilen 66–76) wird ersetzt. Die Variable `postgres_failed` heißt künftig
`devmesh_failed`, auch in den Zeilen 28, 33–35 und 37:

```bash
if [ "$devmesh_failed" -eq 1 ]; then
  phase=$(kubectl --context devmesh -n workspace get pod -l app=llm-services \
    -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)
  if [ "$phase" = "Running" ]; then
    echo "RESTART devmesh-forward.service (Probe 13001 fehlgeschlagen, Pod Running)"
    systemctl --user restart devmesh-forward.service
    restarted=1
  else
    echo "SKIP devmesh-Restart: llm-services-Pod nicht Running (phase='${phase}')"
  fi
fi
```

- [x] **Schritt 2: `probe.sh`.** Zeilen 20–22:

```bash
# T002767/T006996/T900191: nur die verdrahteten Endpoints pruefen. 18080 = fleet-forward
# (mcp-kubernetes, mcp-gateway.service), 13001 = mcp-postgres im devmesh-Pod
# llm-services (devmesh-forward.service).
```

- [x] **Schritt 3: Watchdog-Unit und Timer.** In beiden Dateien werden die Kopfzeilen 1–5
  ("Toter Zustand … Pendant-Lücke") durch diese Zeilen ersetzt:

```ini
# Bewacht mcp-gateway.service (fleet) und devmesh-forward.service (devmesh) auf
# WSL-Hosts. Auf Windows-Hosts nicht installieren: dort startet start-windows.ps1
# beendete Forwards selbst neu (T900191).
```

In der `.service` wird außerdem Zeile 23 angepasst:

```ini
After=mcp-gateway.service devmesh-forward.service
```

- [x] **Schritt 4: Prüfen**

```bash
bash -n scripts/mcp-gateway/watchdog-check.sh scripts/mcp-gateway/probe.sh && echo syntax-ok
unit_check scripts/mcp-gateway/mcp-gateway-watchdog.service scripts/mcp-gateway/mcp-gateway-watchdog.timer
grep -n -E 'k3d-postgres-forward|mcp-postgres-local|postgres_failed' scripts/mcp-gateway/watchdog-check.sh scripts/mcp-gateway/probe.sh; echo "rc=$?"   # rc=1
bash scripts/mcp-gateway/probe.sh --help | head -1                                   # Usage: probe.sh ...
```

### Task P3b.3: `start-mcp-unified.sh`: devmesh-Forward statt lokalem bge-Shim

**Files:** Modify `scripts/mcp-gateway/start-mcp-unified.sh`.

- [x] **Schritt 1: Kopfkommentar** (Zeilen 5–20):

```bash
# Starts the three MCP infrastructure components the local clients depend on:
#   1. mcp-gateway      (kubectl port-forward fleet dev-pod → :18080 mcp-kubernetes, :13002 github)
#   2. devmesh-forward  (kubectl port-forward devmesh llm-services → :18235 llm-proxy,
#                        :13001 mcp-postgres, :13005 bge-mcp) [T900191]
#   3. factory-mcp      (Node.js stdlib → factory-mcp-node :13003)
# Not together with scripts/mcp-gateway/start-windows.ps1 (shared loopback under
# networkingMode=mirrored → "address already in use").
#
# PID files (all under /tmp):
#   /tmp/mcp-gateway.pid      — fleet port-forward
#   /tmp/devmesh-forward.pid  — devmesh port-forward
#   /tmp/factory-mcp.pid      — factory-mcp-node server
```

- [x] **Schritt 2: `stop_process`.** Im `case` wird `bge-mcp) hex_port=… 13005` durch
  `devmesh-forward) hex_port=$(printf '%04X' 18235) ;;` ersetzt.

- [x] **Schritt 3: `start_gateway`.** Es gibt künftig zwei Forwards. `start_bge` wird gelöscht:

```bash
start_gateway() {
  echo "  [1/3] mcp-gateway (fleet port-forward) ..."
  if is_running "mcp-gateway"; then
    echo "    already running (PID $(cat "$(pid_file mcp-gateway)"))"
    return 0
  fi
  nohup kubectl --context fleet port-forward -n workspace-dev svc/dev-pod \
    18080:8080 13002:3002 \
    > /tmp/mcp-gateway.log 2>&1 &
  echo $! > "$(pid_file mcp-gateway)"
  wait_for_port 18080 30
  if port_in_use 18080; then
    echo "    started (PID $(cat "$(pid_file mcp-gateway)")) — :18080 :13002"
  else
    echo "    FAILED — port-forward may not have opened :18080 (check kubectl/fleet context)"
    return 1
  fi
}

start_devmesh() {
  echo "  [2/3] devmesh-forward (devmesh llm-services) ..."
  if is_running "devmesh-forward"; then
    echo "    already running (PID $(cat "$(pid_file devmesh-forward)"))"
    return 0
  fi
  nohup kubectl --context devmesh port-forward -n workspace svc/llm-services \
    18235:18235 13001:13001 13005:13005 \
    > /tmp/devmesh-forward.log 2>&1 &
  echo $! > "$(pid_file devmesh-forward)"
  wait_for_port 18235 30
  if port_in_use 18235; then
    echo "    started (PID $(cat "$(pid_file devmesh-forward)")) — :18235 :13001 :13005"
  else
    echo "    FAILED — check /tmp/devmesh-forward.log (kubectl/devmesh context, svc/llm-services)"
    return 1
  fi
}
```

In `start_factory` wird `[2/3]` zu `[3/3]`.

- [x] **Schritt 4: `main`.** In `start` wird `start_bge` durch `start_devmesh` vor `start_factory`
  ersetzt. `stop` bekommt die Liste `mcp-gateway devmesh-forward factory-mcp`. Das `status`-Label
  von 13005 wird zu `bge-mcp (devmesh) (:13005)`.

- [x] **Schritt 5: Prüfen**

```bash
bash -n scripts/mcp-gateway/start-mcp-unified.sh && echo syntax-ok
grep -n -E 'start_bge|bge-mcp/server\.mjs|13001:3001|18235:18235 *\\?$' scripts/mcp-gateway/start-mcp-unified.sh | grep -v 'llm-services'; echo "rc=$?"   # rc=1
bash scripts/mcp-gateway/start-mcp-unified.sh bogus; echo "rc=$?"                 # Usage-Zeile, rc=1
```

### Task P3b.4: Hinweistext in `scripts/bge-mcp/check-client-env.sh`

- [x] **Schritt 1:** Zeile 78:

```bash
  echo "Fix: bge-mcp laeuft im devmesh-Pod llm-services. Forward starten: systemctl --user start devmesh-forward.service (WSL) bzw. task mcp:start-windows (Windows)."
```

- [x] **Schritt 2: Prüfen**

```bash
bash -n scripts/bge-mcp/check-client-env.sh && echo syntax-ok
BGE_MCP_CLIENT_ENV_FILE=/nonexistent bash scripts/bge-mcp/check-client-env.sh; echo "rc=$?"   # FAIL ... rc=1
```

### Task P3b.5: Unit-Dateien löschen, dev-host-units bereinigen

**Files:** Delete die sieben Units aus der File Structure. Modify
`scripts/dev-host-units/install.sh`, `scripts/dev-host-units/uninstall.sh` und
`scripts/dev-host-units/README.md`.

- [x] **Schritt 1: Löschen**

```bash
git rm scripts/bge-mcp/{bge-mcp,bge-forward-embed,bge-forward-rerank}.service \
       scripts/llm-proxy/{llm-proxy,llm-proxy-lan}.service \
       scripts/mcp-gateway/{mcp-postgres-local,k3d-postgres-forward}.service
```

`scripts/mcp-gateway/mcp-postgres-local.mjs` bleibt bestehen (Befund 3).

- [x] **Schritt 2: `install.sh`.** Die Kopfzeile 4 und der Block "User-Unit: LAN-Bruecke zum
  LLM-Proxy" (Zeilen 31–47) werden gelöscht. Neue Kopfzeile 4:

```bash
# llm-proxy-lan.service ist mit T900191 entfallen: der Proxy laeuft im devmesh-Pod llm-services.
```

- [x] **Schritt 3: `uninstall.sh`.** Die Zeilen 11–13 werden ersetzt. Die alte Unit wird weiter
  abgeräumt, damit Hosts mit Altinstallation sauber werden:

```bash
# Altlast bis T900191: llm-proxy-lan.service (Unit-Datei im Repo geloescht).
systemctl --user disable --now llm-proxy-lan.service 2>/dev/null || true
rm -f "$UNIT_DIR/llm-proxy-lan.service"
systemctl --user daemon-reload 2>/dev/null || true
```

- [x] **Schritt 4: `README.md`.** Die Tabellenzeile `../llm-proxy/llm-proxy-lan.service` und der
  Absatz "Schon vorher repotrackt (Mustergeber) …" werden gelöscht. Darunter kommt:

```markdown
Seit T900191 entfallen: `llm-proxy-lan.service`, `k3d-postgres-forward.service` und
`mcp-postgres-local.service`. llm-proxy und mcp-postgres laufen im devmesh-Pod `llm-services`,
lokal erreichbar über `scripts/mcp-gateway/devmesh-forward.service`.
```

- [x] **Schritt 5: Prüfen**

```bash
bash -n scripts/dev-host-units/install.sh scripts/dev-host-units/uninstall.sh && echo syntax-ok
git grep -n -E 'bge-mcp\.service|bge-forward-(embed|rerank)|llm-proxy(-lan)?\.service|k3d-postgres-forward|mcp-postgres-local\.service' \
  -- scripts Taskfile.yml taskfiles ':!scripts/semantic-code-search/pgvector-forward.service' ':!scripts/migrations' | grep -v -E 'Altlast|entfallen|T900191'
echo "rc=$?"   # rc=1 nach P3b.6; Anker vorher: > 0 Treffer (Befund 4)
```

### Task P3b.6: Taskfile-Einträge umstellen

**Files:** Modify `Taskfile.yml`, `taskfiles/Taskfile.agents.yml`, `taskfiles/Taskfile.llm.yml`.

- [x] **Schritt 1: `Taskfile.yml`**, netto zeilenneutral:

```yaml
  mcp:start-windows:
    desc: "T900039/T900191: Windows-Pendant zu mcp-gateway.service + devmesh-forward.service — Port-Forwards fleet (18080, 13002) und devmesh (18235, 13001, 13005); schliesst den WSL-Mechanismus aus"
```

```yaml
  mcp:autostart:register:
    desc: "T900040: start-windows.ps1 als Autostart-Task registrieren (onlogon) — Windows-Pendant zu 'systemctl --user enable' von mcp-gateway/devmesh-forward"
```

Zeile 2130:

```yaml
      # Enable the systemd port-forward unit (pattern T002604, wie devmesh-forward.service).
```

- [x] **Schritt 2: `taskfiles/Taskfile.agents.yml`.** Kommentar über `mcp:start` (Zeilen 270–272):

```yaml
  # Alternative zu start-windows.ps1 fuer WSL ohne systemd. Startet den fleet-Forward,
  # den devmesh-Forward (llm-services) und factory-mcp-node mit PID-Files.
  # Nicht zusammen mit start-windows.ps1 betreiben (gemeinsamer Loopback).
```

`mcp:start.desc`:

```yaml
    desc: "Start fleet + devmesh port-forwards and factory-mcp (no systemd) — not together with start-windows.ps1"
```

In `mcp:install` und `mcp:uninstall` entfällt der Shell-Block mit den bge-Units ersatzlos.
`devmesh-forward.service` verwalten nur `mcp-gateway:install|uninstall` (Schritt 2b).

In `mcp:service-status` wird die Schleife zu
`for svc in factory-mcp mcp-gateway devmesh-forward; do`.

- [x] **Schritt 2b: `agents:mcp-gateway:*` auf zwei Forwards umstellen.** PID-Datei des
  devmesh-Forwards ist `/tmp/devmesh-forward.pid` wie in P3b.3, damit kein Startweg doppelt startet.

  Kommentar über dem Block (Zeilen 117–119):

```yaml
  # ── mcp-gateway — kubectl port-forwards [T900107, T900191] ──────────────
  # fleet svc/dev-pod: mcp-kubernetes (:18080), github (:13002).
  # devmesh svc/llm-services: llm-proxy (:18235), mcp-postgres (:13001), bge-mcp (:13005).
  # Nicht zusammen mit start-windows.ps1 betreiben (gemeinsamer Loopback).
```

  `mcp-gateway:start`, der Inhalt von `bash -c '…'`:

```bash
          set -euo pipefail
          PIDFILE=/tmp/mcp-gateway.pid
          DM_PIDFILE=/tmp/devmesh-forward.pid
          if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "mcp-gateway (fleet) already running (PID $(cat "$PIDFILE"))"
          else
            nohup kubectl --context fleet port-forward -n workspace-dev svc/dev-pod \
              18080:8080 13002:3002 > /tmp/mcp-gateway.log 2>&1 &
            echo $! > "$PIDFILE"
            echo "mcp-gateway (fleet) started (PID $(cat "$PIDFILE"))"
          fi
          if [[ -f "$DM_PIDFILE" ]] && kill -0 "$(cat "$DM_PIDFILE")" 2>/dev/null; then
            echo "devmesh-forward already running (PID $(cat "$DM_PIDFILE"))"
          else
            nohup kubectl --context devmesh port-forward -n workspace svc/llm-services \
              18235:18235 13001:13001 13005:13005 > /tmp/devmesh-forward.log 2>&1 &
            echo $! > "$DM_PIDFILE"
            echo "devmesh-forward started (PID $(cat "$DM_PIDFILE"))"
          fi
```

  `mcp-gateway:stop` beendet beide PID-Dateien in einer Schleife und behält das bestehende
  `kill -0`-Muster bei:

```bash
          for PIDFILE in /tmp/mcp-gateway.pid /tmp/devmesh-forward.pid; do
            name=$(basename "$PIDFILE" .pid)
            if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
              kill "$(cat "$PIDFILE")"
              echo "$name stopped"
            else
              echo "$name not running"
            fi
            rm -f "$PIDFILE"
          done
```

  `mcp-gateway:status` prüft zusätzlich 13005 (Token aus `$HOME/.config/bge-mcp/server.env`,
  Muster des 13001-Zweigs), alle drei Ports müssen `200` liefern. `desc`:
  `"Health-check mcp-kubernetes (:18080, fleet), mcp-postgres (:13001) and bge-mcp (:13005, devmesh)"`.

```bash
          [ -f "$HOME/.config/bge-mcp/server.env" ] && source "$HOME/.config/bge-mcp/server.env" 2>/dev/null || true
          # in probe(), nach dem 13001-Zweig:
            if [[ "$1" == *"13005"* && -n "${BGE_MCP_TOKEN:-}" ]]; then
              auth=(-H "Authorization: Bearer $BGE_MCP_TOKEN")
            fi
          # nach pg_code:
          bge_code=$(probe http://localhost:13005/mcp || echo "000")
          echo "bge-mcp        (:13005): HTTP $bge_code"
          [[ "$k8s_code" == "200" && "$pg_code" == "200" && "$bge_code" == "200" ]]
```

  `mcp-gateway:install`: Nach dem bestehenden `pkill … svc/dev-pod` werden auch manuell
  gestartete devmesh-Forwards beendet. Danach wird die zweite Unit verlinkt und aktiviert:

```bash
        DM_PIDFILE=/tmp/devmesh-forward.pid
        if [[ -f "$DM_PIDFILE" ]] && kill -0 "$(cat "$DM_PIDFILE")" 2>/dev/null; then
          kill "$(cat "$DM_PIDFILE")" && rm -f "$DM_PIDFILE"
        fi
        pkill -f 'port-forward -n workspace svc/llm-services' 2>/dev/null || true
        # ... (UNIT_DIR/SRC wie bisher)
        ln -sf "${SRC}/mcp-gateway.service" "${UNIT_DIR}/mcp-gateway.service"
        ln -sf "${SRC}/devmesh-forward.service" "${UNIT_DIR}/devmesh-forward.service"
        systemctl --user daemon-reload
        systemctl --user enable --now mcp-gateway.service devmesh-forward.service
        echo "mcp-gateway + devmesh-forward installed as systemd --user services (autostart + Restart=always)."
```

  `mcp-gateway:uninstall`:

```bash
        systemctl --user disable --now mcp-gateway.service devmesh-forward.service 2>/dev/null || true
        rm -f "${UNIT_DIR}/mcp-gateway.service" "${UNIT_DIR}/devmesh-forward.service"
```

  `mcp-gateway:service-status` zeigt beide Units:
  `systemctl --user status mcp-gateway.service devmesh-forward.service --no-pager -n 20 || true`.

  `mcp:install` und `mcp:uninstall` rufen damit nur noch die `factory-mcp:*`- und
  `mcp-gateway:*`-Tasks auf. Wie im bestehenden Muster der Datei wird `ln -sf` verwendet, nicht
  `systemctl --user link`.

- [x] **Schritt 3: `taskfiles/Taskfile.llm.yml`.** Gelöscht werden der Kommentarblock
  "llm-proxy als systemd USER service (T002277)" und die Tasks `proxy:install-service`,
  `proxy:uninstall-service` und `proxy:service-status` (heute Zeilen 164–263, bis vor
  `routing:check`). Der Kommentar in `proxy:start` (Zeilen 110–112) wird angepasst:

```yaml
          # T002277: das PID-File kennt nur die nohup-Instanz. Haelt der devmesh-Forward
          # (devmesh-forward.service, T900191) den Port, ist er belegt, aber
          # kein PID-File da - der Start unten wuerde mit EADDRINUSE sterben und ein
```

Zeile 120:

```yaml
            echo "llm-proxy already answering on :$PORT (devmesh-forward? -> systemctl --user status devmesh-forward)"
```

- [x] **Schritt 4: Prüfen**

```bash
task --list-all 2>/dev/null | grep -E 'llm:proxy:(install-service|uninstall-service|service-status)'; echo "rc=$?"   # rc=1
task --list-all 2>/dev/null | grep -c -E 'llm:proxy:(start|stop|status|logs)'                                      # 4
task --dry agents:mcp:install 2>&1 | grep -c 'devmesh-forward.service'                                              # >= 1
yq '.' taskfiles/Taskfile.llm.yml taskfiles/Taskfile.agents.yml >/dev/null && echo yaml-ok
git grep -n -E 'bge-forward|bge-mcp\.service|llm-proxy\.service' -- Taskfile.yml taskfiles; echo "rc=$?"          # rc=1
grep -n -A1 'svc/dev-pod' taskfiles/Taskfile.agents.yml | grep -c -E '18235|13001:3001'                              # 0 (vorher 1)
grep -c 'svc/llm-services' taskfiles/Taskfile.agents.yml                                                             # >= 2 (start + pkill)
grep -c 'devmesh-forward.service' taskfiles/Taskfile.agents.yml                                                      # >= 3
```

### Task P3b.7: Operator-Checkliste WSL-Host (manuell, nicht automatisiert)

Läuft nach dem Merge, sobald P1b/P2 in devmesh deployt sind. Pro Host gilt **entweder** dieser
Block **oder** der Windows-Block aus P3a.4.

- [ ] Alte Units abschalten:
  `systemctl --user disable --now llm-proxy.service llm-proxy-lan.service bge-mcp.service bge-forward-embed.service bge-forward-rerank.service mcp-postgres-local.service k3d-postgres-forward.service`
- [ ] Verwaiste Symlinks entfernen: `find ~/.config/systemd/user -xtype l -print -delete`,
  danach `systemctl --user daemon-reload`.
- [ ] `mcp-gateway.service` neu laden: `systemctl --user restart mcp-gateway.service`.
- [ ] Neue Unit: `systemctl --user link "$HOME/Bachelorprojekt/scripts/mcp-gateway/devmesh-forward.service"`
  und `systemctl --user enable --now devmesh-forward.service`.
- [ ] Nachweis: `bash scripts/mcp-gateway/probe.sh --port 18080 --port 13001` liefert zwei
  `OK`-Zeilen, `bash scripts/bge-mcp/check-client-env.sh` endet mit rc=0 und
  `curl -fsS http://127.0.0.1:18235/livez` antwortet.

### Task P3b.8: Partial-Verifikation

- [x] **Schritt 1: Alle Prüfungen des Partials**

```bash
for f in scripts/mcp-gateway/{watchdog-check,probe,start-mcp-unified}.sh scripts/bge-mcp/check-client-env.sh \
         scripts/dev-host-units/{install,uninstall}.sh; do bash -n "$f" || echo "FAIL syntax: $f"; done
unit_check scripts/mcp-gateway/devmesh-forward.service scripts/mcp-gateway/mcp-gateway.service \
           scripts/mcp-gateway/mcp-gateway-watchdog.service scripts/mcp-gateway/mcp-gateway-watchdog.timer
for f in scripts/bge-mcp/{bge-mcp,bge-forward-embed,bge-forward-rerank}.service scripts/llm-proxy/{llm-proxy,llm-proxy-lan}.service \
         scripts/mcp-gateway/{mcp-postgres-local,k3d-postgres-forward}.service; do
  [ ! -e "$f" ] || echo "FAIL noch vorhanden: $f"
done
test -f scripts/mcp-gateway/mcp-postgres-local.mjs && echo "mjs bleibt (Befund 3)"
node scripts/code-quality/check.mjs | tail -3        # 0 blocking
```

- [ ] **Schritt 2:** Bis P5b sie umstellt, sind rot: `wsl-exit-nachzug.bats`, `local-llm-proxy.bats`,
  `proxy-env-token-guard.bats`, `watchdog-tunnel-liveness.bats`, `bge-host-routing.bats` (D7).
  `task test:changed`, `task freshness:regenerate` und `task freshness:check` laufen im Final-Task
  der `tasks.md` nach P5b.
