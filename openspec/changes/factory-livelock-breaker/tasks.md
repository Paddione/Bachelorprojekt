---
title: "factory-livelock-breaker — Implementation Plan"
ticket_id: T002361
domains: [bachelorprojekt-test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-livelock-breaker — Implementation Plan

_Ticket: T002361_

## File Structure

```
GEAENDERT:
  scripts/factory/watchdog.sh        (Attempt-Zaehler mit Fortschritts-Reset, Eskalation)
  scripts/ticket.sh                  (neues cmd_unfactory + Dispatch + Usage-Zeile)
  scripts/factory/queue.sh           (factory_excluded-Gate in BEIDEN Dispatch-Zweigen)
  scripts/factory/pipeline.mjs       (dryrun-mark raus aus dem Agent-Prompt)
  scripts/factory/pipeline-runner.js (neues dryrun-mark-Kommando, NICHT fehlerschluckend)
  tests/spec/software-factory.bats   (7 Regressionstests, bereits als RED geschrieben)
```

**Nachtrag zur File Structure (waehrend der Umsetzung erkannt):**
`scripts/factory/pipeline-runner.js` kam hinzu. `pipeline.mjs` hat keinen Node-API-Zugriff
(kein `fs`, kein `child_process`) und fuehrt jeden Shell-Seiteneffekt ueber
`runRunner(agent, '<command>', payload)` aus, das im Runner landet. Der Marker-Aufruf braucht
dort also ein eigenes Kommando. Anders als `phase-event` (das Fehler mit `catch {}` schluckt)
darf `dryrun-mark` NICHT schlucken — ein still uebersprungener Marker ist genau der Bug.

**Praezisierung zu „deterministisch":** auch `runRunner` laesst einen Agenten den Befehl
ausfuehren. Der Gewinn ist nicht „ohne Modell", sondern: der Marker wandert von einem
Stichpunkt unter fuenf in einem Review-Prompt zu einem eigenen Programmschritt mit
Ein-Zweck-Prompt, der im Kontrollfluss liegt und dessen Fehlschlag als Exception sichtbar wird.

Keine neuen Dateien. Keine Datenbankmigration: `factory_control.updated_at` und
`factory_phase_events.at` existieren bereits, inklusive Index
`factory_phase_events_ticket_at_idx (ticket_id, at DESC)`.

### S1-Budgets

| Datei | Endung | Limit | Ist | Wirksame Schwelle |
|---|---|---|---|---|
| `scripts/factory/watchdog.sh` | `.sh` | 500 | 76 | 500, Reserve 424 Zeilen |
| `scripts/factory/queue.sh` | `.sh` | 500 | 30 | 500, Reserve 470 Zeilen |
| `scripts/ticket.sh` | `.sh` | 500 | 924 | keine, Datei steht auf der `s1.ignore`-Liste |
| `scripts/factory/pipeline.mjs` | `.mjs` | 500 | 617 | keine, Datei steht auf der `s1.ignore`-Liste |
| `scripts/factory/pipeline-runner.js` | `.js` | 600 | 489 | 600, Reserve 111 Zeilen |
| `tests/spec/software-factory.bats` | `.bats` | keins | 4419 | nicht S1-gated |

`scripts/ticket.sh` ist in `docs/code-quality/gates.yaml` als „sanctioned single-file CLI"
ausgenommen (G-RH01 Batch 1, „low priority, do not split"). `scripts/factory/pipeline.mjs`
ist als ESM-Zwilling von `pipeline.js` ausgenommen (T000460: Workflow-Skripte verbieten
Top-Level-Importe vor `meta` und `import()` zur Laufzeit, daher nicht modularisierbar).

Beide Ausnahmen sind kein Freibrief. Die Aenderungen dort sind bewusst klein: `ticket.sh`
bekommt eine Subcommand-Funktion, `pipeline.mjs` verschiebt drei Zeilen aus einem
Template-Literal in Code. Waechst einer der beiden Eingriffe ueber ~40 Zeilen, ist das ein
Split-Signal und kein Grund, Zeilen kosmetisch zusammenzuziehen.

## Abgrenzung

Nicht in diesem Change:

- Die Modell-Eskalationsleiter gemma -> deepseek-flash -> deepseek-pro (**T002369**,
  `blocked_by` T002359 und T002361).
- Der slot-gebundene Kontextraum je Factory-Slot (**T002370**, Epic).
- `guard_dryrun_ok` bleibt fail-closed. Fuer einen Kill-Switch ist das richtig; die
  Unfaehigkeit, einen Infra-Abbruch von „nie gelaufen" zu unterscheiden, wird durch den
  Zaehler abgefedert, nicht durch Aufweichen des Guards.
- Preflight auf `ANTHROPIC_BASE_URL` vor dem Dispatch — gehoert zu T002359, sonst
  Doppelarbeit im selben Codebereich.
- `scripts/factory/pipeline.js` wird NICHT angefasst. Sie ist eine Dublette, die nichts
  dispatcht (`dispatcher-bridge.sh:98` startet `pipeline.mjs`, `run-pipeline.mjs:136`
  importiert sie). Die Dublette selbst ist ein eigener Befund.

## Verify (RED → GREEN)

### Task 1 — RED: Regressionstests und Fehlschlag-Nachweis

- [x] Die sieben Tests liegen in `tests/spec/software-factory.bats` unter der Sektion
      `T002361-livelock-breaker`. Sie pruefen strukturell per `grep` gegen Dateien, nicht
      gegen `$output` — das vermeidet die `$0`-Falle aus CLAUDE.md und laeuft offline in CI.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter 'T002361'
# expected: FAIL (rot — 7 von 7 not ok, die Fixes existieren noch nicht)
```

Test 7 muss aus dem richtigen Grund brechen: an `[ "$output" -eq 0 ]`, weil `dryrun-mark`
derzeit IM Agent-Prompt steht (gefunden 1, erwartet 0). Bricht er stattdessen an
`[ -n "$body" ]`, ist der `sed`-Bereich kaputt und der Test prueft nichts.

### Task 2 — `ticket.sh unfactory` implementieren

- [x] Neues `cmd_unfactory()` in `scripts/ticket.sh`, angelehnt an `cmd_retry_count()`
      (Zeile 415) fuer Argument-Parsing und `_pgpod`/`_exec_sql`-Nutzung.

Ein Statement-Block setzt alle Effekte, damit kein halb angewandter Terminalzustand
beobachtbar ist:

- `status = 'blocked'`
- `attention_mode = 'needs_human'`
- `readiness = COALESCE(readiness,'{}'::jsonb) || '{"factory_excluded":true}'::jsonb`

Danach ein Abschlusskommentar ueber die bestehende Kommentar-Schreibroutine, der den
Zaehlerstand und das juengste `factory_phase_events`-Ereignis nennt.

Registrierung:
- Dispatch-Zeile im `case`-Block (bei `retry-count)`, Zeile 909 herum).
- `unfactory` in die `Commands:`-Zeile der Usage-Ausgabe (Zeile 879) aufnehmen.
- Validierung VOR `_pgpod`, damit Bad-Arg-Fehler ohne Cluster deterministisch sind — die
  Konvention aus `cmd_phase`, dort als FA-SF-48 markiert.

Akzeptanzkriterien:
- `bash scripts/ticket.sh 2>&1 | grep '^Commands:'` enthaelt `unfactory`.
- `bash scripts/ticket.sh unfactory` ohne `--id` gibt Exit 2 mit Fehlermeldung, ohne einen
  Cluster zu kontaktieren.
- Tests 4 und 5 aus Task 1 sind gruen.

### Task 3 — Attempt-Zaehler im Watchdog

- [x] In `scripts/factory/watchdog.sh` innerhalb der bestehenden
      `for row in "${stale[@]}"`-Schleife, VOR der Status-Reset-Entscheidung.

Ein `factory_psql`-Statement macht Compare-and-Set fuer den Key `factory_attempt:<ext_id>`
in `tickets.factory_control`:

- `brand` MUSS non-NULL sein (`$BRAND` ist in diesem Skript gesetzt). Grund: der
  `UNIQUE (key, brand)`-Constraint behandelt NULL als distinct, weshalb
  `ON CONFLICT (key, brand)` bei NULL-Brand nie feuert — siehe den T000474-Kommentar in
  `cmd_factory_control set` und den vorhandenen Fehler in `cmd_dryrun_mark`
  (`ticket.sh:479`), der genau so Duplikate ansammelt.
- Reset-Bedingung: existiert ein `tickets.factory_phase_events`-Eintrag fuer dieses Ticket,
  dessen `at` neuer ist als das `updated_at` der Zaehlerzeile, wird auf `1` gesetzt, sonst
  auf `value::int + 1`. Fehlt die Zeile, wird sie mit `1` angelegt.
- `tickets.updated_at` darf fuer den Vergleich NICHT verwendet werden: `fn_lifecycle_ts`
  erhoeht es bei jedem Zeilen-Write, ein reiner `ticket.sh touch` saehe damit wie
  Fortschritt aus.

Fehlerverhalten: schlaegt Lesen oder Schreiben fehl, verhaelt sich der Watchdog wie ohne
Zaehler (bisheriges Reset-Verhalten) und schreibt eine Diagnosezeile nach stderr. Ein
DB-Problem darf keine Tickets stillsetzen — das waere ein schlimmerer Fehlermodus als der
behobene.

Akzeptanzkriterien:
- Tests 1 und 2 aus Task 1 sind gruen.
- `BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/watchdog.sh` gibt weiterhin
  Exit 0 — der bestehende Test „FA-SF-26: dry-resolve works" bleibt gruen.

### Task 4 — Eskalation auf `unfactory` bei `FACTORY_MAX_ATTEMPTS`

- [x] `FACTORY_MAX_ATTEMPTS="${FACTORY_MAX_ATTEMPTS:-3}"` in
      `scripts/factory/watchdog.sh` neben `STALE_MIN` deklarieren.

Erreicht der Zaehler aus Task 3 den Wert, wird statt `update-status` auf
`triage`/`backlog`/`plan_staged` das neue `ticket.sh unfactory --id "$ext_id"` aufgerufen.
Slot-Freigabe (`release-slot`) und Zombie-Worktree-Cleanup laufen unveraendert weiter — die
Eskalation ersetzt ausschliesslich das Status-Ziel, nicht die Aufraeumarbeit.

Der Eskalations-Kommentar benennt die Stufe explizit. Heute schreibt der Watchdog bei jedem
Reset denselben Text; sieben identische Kommentare an T002282 waren fuer sich schon ein
Signal, das niemand gesehen hat.

Akzeptanzkriterien:
- Test 3 aus Task 1 ist gruen.
- Das eskalierte Ticket erscheint weiterhin im JSON-Array der eskalierten IDs.

### Task 5 — `factory_excluded`-Gate in `queue.sh`

- [x] Beide Dispatch-Zweige der `WHERE`-Klausel in `scripts/factory/queue.sh` um
      `AND COALESCE((readiness->>'factory_excluded')::boolean, false) = false` erweitern —
      den `type='feature' AND status='backlog'`-Zweig (Zeile 19) und den
      `type='task' AND status='plan_staged'`-Zweig (Zeile 25).

Der Default `false` ist bewusst gewaehlt: ein fehlendes Flag darf kein bestehendes Ticket
ausschliessen. Das entspricht der Konvention von `lastenheft_locked` (Default false) und
`execution_released` (Default true) in derselben Klausel.

Ein SQL-Kommentar haelt fest, warum das Gate zusaetzlich zu `status='blocked'` existiert: es
haelt das Ticket auch dann draussen, wenn der Status spaeter von Hand oder durch ein anderes
Skript zurueckgedreht wird.

Akzeptanzkriterien:
- Test 6 aus Task 1 ist gruen (mindestens 2 Vorkommen).
- Der bestehende Test „T002272-M1: queue.sh WHERE clause gates plan_staged tasks on
  execution_released" bleibt gruen.

### Task 6 — `dryrun-mark` aus dem Agent-Prompt herausnehmen

- [x] In `scripts/factory/pipeline.mjs`, `DRY_RUN`-Zweig (Zeile 480 herum).

- Die Zeile `bash ${REPO}/scripts/ticket.sh dryrun-mark --id ${A.ticket_id}` aus dem
  Template-Literal des `agent()`-Prompts entfernen und die Aufzaehlung im Prompt anpassen
  (Schritt 3 nennt dann nur noch `release-slot` und `update-status`).
- Nach dem `await agent(...)`-Return den Marker deterministisch setzen. Da `pipeline.mjs`
  keinen Node-API-Zugriff hat (kein `fs`, kein `child_process` — es delegiert dafuer an
  `pipeline-runner.js`), laeuft der Aufruf ueber denselben Weg wie andere
  Shell-Seiteneffekte in dieser Datei. Das bestehende Muster in der Datei ist maßgeblich;
  keine neue Delegationsmechanik erfinden.
- Der Kommentar an der Stelle nennt T001816 und den Grund: ein Zustandsuebergang, der die
  einzige Ausfahrt aus der Dry-Run-First-Schleife ist, darf nicht von Modell-Compliance oder
  vom Ueberleben der Session abhaengen.

`release-slot` und `update-status` bleiben im Prompt. Nur die Marker-Zeile wandert, weil sie
die einzige ist, deren Ausfall eine Endlosschleife erzeugt.

Akzeptanzkriterien:
- Test 7 aus Task 1 ist gruen: der Prompt-Bereich enthaelt `dryrun-mark` nicht mehr, der
  `DRY_RUN`-Block als Ganzes schon.
- Die bestehenden `DRY_RUN`-Kontrakttests der Suite bleiben gruen.

### Task 7 — Final Verification

- [x] Alle Gates laufen gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter 'T002361'
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
task openspec:validate
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:changed` deckt die `tests/spec/`-Suite nicht zuverlaessig ab (bekannte Luecke),
deshalb laeuft die vollstaendige `software-factory.bats` hier explizit — sonst bleiben
Regressionen in den ~4300 bestehenden Zeilen unentdeckt.

`task test:inventory` wird von `freshness:regenerate` mitgezogen; CI vergleicht
`website/src/data/test-inventory.json` gegen die committete Version und schlaegt bei
Abweichung fehl. Die 7 neuen `@test`-Eintraege muessen dort auftauchen.

Akzeptanzkriterien:
- 7 von 7 T002361-Tests `ok`.
- Die vollstaendige `software-factory.bats` hat keine neuen Fehlschlaege gegenueber `main`.
- `task openspec:validate` gruen.
- `task freshness:check` gruen; `test-inventory.json` regeneriert und committet.
