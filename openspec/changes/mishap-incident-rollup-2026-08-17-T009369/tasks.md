---
title: "mishap-incident-rollup-2026-08-17-T009369 — Implementation Plan"
ticket_id: T009369
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-17-T009369 — Implementation Plan

_Container-Ticket: T009369_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-17 20:23 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-17 20:20 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | website/astro-check | astro check fing Parse-Fehler in lib/sdlc-Datei nicht (Exit 0 trotz Syntaxfehler) |
> | 2 | suspicious | taskfile/cluster:start | task cluster:start hing trotz erfolgreichem Cluster-Start (kubectl wait ohne --context) |
> | 3 | degraded | scripts/devflow-ci-watch.sh | devflow-ci-watch.sh bewertet Checks falsch-grün, wenn headRefOid nicht bestimmbar ist |
> | 4 | degraded | scripts/devflow-post-merge-finalize.sh | devflow-post-merge-finalize.sh: kein Skip-Flag für Worktree-Entfernung — reißt laufenden Sessions das cwd weg |
> | 5 | drift | k3d/sdlc-stack/sdlc-console.yaml | sdlc-console im k3d-mentolder-dev drifted vom Manifest (:dev/IfNotPresent statt :latest/Always) |
> | 6 | drift | tickets | T008814 test fixture not marked as is_test_data |
> | 7 | suspicious | factory/pipeline.mjs | Factory-Redispatch reused Worktrees mit veralteter .opencode-Config |
> | 8 | degraded | factory/opencode-exec.sh | opencode run ignoriert erstes SIGTERM — hängende Orchestrator-Läufe schwer abzuräumen |
> | 9 | drift | repo/commit-conventions | Commit-Scope 'llm' abgelehnt — Konsolidierung zu 'ops' (T002328) nicht präsent |
> | 10 | process | skills/ticket-ops | ticket-ops-procedures.md fehlt auf Disk |
> 
> **1. astro check fing Parse-Fehler in lib/sdlc-Datei nicht (Exit 0 trotz Syntaxfehler)** (suspicious, website/astro-check)
> 
> Ein hartes Parse-Fehler-Merge-Artefakt (doppeltes `},` in components/website/src/lib/sdlc/leitstand-purpose-registry.ts) passierte `npx astro check` mit Exit 0 — die Datei liegt offenbar außerhalb des astro-check-Prüfgrafen (lib-Datei, nicht aus dem Seiten-Graph erreicht). Gefangen haben ihn erst ESLint („62:0 Parsing error") und die BATS-Registry-Guards in CI. Fehlermodus: Konflikt-Auflösungen in lib/sdlc/*-Dateien können lokal „grün" erscheinen, obwohl die Datei syntaktisch kaputt ist — astro check suggeriert hier ein falsches Sicherheitsnetz.
> **2. task cluster:start hing trotz erfolgreichem Cluster-Start (kubectl wait ohne --context)** (suspicious, taskfile/cluster:start)
> 
> `task cluster:start` hing 10+ Minuten mit leerem Output und 0 % CPU, obwohl beide Task-Schritte nachweislich erfüllt waren: k3d-Container liefen (k3d cluster list: 1/1 + 1/1, loadbalancer true), beide Nodes Ready, workspace-Pods (shared-db, pocket-id, bge-*) Running. Der Task-Prozess (PID 16413) musste manuell beendet werden. Verdacht: der zweite Schritt `kubectl wait --for=condition=Ready nodes --all --timeout=120s` läuft OHNE --context — bei einem Default-Context, der nicht k3d-mentolder-dev ist, hängt kubectl beim Verbindungsaufbau (Connect-Timeout greift bei `wait` offenbar nicht). Fix-Richtung: explizites --context in der Task-Definition (Zeile 174, Taskfile). Verifiziert 2026-08-17 16:5x CEST: kubectl --context k3d-mentolder-dev get nodes → Ready/Ready.
> **3. devflow-ci-watch.sh bewertet Checks falsch-grün, wenn headRefOid nicht bestimmbar ist** (degraded, scripts/devflow-ci-watch.sh)
> 
> Während der GitHub-API-Störung (503) am 2026-08-17 meldete `bash scripts/devflow-ci-watch.sh T011498 <PR-4692-URL>` „✅ 17 CI-Checks, alle grün", obwohl zeitgleich 5 Checks des PR-HEAD rot waren (Setup-Failures durch 429 beim Action-Download). Das Skript loggte davor mehrfach „⚠ gh pr view --json headRefOid fehlgeschlagen — PR-HEAD nicht bestimmbar, Checks können nicht sicher bewertet werden" — und bewertete dann trotzdem (vermutlich gegen den älteren Commit-Stand). Erwartung: Wenn der PR-HEAD nicht bestimmbar ist, muss die Bewertung fail-closed abbrechen (Exit ≠ 0) statt grün zu melden. Aufgefallen, weil der User die roten Checks manuell sah. Beleg: Run 32042580843, Jobs 95424423502/95424423435 (Setup-429), Skript-Output in Session dd288eb3.
> **4. devflow-post-merge-finalize.sh: kein Skip-Flag für Worktree-Entfernung — reißt laufenden Sessions das cwd weg** (degraded, scripts/devflow-post-merge-finalize.sh)
> 
> Beim Finalize von T011498 (PR #4692) entfernte Schritt 10 des Skripts den Worktree .worktrees/sdlc-deck-leiste-overflow per `git worktree remove --force`, obwohl zwei lebende Sessions (Orchestrator + Finalizer-Subagent) darin arbeiteten — beide verloren ihr cwd (getcwd-Fehler; Finalizer konnte danach keine git-Operationen mehr ausführen, weil seine Sandbox-Isolation an den gelöschten Pfad gebunden war). Das Skript bietet nur --pr/--branch, kein --keep-worktree/--skip-worktree-Flag; die Orchestrator-Anweisung „Worktree nicht entfernen" war damit nicht umsetzbar. Erwartung: entweder ein Skip-Flag, oder ein Guard, der vor dem Remove per agent-lock/lsof prüft, ob eine lebende Session den Pfad als cwd hält (analog worktree-clean-check.sh). Beleg: Finalizer-Bericht Session dd288eb3, 2026-08-17 ~16:25.
> **5. sdlc-console im k3d-mentolder-dev drifted vom Manifest (:dev/IfNotPresent statt :latest/Always)** (drift, k3d/sdlc-stack/sdlc-console.yaml)
> 
> Das live-Deployment sdlc-console (ns workspace, Kontext k3d-mentolder-dev) lief mit Image ghcr.io/paddione/website-sdlc:dev und imagePullPolicy IfNotPresent, während das committete Manifest k3d/sdlc-stack/sdlc-console.yaml:57-58 :latest + Always vorgibt (T003740). Folgen: `task sdlc:refresh` (der dokumentierte Handgriff nach main-Merge) griff nicht — er vergleicht gegen :latest; und ein rollout restart war wirkungslos, weil IfNotPresent den alten lokalen :dev-Layer wiederverwendete. Behoben am 2026-08-17 per kubectl patch auf den Manifest-Stand (danach lief der Pod auf GIT_SHA=2dd3c27e7, Merge von PR #4692). Verifiziert per kubectl get deploy -o jsonpath (Ist) vs. grep im Manifest (Soll). Offene Frage: Woher das :dev-Tag kam (manueller Eingriff oder veraltetes Setup-Skript) — ggf. Drift-Guard für den sdlc-Stack ergänzen.
> **6. T008814 test fixture not marked as is_test_data** (drift, tickets)
> 
> T008814 has is_test_data=false but is clearly a factory test fixture: title='SF-REAL-korczewski-test_FA-2dSF-2d24-3a_...', description='factory fixture' (15 chars). The is_test_data flag was not set when this ticket was created, causing it to appear in triage queries. I marked it done/obsolete during triage, but the root cause is that the ticket creation path doesn't always set is_test_data for factory fixtures.
> **7. Factory-Redispatch reused Worktrees mit veralteter .opencode-Config** (suspicious, factory/pipeline.mjs)
> 
> Nach Merge der Orchestrator-Modell-Umstellung (T011579, PR #4701) hätte der nächste Factory-Tick die drei in_progress-Tickets in ihren BESTEHENDEN Worktrees redispatcht — dort lag noch die .opencode/agent-models.jsonc von vor dem Merge (opencode-go, erschöpftes Kontingent) → erneuter Hänger. Workaround: origin/main manuell in die drei Feature-Branches gemergt und gepusht. Strukturell: Änderungen an .opencode/* auf main erreichen wiederverwendete Ticket-Worktrees nicht automatisch; ein Rebase/Merge-Schritt im Reuse-Pfad von setupWorktree (pipeline.mjs) würde das schließen.
> **8. opencode run ignoriert erstes SIGTERM — hängende Orchestrator-Läufe schwer abzuräumen** (degraded, factory/opencode-exec.sh)
> 
> Drei nach Provider-Fehler (Monthly usage limit) hängende `opencode run --agent orchestrator`-Prozesse überlebten das erste SIGTERM; erst ein zweites SIGTERM mit Wartezeit beendete sie. opencode-exec.sh hat zudem keinen Timeout-Wrapper um den `opencode run`-Aufruf — ein Orchestrator, der nach einem Stream-Error weder stirbt noch arbeitet, hält Ticket-Slot und in_progress-Status unbegrenzt (beobachtet 2026-08-17, ~40 min bis zum manuellen Eingriff). Ein `timeout`-Wrapper bzw. Watchdog auf 0-Byte-Run-Log + 0 CPU würde die Lücke schließen.
> **9. Commit-Scope 'llm' abgelehnt — Konsolidierung zu 'ops' (T002328) nicht präsent** (drift, repo/commit-conventions)
> 
> Beim Chore-Commit T011579 wurde chore(llm) vom commit-msg-Hook abgelehnt ('llm' wurde zu 'ops' konsolidiert, T002328) — ein Commit-Versuch verloren. Kleine Friction, kein Defekt: Der Hook funktionierte korrekt und nannte die Abhilfe. Erinnerung an `bash scripts/validate-commit-msg.sh scopes` vor dem ersten Commit in LLM-nahen Chores.
> **10. ticket-ops-procedures.md fehlt auf Disk** (process, skills/ticket-ops)
> 
> Skill-Body verweist auf .claude/skills/references/ticket-ops-procedures.md (§Phase 1/2/3) — Datei existiert nicht. Skill läuft ohne die detaillierten SQL-Queries, Rubriken und Subagent-Matrix. Kein funktionaler Schaden, aber die ausformulierten Schritte (Tier-A/B-Berechnung, Eskalationsschwellen, Dispatch-Routing) sind nicht erreichbar.

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
