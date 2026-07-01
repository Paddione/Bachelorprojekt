---
title: "ticket-mcp Go-Rewrite mit HTTP-Transport"
ticket_id: T001043
domains: [infra, tooling]
status: plan_staged
---

# ticket-mcp Go-Rewrite — Implementation Plan

## File Structure

```
scripts/ticket-mcp/
  go/
    cmd/ticket-mcp/main.go          # Transport-Wahl, Server-Init (neu)
    internal/tools/list.go          # list_tickets, get_ticket, export_tickets (neu)
    internal/tools/triage.go        # triage_ticket, backfill_ticket_id (neu)
    internal/tools/planning.go      # set_plan_meta, set_readiness_flag, prepare_feature (neu)
    internal/tools/lifecycle.go     # transition_status, add_comment, update_fields (neu)
    internal/tools/mishap.go        # report_mishap + mishap-buffer (neu)
    internal/runner/run_ticket.go   # exec.Command-Wrapper (neu)
    go.mod                          # neu
    go.sum                          # neu (generiert)
    Makefile                        # neu
  .gitignore                        # neu (ignoriert ticket-mcp-go Binary)
  ticket-mcp-go                     # Build-Artefakt (gitignoriert)
.opencode/opencode.jsonc             # ändern: local→remote
.mcp.json                           # ändern: stdio→Go-Binary
scripts/mcp-portforward.sh          # ändern: Port 13004 in Status-Schleife
Taskfile.yml                        # ändern: ticket-mcp:build Task
```

## Übersicht

Port des bestehenden Node.js MCP-Servers `scripts/ticket-mcp/` nach Go — als **Single Binary**
mit **Dual-Transport** (stdio für Claude Code, StreamableHTTP für opencode auf Port 13004).
Auslöser: opencode kann den Node-Server nicht spawnen (`zod` nur transitiv, nicht in
`package.json` deklariert), opencode-Sessions haben dadurch keinen Zugriff auf die 12
ticket-mcp-Tools.

**Komplexität:** mittel. Es ist eine 1:1-Portierung mit **bekanntem, gelesenem Quell-Verhalten** —
keine neue Fachlogik. Der Aufwand liegt in (a) der exakten Parameter-/Enum-/Default-Treue zu den
Node-Tools, (b) der Composite-Logik von `prepare_feature` (`plan-meta` + Readiness-Flags +
`inject attention_mode` + `update-status`), (c) der Transport-Umschaltung und (d) den drei
Konfig-Touchpoints (`.opencode/opencode.jsonc`, `.mcp.json`, `scripts/mcp-portforward.sh`).

**Risiken (Kurz):**
1. **Parameter-/Default-Drift** — jede Abweichung bei snake_case-Namen, Enums oder Defaults
   (`brand=mentolder`, `limit=200`, `status=triage` bei triage, `author=claude-code`,
   `visibility=internal`) bricht bestehende Tool-Aufrufe still. Gegenmaßnahme: pro Tool die
   Node-Quelle als verbindliche Referenz, Smoke-Test der Tool-Liste.
2. **mark3labs/mcp-go API-Drift** — die SDK-API (Tool-Registrierung, Param-Extraktion,
   StreamableHTTP-Server) ist versionsabhängig. Gegenmaßnahme: Version in `go.mod` pinnen, vor
   Implementierung via context7 / godoc die aktuelle API-Form prüfen.
3. **Security-Wrapper** — `exec.Command("bash", ticketSh, args...)` ohne `-c`, Pfad-Validierung
   gegen Repo-Root. Falsch implementiert → Shell-Injection-Risiko oder kaputte Repo-Root-Erkennung
   im Worktree (`os.Executable()` zeigt auf das Binary, nicht auf den CWD).

