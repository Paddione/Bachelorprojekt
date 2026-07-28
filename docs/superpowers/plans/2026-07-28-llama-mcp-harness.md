---
title: llama.cpp MCP-Harness Implementation Plan
ticket_id: T002398
domains: [ops, infra]
status: completed
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llama.cpp MCP-Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/mcp-sync.sh` generiert aus der SSOT-Registry zusätzlich eine Cursor-Format-Datei, die `llama-server` über `--mcp-servers-config` einliest — damit laufen ausgewählte MCP-Server als stdio-Kindprozesse von llama.cpp.

**Architecture:** Ein vierter `render_*`-Generator im bestehenden 167-Zeilen-Skript, verdrahtet in `cmd_render` und `cmd_check`. Opt-in über `harness.llamacpp` je Server; HTTP-Server werden fail-closed abgelehnt, nicht übersprungen.

**Tech Stack:** Bash + `node -e` mit dem `yaml`-Paket (Muster der drei bestehenden Renderer), BATS.

**Spec:** `docs/superpowers/specs/2026-07-28-llama-mcp-harness-design.md` · **Ticket:** T002398 · **Epic:** T002397

## Global Constraints

- **`mcp.yaml` ist SSOT (T002300).** Die generierte Datei wird nie von Hand editiert; jede Änderung geht in die Registry und dann durch `task mcp:sync`.
- **llama.cpp spricht MCP ausschließlich über stdio.** `server_mcp_stdio` ist die einzige Transport-Implementierung in `tools/server/server-mcp.h`. `mcp-kubernetes`, `mcp-postgres` und `factory-mcp` sind HTTP und dürfen niemals in der generierten Datei landen.
- **Fail-closed statt still überspringen.** llama.cpp verwirft Einträge ohne `command` wortlos und meldet bei fehlendem `mcpServers` keinen Fehler. Jeder Konfigurationsfehler muss deshalb im Generator abbrechen.
- **Neue Renderer folgen dem Bestandsmuster exakt:** `node -e "…"` mit `require('yaml')`, Iteration über `Object.keys(clients).sort()`, `continue` wenn der Harness-Block fehlt, Ausgabe über `fs.writeFileSync('/dev/stdout', …)`.
- **Kommentare auf Deutsch, Bezeichner auf Englisch.**
- **BATS-Runner:** `tests/unit/lib/bats-core/bin/bats` (vendored), NICHT `which bats`.

## File Structure

| Datei | Verantwortung |
|---|---|
| `scripts/mcp-sync.sh` | **Modifizieren:** `render_llamacpp_json()`, Zielpfad-Konstante, Verdrahtung in `cmd_render`/`cmd_check`, Kopfkommentar. |
| `docs/agent-guide/registry/mcp.yaml` | **Modifizieren:** `harness.llamacpp`-Blöcke für `ticket-mcp` und `codebase-memory-mcp`. |
| `scripts/llm/mcp-servers.json` | **Generiert und committet.** Die Datei, die `--mcp-servers-config` einliest. |
| `tests/spec/mcp-tooling.bats` | **Modifizieren:** fünf Guards für die neue Datei und die Fail-closed-Regel. |

## Tasks

---

### Task 1: Renderer, Fail-closed-Regel und Verdrahtung

**Files:**
- Modify: `scripts/mcp-sync.sh`
- Test: `tests/spec/mcp-tooling.bats`

**Interfaces:**
- Consumes: `docs/agent-guide/registry/mcp.yaml`
- Produces: `render_llamacpp_json()` (stdout: JSON), `LLAMACPP_TARGET` (Pfad-Konstante), Exit 2 bei Konfigurationsfehler

- [ ] **Step 1: Write the failing test**

An `tests/spec/mcp-tooling.bats` anhängen:

```bash

# --- T002398: llama.cpp als vierter MCP-Harness --------------------------------
# llama.cpp spricht MCP NUR ueber stdio (server_mcp_stdio ist die einzige
# Transport-Implementierung) und verwirft fehlerhafte Eintraege WORTLOS. Diese
# Guards stellen sicher, dass der Generator die Fehler stattdessen meldet.

@test "T002398: mcp-sync render erzeugt gueltiges scripts/llm/mcp-servers.json" {
  run bash scripts/mcp-sync.sh render
  [ "$status" -eq 0 ]
  run node -e 'const d=require("./scripts/llm/mcp-servers.json"); if(typeof d.mcpServers!=="object") process.exit(1)'
  [ "$status" -eq 0 ]
}

