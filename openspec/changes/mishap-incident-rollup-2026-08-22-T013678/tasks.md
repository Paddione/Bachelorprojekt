---
title: "mishap-incident-rollup-2026-08-22-T013678 — Implementation Plan"
ticket_id: T013678
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013678 — Implementation Plan

_Container-Ticket: T013678_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 17:25 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-22 16:11 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | degraded | ticket-mcp/export-timeline | export_ticket_timeline schlägt für Brand korczewski fehl (Exit 3, keine Diagnose) |
> | 2 | degraded | tests/factory-fixtures | Verwaiste Factory-Test-Fixtures akkumulieren ohne Sweeper — geleakte SF-REAL-Zeilen sind in der echten Queue dispatchbar |
> | 3 | suspicious | factory/post-merge-finalize | Plan-Status-Flip uncommittet im Hauptcheckout statt im PR (T013593 tasks.md) |
> | 4 | suspicious | factory/worktrees | Uncommittete .opencode/package.json+-Lockfile-Änderungen im mishap-rollup Worktree T013316-reuse |
> | 5 | drift | skills/dev-flow-plan | worktree-create.sh: Skill-Text zeigt Aufruf ohne Pflicht-Pfadargument |
> | 6 | suspicious | skills/dev-flow-plan | freshness:regenerate erzeugt repo-index.json, plan-preflight verbietet sie im selben Zug |
> | 7 | degraded | components/website | components/website/node_modules unvollstaendig im Haupt-Checkout — pg toter Symlink, tsx ohne dist/ |
> | 8 | degraded | scripts/llm-proxy | plan-qa-check.sh uebersprungen — llm-proxy antwortet 503 no_backend |
> | 9 | suspicious | tickets/merge-closure | Merge=Closure griff nicht bei MCP-angelegtem Chore-Ticket (T013675 blieb triage nach gemergtem PR) |
> | 10 | degraded | scripts/git-worktree-health.sh | git-worktree-health.sh objects wertet harmloses dangling als BEFUND (Exit 1) |
> 
> **1. export_ticket_timeline schlägt für Brand korczewski fehl (Exit 3, keine Diagnose)** (degraded, ticket-mcp/export-timeline)
> 
> Beim Sichten von T013303 (2026-08-22) antwortete mcp__ticket-mcp__export_ticket_timeline mit brand=korczewski und Exit 3 ('ticket.sh failed (exit code 3)') ohne Diagnose. Der Umweg über direktes SQL gegen tickets.ticket_comments / tickets.factory_phase_events funktionierte sofort; auch die erste SQL-Form scheiterte an undokumentierten Spaltennamen (factory_phase_events nutzt 'at', nicht 'created_at'). Der Timeline-Export sollte entweder korczewski unterstützen oder den Fehler mit Ursache melden; die Ersatzmessung per Hand-SQL ist fehleranfällig.
> **2. Verwaiste Factory-Test-Fixtures akkumulieren ohne Sweeper — geleakte SF-REAL-Zeilen sind in der echten Queue dispatchbar** (degraded, tests/factory-fixtures)
> 
> Beim Nachweis-Check 'werden Test-Tickets vergessen?' (2026-08-22) fanden sich 17 verwaiste Fixture-Zeilen in der Prod-Nahen Ticket-DB: 1x SF-REAL mit is_test_data=false (T013672, dadurch sichtbar und DISPATCHBAR in der echten Factory-Queue), 14x SF-TEST mit is_test_data=true in nicht-terminalen Status (seit >= 2026-08-21T22:00), 2x SF-REAL done mit Fake-Zeitstempel 2000-01-01. Ursache: Der Teardown-Schutz [T005309] registriert Seed-IDs in BATS_FILE_TMPDIR und purgt nach jedem Test — aber stirbt der Runner unkontrolliert (Timeout/SIGKILL/Session-Tod), ist die Registry weg und die Zeilen bleiben. Es existiert KEIN periodischer Sweeper für verwaiste Test-Zeilen; fn_purge_test_data liegt nur als archiviertes One-Shot-SQL. Scharfste Kante: geleakte SF-REAL-Zeilen sind wegen absichtlichem is_test_data=false dispatchbar und können einen echten Pipeline-Slot verbrennen. Bereinigt per purge_real_feature/purge_factory_test_data (17/17). Empfehlung: altersbasierter Sweep im Factory-Tick (is_test_data=true > N Tage, SF-REAL-* > M Stunden) oder Purge-Registry in der DB statt im Tmpdir.
> **3. Plan-Status-Flip uncommittet im Hauptcheckout statt im PR (T013593 tasks.md)** (suspicious, factory/post-merge-finalize)
> 
> repo-hygiene-Lauf 2026-08-22 fand im Hauptcheckout die uncommittete Änderung `status: active → completed` in openspec/changes/brain-ingest-loadout-swap/tasks.md (Ticket T013593, bereits done/shipped, PRs #5007/#5010 gemergt). Der Flip wurde außerhalb eines Worktrees/PR geschrieben und wäre fast verloren gegangen; der später gezogene Archiv-Merge (#5010) trägt weiterhin status: active im archivierten Plan. Verifiziert: git status/diff im Hauptcheckout; grep des archivierten tasks.md zeigt 'status: active'. Stash 'hygiene: tasks.md status flip vor Archiv-Pull gesichert' hält den Flip. Muster wie T012966/T012968: Buchhaltungsschreibvorgänge landen im falschen Checkout.
> **4. Uncommittete .opencode/package.json+-Lockfile-Änderungen im mishap-rollup Worktree T013316-reuse** (suspicious, factory/worktrees)
> 
> repo-hygiene-Lauf 2026-08-22: worktree-clean-check meldet im Reuse-Worktree .worktrees/mishap-incident-rollup-2026-08-22-T013316-reuse zwei nicht-allowlistete Abweichungen: modifizierte .opencode/package.json und .opencode/package-lock.json (vermutlich ein npm install in .opencode/ während einer Session dort). Kein Ticket-Anlass erkennbar; Änderungen wurden nicht verworfen (fail-closed). Verifiziert: git -C <wt> status --porcelain zeigt beide Dateien als M. Gleiches Muster wie T012966 (ungesicherte Patches im mishap-rollup-Worktree).
> **5. worktree-create.sh: Skill-Text zeigt Aufruf ohne Pflicht-Pfadargument** (drift, skills/dev-flow-plan)
> 
> scripts/worktree-create.sh verlangt zwei Pflichtargumente (Zeile 260-261: BRANCH="${1:?...}", WT_PATH="${2:?...}"). Der Aufruf mit nur dem Branch-Namen bricht ab mit: "scripts/worktree-create.sh: line 261: 2: Usage: worktree-create.sh <branch> <path> [<base>]". Der Skill-Text in dev-flow-plan nennt das Skript teils ohne Pfad-Argument, was zu einem Fehlversuch je Ticket führte (beide Tickets dieses Laufs betroffen). Abhilfe: Aufrufbeispiele in dev-flow-plan / dev-flow-plan-phases auf die Zwei-Argument-Form bringen, oder den Pfad aus dem Branch-Namen ableiten (.worktrees/<branch-ohne-praefix>), da er in jedem beobachteten Aufruf diesem Muster folgt. Verifiziert per sed -n '259,263p' scripts/worktree-create.sh.
> **6. freshness:regenerate erzeugt repo-index.json, plan-preflight verbietet sie im selben Zug** (suspicious, skills/dev-flow-plan)
> 
> Im dev-flow-plan-Ablauf steht `task freshness:regenerate` vor dem Plan-Commit. Sobald eine neue Testdatei hinzukommt, schreibt der Lauf docs/code-quality/repo-index.json mit (file_count plus der neue Pfad). Der direkt folgende Guard scripts/plan-preflight.sh lehnt genau diese Datei ab: "FEHLER: Fremd-Datei im Staged-Set: docs/code-quality/repo-index.json".
> 
> Die Ablehnung ist inhaltlich richtig — T002687 nimmt repo-index.json bewusst aus der Freshness-Liste (Kommentar in Taskfile.yml:1381 und .githooks/pre-commit:91), sie gehört also nicht in den Commit. Die Friction ist die Reihenfolge: der vorgeschriebene Schritt erzeugt eine Datei, die der nächste vorgeschriebene Schritt verbietet, ohne dass der Ablauf sagt, dass `git restore` hier die richtige Antwort ist und kein Guard-Defekt vorliegt. Trat bei beiden Tickets dieses Laufs auf.
> 
> Mögliche Abhilfe: entweder in der Guard-Fehlermeldung ergänzen, dass regenerierte, nicht-freshness-relevante Artefakte zu verwerfen sind, oder freshness:regenerate den repo-index-Schritt bei Plan-Commits auslassen lassen.
> **7. components/website/node_modules unvollstaendig im Haupt-Checkout — pg toter Symlink, tsx ohne dist/** (degraded, components/website)
> 
> Im Haupt-Checkout (/home/patrick/Bachelorprojekt) ist die pnpm-Installation unter components/website/node_modules teilweise defekt:
> 
> - node_modules/pg ist ein toter Symlink. `ls -d` zeigt ihn, `readlink -e` schlaegt fehl.
> - node_modules/.bin/tsx existiert und aufloest, aber der Aufruf endet mit
  > "Cannot find module '.../node_modules/tsx/dist/cli.mjs'" — das Paketverzeichnis ist da,
  > dist/ fehlt.
> 
> Wirkung: tests/unit/tickets-transition.bats skippt seine vier Runtime-Tests auch lokal, weil der Guard tsx_available (Zeile 55-57) auf `[[ -d .../node_modules/pg ]]` prueft und dem toten Symlink folgt. Das sieht zunaechst nach einem Testdefekt oder nach fehlender Installation aus; tatsaechlich ist der Baum halb installiert.
> 
> Diagnosebefehle:
  > readlink -e components/website/node_modules/pg          # -> leer, Exit 1
  > ./components/website/node_modules/.bin/tsx --version    # -> MODULE_NOT_FOUND
> 
> Nicht behoben in diesem Lauf: eine Reparatur haette `pnpm install` im Haupt-Checkout verlangt, was waehrend einer Planungsphase eine unnoetige Zustandsaenderung am Arbeitsbaum des Nutzers waere. Als Fallstrick in den Plan von T013674 aufgenommen, damit ein lokaler Fehlschlag dort nicht dem Code zugeschrieben wird.
> **8. plan-qa-check.sh uebersprungen — llm-proxy antwortet 503 no_backend** (degraded, scripts/llm-proxy)
> 
> Die advisory Plan-QA nach plan-lint lief nicht durch:
> 
  > [plan-qa] WARNING: Gateway returned HTTP 503: {"error":{"code":"no_backend","message":"no healthy backend"}} — skipping QA (advisory).
  > [plan-qa] RESULT: SKIPPED — HTTP 503
> 
> Kein Abbruch, das Gate ist bewusst advisory und plan-lint war grün. Bekanntes Discovery-Fenster des lokalen llm-proxy nach einem Loadout-Swap: llama-server ist bereits gesund, /v1/models entscheidet und meldet noch keinen Backend. Betraf beide Tickets dieses Laufs, also über mehrere Minuten hinweg stabil 503.
> 
> Festgehalten als Datenpunkt zur Haeufigkeit, nicht als Fehlerbericht — wenn die QA regelmaessig ausfaellt, prueft sie faktisch keinen Plan mehr, und das Ausbleiben ihres Urteils faellt niemandem auf, weil die Meldung eine Warnung unter vielen ist.
> **9. Merge=Closure griff nicht bei MCP-angelegtem Chore-Ticket (T013675 blieb triage nach gemergtem PR)** (suspicious, tickets/merge-closure)
> 
> Chore-Ticket T013675 (via ticket-mcp create_ticket angelegt, Status triage) blieb nach Squash-Merge von PR #5011 auf triage stehen — die dokumentierte Merge=Closure-Konvention (AGENTS.md/T001092: 'ticket closes on green auto-merge') griff nicht. PR-Link war vor dem Merge per add_pr_link gesetzt. Ticket wurde manuell auf done/fixed geschlossen. Moegliche Ursache: Closure-Hook feuert nur fuer Tickets in Factory-Lanes (backlog/plan_staged) oder mit plan_ref, nicht fuer direkt angelegte Chores. Verifiziert: get_ticket nach Merge zeigte status=triage, resolution=null.
> **10. git-worktree-health.sh objects wertet harmloses dangling als BEFUND (Exit 1)** (degraded, scripts/git-worktree-health.sh)
> 
> Beim repo-hygiene-Lauf 2026-08-22 meldete `bash scripts/git-worktree-health.sh objects` Exit 1 mit „BEFUND: git fsck meldet Fehler" und ~400 Zeilen dangling commits/trees/blobs samt RETTUNGSSEQUENZ (T002994). Gegenprobe: `git fsck --no-reflogs | grep -cE '^(error|missing|corrupt|broken)'` = 0 — es liegt KEINE Korruption vor, nur normales GC-Futter nach Squash-Merges/Reaper-Läufen. Das Skript zählt offenbar jede fsck-Ausgabe als Befund; das erzeugt bei jedem Lauf Fehlalarme und ein Operator könnte unnötig die Rettungssequenz anfassen. Verbesserung: dangling von echten Fehlern trennen (z. B. nur bei error/missing/corrupt exit 1, dangling höchstens als Info-Zeile).

## Aufgaben — ein Eintrag, eine Entscheidung

So wird dieser Container abgearbeitet: **jeder Eintrag unten bekommt eine Disposition**, und
zwar genau eine der vier folgenden. Erst dann wird seine Box abgehakt.

| Disposition | Wann | Was sie verlangt |
|---|---|---|
| **gefixt** | der Eintrag beschreibt ein Problem, das in diesem Zyklus behoben wird | Code- oder Konfigaenderung **plus** ein Test, der das Fehlverhalten vorher reproduziert |
| **bereits gefixt** | das Problem ist zwischenzeitlich anderswo behoben worden | den Beleg nennen (PR-Nummer oder Commit) und gegenpruefen, dass er auf `main` liegt |
| **kein Repo-Fix** | transientes Laufzeitereignis, Bedienfehler, oder bewusst so gewollt — und NICHT wiederholungsanfaellig | begruenden, warum keine Repo-Aenderung folgt UND warum kein Ablaufdatum noetig ist |
| **beobachten (bis Zyklus <JJJJ-MM-TT>)** | transient, aber wiederholungsanfaellig — der Workaround soll proaktiv im Blick bleiben | ein Ablaufdatum: der Generator fuehrt den Eintrag bis dahin in jedem Zyklus fort, danach wird er in ein eigenes Ticket eskaliert |

Ein Eintrag darf offen bleiben, wenn er den Rahmen dieses Zyklus sprengt — dann bleibt seine
Box leer und der Grund steht dahinter. Was nicht zulaessig ist: eine Box abhaken, ohne die
Disposition hinzuschreiben. Die Dispositionen zusammen sind der Nachweis, dass der Container
abgearbeitet wurde und nicht nur geschlossen.

- [ ] **1. export_ticket_timeline schlägt für Brand korczewski fehl (Exit 3, keine Diagnose)** (degraded, ticket-mcp/export-timeline) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **2. Verwaiste Factory-Test-Fixtures akkumulieren ohne Sweeper — geleakte SF-REAL-Zeilen sind in der echten Queue dispatchbar** (degraded, tests/factory-fixtures) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **3. Plan-Status-Flip uncommittet im Hauptcheckout statt im PR (T013593 tasks.md)** (suspicious, factory/post-merge-finalize) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **4. Uncommittete .opencode/package.json+-Lockfile-Änderungen im mishap-rollup Worktree T013316-reuse** (suspicious, factory/worktrees) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **5. worktree-create.sh: Skill-Text zeigt Aufruf ohne Pflicht-Pfadargument** (drift, skills/dev-flow-plan) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **6. freshness:regenerate erzeugt repo-index.json, plan-preflight verbietet sie im selben Zug** (suspicious, skills/dev-flow-plan) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **7. components/website/node_modules unvollstaendig im Haupt-Checkout — pg toter Symlink, tsx ohne dist/** (degraded, components/website) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **8. plan-qa-check.sh uebersprungen — llm-proxy antwortet 503 no_backend** (degraded, scripts/llm-proxy) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **9. Merge=Closure griff nicht bei MCP-angelegtem Chore-Ticket (T013675 blieb triage nach gemergtem PR)** (suspicious, tickets/merge-closure) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **10. git-worktree-health.sh objects wertet harmloses dangling als BEFUND (Exit 1)** (degraded, scripts/git-worktree-health.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung

- [ ] **Failing-Test-Step (RED).** Fuer jeden Eintrag, der die Disposition **gefixt** bekommt,
      zuerst einen Test schreiben, der das beschriebene Fehlverhalten reproduziert. Er gehoert
      nach `tests/spec/<spec-slug>/<kurz-slug>.bats` — das Verzeichnis der Spec, die das
      Verhalten abdeckt. Eintraege mit den beiden anderen Dispositionen brauchen keinen Test.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/<spec-slug>/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