**Quality-Gate-Vorabprüfung (S1 Zeilenlimits):** Alle Go-Quelldateien sind **neu**
(nicht-baselined) → wirksame Schwelle = statisches Extension-Limit. `.go` ist in
`docs/code-quality/gates.yaml` **nicht** in der S1-Limit-Tabelle aufgeführt (Stand 2026-06: nur
`.ts/.js/.jsx/.py/.svelte/.sh/.mjs/.mts/.astro/.tsx/.java/.php/.bash/.cjs`) → keine Go-Zeilen-Ratchet.
**Verifizieren** in Task 1 via `jq '.s1.limits' docs/code-quality/gates.yaml`; falls `.go` doch
gelistet ist, jede Datei mit Wachstumsreserve < 80 % des Limits schneiden (Tools nach Gruppen
getrennt — wie in der Node-Struktur). Geänderte Config-Dateien (`.jsonc`, `.json`, `.sh`) bleiben
zeilenneutral bis +wenige Zeilen → kein S1-Risiko.
**S4 (Orphan):** Das neue Go-Binary wird über `.mcp.json` + `.opencode/opencode.jsonc` referenziert;
das Makefile-Build wird über einen neuen Taskfile-Eintrag erreichbar (Task 6) → kein Orphan.

---

## Task 1: Go-Modul und Projektstruktur anlegen

### Requirement
Ein Go-Modul unter `scripts/ticket-mcp/go/` mit gepinnter `mark3labs/mcp-go`-Abhängigkeit, Go ≥ 1.21,
und ein Makefile, das ein Binary `ticket-mcp-go` in den **Parent**-Ordner `scripts/ticket-mcp/`
baut (nicht ins `go/`-Subdir).

### target_files
- `scripts/ticket-mcp/go/go.mod` (neu)
- `scripts/ticket-mcp/go/go.sum` (neu, generiert)
- `scripts/ticket-mcp/go/Makefile` (neu)
- `scripts/ticket-mcp/go/cmd/ticket-mcp/main.go` (neu, Platzhalter-`package main` für ersten Build)
- `scripts/ticket-mcp/.gitignore` (neu)
- Referenz (read-only): `docs/code-quality/gates.yaml`

### Steps
- [ ] `go.mod` anlegen: `module github.com/korczewski/bachelorprojekt/ticket-mcp`, `go 1.21`
      (oder höher, gegen lokal installierte Go-Version prüfen).
- [ ] Vor `go get`: aktuelle `mark3labs/mcp-go`-API verifizieren (context7 `resolve-library-id` +
      `query-docs`, oder `go doc github.com/mark3labs/mcp-go/server` nach dem ersten `go get`) —
      insb. Server-Konstruktor, `AddTool`-Signatur und StreamableHTTP-Server-Typ.
- [ ] `go get github.com/mark3labs/mcp-go@latest` und Version in `go.mod` festschreiben; `go mod tidy`.
- [ ] `Makefile` mit `build`-Target: `go build -o ../ticket-mcp-go ./cmd/ticket-mcp`
      (Output landet in `scripts/ticket-mcp/ticket-mcp-go`). Zusätzlich `tidy`- und `test`-Targets.
- [ ] `scripts/ticket-mcp/.gitignore` mit Zeile `ticket-mcp-go` (das gebaute Binary nicht committen).
- [ ] Minimal-`main.go` (`func main() {}`), damit `make build` grün ist (echte Logik in Task 5).
- [ ] S1-Gate prüfen: `jq '.s1.limits' docs/code-quality/gates.yaml` — bestätigen, dass `.go`
      kein Zeilenlimit hat (oder das Limit notieren).

### Acceptance Criteria
- [ ] `cd scripts/ticket-mcp/go && make build` erzeugt `scripts/ticket-mcp/ticket-mcp-go`.
- [ ] `go.mod` pinnt eine konkrete `mark3labs/mcp-go`-Version; `go.sum` ist vollständig.
- [ ] `scripts/ticket-mcp/.gitignore` ignoriert das Binary; `git status` zeigt es nicht als untracked.
- [ ] `go vet ./...` ist sauber.

---

## Task 2: runner — `run_ticket.go` (exec.Command-Wrapper + Security)