@test "T002398: jeder Eintrag hat ein nicht-leeres command" {
  run node -e '
    const d=require("./scripts/llm/mcp-servers.json");
    const bad=Object.entries(d.mcpServers).filter(([,v])=>!v.command).map(([k])=>k);
    if(bad.length){console.error("ohne command: "+bad.join(","));process.exit(1)}
  '
  [ "$status" -eq 0 ]
}

@test "T002398: kein http-Server steht in der llama.cpp-Config" {
  run node -e '
    const fs=require("fs"), yaml=require("yaml");
    const reg=yaml.parse(fs.readFileSync("docs/agent-guide/registry/mcp.yaml","utf8"));
    const gen=require("./scripts/llm/mcp-servers.json");
    const http=Object.entries(reg.clients).filter(([,c])=>c.transport==="http").map(([k])=>k);
    const bad=http.filter(n=>n in gen.mcpServers);
    if(bad.length){console.error("http in llama.cpp-Config: "+bad.join(","));process.exit(1)}
  '
  [ "$status" -eq 0 ]
}

@test "T002398: mcp:check erkennt Drift in der llama.cpp-Config" {
  cp scripts/llm/mcp-servers.json "$BATS_TEST_TMPDIR/backup.json"
  node -e '
    const fs=require("fs");
    const d=JSON.parse(fs.readFileSync("scripts/llm/mcp-servers.json","utf8"));
    d.mcpServers["drift-probe"]={command:"nope"};
    fs.writeFileSync("scripts/llm/mcp-servers.json", JSON.stringify(d,null,2)+"\n");
  '
  run bash scripts/mcp-sync.sh check
  cp "$BATS_TEST_TMPDIR/backup.json" scripts/llm/mcp-servers.json
  [ "$status" -ne 0 ]
}

