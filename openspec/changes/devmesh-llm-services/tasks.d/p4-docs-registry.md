<!-- Partial p4-docs-registry — target_files: docs/adr/ADR-008-local-k3s-dev-mesh.md, docs/adr/ADR-007-wsl-exit-fleet-native.md, docs/runbooks/devmesh-tailnet.md, docs/agent-guide/registry/mcp.yaml, .mcp.json, .opencode/opencode.jsonc, scripts/llm/mcp-servers.json, CLAUDE.md, .claude/skills/references/mcp-tool-guide.md -->

## Partial P4: ADR, Runbook und MCP-Registry

**Ziel:** Die Dokumentation zieht den Verbleib von llm-proxy, bge-mcp und mcp-postgres in
devmesh nach — ADR-Nachtrag, Tailnet-Runbook (ACL je GPU-Port + Operator-Umzugsschritte),
MCP-Registry inkl. der von `task mcp:sync` generierten Client-Configs, und die Korrektur der
CLAUDE.md-Routing-Zeile, die den alten `mcp-postgres`-Zielort behauptet. Dieses Partial schreibt
keinen Code und keine Manifeste — alle Pfade liegen unter `docs/**`, `CLAUDE.md`,
`.claude/skills/references/**` oder sind von `mcp-sync.sh` generierte Configs.