### Requirement
Ein `runner`-Paket, das `scripts/ticket.sh` via `exec.Command("bash", ticketSh, args...)` aufruft —
**ohne** `-c`-Flag, **ohne** String-Interpolation. Repo-Root wird zur Laufzeit ermittelt,
`ticketSh`-Pfad gegen den Repo-Root validiert (`filepath.Clean` + `strings.HasPrefix`). Verhalten
1:1 zu `lib/run-ticket.js`: `BRAND`-Env-Override, `maxBuffer`-Äquivalent, stderr-getriebene
Fehlermeldung `ticket.sh failed (exit code N): <stderr>`.

### target_files
- `scripts/ticket-mcp/go/internal/runner/run_ticket.go` (neu)
- Referenz (read-only): `scripts/ticket-mcp/lib/run-ticket.js`

### Steps
- [ ] **Repo-Root-Erkennung:** Aus `os.Executable()` den Binary-Pfad nehmen, `filepath.EvalSymlinks`,
      dann von dort aufwärts traversieren bis ein Verzeichnis mit `scripts/ticket.sh` **und** `.git`
      gefunden ist. (Das Binary liegt in `scripts/ticket-mcp/` → Repo-Root = drei Ebenen hoch, aber
      die Suche nach `scripts/ticket.sh` macht es worktree-robust, da `os.Getwd()` bei stdio aus
      Claude Code/opencode nicht verlässlich ist.) Fallback: `TICKET_MCP_REPO_ROOT`-Env-Var.
- [ ] **`ticketSh`-Validierung:** `ticketSh := filepath.Join(repoRoot, "scripts", "ticket.sh")`,
      dann `clean := filepath.Clean(ticketSh)` und `strings.HasPrefix(clean, repoRoot)` erzwingen —
      sonst Fehler. (Verteidigt gegen einen evtl. via Env injizierten `TICKET_SH`-Override; falls
      `TICKET_SH`-Env wie im Node-Code unterstützt wird, denselben Prefix-Check anwenden.)
- [ ] **Ausführung:** `cmd := exec.Command("bash", ticketSh, args...)`; `cmd.Env` = `os.Environ()`
      plus `extraEnv` (z.B. `BRAND=…`, `VDA_NONINTERACTIVE=1`). **Niemals** `bash -c`.
- [ ] **Output/Buffer:** stdout in einen `bytes.Buffer` (Node nutzt `maxBuffer: 10MB` — Go hat
      kein hartes Limit; optional einen 10-MB-Cap loggen, aber stdout vollständig zurückgeben).
- [ ] **Fehlerformat:** bei `*exec.ExitError` stderr trimmen und
      `fmt.Errorf("ticket.sh failed (exit code %d): %s", code, stderrTrimmed)` zurückgeben —
      identisch zur Node-Meldung, damit Tool-Fehlertexte stabil bleiben.
- [ ] Exportierte Signatur: `RunTicket(args []string, extraEnv map[string]string) (string, error)`.

### Acceptance Criteria
- [ ] Kein `exec.Command("bash", "-c", …)` und keine `fmt.Sprintf`-Args-Konstruktion im Code.
- [ ] Repo-Root wird unabhängig vom CWD korrekt gefunden (Test: Binary aus `/tmp` heraus starten).
- [ ] `RunTicket(["list","--brand","mentolder"], …)` mit `FACTORY_DRY_RESOLVE=1` gibt die
      `DRY-RESOLVE`-Zeile zurück und exit 0 (Smoke gegen echtes `ticket.sh`).
- [ ] Bei nicht-existentem `ticket.sh` / Prefix-Verletzung schlägt der Aufruf mit klarem Fehler fehl.

---

## Task 3: mishap-buffer — JSON-Persistenz + classifyBundle

### Requirement
Ein `mishap`-Paket (oder Teil von `internal/tools/mishap.go`), das `.git/mishap-buffer.json` liest
und schreibt und `classifyBundle(entries)` mit **exakt** der Node-Logik implementiert
(severity/priority/areas/title/description).

