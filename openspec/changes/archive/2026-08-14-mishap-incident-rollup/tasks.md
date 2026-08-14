---
title: "mishap-incident-rollup — Implementation Plan"
ticket_id: T004887
domains: [factory]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup — Implementation Plan

_Container-Ticket: T004887_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-14 10:09 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

### Mishap-Rollup — 10 Eintraege (2026-08-14 10:00 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | dev-flow (merge/branch-lifecycle) | Branch-Auto-Delete bei Merge verhinderte Post-Merge-OpenSpec-Archiv — Branch musste neu erstellt werden |
| 2 | suspicious | scripts/toolset/check.test.mjs | check.test.mjs pre-existing rot: Fixture verstößt gegen die Validator-Regeln, die der Test nicht abbildet |
| 3 | drift | repo/AGENTS.md | PR 4397: alibaba-primary-Registry-Runtime ohne AGENTS.md-Tabellenzeile (Spec-Shard-1-Fail) |
| 4 | drift | tickets | Referenziertes Ticket T004396 existiert nicht im Tracker |
| 5 | drift | scripts/branch-reaper.sh | branch-reaper.sh bricht unter set -e bei nicht-existentem Ticket in sweep-Schleife ab |
| 6 | process | scripts/hooks/mishap-tracker.sh | Zweiter Mishap-Rollup-Container statt Append auf bestehenden |
| 7 | drift | tickets/areas | areas-Feld mit führendem Leerzeichen am Rollup-Container |
| 8 | process | skills/dev-flow-plan | RED-Test-Fälle ohne echten PCRE-Syntaxfehler konstruiert |
| 9 | process | plan-authoring | Plan empfahl ungültigen Commit-Scope 'openspec-embed' (valid: scripts) |
| 10 | drift | scripts/runtime-drift-check.sh · /usr/local/bin/mcp-task-runner | mcp-task-runner-Prozesse laufen mit ersetzter (deleted) Binary |

**1. Branch-Auto-Delete bei Merge verhinderte Post-Merge-OpenSpec-Archiv — Branch musste neu erstellt werden** (drift, dev-flow (merge/branch-lifecycle))

