---
title: "mishap-incident-rollup-2026-08-14-T005030 — Implementation Plan"
ticket_id: T005030
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-14-T005030 — Implementation Plan

_Container-Ticket: T005030_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-14 16:21 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

### Mishap-Rollup — 10 Eintraege (2026-08-14 16:14 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | tickets/areas | Mishap-Ticket nannte falsche Ziel-Datei (Root-Cause in CSV→ARRAY-Konversion) |
| 2 | degraded | skills/ticket-ops + scripts/hooks/worktree-write-guard.sh | Paralleler ticket-ops-Dispatch: worktree-write-guard blockt Phase-A-Writes auf main |
| 3 | suspicious | scripts/agent-lock.sh (reap) + dev-flow-execute Pre-Flight | Reaper räumt toten ticket-Lock nicht — manueller Release nötig (T005029) |
| 4 | degraded | tests/spec/software-factory + k3d-Dev-DB | task test:changed lokal strukturell rot — Watchdog-Tests kollidieren über die geteilte k3d-Dev-DB |
| 5 | process | scripts/vda.sh | Plan-Punkt war bereits umgesetzt (T002343) — Befund aus alten Daten |
| 6 | drift | scripts/vda.sh frontmatter + scripts/plan-lint.sh | vda.sh frontmatter erzeugt invalides Frontmatter, wenn domains als YAML-Liste geschrieben sind |
| 7 | process | scripts/openspec.sh | Archive-Status-Sed-Muster deckt planning nicht ab |
| 8 | process | skills/dev-flow-execute | Review-Gate übersprungen — Merge bei grüner CI ohne separaten Review |
| 9 | suspicious | tests/lib/factory-test-fixtures.sh + kubectl exec -i-Muster | kubectl exec -i drainte Shell-Stdin — Purge-Loop löschte nur erste Registry-ID |
| 10 | drift | .githooks + Worktree-Betrieb | commit-msg-Hook nicht worktree-fähig — check-fix-ticket-guard.sh fehlt in Worktrees |

**1. Mishap-Ticket nannte falsche Ziel-Datei (Root-Cause in CSV→ARRAY-Konversion)** (drift, tickets/areas)

T004894 lokalisierte den Fix in der falschen Datei: "Ziel-Datei scripts/hooks/mishap-tracker.sh" — verifizierte Root-Cause liegt in der CSV→ARRAY-Konversion (scripts/ticket.sh _csv_to_quoted Z.834, scripts/vda/ticket/create.sh Z.99); mishap-tracker.sh hat keine areas-Logik. Breites Muster: 7 Tickets mit führenden Leerzeichen in areas. Analyse + Belege in openspec/changes/areas-csv-trim/proposal.md.
**2. Paralleler ticket-ops-Dispatch: worktree-write-guard blockt Phase-A-Writes auf main** (degraded, skills/ticket-ops + scripts/hooks/worktree-write-guard.sh)

Beobachtet im ticket-ops-Welle-1/2-Dispatch (2026-08-14): 6 parallele dev-flow-plan-Subagenten derselben Session teilen CLAUDE_CODE_SESSION_ID (Guard-Zeile 100). Sobald der erste Agent seinen Worktree-Claim hielt, verweigerte der worktree-write-guard die Phase-A-Writes (proposal.md, Delta-Spec, tasks.md) auf main für die übrigen Agenten — die T004602-Sequenz (Phase A im Haupt-Checkout OHNE Claim) ist im Parallelfall unmöglich. 3 von 6 Agenten mussten den Notausgang WORKTREE_GUARD_BYPASS=1 für Phase-A-Artefakte nehmen (Belege: Agentenberichte T004896/T004893/T004897). ticket-ops Step 3.6 und der Guard sind strukturell nicht aufeinander abgestimmt: Der Guard sperrt main bei EIGENEN Claims (T001268-Design), die Phase-A-Regel setzt aber genau voraus, dass main-Writes trotz Schwester-Claims möglich bleiben.
**3. Reaper räumt toten ticket-Lock nicht — manueller Release nötig (T005029)** (suspicious, scripts/agent-lock.sh (reap) + dev-flow-execute Pre-Flight)

Beim dev-flow-execute-Pre-Flight für T005029 blockierte der ticket-scoped Lock des beendeten dev-flow-plan-Agenten den Status-Übergang nach in_progress ("Ticket ist gesperrt", Exit 7). Der Lock erfüllte beide Reapable-Bedingungen (PID 3229580 tot — ps belegt; Alter ~48 min > AGENT_LOCK_GRACE 120s — created_at 1786715250 belegt), aber `agent-lock.sh reap` (kurz vorher gelaufen, RC 0) räumte ihn nicht. Manueller `release ticket T005029` (RC 0) löste auf. Entweder greift die Reap-Bedingung 1 nicht wie dokumentiert (session-coordination.md Z. 133-135) oder der Reap-Lauf verfehlte den Lock aus einem anderen Grund — ungeklärt.
**4. task test:changed lokal strukturell rot — Watchdog-Tests kollidieren über die geteilte k3d-Dev-DB** (degraded, tests/spec/software-factory + k3d-Dev-DB)