### target_files
- `scripts/ticket-mcp/go/internal/tools/mishap.go` (Buffer- + classify-Teil; neu — siehe auch Task 4)
- Referenz (read-only): `scripts/ticket-mcp/lib/mishap-buffer.js`, `scripts/ticket-mcp/tools/mishap.js`

### Steps
- [ ] **Buffer-Pfad:** `filepath.Join(repoRoot, ".git", "mishap-buffer.json")` (Repo-Root aus Task 2).
- [ ] **`readBuffer`:** Datei lesen + `json.Unmarshal` in `[]MishapEntry`; bei Fehler/Nichtexistenz
      leeren Slice zurückgeben (Node: `try/catch → []`). **Nicht** fatal.
- [ ] **`writeBuffer`:** `json.MarshalIndent(entries, "", "  ")` (2-Space-Indent wie Node
      `JSON.stringify(…, null, 2)`), dann schreiben.
- [ ] **`MishapEntry`-Felder** mit JSON-Tags: `title`, `description`, `component`, `type`,
      `reported_at` (ISO-8601 via `time.Now().UTC().Format(time.RFC3339)` — Node nutzt
      `new Date().toISOString()`, also UTC mit `Z`; UTC-`Z` beibehalten).
- [ ] **`classifyBundle`** 1:1:
      - `hasCritical = any(type == "broken" || type == "security")`
      - `severity = hasCritical ? "major" : "minor"`, `priority = hasCritical ? "hoch" : "mittel"`
      - `components` = eindeutige, nicht-leere `component`-Werte **in Reihenfolge des ersten
        Auftretens** (Node: `[...new Set(...)]` bewahrt Insertion-Order — in Go manuell ein
        `seen`-Set + Slice, **keine** `map`-Iteration, die ist ungeordnet).
      - `areas = strings.Join(components, ",")`
      - `title = fmt.Sprintf("Mishap-Bundle: %s (%d Einträge)", strings.Join(components, ", "), len(entries))`
      - `description` = pro Eintrag `### Mishap %d: %s\n**Typ:** %s | **Komponente:** %s\n\n%s`,
        verbunden mit `\n\n---\n\n`.

### Acceptance Criteria
- [ ] `classifyBundle` produziert byte-identische `title`/`description`/`areas`/`severity`/`priority`
      wie die Node-Funktion für denselben Input (manueller Vergleich an 1 broken- + 2 degraded-Beispiel).
- [ ] `components` behält Insertion-Order (kritisch: `map`-Iteration vermeiden).
- [ ] Nichtexistente Buffer-Datei → leerer Slice, kein Crash.

---

## Task 4: Tools — alle 12 Tools portieren

### Requirement
Alle 12 Tools mit **identischen** snake_case-Parameternamen, Enums, Defaults und ausgegebenen
`ticket.sh`-Argumenten registrieren. Gruppierung analog Node:
`list.go` (list_tickets, get_ticket, export_tickets), `triage.go` (triage_ticket,
backfill_ticket_id), `planning.go` (set_plan_meta, set_readiness_flag, prepare_feature),
`lifecycle.go` (transition_status, add_comment, update_fields), `mishap.go` (report_mishap).

### target_files
- `scripts/ticket-mcp/go/internal/tools/list.go` (neu)
- `scripts/ticket-mcp/go/internal/tools/triage.go` (neu)
- `scripts/ticket-mcp/go/internal/tools/planning.go` (neu)
- `scripts/ticket-mcp/go/internal/tools/lifecycle.go` (neu)
- `scripts/ticket-mcp/go/internal/tools/mishap.go` (neu — baut auf Task 3 auf)
- Referenz (read-only): die fünf `scripts/ticket-mcp/tools/*.js`

