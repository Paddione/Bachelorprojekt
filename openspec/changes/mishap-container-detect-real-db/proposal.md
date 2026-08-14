# Proposal: mishap-container-detect-real-db

## Why

### Symptom (Fakt, reproduzierbar)

Am 2026-08-14 07:50:17 UTC wurde T004752 ("Mishap Rollup — fortlaufende Sammlung",
type=chore) angelegt, obwohl T003533 mit identischem Titel und type=chore existierte
und offen war. Der Mishap-Append (`ticket-mcp` → `ticket.sh rollup-container`) erkannte
den bestehenden Container nicht und legte ein Duplikat an.

### Hypothese vs. Ursache (T002448-M5 — mit Evidenz verifiziert)

Hypothese aus dem Ticket: "Die Container-Erkennung findet den Container nicht, wenn er
auf blocked/needs_human steht."

Verifiziert — drei Belege:

1. **Code-Stand zum Mishap-Zeitpunkt** (`git show 9f3e271ed:scripts/ticket.sh`,
   letzter Stand vor 07:50, Commit vom 07:20): `cmd_rollup_container` filterte mit
   einer positiven Status-Allowlist:
   ```sql
   AND status IN ('triage','backlog','planning','plan_staged','in_progress')
   ```
   `blocked` war NICHT enthalten — ein blocked-Container war unsichtbar.
2. **T003533 stand auf blocked** (ticket_comments-Beleg): factory-watchdog am
   2026-08-14 05:52:55: "Status=blocked, attention_mode=needs_human,
   readiness.factory_excluded=true".
3. **Duplikat-Entstehung**: Suche leer → Step 2 (Create) → T004752 created_at
   07:50:17.

Die Hypothese ist damit bestätigt: Die Erkennung schloss `blocked` aus.

### Fix-Status: Root-Cause-Fix bereits auf main (T004898, PR #4423, 13:03 UTC)

Der Dispatch zum Ticket ging davon aus, dass der Root-Cause-Fix noch offen ist. Die
Analyse zeigt: **T004898 hat exakt diesen Defekt bereits behoben** (Commit-Message:
"Der Suchfilter schloss status=blocked aus — ein blocked-Container (T003533) war
unsichtbar und die Aufloesung legte einen Zweit-Container an"):

- `scripts/ticket.sh` `cmd_rollup_container`: `status IN (...)` → `status NOT IN ('done','archived')`
- Regressionstest (Mock): `tests/spec/mishap-rollup/container-finds-blocked-status.bats`
- SSOT-Spec `openspec/specs/mishap-rollup.md` enthält bereits die Requirement
  "rollup-container self-heals on an empty search result" (`status NOT IN ('done','archived')`)
  und das Scenario "An open blocked container is found and reused".

### Verbleibende Lücke (Auftrag dieses Tickets)

Der Dispatch verlangt: "die Erkennungslogik soll gegen die reale DB-Situation getestet
werden (ticket-mcp/ticket.sh als Read-Pfad)". Alle Tests in `tests/spec/mishap-rollup/`
arbeiten mit kubectl-Mocks — **kein einziger Test verifiziert die Container-Erkennung
gegen die echte Datenbank**. Reale Situation (2026-08-14, verifiziert per Read-Query):

- Genau **ein** offener Container: **T005030** (status=triage, attention_mode=auto),
  Nachfolger des obsolete geschlossenen T003533.
- `bash scripts/ticket.sh rollup-container --brand mentolder` liefert live `T005030`.

Dieses Ticket schließt diese Lücke: ein Real-DB-Regressionstest, der die Invariante
"höchstens ein offener Container wird gefunden, kein Duplikat wird angelegt" gegen die
echte DB prüft und die blocked-Sichtbarkeit am realen Ausführungspfad pinnt
(emittiertes SQL-Predikat via kubectl-Passthrough-Wrapper).

## What

1. **Real-DB-Regressionstest** `tests/spec/mishap-rollup/container-resolution-real-db.bats`
   (neue Datei, Spec-Dir-Konvention T002416 — Spec `openspec/specs/mishap-rollup.md`):
   - Verfügbarkeits-Guard in der Rotphase (T002820): Cluster/DB nicht erreichbar → skip
     (CI ohne Cluster skippt sauber, lokal gegen k3d läuft der Test).
   - Positiv-Anker (T002356-M1): `ticket.sh rollup-container --brand mentolder` läuft
     (rc 0, Output nicht leer).
   - Aussage A (realer Finde-Pfad): Output == der einzige offene Container (per
     eigenständigem DB-Read ermittelt — aktuell T005030), kein "kein offener
     Container"-Diagnostik auf stderr.
   - Aussage B (kein Duplikat): nach dem Lauf existiert weiterhin genau ein offener
     Container (Count == 1).
   - Aussage C (blocked-Sichtbarkeit am realen Pfad): kubectl-Passthrough-Wrapper
     protokolliert das emittierte SQL → Such-Query trägt `status NOT IN ('done','archived')`
     und KEINE positive `status IN (`-Allowlist. Diese Assertion ist gegen den
     prä-T004898-Stand (9f3e271ed) rot — RED-Beweis im Wegwerf-Worktree.
2. **RED-Beweis (Task 1):** Test gegen den Altcode (Wegwerf-Worktree von
   9f3e271ed) ausführen → Aussage C schlägt fehl (`expected: FAIL`). Gegen main ist
   der Test grün (Fix seit T004898 live).
3. **GREEN + Inventar (Task 2):** Test gegen main grün; `task test:inventory`
   regenerieren und `website/src/data/test-inventory.json` mitcommitten (CI-Inventar-Check).
4. **Finale Verifikation (Task 3):** `task test:changed`,
   `task freshness:regenerate`, `task freshness:check`.

## Scope-Grenzen

- **Kein Production-Code-Fix in diesem Change** — der Root-Cause-Fix ist durch
  T004898 auf main; dieser Change liefert die fehlende Real-DB-Verifikation und
  Regressionssicherung.
- **T004894 (Welle 2)** fixt separat den Areas-Trim — wird nicht vorweggenommen.
- **Befund (außerhalb Scope, Folge-Ticket):** `scripts/factory/migrate-mishap-bundles.sh`
  `find_container()` legt einen Container bedingungslos per `create` an, ohne zuvor
  die Existenz zu prüfen (Kommentar im Code bestätigt das bewusst pragmatische
  Verhalten) — potenzieller Zweit-Duplikat-Pfad eines Einmal-Migrationswerkzeugs.
- **Befund (Doku):** Die im Mishap gemeldete Komponente `scripts/hooks/mishap-tracker.sh`
  ist falsch — dieses Skript enthält keine Container-Erkennung (nur Friction-Logging);
  die Erkennung lebt in `scripts/ticket.sh` `cmd_rollup_container`.

_Ticket: T004893_