Beobachtet 2026-08-14: Branch-Auto-Delete beim PR-Merge (Repo-Setting delete_branch_on_merge=true + --delete-branch in allen Merge-Flows) löschte den Branch, bevor die Post-Merge-OpenSpec-Archivierung (dev-flow Schritt 7) ihn nutzen konnte — der Branch musste für die Archivierung neu erstellt werden (Archiv-PR #4393, T004295). Fix: PR #4394 / T004612 — Repo-Setting auf false gesetzt, --delete-branch aus allen Fix-PR-Merges entfernt, Reihenfolge jetzt Merge → Archiv → explizite Branch-Löschung in Schritt 7.5. branch-reaper.sh bleibt als Netz.
**2. check.test.mjs pre-existing rot: Fixture verstößt gegen die Validator-Regeln, die der Test nicht abbildet** (suspicious, scripts/toolset/check.test.mjs)

Pre-existing failure, gefunden während Verifikation T004612 (PR #4394): `node scripts/toolset/check.test.mjs` schlägt auf origin/main fehl — das Fixture (canonical cli:gh-axi ohne use_when/roles) lässt check.mjs mit Exit != 0 enden ("Capability ... is canonical but has no 'use_when'"), der Test erwartet aber "check passed". Auch auf main rot (verglichen 2026-08-14). Nicht Teil von T004612; eigener Folgevorgang nötig.
**3. PR 4397: alibaba-primary-Registry-Runtime ohne AGENTS.md-Tabellenzeile (Spec-Shard-1-Fail)** (drift, repo/AGENTS.md)

Beim Hinzufügen der alibaba-primary-Runtime (T004396) in docs/agent-guide/registry/agents.yaml + .opencode/agent-models.jsonc fehlte die Tabellenzeile in AGENTS.md. tests/spec/agent-skills.bats "T002305: AGENTS.md runtime table covers every registry runtime" schlug in Factory spec shard 1 fehl. Fix: Zeile | `alibaba-primary` | ... in AGENTS.md ergänzt (Commit 4a460239b), CI danach grün, PR 4397 gemergt.
**4. Referenziertes Ticket T004396 existiert nicht im Tracker** (drift, tickets)

PR 4397 / Branch feature/opencode-alibaba-T004396 referenziert Ticket T004396, aber in tickets.tickets (mentolder) existiert kein Ticket mit external_id T004396 — auch keine T00439x-Einträge im Bereich. Merge=Closure (T001092) kann nicht greifen, da kein Ticket vorhanden ist. PR wurde trotzdem gemergt; vermutlich wurde das Ticket nie angelegt oder die Nummer stammt aus einem anderen Planungsfluss.
**5. branch-reaper.sh bricht unter set -e bei nicht-existentem Ticket in sweep-Schleife ab** (drift, scripts/branch-reaper.sh)

In scripts/branch-reaper.sh führt das Subshell-Kommando ticket_json="$(bash "$TICKET_SH" get --id "$branch_ticket_id" 2>/dev/null || echo "{}")" unter set -e zum Abbruch des gesamten Sweeps mit Exit 1, wenn ticket.sh mit Exit 1 fehlschlägt (z.B. wenn eine aus dem Branch-Namen extrahierte Ticket-ID wie T004396 nicht im Tracker existiert). Im Subshell bricht set -e vor der inneren Alternative ab. Fix: set +e im Subshell oder Prüfung vor Ausführung.
**6. Zweiter Mishap-Rollup-Container statt Append auf bestehenden** (process, scripts/hooks/mishap-tracker.sh)

Am 2026-08-14 07:50 wurde T004752 (Titel: "Mishap Rollup — fortlaufende Sammlung") angelegt, obwohl der dauerhaft offene Container T003533 existiert — Titel und Beschreibung sind identisch. Der Mishap-Append erkannte den bestehenden Container nicht (T003533 steht auf blocked/needs_human). Behoben in der ticket-ops-Runde 2026-08-14: T004752 als obsolete geschlossen (Beleg-Kommentar), Container bleibt T003533.
**7. areas-Feld mit führendem Leerzeichen am Rollup-Container** (drift, tickets/areas)

Der Rollup-Container T003533 trägt areas=["tickets"," db"] — der zweite Eintrag hat ein führendes Leerzeichen (" db"). Vermutlich vom Append-Mechanismus komma-konkateniert. Verifiziert per DB-Query am 2026-08-14: SELECT external_id, areas FROM tickets.tickets WHERE external_id='T003533'. Unbehandelt — kein areas-Update-Wrapper in ticket-mcp; bewusst nicht per psql geflickt.
**8. RED-Test-Fälle ohne echten PCRE-Syntaxfehler konstruiert** (process, skills/dev-flow-plan)

Bei der RED-Test-Konstruktion für T004829 (PCRE-Slug-Injection) waren die ersten zwei gewählten Fehlermodus-Fälle gar keine PCRE-Syntaxfehler: "demo[" ist eine gültige Zeichenklasse, "demo{" wird von PCRE als literal behandelt — beide Läufe waren grün statt rot. Erst die unbalancierte Klammer "demo(" erzeugt den echten grep-exit-2-Pfad. Zwei "RED"-Läufe waren dadurch Artefakte des Testdesigns, nicht des Codes (T003548: ein RED-Lauf, der grün ist, ist ein Befund am Test). Zusätzlich baute die erste Testversion den Erfolgsmarker ohne Apostrophe ("indexed slug=demo" statt "indexed slug='demo'"), wodurch der Marker-grep nie matchte.
**9. Plan empfahl ungültigen Commit-Scope 'openspec-embed' (valid: scripts)** (process, plan-authoring)

tasks.md für T004829 schrieb den Commit-Scope 'openspec-embed' vor ('fix(openspec-embed): ...'). Der commit-msg-Hook lehnte ab — gültige Scopes sind nur agents/ci/db/deps/docs/factory/infra/mcp/ops/plans/scripts/security/skills/test/website. Fix musste als 'fix(scripts): ...' committet werden. Plans sollten nur gültige Scopes verwenden.
**10. mcp-task-runner-Prozesse laufen mit ersetzter (deleted) Binary** (drift, scripts/runtime-drift-check.sh · /usr/local/bin/mcp-task-runner)

runtime-drift-check.sh (T003825) meldet 2 Drift-Befunde: PID 2201282 und PID 3857812 (/usr/local/bin/mcp-task-runner) laufen mit (deleted)-Binary — /proc/PID/exe zeigt auf die ersetzte Inode. Guard ist meldend; das Beenden bleibt Operator-Entscheidung (kill 2201282 3857812; Server startet beim nächsten Tool-Aufruf neu).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