### Steps — list.go
- [ ] `list_tickets(brand?, status?, type?, attention_mode?, missing_id? bool, limit? int 1..1000)`,
      Default `brand=mentolder`, `limit=200` → `["list","--brand",brand,"--limit",str(limit)]`
      + optional `--status/--type/--attention-mode/--missing-id`; Env `BRAND=brand`.
- [ ] `get_ticket(id, brand?)` → `["get","--id",id]`, Env `BRAND`.
- [ ] `export_tickets(brand?, status?, type?, format? json|markdown, limit? 1..1000)`,
      Default `format=json`, `limit=200`. Bei `markdown`: stdout als JSON parsen
      (`json.Unmarshal` in `[]struct{ ExternalID, Status, Title }`) und Zeilen
      `- **<external_id|(kein ID)>** [<status>] <title>` joinen; leer → `_(keine Tickets)_`.

### Steps — triage.go
- [ ] `triage_ticket(id, brand?, type? enum, severity? enum, priority? enum, attention_mode? enum,
      status? = "triage")` → `["triage","--id",id,"--status",status,"--apply","--no-comment"]`
      + optionale `--priority/--severity/--type/--attention-mode`; Env `BRAND` **und**
      `VDA_NONINTERACTIVE=1`.
- [ ] `backfill_ticket_id(brand?)` → `["backfill-id","--brand",brand]`; leerer Output →
      `"Keine Tickets ohne ID gefunden."`.

### Steps — planning.go
- [ ] `set_plan_meta(id, brand?, value_prop?, effort? enum[klein,mittel,gross], areas?, depends_on?,
      rank? int)` → `["plan-meta","set","--id",id]` + optional
      `--value-prop/--effort/--areas/--depends-on/--rank`.
- [ ] `set_readiness_flag(id, brand?, flag enum[spec_skizziert,abhaengigkeiten_klar,
      offene_fragen_geklaert,aufwand_geschaetzt,lastenheft_locked], value bool)` →
      `["plan-meta","set","--id",id,"--readiness","<flag>=<true|false>"]`.
- [ ] `prepare_feature(...)` als **Composite** (Reihenfolge exakt wie Node):
      1. `plan-meta set --id …` nur wenn mind. eines von value_prop/effort/areas/depends_on gesetzt.
      2. Pro gesetztem Readiness-Flag (spec_skizziert, abhaengigkeiten_klar, offene_fragen_geklaert,
         aufwand_geschaetzt — nur die nicht-nil): `plan-meta set … --readiness flag=<bool>`.
      3. Falls `attention_mode` gesetzt: `inject --id … --fields attention_mode=<mode>`.
      4. Immer zuletzt: `update-status --id … --status planning`.
      - Jeder Teilschritt **fängt Fehler ab** und hängt `FEHLER <stufe>: <msg>` ans Log
        (Node `.catch(...)`), statt abzubrechen. Rückgabe = `\n`-join der nicht-leeren Logzeilen.
      - Hinweis: `priority` und `severity` sind im Node-Schema deklariert, werden aber **nicht** an
        `ticket.sh` durchgereicht — dieses Verhalten 1:1 spiegeln, damit kein Verhaltens-Drift
        entsteht. Im Code mit Kommentar markieren.

### Steps — lifecycle.go
- [ ] `transition_status(id, brand?, status enum[triage,planning,plan_staged,backlog,in_progress,
      in_review,qa_review,blocked,awaiting_deploy,done,archived], resolution? enum[fixed,shipped,
      obsolete], notes?)` → `["update-status","--id",id,"--status",status]` + optional
      `--resolution/--notes`.
- [ ] `add_comment(id, brand?, body, author? = "claude-code", visibility? = "internal")` →
      `["add-comment","--id",id,"--body",body,"--author",author,"--visibility",visibility]`.
- [ ] `update_fields(id, brand?, notes?)`: ohne `notes` → Text
      `"Keine Felder zum Aktualisieren angegeben."`; mit `notes` →
      `["add-comment","--id",id,"--body",notes,"--author","ticket-mcp","--visibility","internal"]`.