**Spec:** Dieses Partial deckt keine eigene Requirement-Datei; es macht `local-dev-mesh.md`
("devmesh hosts the CPU-bound LLM and database services", "The GPU endpoint exposes one port
per workstation GPU service") und `local-llm-proxy.md` ("The proxy serves remote backends only")
nachvollziehbar/betreibbar, ohne sie selbst zu implementieren (das tun P1a/P1b/P2/P3a/P3b). Kein
Failing-Test-Step in diesem Partial — es gibt keinen BATS-Guard auf ADR-Prosa oder Runbook-Text;
Verifikation läuft über `task mcp:check`/`task mcp:sync` (strukturell) und die drei
Pflicht-Kommandos (Task P4.5).

### File Structure (dieses Partial)

| Datei | Verantwortung | Ist | Budget |
|---|---|---|---|
| `docs/adr/ADR-008-local-k3s-dev-mesh.md` | Nachtrag 2026-09-16 (T900191): llm-proxy/bge-mcp/mcp-postgres ziehen aus WSL + fleet-dev-pod nach devmesh | 142 | außerhalb S1-Scope |
| `docs/adr/ADR-007-wsl-exit-fleet-native.md` | Ergänzung des Nachtrags T900107: dessen Verortung des Proxys im dev-pod wird von T900191 weiter revidiert | 198 | außerhalb S1-Scope |
| `docs/runbooks/devmesh-tailnet.md` | ACL-Ausnahme je GPU-Port + Operator-Schritte für den Umzug | 136 | außerhalb S1-Scope |
| `docs/agent-guide/registry/mcp.yaml` | mcp-postgres/bge-mcp auf devmesh umbiegen, dev-pod-Block bereinigen, neuer devmesh-`llm-services`-Block | 379 | außerhalb S1-Scope |
| `.mcp.json`, `.opencode/opencode.jsonc`, `scripts/llm/mcp-servers.json` | von `task mcp:sync` generiert — Diff nur falls die Registry-Änderung Client-URLs ändert | generiert | n/a (generiert, nicht S1-pflichtig) |
| `CLAUDE.md` | Routing-Zeile `mcp-postgres (localhost:13001, nur mentolder-DB)` korrigieren | 186 | außerhalb S1-Scope |
| `.claude/skills/references/mcp-tool-guide.md` | dieselbe Korrektur im mcp-postgres-Abschnitt | 312 | außerhalb S1-Scope |

**S1-Budget:** Alle sieben Dateien liegen außerhalb von `scan.code_roots` in
`docs/code-quality/gates.yaml` (`docs/`, `.claude/`, `CLAUDE.md`, `AGENTS.md` sind dort nicht
gelistet) und tragen zudem Endungen (`.md`, `.yaml` außerhalb der gelisteten Roots), für die
`s1.limits` keinen Wert definiert. Der S1-Ratchet greift hier nicht — Messbefehl, der das belegt:

```bash
# Stand, gegen den gemessen wurde
PRE=db16df855
grep -n 'code_roots:' -A20 docs/code-quality/gates.yaml | grep -c '^\s*- docs\|^\s*- CLAUDE\|^\s*- \.claude'
# erwartet: 0 — keiner der vier Wurzeln liegt in scan.code_roots
jq -r '."S1:docs/adr/ADR-008-local-k3s-dev-mesh.md".metric // "nicht-baselined"' docs/code-quality/baseline.json
jq -r '."S1:CLAUDE.md".metric // "nicht-baselined"' docs/code-quality/baseline.json
```

`scripts/llm/mcp-bridge.json` ist **nicht** in target_files — Begründung siehe Befund F1 in
Task P4.3, Schritt 2a. AGENTS.md ist **nicht** in target_files: `grep -n "mcp-postgres" AGENTS.md` liefert keinen
Treffer (geprüft am Stand `db16df855`), die Routing-Tabelle dort führt keine MCP-Primär-Spalte.
Der einzige automatisierte Paritäts-Guard zwischen beiden Dateien ist
`tests/spec/agent-skills.bats::"CLAUDE.md and AGENTS.md name exactly the registry roles"` — er
vergleicht Agent-Rollennamen gegen `docs/agent-guide/registry/agents.yaml`, nicht MCP-Ports. Die
CLAUDE.md-Änderung in diesem Partial fügt keine neue `bachelorprojekt-*`-Rolle ein und bleibt
außerhalb dieses Guards.

**F2 — Netzwerk-Registry unverändert.** `docs/agent-guide/registry/networks.yaml` und
`docs/agent-guide/maps/networks-map.md` sind **nicht** in target_files:
`grep -rn "llm-proxy-lan\|10.0.33.0/24"` auf beide Dateien (Stand `db16df855`) liefert keinen
Treffer — die 10.0.33.0/24-Bridge war dort nie verzeichnet, ihr
Wegfall braucht also keine Löschung. Der Tailnet-Bereich `100.64.0.0/10` und die
devmesh-Pod/Service-CIDRs sind bereits dokumentiert (Zeilen 17–19 der Map); die neuen GPU-Ports
liegen als Ports auf einer bestehenden Adresse (`gpu-host` = 100.102.71.114), keine neue
Adressbereichs-Zeile nötig.

### Interfaces

- **Consumes:** `devmesh/inventory.yaml` (`gpu_endpoint.ports`, von P1a auf eine Liste erweitert),
  `devmesh/tailnet-policy.hujson` (von P1a um je-Port-Regeln erweitert) — dieses Partial liest
  ihren Zielzustand aus P1a's Spec-Text, ändert die Dateien selbst aber nicht (Tabu).
- **Produces:** Lesbarer Entscheidungs-/Betriebstext für Operator und Agenten; kein
  Laufzeit-Vertrag. Die generierten Configs (`.mcp.json` etc.) sind der einzige Teil mit
  strukturellem Vertrag — geprüft durch `task mcp:check` (Exit 0 = kein Drift).
- **depends_on:** `p1b-llm-services` (liefert, mit seiner Abhängigkeit `p1a-gpu-endpoint`, `gpu_endpoint.address` und `gpu_endpoint.ports`
  — heute laut P1a-Zwischenstand `[1234, 1919, 8089, 8090, 8094]` —, das Deployment/den
  Service-Namen `llm-services`, den neuen Task `devmesh:registry:migrate`, den Secret-Key
  `MCP_READONLY_DB_PASSWORD` und die devmesh-DB-URL, auf die dieses Partial verweist),
  `p3b-wsl-units` (liefert den endgültigen Wortlaut von `scripts/mcp-gateway/mcp-gateway.service`
  [bleibt fleet-only: 18080], dem neuen `scripts/mcp-gateway/devmesh-forward.service` [18235,
  13001, 13005 aus devmesh] und, aus dem parallel landenden `p3a-windows`, `start-windows.ps1`, auf die der Runbook-Abschnitt und
  `mcp.yaml`'s `windows_note`/Cluster-Kommentare verweisen — Taskfile-Einstieg für beide bleibt
  `task agents:mcp-gateway:start`/`agents:mcp-gateway:install`, keine neuen Task-Namen).

---

### Task P4.1: ADR-Nachtrag — ADR-008 und ADR-007

**Files:**
- Modify: `docs/adr/ADR-008-local-k3s-dev-mesh.md`
- Modify: `docs/adr/ADR-007-wsl-exit-fleet-native.md`

- [x] **Schritt 1: Nachtrag an ADR-008 anhängen**

Ans Ende von `docs/adr/ADR-008-local-k3s-dev-mesh.md` (nach dem Abschnitt "Inventar-Belege")
anhängen:

```markdown

### Nachtrag 2026-09-16 (T900191): llm-proxy, bge-mcp und mcp-postgres ziehen nach devmesh

Die drei CPU/RAM-Dienste liefen bislang doppelt: als WSL-systemd-User-Units auf dem
Dev-Rechner und als Container im fleet-`dev-pod` (`workspace-dev`, siehe ADR-007-Nachtrag
T900107). Beides entfällt zugunsten eines einzigen Orts: der devmesh-Komponente
`dev-local/components/llm-services` (SP-3-Nachtrag, `openspec/changes/devmesh-llm-services`).

**Begründung:** Nur devmesh hat mit `llm-gateway-host` (Nachtrag 2026-09-11, Punkt 1) bereits
den Tailnet-Pfad zu den Windows-GPU-Diensten. Der fleet-`dev-pod` erreicht PK-Desktop nicht —
seine Backend-Registry führte deshalb ausschließlich `127.0.0.1`-URLs, die im Pod-Netzwerk-Namensraum
des Pods nicht auf die Windows-GPU zeigen konnten. Der Dev-Rechner selbst trägt danach nur noch
VRAM-Dienste (llama.cpp, LM Studio, FreeToken) und `kubectl port-forward`-Clients.

**Konsequenz für den ADR-007-Nachtrag T900107:** dessen Satz "Migriert ist die Routing-Schicht
... jetzt als Container des `dev-pod` gegen Remote-Backends" gilt ab T900191 nicht mehr — der
Proxy läuft nicht mehr im fleet-`dev-pod`, sondern in devmesh. Siehe Ergänzung in ADR-007 unten.

Details: `openspec/changes/devmesh-llm-services/design.md` (Decisions D1–D7).
```

- [x] **Schritt 2: Ergänzung an ADR-007 anhängen**

Direkt nach dem bestehenden Absatz "*Beim llm-proxy ist "retire" und "portieren"
auseinanderzuhalten.* ..." (Ende des Nachtrags 2026-09-10/T900107) in
`docs/adr/ADR-007-wsl-exit-fleet-native.md` einfügen:

```markdown

**Ergänzung 2026-09-16 (T900191, siehe ADR-008-Nachtrag):** Der obige Satz "migriert ... jetzt
als Container des `dev-pod`" gilt nur bis T900191. Der fleet-`dev-pod` erreicht die
Windows-GPU-Dienste nicht (keine Route zum Dev-Rechner), devmesh dagegen schon
(`llm-gateway-host`, ADR-008-Nachtrag 2026-09-11). Der Proxy zieht deshalb ein zweites Mal um,
diesmal nach devmesh (`dev-local/components/llm-services`) — der fleet-`dev-pod` startet ihn
nicht mehr.
```

- [x] **Schritt 3: Betroffene fleet-Referenzen auf den Proxy prüfen (design.md D1)**

```bash
git grep -n "dev-pod.*18235\|18235.*dev-pod" -- '*.yaml' '*.md' ':!openspec/changes/archive' | grep -v openspec/changes/devmesh-llm-services
```

Jeder Treffer außerhalb dieses Change-Verzeichnisses gehört entweder in P1a/P1b (Manifest-Umstellung)
oder — wenn es sich um eine Doku-Stelle handelt, die diesen Umzug nicht kennt — als Folge-Notiz
hierher. Am Stand `db16df855` liefert der Befehl `docs/agent-guide/registry/mcp.yaml` (Task P4.3
behandelt das) und `scripts/mcp-gateway/*` (P3a/P3b-Zuständigkeit).

- [x] **Schritt 4: Verify**

```bash
grep -c "T900191" docs/adr/ADR-008-local-k3s-dev-mesh.md docs/adr/ADR-007-wsl-exit-fleet-native.md
```

Erwartet: beide Dateien ≥ 1.

---

### Task P4.2: Runbook — ACL je GPU-Port und Operator-Umzugsschritte

**Files:**
- Modify: `docs/runbooks/devmesh-tailnet.md`

- [x] **Schritt 1: Rollen-Abschnitt auf mehrere Ports umstellen**

In `docs/runbooks/devmesh-tailnet.md` den Satz

```
Kein allgemeiner Pfad von `tag:devmesh` nach `tag:devclient`. Einzige Ausnahme ist die GPU-Inferenz:
`tag:devmesh` → `gpu-host` (pk-desktop) auf `gpu_endpoint.port` aus dem Inventar (heute 1234).
```

ersetzen durch:

```markdown
Kein allgemeiner Pfad von `tag:devmesh` nach `tag:devclient`. Einzige Ausnahme ist die
GPU-Inferenz: `tag:devmesh` → `gpu-host` (pk-desktop, Tailnet-Adresse aus
`gpu_endpoint.address`) — **eine ACL-Regel pro Eintrag in `gpu_endpoint.ports`** aus dem
Inventar. T900191 erweitert das Feld von einem einzelnen `port` auf eine benannte Portliste,
weil der llm-proxy jetzt fünf Windows-GPU-Backends über denselben Tailnet-Host erreicht, nicht
nur den bisherigen `:1234`-Server: `1234` (bisheriger LLM-Endpunkt), `1919` (FreeToken-native,
T014105), `8089`, `8090`, `8094` (weitere lokale Inferenz-/Werkzeugdienste — exakte Zuordnung
in `devmesh/inventory.yaml`-Kommentaren, P1a-Zuständigkeit). Jeder Eintrag in `gpu_endpoint.ports`
braucht eine eigene `acls`-Zeile in `devmesh/tailnet-policy.hujson`
(`{"action": "accept", "src": ["tag:devmesh"], "dst": ["gpu-host:<port>"]}`, fünf Zeilen statt
bisher einer) — Schritt 5 unten prüft das vor dem Einspielen.
```

- [x] **Schritt 2: Neuen Abschnitt "Schritt 7: Umzug llm-proxy/bge-mcp/mcp-postgres nach
  devmesh (T900191)" ans Ende des Runbooks anhängen**

```markdown

## Schritt 7: Umzug llm-proxy/bge-mcp/mcp-postgres nach devmesh (T900191)

Voraussetzung: Schritte 1–6 sind einmal durchlaufen (Tailnet steht, ACL eingespielt) und P1a/P1b/P2
dieses Change (`dev-local/components/llm-services`, Migration) sind bereits gemergt.

1. **Secrets siegeln.** `BGE_MCP_TOKEN`, `MCP_POSTGRES_TOKEN`, `LLM_PROXY_ADMIN_TOKEN` und
   `MCP_READONLY_DB_PASSWORD` (neuer Key, P1b: Passwort des `mcp_readonly`-DB-Users in devmesh,
   analog zum fleet-Pendant) in `environments/.secrets/dev.yaml` eintragen (Schema-Einträge aus
   P1b), dann:
   ```bash
   task env:seal ENV=dev
   ```
   Committed wird `environments/sealed-secrets/dev.yaml`.
2. **Stack deployen.**
   ```bash
   task devmesh:deploy
   ```
   Erwartet: Rollout-Status für `deployment/llm-services` (und alle anderen Profil-Deployments)
   meldet `successfully rolled out`.
3. **Registry-Migration ausführen** (legt `tickets.llm_proxy_backends` mit devmesh-URLs an —
   **nicht** zu verwechseln mit `task devmesh:migrate`, das kopiert pocket_id/website-Inhalte
   aus dem alten k3d-Cluster und hat mit der Backend-Registry nichts zu tun):
   ```bash
   task devmesh:registry:migrate
   ```
4. **WSL-Units stoppen und deaktivieren** — erst NACHDEM Schritt 2/3 grün sind, sonst verliert
   man beide Quellen gleichzeitig:
   ```bash
   systemctl --user disable --now llm-proxy.service llm-proxy-lan.service bge-mcp.service \
     bge-forward-embed.service bge-forward-rerank.service mcp-postgres-local.service \
     k3d-postgres-forward.service
   ```
5. **Gateway-Units umstellen** — `mcp-gateway.service` bleibt bestehen und bedient ab jetzt nur
   noch fleet (`:18080`, `:13002`); ein neues, zweites Unit
   `scripts/mcp-gateway/devmesh-forward.service` bedient die drei devmesh-Ports
   (`:18235`, `:13001`, `:13005` aus `svc/llm-services`, Context `devmesh`). Wortlaut/Unit-Datei
   sind P3b-Zuständigkeit; der gemeinsame Taskfile-Einstieg bleibt unverändert
   `agents:mcp-gateway:start`/`agents:mcp-gateway:install` (startet/installiert jetzt beide
   Units):
   ```bash
   task agents:mcp-gateway:install
   task agents:mcp-gateway:start
   ```
6. **Windows-Autostart neu registrieren** (PK-Desktop, PowerShell): das gefixte
   `start-windows.ps1` (T900190) startet die devmesh-Port-Forwards statt des lokalen
   bge-mcp-Shims:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mcp-gateway/register-autostart.ps1
   ```
7. **Abnahme:** die drei Health-Checks aus `.claude/skills/references/mcp-tool-guide.md`
   (`mcp-postgres`, `bge-mcp`, llm-proxy) gegen `127.0.0.1:13001`, `:13005`, `:18235` — alle
   `200`/erreichbar, **ohne** dass eine WSL-Unit läuft:
   ```bash
   systemctl --user list-units 'llm-proxy*' 'bge-mcp*' 'bge-forward-*' 'mcp-postgres-local*' \
     'k3d-postgres-forward*' --no-legend | wc -l   # erwartet: 0
   systemctl --user is-active devmesh-forward.service   # erwartet: active
   ```
```

- [x] **Schritt 3: Verify**

```bash
grep -c "gpu_endpoint.ports" docs/runbooks/devmesh-tailnet.md   # erwartet: >= 1
grep -c "T900191" docs/runbooks/devmesh-tailnet.md              # erwartet: >= 1
```

---

### Task P4.3: MCP-Registry — mcp-postgres, bge-mcp, dev-pod-Block, neuer devmesh-Block

**Files:**
- Modify: `docs/agent-guide/registry/mcp.yaml`

- [x] **Schritt 1: `mcp-postgres`-Eintrag auf devmesh umbiegen**

In `docs/agent-guide/registry/mcp.yaml` beim `mcp-postgres`-Block:
- `database:` von `shared-db.workspace.svc.cluster.local/website` auf
  `shared-db.workspace.svc.cluster.local/website (devmesh-Cluster, NICHT fleet)` ändern.
- `scope_warning:` ergänzen: die Brand-Bindung bleibt bestehen, aber die Quelle ist jetzt die
  **devmesh**-DB (Entwicklungsdaten, s. ADR-008-Nachtrag 2026-09-11: "die devmesh-DB trägt
  Entwicklungsdaten, Ticket-Tooling verweigert dort Schreibzugriffe") statt der fleet-DB. Diese
  Warnung ist die wichtigste Textänderung: bisher stand hier "seit ADR-007 die SSOT" — das war
  über fleet korrekt und wäre über devmesh-Werte irreführend, weil devmesh **nicht**
  Ticket-DB-of-record ist.
- `windows_note:` auf die devmesh-Port-Forward-Quelle umschreiben, den Verweis auf den
  `k3d-postgres-forward`-Fallback (Zeilen 96–100 alt) entfernen (die WSL-Unit entfällt laut
  design.md D7).

- [x] **Schritt 2: `bge-mcp`-Eintrag auf devmesh umbiegen**

Analog: `windows_note`/`failover_note` auf `svc/llm-services` in devmesh verweisen statt auf den
fleet-`dev-pod`-Port-Forward und den WSL-Shim. Beide `windows_note`-Texte nennen ab jetzt zwei
Gateway-Units statt einer: `scripts/mcp-gateway/mcp-gateway.service` (fleet, unverändert) UND
`scripts/mcp-gateway/devmesh-forward.service` (neu, P3b) für die drei devmesh-Ports — Taskfile-
Einstieg bleibt in beiden Fällen `task agents:mcp-gateway:start`/`agents:mcp-gateway:install`.

- [x] **Schritt 2a (F1 — kein Code-/Config-Task, nur Registry-Kommentar): `browser_endpoint`/
  `bridge`-Einträge von `mcp-task-runner`, `codebase-memory-mcp`, `playwright` prüfen und
  dokumentieren, statt entfernen**

Befund: `mcp-task-runner`, `codebase-memory-mcp` und `playwright` tragen zusätzlich zu ihrem
Harness-Eintrag einen `bridge:`-Block, der auf `http://127.0.0.1:18235/mcp/<server>` zeigt — das
ist die stdio→HTTP-Bridge im llm-proxy selbst (`scripts/llm-proxy/mcp-bridge.mjs`,
`initBridge()` in `server.mjs`, Config `scripts/llm/mcp-bridge.json`). Sie spawnt die
konfigurierten Kommandos als Kindprozesse des llm-proxy-Prozesses, u. a.
`node /home/patrick/Bachelorprojekt/scripts/ticket-mcp-node/server.mjs` und
`--taskfile /home/patrick/Bachelorprojekt/Taskfile.yml` — **absolute Host-Pfade**.

Geprüft, was die Bridge im Pod tut, wenn der Befehl fehlt:
`scripts/llm-proxy/mcp-bridge.mjs` beschreibt `initBridge()` selbst als
"Best-effort – logs errors, never throws"; ein fehlgeschlagener `spawn()` landet im
`proc.on('error', ...)`-Handler (`console.error('[mcp-bridge] ... spawn error', ...)`), der
Server-Eintrag bleibt `unavailable`, nachfolgende `/mcp/<name>`-Requests bekommen
`{error: {code: 'server_unavailable', ...}}` zurück. **Der llm-proxy-Prozess selbst stirbt
nicht** — nur die drei bridge-vermittelten Routen bleiben funktionslos.

**Das ist kein neues Problem dieses Umzugs.** Der Pod-Mount des Repos liegt schon im
fleet-`dev-pod` unter `/workspace/repo` (`k3d/dev-pod/deployment.yaml`,
`DEV_POD_REPO`/`REPO_DIR`), nie unter `/home/patrick/Bachelorprojekt` — die absoluten Pfade in
`scripts/llm/mcp-bridge.json` passten dort schon vor T900191 nicht zum Container-Dateisystem.
Sie stammen erkennbar aus der Zeit, als der Proxy noch host-nativ auf WSL lief (vor dem
ADR-007-Nachtrag T900107, der ihn in den `dev-pod`-Container verlegte). Devmesh ändert an dieser
Lage nichts — der Pfad-Bruch existiert unabhängig davon, ob der Proxy im fleet-`dev-pod` oder im
devmesh-`llm-services`-Pod läuft.

**Entscheidung: dokumentieren, nicht entfernen.** Ein Entfernen der drei Einträge wäre
Scope-Creep über T900191 hinaus (der Fix eines container-unabhängigen Altzustands aus T900107,
kein von diesem Change verursachtes Problem) und hätte Folgekosten außerhalb dieses Partials:
`task mcp:sync` müsste die `bridge:`-Verarbeitung anpassen, `scripts/llm/mcp-bridge.json` bräuchte
entweder repo-relative Pfade oder eine Container-Variante — beides Code-/Config-Änderungen, die
gegen das Tabu dieses Partials (nur `docs/**`, `CLAUDE.md`, `.claude/skills/references/**`,
generierte MCP-Configs) laufen. Stattdessen bekommen die drei Blöcke einen Kommentar direkt über
`bridge:`:

```yaml
    # T900191: die Bridge laeuft als Teil des llm-proxy-Prozesses, der jetzt im
    # devmesh-Pod `llm-services` steckt (mcp-node-Image). Die command/args oben
    # sind absolute Host-Pfade (/home/patrick/Bachelorprojekt/...) und referenzieren
    # damit ausserhalb des Containers liegende Dateien — Best-effort-Verhalten,
    # kein Absturz: initBridge() faengt den spawn-Fehler ab, dieser eine
    # Server bleibt "unavailable", der Proxy selbst bleibt gesund. Vorbestehend
    # seit T900107 (Proxy zog vom host-nativen WSL in den Container); der
    # devmesh-Umzug aendert daran nichts. Fuer diesen Server ausschliesslich
    # den harness-Eintrag (lokaler stdio-Prozess je Maschine) nutzen, nicht die
    # Bridge/browser_endpoint.
```

- [x] **Schritt 3: `cluster.dev-pod`-Block bereinigen**

Im `cluster:`-Abschnitt, Container `mcp-node`, die Zeilen
```yaml
        - { name: llm-proxy, port: 18235, forwarded_port: 18235 }
        - { name: postgres, port: 3001, forwarded_port: 13001 }
```
entfernen. Den Kopf-Kommentar-Block ("Port-forward-Bruecke ... 18080:8080 13001:3001 13002:3002
18235:18235") auf die verbleibenden zwei Forwards (`18080:8080 13002:3002`) kürzen — 13001 und
18235 kommen jetzt aus dem devmesh-`llm-services`-Service, nicht mehr aus `svc/dev-pod`.

- [x] **Schritt 4: Neuen `cluster.devmesh`-Block anlegen**

`mcp-sync.sh` liest ausschließlich den `clients:`-Zweig (belegt: `grep -n "cluster" scripts/mcp-sync.sh`
liefert keinen Treffer) — der `cluster:`-Zweig ist reine Dokumentation ohne Schema-Validator.
Ein zweiter Top-Level-Key unter `cluster:` ist deshalb unkritisch für `mcp:sync`/`mcp:check`.
Analog zum bestehenden `dev-pod`-Block anhängen:

```yaml
  # devmesh-llm-services: dev-local/components/llm-services [T900191]
  # Namespace: workspace, Context: devmesh
  # Zustellung: task devmesh:deploy (kein Flux fuer devmesh, s. proposal.md Non-Goals)
  # Port-forward-Bruecke: kubectl --context devmesh port-forward -n workspace \
  #   svc/llm-services 18235:18235 13001:3001 13005:3007
  llm-services:
    note: >-
      Ein Deployment, mcp-node-Image mit MCP_NODE_SERVICES-Schalter: nur llm-proxy,
      mcp-postgres und bge-mcp starten (design.md D4). GPU-Backends bleiben auf der
      Windows-Seite, erreicht ueber llm-gateway-host (Tailnet).
    containers:
      - name: mcp-node
        image: ghcr.io/paddione/mcp-node:latest
        servers:
          - { name: llm-proxy, port: 18235, forwarded_port: 18235 }
          - { name: postgres, port: 3001, forwarded_port: 13001 }
          - { name: bge-mcp, port: 3007, forwarded_port: 13005 }
```

- [x] **Schritt 5: `task mcp:sync` und `task mcp:check` ausführen**

```bash
task mcp:sync
task mcp:check
```

Erwartet: `mcp:sync` schreibt `.mcp.json`, `.opencode/opencode.jsonc`, `scripts/llm/mcp-servers.json`
(sowie `~/.gemini/...`/`~/.qwen/...` außerhalb des Repos, nicht committen) neu, falls sich
Endpoint-URLs geändert haben — bei `mcp-postgres`/`bge-mcp` ändert sich hier NUR Prosa
(`database:`, `windows_note`, `scope_warning`), nicht `endpoint:`/`headers:`, also ist im
Normalfall **kein** Diff in den generierten Dateien zu erwarten. Trotzdem `git status` nach dem
Lauf prüfen:

```bash
git status --porcelain .mcp.json .opencode/opencode.jsonc scripts/llm/mcp-servers.json
```

Zeigt der Befehl eine Änderung, gehört die geänderte Datei zusätzlich in target_files dieses
Partials und wird mitcommittet (Task P4.5). `task mcp:check` muss danach Exit 0 melden (kein
Drift zwischen Registry und generierten Configs).

---

### Task P4.4: CLAUDE.md und mcp-tool-guide.md — veraltete `mcp-postgres`-Zielortbehauptung korrigieren

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/skills/references/mcp-tool-guide.md`

- [x] **Schritt 1: Zeile in CLAUDE.md korrigieren**

Ist-Zeile (Zeile 17, Stand `db16df855`):
```
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` | `mcp-postgres` (localhost:13001, nur mentolder-DB) — Ticket-Reads → `ticket-mcp` mit `brand` |
```
ersetzen durch:
```
| database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, `bachelorprojekt.features`, `v_timeline` | `bachelorprojekt-db` | `mcp-postgres` (localhost:13001, **devmesh**-DB seit T900191, nur mentolder-Brand-Daten) — Ticket-Reads → `ticket-mcp` mit `brand` |
```
Dieselbe Korrektur in Zeile 16 (`bachelorprojekt-test`-Zeile): `mcp-postgres` (:13001, nur
mentolder)` → `mcp-postgres` (:13001, devmesh seit T900191, nur mentolder)`.

- [x] **Schritt 2: mcp-tool-guide.md korrigieren**

Den Satz (Zeile 100–104, Stand `db16df855`)
```
⚠️ **Bedient die fleet-DB — seit ADR-007 die SSOT, keine Kopie mehr [T900013].** Port 13001
wird per `kubectl --context fleet port-forward` auf die **fleet**-Postgres bedient. ...
```
ersetzen durch einen Absatz, der klarstellt: seit T900191 bedient Port 13001 die
**devmesh**-Postgres (Entwicklungsdaten, keine Ticket-SSOT), nicht mehr fleet. Ticket-Zustand
bleibt — unverändert — bei `ticket-mcp-node`/`psql()`-Fallback gegen fleet; dieser Server war für
Ticket-Zustand ohnehin nie der richtige Weg (Grund: `external_id`-Brand-Kollision, unverändert
gültig). Den `curl`-Health-Check-Endpunkt (`http://localhost:13001/mcp`) NICHT ändern — der Port
bleibt lokal identisch, nur das dahinterliegende Cluster wechselt.

- [x] **Schritt 3: Verify**

```bash
grep -n "devmesh" CLAUDE.md .claude/skills/references/mcp-tool-guide.md | grep -c "13001\|mcp-postgres"
```

Erwartet: ≥ 2 (mindestens je ein Treffer pro Datei).

---

### Task P4.5: Verifikation dieses Partials

**Files:**
- Verify: alle Dateien aus der File-Structure-Tabelle

- [x] **Schritt 1: Registry-Konsistenz**

```bash
task mcp:sync
task mcp:check
```

Erwartet: beide Exit 0. `mcp:check` vergleicht `docs/agent-guide/registry/mcp.yaml` gegen die
vier generierten Configs und meldet Drift ≠ 0 als Fehler.

- [x] **Schritt 2: Netzwerk-Registry unverändert (Beleg für den F2-Befund oben)**

```bash
task networks:check
git diff --stat docs/agent-guide/registry/networks.yaml docs/agent-guide/maps/networks-map.md
```

Erwartet: `networks:check` Exit 0, `git diff --stat` liefert **keine** Zeile (dieses Partial
fasst diese beiden Dateien nicht an).

- [x] **Schritt 3: Die drei Pflicht-Kommandos**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartet: alle drei Exit 0.

- [x] **Schritt 4: Commit**

```bash
git add docs/adr/ADR-008-local-k3s-dev-mesh.md docs/adr/ADR-007-wsl-exit-fleet-native.md \
  docs/runbooks/devmesh-tailnet.md docs/agent-guide/registry/mcp.yaml CLAUDE.md \
  .claude/skills/references/mcp-tool-guide.md
git status --porcelain .mcp.json .opencode/opencode.jsonc scripts/llm/mcp-servers.json
# nur falls Schritt 1 dort einen Diff zeigte, diese Dateien mit hinzufuegen:
git add .mcp.json .opencode/opencode.jsonc scripts/llm/mcp-servers.json 2>/dev/null || true
git commit -m "docs(devmesh): ADR-Nachtrag, Tailnet-Runbook und MCP-Registry auf devmesh-Umzug ziehen [T900191]"
```