@test "T002398: llamacpp-Block an einem http-Server laesst render fehlschlagen" {
  cp docs/agent-guide/registry/mcp.yaml "$BATS_TEST_TMPDIR/reg.yaml"
  node -e '
    const fs=require("fs"), yaml=require("yaml");
    const reg=yaml.parse(fs.readFileSync("docs/agent-guide/registry/mcp.yaml","utf8"));
    const httpName=Object.entries(reg.clients).find(([,c])=>c.transport==="http")[0];
    reg.clients[httpName].harness.llamacpp={command:"should-not-be-emitted"};
    fs.writeFileSync("docs/agent-guide/registry/mcp.yaml", yaml.stringify(reg));
  '
  run bash scripts/mcp-sync.sh render
  cp "$BATS_TEST_TMPDIR/reg.yaml" docs/agent-guide/registry/mcp.yaml
  bash scripts/mcp-sync.sh render >/dev/null 2>&1 || true
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-tooling.bats -f T002398`
Expected: FAIL — `scripts/llm/mcp-servers.json` existiert nicht, `render` erzeugt sie nicht.

- [ ] **Step 3: Renderer in `scripts/mcp-sync.sh` ergänzen**

Zielpfad-Konstante nach Zeile 12 (`AGY_TARGET=…`) einfügen:

```bash
LLAMACPP_TARGET="$REPO/scripts/llm/mcp-servers.json"
```

Kopfkommentar (Zeile 5) anpassen:

```bash
#   render   — Write all four target configs from docs/agent-guide/registry/mcp.yaml
```

Renderer nach `render_agy_json()` (also nach Zeile 60) einfügen:

```bash
# llama.cpp (T002398): Cursor-Format "mcpServers". Opt-in ueber harness.llamacpp --
# ohne Block wird ein Server NICHT angehaengt, weil jeder Eintrag ein Kindprozess
# von llama-server wird (npx-basierte Server wuerden den Modellstart verzoegern).
render_llamacpp_json() {
  node -e "
    const fs = require('fs'), yaml = require('yaml');
    const reg = yaml.parse(fs.readFileSync('$REGISTRY', 'utf8'));
    const clients = reg.clients;
    const out = { mcpServers: {} };
    for (const name of Object.keys(clients).sort()) {
      const c = clients[name];
      if (!c.harness || !c.harness.llamacpp) continue;
      // llama.cpp spricht MCP NUR ueber stdio (server_mcp_stdio ist die einzige
      // Transport-Implementierung). Ein http-Server hier ergaebe eine Config, die
      // llama-server WORTLOS verwirft -- deshalb abbrechen statt ueberspringen.
      if (c.transport === 'http') {
        console.error('mcp-sync: ' + name + ' hat einen llamacpp-Block, ist aber transport: http — llama.cpp unterstuetzt nur stdio.');
        process.exit(2);
      }
      const h = c.harness.llamacpp;
      if (!h.command) {
        console.error('mcp-sync: ' + name + ' hat einen llamacpp-Block ohne command.');
        process.exit(2);
      }
      const server = { command: h.command };
      // Leere Felder werden WEGGELASSEN, nicht als null emittiert: llama.cpp
      // behandelt ein leeres command als 'ueberspringen'.
      if (h.args && h.args.length) server.args = h.args;
      if (h.env) server.env = h.env;
      if (h.cwd) server.cwd = h.cwd;
      if (h.timeout_ms) server.timeout_ms = h.timeout_ms;
      out.mcpServers[name] = server;
    }
    fs.writeFileSync('/dev/stdout', JSON.stringify(out, null, 2) + '\n');
  "
}
```

In `cmd_render()` nach dem agy-Block (nach Zeile 135) ergänzen:

```bash
  echo "mcp-sync: render: writing $LLAMACPP_TARGET"
  render_llamacpp_json > "${LLAMACPP_TARGET}.tmp"
  mv "${LLAMACPP_TARGET}.tmp" "$LLAMACPP_TARGET"
```

In `cmd_check()` vor `return "$exit_code"` ergänzen:

```bash
  render_llamacpp_json > "$tmpd/llamacpp.json"
  diff_or_drift "scripts/llm/mcp-servers.json" "$tmpd/llamacpp.json" "$LLAMACPP_TARGET" || exit_code=1
```

- [ ] **Step 4: Zwischenprüfung — Renderer läuft, Datei ist noch leer**

Run: `bash scripts/mcp-sync.sh render && cat scripts/llm/mcp-servers.json`
Expected: `{ "mcpServers": {} }` — kein Server hat bisher einen `llamacpp`-Block. Genau so soll es sein: gültige Datei, leeres Objekt, kein Fehler.

- [ ] **Step 5: Commit**

```bash
git add scripts/mcp-sync.sh scripts/llm/mcp-servers.json tests/spec/mcp-tooling.bats
git commit -m "feat(mcp): llama.cpp als vierten Harness in mcp-sync rendern [T002398]"
```

---

### Task 2: Registry-Blöcke für `ticket-mcp` und `codebase-memory-mcp`

**Files:**
- Modify: `docs/agent-guide/registry/mcp.yaml`
- Modify: `scripts/llm/mcp-servers.json` (regeneriert)

**Interfaces:**
- Consumes: `render_llamacpp_json()` aus Task 1
- Produces: zwei Einträge in `mcpServers`

- [ ] **Step 1: Registry ergänzen**

In `docs/agent-guide/registry/mcp.yaml` beim Server `ticket-mcp` unter `harness:` anfügen:

```yaml
      llamacpp:
        command: ticket-mcp-go
        env:
          TICKET_MCP_REPO_ROOT: /home/patrick/Bachelorprojekt
        cwd: /home/patrick/Bachelorprojekt
        timeout_ms: 30000
```

Bei `codebase-memory-mcp` unter `harness:` anfügen:

```yaml
      llamacpp:
        command: /home/patrick/.local/bin/codebase-memory-mcp
        cwd: /home/patrick/Bachelorprojekt
        timeout_ms: 30000
```

- [ ] **Step 2: Regenerieren und ansehen**

Run: `bash scripts/mcp-sync.sh render && cat scripts/llm/mcp-servers.json`
Expected: beide Server mit `command`, `cwd`, `timeout_ms`; `ticket-mcp` zusätzlich mit `env`. Kein `args`-Feld (leer → weggelassen).

- [ ] **Step 3: Drift-Erkennung gegenprüfen**

Run: `bash scripts/mcp-sync.sh check`
Expected: `OK` für alle vier Ziele, Exit 0.

- [ ] **Step 4: BATS-Guards laufen lassen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-tooling.bats -f T002398`
Expected: PASS, 5 Tests

- [ ] **Step 5: Commit**

```bash
git add docs/agent-guide/registry/mcp.yaml scripts/llm/mcp-servers.json
git commit -m "feat(mcp): ticket-mcp und codebase-memory-mcp an llama.cpp anbinden [T002398]"
```

---

### Task 3: Live-Verifikation gegen llama-server

**Files:** keine — reine Verifikation

**Interfaces:**
- Consumes: `scripts/llm/mcp-servers.json` aus Task 2

- [ ] **Step 1: Voraussetzung sicherstellen**

Run: `command -v ticket-mcp-go || task ticket-mcp:build`
Expected: Pfad zum Binary. Das Binary ist gitignored und wird von `make -C scripts/ticket-mcp/go build` erzeugt und nach `/usr/local/bin` installiert.

- [ ] **Step 2: llama-server mit MCP-Config starten**

Run:
```bash
LLAMA=~/opt/llama-b10155-cuda13.3/bin/llama-server
setsid nohup "$LLAMA" -m ~/models/gguf/gptoss20/gpt-oss-20b-Q8_0.gguf \
  --host 127.0.0.1 --port 8098 \
  -fit on -fitt 2400 -fitc 32768 \
  -np 1 -ctk q8_0 -ctv q8_0 -fa on --jinja --metrics \
  --alias gptoss-mcp \
  --mcp-servers-config "$PWD/scripts/llm/mcp-servers.json" \
  > ~/.local/state/llama/gptoss-mcp.log 2>&1 < /dev/null &
```

**`--host 127.0.0.1`, nicht `0.0.0.0`** — ein Server mit angehängtem `ticket-mcp` kann Tickets schreiben. `--tools` beschränkt zwar `--cors-origins` auf localhost, aber nicht den Bind.

- [ ] **Step 3: Tool-Katalog prüfen**

Run:
```bash
until curl -sf http://127.0.0.1:8098/health >/dev/null; do sleep 2; done
curl -s http://127.0.0.1:8098/tools | python3 -m json.tool | head -40
```
Expected: JSON-Array mit Tool-Definitionen; darunter Einträge aus `ticket-mcp` (z. B. `get_ticket`, `list_tickets`).

Liefert es ein leeres Array, ins Log sehen: `grep -i mcp ~/.local/state/llama/gptoss-mcp.log` — der häufigste Grund ist ein nicht auffindbares `command`.

- [ ] **Step 4: Tool-Ausführung prüfen**

Run:
```bash
curl -s http://127.0.0.1:8098/tools -H 'Content-Type: application/json' \
  -d '{"tool":"get_ticket","params":{"id":"T002398"}}' | head -c 400
```
Expected: die Ticketdaten von T002398. Damit ist die Kette Registry → generierte Config → Kindprozess → Tool-Aufruf durchgängig belegt.

- [ ] **Step 5: Ergebnis am Ticket festhalten**

Run:
```bash
bash scripts/ticket.sh add-comment --id T002398 --body "Live verifiziert: GET /tools listet ticket-mcp-Tools, POST /tools liefert T002398 zurueck."
```

---

### Task 4: Bind-Regel, Dokumentation und Abschluss

**Files:**
- Modify: `docs/agent-guide/registry/mcp.yaml` (Kommentarblock)
- Modify: `scripts/llm-proxy/loadouts.mjs` — **nur falls T002394 bereits gemergt ist**

**Interfaces:**
- Consumes: alles

- [ ] **Step 1: Registry-Kommentar ergänzen**

Über dem `clients:`-Block in `mcp.yaml` anfügen:

```yaml
# LLAMA.CPP-HARNESS (T002398): der Block harness.llamacpp haengt einen Server als
# stdio-Kindprozess an llama-server (--mcp-servers-config, Ziel scripts/llm/mcp-servers.json).
# NUR fuer transport: stdio — llama.cpp hat mit server_mcp_stdio genau eine
# Transport-Implementierung; ein llamacpp-Block an einem http-Server laesst mcp-sync
# fail-closed abbrechen. Opt-in mit Absicht: jeder Eintrag ist ein zusaetzlicher
# Kindprozess beim Modellstart.
```

- [ ] **Step 2: Bind-Regel — Vorbedingung prüfen**

Run: `test -f scripts/llm-proxy/loadouts.mjs && echo VORHANDEN || echo "T002394 noch nicht gemergt"`

**Falls VORHANDEN:** in `validateLoadout` ergänzen (nach der `loadMode`-Prüfung):

```javascript
  // Ein Loadout mit MCP-Servern kann Tickets schreiben. llama.cpp beschraenkt bei
  // aktiven Tools zwar --cors-origins auf localhost, aber NICHT den Bind (T002398).
  if (l.mcp?.serversConfig != null && (defaultsHost ?? '0.0.0.0') === '0.0.0.0') {
    fail(`${l.slug}: mcp.serversConfig verlangt host 127.0.0.1, nicht 0.0.0.0`);
  }
```

Dazu `validateLoadout` um den Parameter `defaultsHost` erweitern und in `parseLoadouts` als `doc.defaults?.host` durchreichen. Test in `loadouts.test.mjs` ergänzen:

```javascript
test('mcp.serversConfig zusammen mit host 0.0.0.0 wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].mcp.serversConfig = 'scripts/llm/mcp-servers.json'
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /127\.0\.0\.1/)
})
```

**Falls NICHT vorhanden:** überspringen und stattdessen als Anforderung an T002394 vermerken:

```bash
bash scripts/ticket.sh add-comment --id T002394 --body "Aus T002398: loadouts.mjs muss ablehnen, wenn mcp.serversConfig gesetzt ist und defaults.host 0.0.0.0 bleibt. Ein llama-server mit ticket-mcp kann Tickets schreiben; --tools beschraenkt nur CORS, nicht den Bind."
```

- [ ] **Step 3: Verifikationsblock (die drei Pflicht-Gates)**

Run:
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: alle drei PASS. Änderungen aus `freshness:regenerate` gehören in den Abschluss-Commit.

- [ ] **Step 4: Volle MCP-Suite**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-tooling.bats && task mcp:check`
Expected: PASS, Exit 0.

- [ ] **Step 5: Commit und PR**

```bash
git add -A
git commit -m "docs(mcp): llama.cpp-Harness in der Registry dokumentieren [T002398]"
git push -u origin feature/llama-mcp-harness-T002398
gh-axi pr create --title "feat(mcp): llama.cpp als vierter MCP-Harness [T002398]" --body "..."
gh-axi pr merge <n> --squash --auto
```

**Nicht die Epic-ID T002397 in den PR-Titel schreiben** — ein `project`-Ticket im PR-Titel wird beim Merge automatisch auf `done` gesetzt, obwohl sechs Kindtickets offen sind.

---

## Self-Review

**Spec-Abdeckung:** B1 (nur stdio) → Task 1 Step 3 Fail-closed-Zweig + Guard 3 und 5. B2 (Cursor-Format) → Task 1 Step 3 Feldliste. B3 (Tools nicht in `/v1`) → nicht implementierungsrelevant, in Task 3 Step 3/4 als Verifikationsweg abgebildet. B4 (`ticket-mcp-go` unverändert) → Task 3 Step 1. E1 (vierter Renderer) → Task 1. E2 (Opt-in) → Task 2, zwei Server. E3 (fail-closed) → Task 1 Step 3, Guard 5. E4 (Bind) → Task 3 Step 2 und Task 4 Step 2. Fehlerbehandlungstabelle: alle sechs Zeilen sind abgedeckt. Tests → Task 1 Step 1, fünf Guards.

**Bewusst nicht abgedeckt:** die eingebauten llama.cpp-Tools (`--tools`, `-ag/--agent`). Sie stehen in derselben Registry und wären ein Einzeiler, tragen aber eine eigene Sicherheitsabwägung — `exec_shell_command` und `write_file` auf einem Server, der Ticketdaten sieht. Das gehört in ein eigenes Ticket mit eigener Begründung, nicht als Beifang hier hinein.

**Abhängigkeit nach außen:** Task 4 Step 2 hängt an T002394. Der Schritt prüft die Vorbedingung explizit und hat einen definierten Alternativpfad (Kommentar am anderen Ticket), läuft also in beiden Fällen zu Ende.

**Typkonsistenz geprüft:** `render_llamacpp_json` und `LLAMACPP_TARGET` werden in Task 1 definiert und in `cmd_render`/`cmd_check` mit exakt diesen Namen genutzt. Der Registry-Schlüssel heißt durchgängig `llamacpp` (nicht `llama_cpp` oder `llama-cpp`) — in Renderer, Registry-Blöcken, Guard 5 und im Kommentar.