### Steps — mishap.go (Tool-Teil, Buffer aus Task 3)
- [ ] `report_mishap(title, description, component, type enum[broken,degraded,suspicious,security,
      drift], brand?)`: Entry an Buffer anhängen.
      - `len < 3` → Buffer schreiben, Text `Mishap gespeichert (n/3). Noch <3-n> bis …`.
      - `len >= 3` → erste 3 Einträge `classifyBundle`, dann
        `ticket.sh create --type task --brand … --title … --description … --status triage
        --severity … --priority … --attention-mode ai_ready --areas …`. Bei Erfolg Buffer auf
        `entries[3:]` kürzen + schreiben; `extId = split(stdout,"|")[0]`. Bei Fehler: vollen Buffer
        zurückschreiben und Fehler propagieren (Node-Verhalten exakt spiegeln).
      - Konstante `MISHAP_TRIGGER = 3`.
- [ ] **Param-Extraktion** überall über die `mark3labs/mcp-go`-Request-Helper (z.B.
      `request.RequireString`/`request.GetString`/`GetBool`/`GetInt` o. ä. — exakte Helfer-Namen aus
      der gepinnten SDK-Version verifizieren). Optionale Felder als Pointer/`ok`-Pattern, damit der
      Unterschied „nicht gesetzt" vs. „leer/false" erhalten bleibt (wichtig für `missing_id`,
      Readiness-Flags, `rank`).
- [ ] Enum-Validierung serverseitig erzwingen (SDK-Enum-Option falls vorhanden; sonst manuell
      prüfen und Fehler zurückgeben) — gleiche erlaubte Werte wie die zod-`enum`s.

### Acceptance Criteria
- [ ] Alle 12 Tool-Namen + alle Parameternamen sind byte-identisch zu den Node-Tools (snake_case).
- [ ] Defaults stimmen: `brand=mentolder`, `limit=200`, triage `status=triage`,
      add_comment `author=claude-code`/`visibility=internal`, export `format=json`.
- [ ] `prepare_feature` führt die 4 Stufen in der Node-Reihenfolge aus und sammelt Teilfehler,
      statt abzubrechen; `priority`/`severity` werden bewusst nicht an `ticket.sh` weitergegeben.
- [ ] `export_tickets format=markdown` erzeugt dieselbe Zeilenform wie Node.
- [ ] `report_mishap` triggert bei genau 3 Einträgen ein Bundle-Ticket und kürzt den Buffer korrekt.

---

## Task 5: main.go — Transport-Wahl (stdio default, HTTP via Flag/Env)

### Requirement
`cmd/ticket-mcp/main.go` initialisiert den MCP-Server, registriert alle 5 Tool-Gruppen und wählt
den Transport: **stdio** als Default; **StreamableHTTP** auf `/mcp` wenn `--http`-Flag **oder**
`TICKET_MCP_HTTP=1`. Port aus `TICKET_MCP_PORT` (Default `13004`).

### target_files
- `scripts/ticket-mcp/go/cmd/ticket-mcp/main.go` (ersetzt Platzhalter aus Task 1)

### Steps
- [ ] Server bauen: Name `ticket-mcp`, Version `1.0.0` (Parität zu `server.js`).
- [ ] Alle Registrierungsfunktionen aufrufen (`RegisterListTools`, `RegisterTriageTools`,
      `RegisterPlanningTools`, `RegisterLifecycleTools`, `RegisterMishapTools`) — jede bekommt den
      Server + (falls nötig) den Repo-Root/runner injiziert.
- [ ] **Transport-Entscheidung:** `flag.Bool("http", …)`;
      `httpMode = *httpFlag || os.Getenv("TICKET_MCP_HTTP") == "1"`.
