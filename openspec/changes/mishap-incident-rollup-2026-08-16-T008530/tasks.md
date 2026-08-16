---
title: "mishap-incident-rollup-2026-08-16-T008530 — Implementation Plan"
ticket_id: T008530
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-16-T008530 — Implementation Plan

_Container-Ticket: T008530_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-16 00:53 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-16 00:47 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | degraded | website-worktrees/verifikation | Lokale Build-Verifikation fehlt im Worktree — Svelte-Syntaxfehler fallen erst in CI auf (2 CI-Runden T007957) |
> | 2 | degraded | scripts/worktree-create.sh | worktree-create.sh verweigert bei Haupt-Checkout auf Fremdbranch |
> | 3 | suspicious | .githooks/pre-commit | Pre-Commit-Hook entstaged Dateien still — Commit unvollstaendig |
> | 4 | process | skills/dev-flow-chore | Prozess: test:changed-Diagnose durch tail-Pipe erschwert |
> | 5 | drift | repo/node_modules | node_modules-Stand: js-yaml fehlt im geteilten node_modules (Worktree-Symlink) — toolset-registry/llm-proxy-Testfamilien lokal rot |
> | 6 | suspicious | ci/auto-merge-workflow | Auto-Merge-Workflow umgeht Review-Gate (2× Merge vor Reviewer-APPROVED) |
> | 7 | degraded | scripts/devflow-ci-watch.sh | devflow-ci-watch.sh meldet grün bei roten Checks (Snapshot-Blindheit, 2×) |
> | 8 | degraded | factory/watchdog | Watchdog re-stagt Tickets trotz branch-Claim und nach Merge (3× Status-Reset) |
> | 9 | degraded | ci/vitest-job | Vitest-CI-Gate grün ohne Testlauf („No test files found") maskierte Review-Befund |
> | 10 | suspicious | worktrees/sdlc-leitstand-e4 | Unbekannter Akteur startete Rebase im E4-Worktree (rebase-merge-Dir vorgefunden) |
> 
> **1. Lokale Build-Verifikation fehlt im Worktree — Svelte-Syntaxfehler fallen erst in CI auf (2 CI-Runden T007957)** (degraded, website-worktrees/verifikation)
> 
> Auf PR #4674 (T007957, E3-Shell) fiel CI dreimal in Folge auf Fehler, die lokal nicht sichtbar waren: ESLint-unused (2×) und ein Svelte-3-Event-Modifier (onsubmit|preventDefault) in DeckWissen.svelte, der erst im astro-Build-Step aufschlägt. Ursache: Im Worktree ist weder vitest noch pnpm build lauffähig (bekannte node_modules-Symlink-Falle, siehe Memory vitest-website-not-runnable-locally) — die lokale Verifikation trägt nur BATS/node --experimental-strip-types, Svelte-Kompilierung und ESLint bleiben CI-exklusiv. Der Reviewer (statischer Diff) kann Svelte-Syntax ebenfalls nicht kompilieren. Fix-Idee: ein günstiger Pre-Push-Check für Svelte-Dateien im Worktree (z.B. svelte/compiler parse() via npx als standalone-Syntax-Sweep ohne pnpm-Install — nur parse, kein Build) als Teil der verification-block-Referenz; alternativ CI-Job-Reihenfolge so ändern, dass der astro-Build VOR ESLint-Fail-Fast läuft, damit Fehler nicht maskiert werden.
> **2. worktree-create.sh verweigert bei Haupt-Checkout auf Fremdbranch** (degraded, scripts/worktree-create.sh)
> 
> Bei dev-flow-chore T008454 stand der Haupt-Checkout auf fix/e2e-test-suite-resilience-T008338 (fremde Session); scripts/worktree-create.sh bricht dann mit FATAL ab. Workaround: manuelles `git worktree add <pfad> -b <branch> origin/main` (bekanntes Muster, Memory worktree-create-requires-main-checkout). Verbesserungsidee: worktree-create.sh koennte von origin/main aus anlegen statt den lokalen main-Branch zu verlangen.
> **3. Pre-Commit-Hook entstaged Dateien still — Commit unvollstaendig** (suspicious, .githooks/pre-commit)
> 
> Beim Commit von T008454 (Worktree local-website-checks-T008454, 2026-08-15 ~23:55) enthielt der Commit nur 3 von 5 gestagten Dateien: Taskfile.yml und .claude/skills/references/verification-block.md lagen danach wieder als unstaged M vor, ohne Fehlermeldung. Muster deckungsgleich mit Memory bonsai-guard-reverts-then-readd. Aufgefallen nur durch `git show --stat HEAD`-Verifikation; per `git add` + `git commit --amend` nachgezogen. Ein still verkleinerter Commit ist ein Datenverlust-Risiko im Standard-Flow.
> **4. Prozess: test:changed-Diagnose durch tail-Pipe erschwert** (process, skills/dev-flow-chore)
> 
> `task test:changed 2>&1 | tail -25` verschluckte bei T008454 den tatsaechlich fehlgeschlagenen Schritt (die Spec-Suite-Failures lagen oberhalb des tail-Fensters); die Diagnose erforderte einen kompletten Re-Run der ~20-min-Suite mit vollem Log in eine Datei. Konvention fuer lange Testlaeufe: immer in Datei umleiten (`> log 2>&1`) und danach gezielt greppen, nie live durch tail kuerzen.
> **5. node_modules-Stand: js-yaml fehlt im geteilten node_modules (Worktree-Symlink) — toolset-registry/llm-proxy-Testfamilien lokal rot** (drift, repo/node_modules)
> 
> Beim test:changed-Lauf fuer T008015 (2026-08-16) schlugen ~25 toolset-registry-Tests (schema-gate/collect/context/toolset) + llm-proxy/ui-config-seed-Suiten mit ERR_MODULE_NOT_FOUND 'js-yaml' fehl. js-yaml ist transitiv in package-lock.json (4 Referenzen), aber nicht installiert — weder im Hauptcheckout-node_modules noch im Worktree (Symlink auf Hauptcheckout). scripts/toolset/lib/registry.mjs, scripts/toolset/probe.mjs, scripts/llm/ui-config-seed.mjs u.a. importieren es direkt, ohne direkte package.json-Deklaration. Gleiche Klasse wie T007877-Mishap 3 (13 broken pnpm-Symlinks). Remediation: npm install im Hauptcheckout (nicht waehrend paralleler Sessions), ggf. js-yaml als direkte Dependency deklarieren. CI (npm ci fresh) laeuft gruen — lokal-only.
> **6. Auto-Merge-Workflow umgeht Review-Gate (2× Merge vor Reviewer-APPROVED)** (suspicious, ci/auto-merge-workflow)
> 
> Zweimal in einem dev-flow-execute-Fan-out beobachtet (2026-08-15/16): (1) PR #4672 (T007955) wurde gemergt, obwohl der Finisher KEIN Auto-Merge anfordern durfte — extern aktiviert; (2) PR #4688 (T008017) wurde über den „Enable Auto-Merge"-Workflow gemergt, während das unabhängige Review-Gate noch CHANGES REQUESTED stand (MAJOR-1 fehlende data-purpose-id-Anker, MINORs). Folge: Defekte landeten auf main, Follow-up-PR #4689 + Bug-Ticket T009137 nötig. Beleg: gh pr view 4672/4688 (mergedAt vor Review-Verdikt), Review-Berichte im Verlauf. Der Workflow aktiviert Auto-Merge automatisch bei grünen Checks — ohne das Orchestrator-Review-Gate (T005307, fail-closed laut Skill dev-flow-execute Schritt 3.8).
> **7. devflow-ci-watch.sh meldet grün bei roten Checks (Snapshot-Blindheit, 2×)** (degraded, scripts/devflow-ci-watch.sh)
> 
> Zweimal im selben Fan-out: (1) E4/PR #4684 — Skript meldete „✅ 18 CI-Checks, alle grün" (Exit 0), live stand aber „Vitest (website)" FAIL (Job 95076939519, 7 ESLint-Fehler); der Check erschien erst nach dem finalen Snapshot des Skripts. (2) E5/PR #4688 — Skript Exit 0, während gh pr checks 4 FAILUREs zeigte (Factory+OpenSpec+Guards, Vitest, Factory shard 3+4). Der Live-Gegencheck per `gh pr checks --json` fand beide Male den roten Zustand, den das Skript nicht meldete. Fehlermodus: Orchestratoren vertrauen dem Exit-Code und übersehen rote Gates.
> **8. Watchdog re-stagt Tickets trotz branch-Claim und nach Merge (3× Status-Reset)** (degraded, factory/watchdog)
> 
> Dreimal im Fan-out: (1+2) T007955 wurde vom Watchdog zweimal auf plan_staged zurückgesetzt („pipeline stale"), obwohl ein dev-flow-Claim (branch-Scope, SID f2e79c44) auf dem Branch lag und eine Session aktiv arbeitete — die in_progress-Transitionen wurden überschrieben; (3) T008017 wurde nach dem Auto-Merge statt auf done auf backlog gesetzt (trotz gemergtem PR #4688). Beleg: export_ticket_timeline T007955 (Watchdog-Kommentare 19:25/18:57 UTC) und get_ticket T008017 (status=backlog nach Merge). T006297 fixiert den Merged-PR-Gate-Teil; die Claim-Ignoranz des Watchdogs (agent-lock.sh check auf „held" fehlt) bleibt offen.
> **9. Vitest-CI-Gate grün ohne Testlauf („No test files found") maskierte Review-Befund** (degraded, ci/vitest-job)
> 
> Der „Vitest (website)"-Job lief auf PR #4688 mit „No test files found, exiting with code 0" — grünes Gate ohne einen einzigen Testlauf (--changed-Selektion auf shallow History). Konsequenz: MAJOR-1 (fehlende data-purpose-id-Anker, wäre vom Anker-Vitest gefangen worden) blieb in CI unsichtbar; gefunden hat ihn nur das statische Review. Beleg: gh run view 31915438900 --job 95086451059 --log. Das Muster ist im Memory dokumentiert („Vitest (website) grün ohne Testlauf"), trat aber erneut auf und maskierte einen echten Befund.
> **10. Unbekannter Akteur startete Rebase im E4-Worktree (rebase-merge-Dir vorgefunden)** (suspicious, worktrees/sdlc-leitstand-e4)
> 
> Im E4-Worktree lag eine bereits laufende Rebase (rebase-merge-Dir, onto=885c0ede5 = neuer main nach E3-Merge, orig-head=a73bb82e2) vor, als der Orchestrator sie starten wollte („already a rebase-merge directory"). Kein bekannter Akteur: E4-Implementer war längst beendet, Orchestrator hatte den Rebase noch nicht gestartet, kein Claim anderer SID. Der Zustand war inhaltlich korrekt (exakt der beabsichtigte Rebase) und wurde vom Orchestrator fertiggestellt — aber der Urheber ist ungeklärt. Prüfen: startet ein Hook/Watchdog-Skript Rebase-Vorgänge in fremden Worktrees?

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