Befund des Implementers T005029 (PR #4438): `task test:changed` ist lokal bei jedem Lauf rot mit 8 Fehlschlägen (FA-SF-04/34, T002610 x2, T003810 x2, FA-SF-25 x2) — mehrere Watchdog-Testvarianten (FA-SF-26, T002610) laufen mit STALE_MIN=0 gegen die geteilte k3d-Dev-DB und setzen sich gegenseitig in_progress-Tickets zurück. Alle 8 Tests isoliert grün, seriell 184/184 grün; betroffen sind auch Dateien ohne Bezug zum Change. CI ist nicht betroffen (Cluster-lose Runner, _skip_if_no_db skippt, T002375-p4). Strukturelles Test-Setup-Problem: parallele Läufe gegen die gemeinsame Dev-DB sind nicht isoliert. Reproduktion: zweimal `task test:changed` parallel bzw. `bats tests/spec/software-factory/scheduling.bats` während ein anderer Lauf aktiv ist.
**5. Plan-Punkt war bereits umgesetzt (T002343) — Befund aus alten Daten** (process, scripts/vda.sh)

CFR-Drilldown T005307: Vorschlag 3 (Scout-Spec-Mindestlaenge hart zaehlen) war bereits seit T002343 (a856cf2a3, 2026-07-27) umgesetzt (blockTicket in pipeline-runner.js). Der Befund baute auf factory_recent-Daten vom 21./22.07. auf — Symptom VOR dem Fix. Lernpunkt: bei Prozess-Befunden die Implementierungs-Historie der betroffenen Stelle pruefen (git log -S), bevor der Vorschlag ins Ticket kommt; check-merged T005307 allein reicht nicht, wenn der Befund aus aelteren Beobachtungen stammt.
**6. vda.sh frontmatter erzeugt invalides Frontmatter, wenn domains als YAML-Liste geschrieben sind** (drift, scripts/vda.sh frontmatter + scripts/plan-lint.sh)

Beim Plan-Lauf für T005308 (dev-flow-plan in-context): tasks.md trug gültiges YAML in List-Form (`domains:\n  - factory`), plan-lint meldete trotzdem F1/F2 ("frontmatter missing required key 'domains'", "domains is empty"). Der danach obligatorische `bash scripts/vda.sh frontmatter <plan>` "reparierte" das Frontmatter und erzeugte dabei einen strukturell falschen Zustand: `domains: [website, test]` (geratene, falsche Domains — der Change betrifft factory/test, nicht website) mit dem Rest `  - factory` als losem Folgeblock darunter. Behebungsweg: manuelles Edit auf `domains: [factory, test]`, danach plan-lint PASS. Befund: plan-lint und vda.sh frontmatter verstehen die YAML-List-Form von `domains` nicht (erwarten die Flow-Form) und der vda.sh-Repair kann das Frontmatter dabei beschädigen statt es zu reparieren. Repro: tasks.md mit `domains:\n  - factory` anlegen → plan-lint → vda.sh frontmatter → Frontmatter betrachten.
**7. Archive-Status-Sed-Muster deckt planning nicht ab** (process, scripts/openspec.sh)

dev-flow-execute T005307: archive-plan lief, bevor das Plan-Frontmatter auf completed stand — das sed-Muster aus plan-archive-steps.md (active|plan_staged|in_progress) deckt den Status planning nicht ab, der bei Fix-Plaenen ohne /opsx:apply der Ist-Zustand ist. Frontmatter wurde erst NACH dem archive-plan-Lauf im Archiv-Ordner korrigiert; die Postgres-Kopie traegt daher planning. Vorschlag: Muster in plan-archive-steps.md um planning erweitern.
**8. Review-Gate übersprungen — Merge bei grüner CI ohne separaten Review** (process, skills/dev-flow-execute)

T005307: Das formale Review-Gate (Schritt 3.8, requesting-code-review als unabhängige Prüfung) wurde nicht als separater Schritt ausgeführt — der Implementer-Subagent hat implementiert, verifiziert und direkt den PR mit Auto-Merge erstellt; der Merge (PR #4444) erfolgte bei vollständig grüner CI. Ersatz-Evidenz: CI vollständig grün, Orchestrator-Verifikation (Phase-Chain-Gate OK, Merge-Verifikation). Lernpunkt: im Implementer-Prompt das Review-Gate als expliziten Sub-Schritt verankern oder es als Orchestrator-Gate VOR dem Auto-Merge einfordern.
**9. kubectl exec -i drainte Shell-Stdin — Purge-Loop löschte nur erste Registry-ID** (suspicious, tests/lib/factory-test-fixtures.sh + kubectl exec -i-Muster)

Befund des Implementers T005309 (PR #4447): Der Purge-Loop über der Seed-Registry-Datei (while-read/mapfile) löschte anfangs nur die erste ID — `kubectl exec -i` liest den Shell-Stdin und drainte die Datei, bevor die Schleife weiterging. Fix im PR: `< /dev/null` an beiden exec-Aufrufen in purge_real_feature + mapfile in _sf_teardown (empirisch verifiziert, im Code dokumentiert). Das Muster ist generisch: JEDE `kubectl exec -i`-Pipe in einer Schleife, deren Eingabe aus einer Datei/Variablen kommt, ist gefährdet. Verbleibendes Risiko: Repo-weite andere Vorkommen desselben Musters sind nicht geprüft — Empfehlung als eigener Scan (git grep auf kubectl exec -i in Schleifen-Kontexten).
**10. commit-msg-Hook nicht worktree-fähig — check-fix-ticket-guard.sh fehlt in Worktrees** (drift, .githooks + Worktree-Betrieb)

Befund des Implementers T005309: Der commit-msg-Hook ist nicht worktree-fähig — `check-fix-ticket-guard.sh` liegt nur im Haupt-Checkout (Hook-Pfad referenziert vermutlich relativ zum Haupt-Repo). Im Worktree schlug der Hook fehl bzw. lief leer; der Implementer musste das Guard-Skript lokal in den Worktree kopieren (und nach den Commits wieder entfernen). Erwartung: Hooks (pre-commit/commit-msg) müssen in jedem Worktree identisch funktionieren — die Branch-Namens- und Ticket-Guards sind genau dort nötig, wo die Arbeit stattfindet. Ein Hook, der im Worktree still leer läuft oder fehlt, schwächt die Guards genau am Ort des Commits.

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