- [ ] **Port:** `port := os.Getenv("TICKET_MCP_PORT")`; leer → `"13004"`. Validieren (numerisch).
- [ ] **stdio:** `server.ServeStdio(s)` (exakter SDK-Aufruf gemäß gepinnter Version).
- [ ] **HTTP:** StreamableHTTP-Server der SDK auf `:<port>` mit Endpoint-Pfad `/mcp` starten
      (SDK-Typ `server.NewStreamableHTTPServer` o. ä. — API verifizieren). Start-Logzeile auf
      **stderr** (nicht stdout — stdout ist bei stdio der MCP-Kanal).
- [ ] Sauberes Shutdown auf SIGINT/SIGTERM (für den HTTP-Modus).

### Acceptance Criteria
- [ ] `./ticket-mcp-go` ohne Args läuft im stdio-Modus (kein Port offen).
- [ ] `TICKET_MCP_HTTP=1 ./ticket-mcp-go` **und** `./ticket-mcp-go --http` lauschen auf
      `http://localhost:13004/mcp`.
- [ ] `TICKET_MCP_PORT=13099 ./ticket-mcp-go --http` lauscht auf 13099.
- [ ] Im stdio-Modus geht **keine** Diagnose-Ausgabe nach stdout.

---

## Task 6: Konfiguration — opencode.jsonc, .mcp.json, mcp-portforward.sh, Taskfile

### Requirement
Die drei MCP-Konfig-Touchpoints auf das Go-Binary umstellen und den Build erreichbar machen (S4).

### target_files
- `.opencode/opencode.jsonc` (ändern)
- `.mcp.json` (ändern — Claude-Code-stdio-Eintrag)
- `scripts/mcp-portforward.sh` (ändern)
- `Taskfile.yml` (ändern — neuer `ticket-mcp:build`-Task; exakter Namespace via task-oracle prüfen)

### Steps
- [ ] **opencode.jsonc:** `ticket-mcp`-Eintrag von `{"type":"local","command":["node",…server.js]}`
      auf `{"type":"remote","url":"http://localhost:13004/mcp","enabled":true}` umstellen
      (Block in den „Monolith HTTP-Endpunkte"-Bereich verschieben, JSONC-Kommentare respektieren).
- [ ] **.mcp.json (Claude Code):** Der committete `.mcp.json` enthält aktuell **keinen**
      `ticket-mcp`-Eintrag (die stdio-Registrierung lebt in der gitignorierten lokalen
      `.claude/settings.json`). Plan-Entscheidung: einen stdio-Eintrag
      `"ticket-mcp": {"command": "<repo>/scripts/ticket-mcp/ticket-mcp-go"}` in `.mcp.json`
      ergänzen, damit Claude Code das Go-Binary nutzt. **Absoluter Pfad** wie bei
      `mcp-task-runner` (`/home/patrick/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go`).
      → **In der Execute-Phase mit Patrick bestätigen**, ob der Eintrag in `.mcp.json`
      (committed) oder in der lokalen `.claude/settings.json` (machine-local, nicht committed)
      landen soll. Default-Annahme: `.mcp.json`.
- [ ] **mcp-portforward.sh:** Da der Go-Server **lokal** läuft (kein k8s-Service dahinter), wird
      Port 13004 **nicht** zum `kubectl port-forward`-Aufruf (`18080:8080 …`) hinzugefügt.
      Stattdessen:
      - `status`-Sektion um Port `13004` in der Listening-Schleife erweitern
        (`for port in 18080 13000 13001 13002 13004 4317`).
      - Optional die Endpoint-Health-Schleife um `"ticket:13004:/mcp"` ergänzen.
      - In Execute mit Patrick abklären, ob zusätzlich ein `start_ticket_mcp()`-Helper (Binary im
        HTTP-Modus starten/stoppen) gewünscht ist.
- [ ] **Taskfile.yml:** Einen Task `ticket-mcp:build` (oder vorhandenen Namespace via
      `bash scripts/task-oracle.sh 'build ticket-mcp go binary'` ermitteln) ergänzen, der
      `make -C scripts/ticket-mcp/go build` aufruft → macht das neue `Makefile` Taskfile-erreichbar
      (S4-Orphan-Schutz) und CI-baubar.

### Acceptance Criteria
- [ ] `.opencode/opencode.jsonc` ist valides JSONC (keine Trailing-Comma-Fehler), `ticket-mcp`
      zeigt auf `http://localhost:13004/mcp`.
- [ ] `.mcp.json` ist valides JSON und referenziert das Go-Binary (oder dokumentierte Alternative).
- [ ] `scripts/mcp-portforward.sh status` listet `:13004`.
- [ ] `task ticket-mcp:build` baut das Binary.

---

## Task 7: Verification

### Requirement
Funktionale Parität nachweisen, vorhandene Tests grün halten, Quality-Gates erfüllen.

### target_files
- ggf. `tests/spec/ticket-mcp.bats` (nur falls Smoke-Erweiterung nötig — **nicht** neue
  ticket-nummerierte Datei)
- `website/src/data/test-inventory.json` (nur falls Tests geändert wurden)

### Steps
- [ ] **Failing-Test zuerst (red):** Smoke-Test aufrufen, bevor das Binary existiert —
      expected: FAIL (Binary fehlt noch, Exit 1 erwartet).
      `./tests/runner.sh local ticket-mcp 2>&1 | grep -i fail` → verify it fails.
      Erst nach diesem bestätigten Rot-Zustand Build starten (green).
- [ ] **Build + Vet:** `cd scripts/ticket-mcp/go && make build && go vet ./... && go test ./...`
      (Go-Unit-Tests für `classifyBundle` und Repo-Root-Erkennung optional, aber empfohlen —
      wenn hinzugefügt, sind es Go-Tests, **keine** BATS/Vitest, also kein test-inventory-Impact;
      verifizieren).
- [ ] **stdio-Smoke:** Binary im stdio-Modus per JSON-RPC-`initialize` + `tools/list` anstoßen
      (z.B. `printf '<initialize>\n<tools/list>\n' | ./ticket-mcp-go`) und prüfen, dass
      **alle 12 Tools** gelistet werden.
- [ ] **HTTP-Smoke:** `./ticket-mcp-go --http &`, dann
      `curl -s -X POST -H 'Content-Type: application/json'
      -H 'Accept: application/json, text/event-stream'
      http://localhost:13004/mcp -d '<tools/list>'` → 12 Tools.
- [ ] **opencode-Erkennung:** Sicherstellen, dass der `remote`-Eintrag von opencode geladen wird
      (sofern lokal eine opencode-Instanz verfügbar ist — sonst dokumentieren).
- [ ] **Bestehende BATS:** `./tests/runner.sh local` für `tests/spec/ticket-mcp.bats` läuft grün
      (testet `ticket.sh` direkt, vom Rewrite unberührt — Regressions-Sicherung).
- [ ] **Pflicht-CI-Gates (in dieser Reihenfolge):**
  - [ ] `task test:changed`
  - [ ] `task freshness:regenerate`
  - [ ] `task freshness:check`
- [ ] **Falls Tests geändert/hinzugefügt wurden:** `task test:inventory` und
      `website/src/data/test-inventory.json` mitcommitten (CI failt sonst). Bei reinen Go-`*_test.go`
      verifizieren, ob das Inventar sie überhaupt erfasst — wenn nicht, entfällt dieser Schritt.

### Acceptance Criteria
- [ ] `make build`, `go vet`, `go test` grün.
- [ ] stdio- **und** HTTP-Smoke listen jeweils alle 12 Tools.
- [ ] `tests/spec/ticket-mcp.bats` grün.
- [ ] `task test:changed`, `task freshness:regenerate`, `task freshness:check` ohne Fehler.
- [ ] S1–S4 sauber (kein Orphan, kein Hostname-Literal, kein Baseline-Wachstum).
- [ ] Node-Implementierung unter `scripts/ticket-mcp/{server.js,lib,tools}` bleibt als Referenz
      erhalten (kein Delete — Scope-Vorgabe der Proposal).
