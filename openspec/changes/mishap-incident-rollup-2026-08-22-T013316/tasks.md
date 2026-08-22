---
title: "mishap-incident-rollup-2026-08-22-T013316 — Implementation Plan"
ticket_id: T013316
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013316 — Implementation Plan

_Container-Ticket: T013316_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 10:48 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-22 10:41 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | process | infra | Delegation für Review-/Finalizer-Subagenten im Subagent-Kontext unbrauchbar |
> | 2 | process | scripts | Finalizer-Schritt 7 scheitert, wenn Plan-Datei nur im Worktree liegt |
> | 3 | process | website | svelte-check in components/website nicht installiert — Plan-Verifikationsschritt nicht ausführbar |
> | 4 | process | scripts | Bekannte Worktree/Test-Frictions: SID-Drift, BATS stderr-Mixing, pnpm-TTY-Abbruch, commitlint-Scopes |
> | 5 | drift | Taskfile freshness:regenerate | freshness:regenerate erzeugt Kollateral-Drift an .opencode/package.json |
> | 6 | suspicious | tests/spec health-goals G-CD03 | Flaky G-CD03 --self-test in CI-Spec-Shards (PR #4959) |
> | 7 | degraded | scripts/agent-lock.sh | agent-lock.sh claim aus Subshell erzeugt SID, die ticket.sh als fremde Session wertet |
> | 8 | degraded | task test:changed / find-changed-tests | test(mishap-rollup)-Scope fehlt in der test:changed-Allowlist |
> | 9 | suspicious | scripts/hygiene worktree cleanup | Ad-hoc git-worktree-Parsing entfernte das falsche Worktree (selbst korrigiert) |
> | 10 | degraded | scripts/factory/rollup-carryover.sh | Rollup-Eskalation scannt fremde Pläne über Worktree-Namen — False-Positive-needs_human-Tickets |
> 
> **1. Delegation für Review-/Finalizer-Subagenten im Subagent-Kontext unbrauchbar** (process, infra)
> 
> Im opencode-Subagent-Kontext existiert kein natives task-Tool, und delegate verwarf explore/general als "write-capable" — der vorgeschriebene unabhängige Reviewer (T005307) und der frische Finalizer (T006284) waren nicht spawnbar. Beide Schritte liefen dokumentiert in-context (Review mit Checkliste gegen den echten Diff; Finalisierung über das idempotente devflow-post-merge-finalize.sh). Entweder ein delegierbarer Read-only-Agent etablieren oder den Skill um eine In-Context-Fallback-Anleitung erweitern.
> **2. Finalizer-Schritt 7 scheitert, wenn Plan-Datei nur im Worktree liegt** (process, scripts)
> 
> devflow-post-merge-finalize.sh Schritt 7 (archive-plan) scheiterte, weil der Change-Ordner openspec/changes/<slug>/ nur auf dem (squash-gemergten) Branch bzw. im Worktree liegt — der Lauf aus dem Haupt-Checkout fand die Plan-Datei nicht. Manuelle Nachholung: ticket.sh archive-plan im WORKTREE ausführen, dann Finalizer-Rerun (idempotent) für Schritt 8+. Der Skript sollte den Worktree-Pfad als Fallback auflösen (Schritt 8 tut das bereits).
> **3. svelte-check in components/website nicht installiert — Plan-Verifikationsschritt nicht ausführbar** (process, website)
> 
> p5 des Plans setzte svelte-check als Abschlussprüfung an; im Projekt ist svelte-check nicht installiert (pnpm exec → EACCES/MODULE_NOT_FOUND). Verifikation lief über astro check (0 errors) + vollen Produktionsbuild. Entweder svelte-check als devDependency aufnehmen oder die Plan-Vorlage auf 'astro check + build' umstellen.
> **4. Bekannte Worktree/Test-Frictions: SID-Drift, BATS stderr-Mixing, pnpm-TTY-Abbruch, commitlint-Scopes** (process, scripts)
> 
> Drei weitere Frictions aus T013306, jeweils mit bekanntem Workaround: (1) agent-lock SID driftet ohne Harness-Env pro Bash-Call (T002381) — Claim/Check-Mismatch erzwang Release+Reclaim mit fixer AGENT_LOCK_SID. (2) BATS run mischt stderr in $output — Wrapper-Vertragstests brauchen run --separate-stderr + bats_require_minimum_version 1.5.0. (3) pnpm im Worktree bricht mit ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY ab — CI=true pnpm install --prefer-offline umgeht es; commitlint lehnte zudem die Scopes health-goals/sdlc ab (gültig: scripts/website/test).
> **5. freshness:regenerate erzeugt Kollateral-Drift an .opencode/package.json** (drift, Taskfile freshness:regenerate)
> 
> Bei Regeneration von Frischhaltungs-Artefakten im PR-Kontext (#4962-Vorbereitung, 2026-08-22) zog task freshness:regenerate ungewollte Änderungen an .opencode/package.json nach sich; der Agent musste die Datei manuell revertieren, bevor der Commit ging. Beim Nachfolge-Lauf (Worktrees e2e-entskippen/rollup-loop-closure) trat der Drift nicht erneut auf (verifiziert: git status nach regenerate zeigte nur die erwarteten Artefakte) — vermutlich kontextabhängig. Erwartet: regenerate soll deterministisch nur deklarierte Artefakte anfassen.
> **6. Flaky G-CD03 --self-test in CI-Spec-Shards (PR #4959)** (suspicious, tests/spec health-goals G-CD03)
> 
> Im PR #4959 schlug der Drift-Selbsttest G-CD03 (--self-test) im CI-Shard sporadisch fehl, obwohl lokal grün; nach Re-Trigger lief der Job grün. Nicht-deterministisches Gate in den Factory spec shards erzeugt Fehlalarme und blockiert Auto-Merge zufällig. Vermutete Ursache: zeit-/umgebungsabhängiger Vergleich im Selbsttest (CI-Runner vs. lokale Worktree-Umgebung).
> **7. agent-lock.sh claim aus Subshell erzeugt SID, die ticket.sh als fremde Session wertet** (degraded, scripts/agent-lock.sh)
> 
> Wird scripts/agent-lock.sh claim aus einer Subshell heraus aufgerufen (z. B. $(...) oder in Pipeline), landet eine andere SID im Lock als die, mit der ticket.sh später die Session-Identität prüft — ticket.sh stuft den Aufrufer daraufhin als fremde Session ein und verlangt einen manuellen Override. Umständlich und fehleranfällig; Lock-Claim und Ticket-Interaktion sollten dieselbe SID-Ableitung nutzen bzw. der Claim muss in der Hauptshell erfolgen. Beobachtet am T013305-Lock (SID 1560981), der nach Sessionende als stale liegen blieb.
> **8. test(mishap-rollup)-Scope fehlt in der test:changed-Allowlist** (degraded, task test:changed / find-changed-tests)
> 
> Der Scope test(mishap-rollup) wird von task test:changed nicht erkannt (nicht in der Domain-/Scope-Allowlist); für Änderungen an scripts/factory/mishap-rollup.sh und rollup-carryover.sh musste die Suite manuell via tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/ gefahren werden. Entweder Scope in der Erkennung ergänzen oder dokumentieren, dass factory-Scopes den Factory-Runner verwenden.
> **9. Ad-hoc git-worktree-Parsing entfernte das falsche Worktree (selbst korrigiert)** (suspicious, scripts/hygiene worktree cleanup)
> 
> Beim Cleanup nach den Merges #4962/#4967 matchte eine Ad-hoc-Schleife (git worktree list --porcelain | grep -A2 refs/heads/<branch>) die Blockgrenzen falsch: statt der Ziel-Worktrees wurde .worktrees/mishap-incident-rollup-2026-08-22-T013303-reuse entfernt, während die eigentlichen Branches zunächst 'used by worktree' blieben. Fernbedrohte Daten: keine (Worktree war clean; Branch intakt). Korrektur: Ziel-Worktrees explizit per Pfad entfernt, lokale Branches gelöscht, T013303-reuse-Worktree per git worktree add am Original-Commit 0bc92ec07 wiederhergestellt. Lehre: Worktree-Entfernung nur mit direkter Pfadangabe aus git worktree list, nie via grep-Ableitung.
> **10. Rollup-Eskalation scannt fremde Pläne über Worktree-Namen — False-Positive-needs_human-Tickets** (degraded, scripts/factory/rollup-carryover.sh)
> 
> `_cycle_plans()` globbt `find "$SCAN_ROOT" -path '*mishap-incident-rollup-*'`. Da der Worktree `.worktrees/mishap-incident-rollup-2026-08-22-T013303-reuse/` das Muster im NAMEN trägt, wurden ~700 archivierte Feature-Pläne in diesem Worktree als Rollup-Zyklen gescannt. Folge: (1) Boilerplate-TDD-Zeilen ohne `(meta)`-Suffix passieren `_line_title` un gefiltert als Rohzeile (Titel = `- [ ] **7. Final Verification.**`); (2) identische Boilerplate in ≥2 gescannten Plänen gilt fälschlich als Rezurrenz → Eskalation. Real entstanden am 2026-08-22 08:53 UTC die False-Positive-Tickets T013420/T013421/T013422 (inzwischen obsolete archiviert). Reproduziert: `bash scripts/factory/rollup-carryover.sh --escalations $REPO --container T013316` liefert exakt die 3 Müll-Zeilen. REZIDIV-RISIKO: Die Idempotenz-Marker (`Eskaliert:`-Kommentare) hängen am Container T013316 — jeder künftige Zyklus mit frischem Container eskaliert dieselben 3 False Positives erneut, solange der reuse-Worktree existiert. Fix-Richtung: find auf `$SCAN_ROOT/openspec/changes` verankern und/oder `.worktrees/` aus dem Scan ausschließen; zusätzlich Titel-Fallback verwerfen, wenn `_line_title` nicht matcht (leere Antwort ist kein Urteil).

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

- [x] **1. Delegation für Review-/Finalizer-Subagenten im Subagent-Kontext unbrauchbar** (process, infra) — Disposition: **kein Repo-Fix** — Harness-Eigenschaft, nicht Repo-Code. Die Delegations-Pfade sind seit T013360 in AGENTS.md dokumentiert (`delegate` für Read-only, `task` für Write-capable); der dokumentierte In-Context-Fallback (Review mit Checkliste gegen den echten Diff, idempotenter `devflow-post-merge-finalize.sh`) ist funktional. Kein Ablaufdatum nötig — die Dokumentation bildet den Zustand ab, es gibt keinen offenen Workaround zu überwachen.
- [x] **2. Finalizer-Schritt 7 scheitert, wenn Plan-Datei nur im Worktree liegt** (process, scripts) — Disposition: **bereits gefixt** — `scripts/devflow-post-merge-finalize.sh` auf main löst den Worktree-Pfad früh auf (`git worktree list --porcelain`, Zeilen 162–179) und wählt das Archivziel über `$WORKTREE/openspec/changes/$SLUG` (Zeilen 348–349); der Plan-Fund im Worktree geht damit denselben Pfad wie Schritt 8.
- [x] **3. svelte-check in components/website nicht installiert — Plan-Verifikationsschritt nicht ausführbar** (process, website) — Disposition: **kein Repo-Fix** — Das Projekt prüft Svelte-in-Astro über `astro check` (`@astrojs/check` ^0.9.9, Script `astro:check` in package.json) plus Produktionsbuild; beide sind installiert und lauffähig. svelte-check zusätzlich aufzunehmen wäre Redundanz. Plan-Vorlagen nennen künftig `astro check + build` als Verifikation — Autoren-Disziplin, kein Code-Defekt; die Fehlermeldung des fehlenden Tools führt unmittelbar zur Umstellung.
- [x] **4. Bekannte Worktree/Test-Frictions: SID-Drift, BATS stderr-Mixing, pnpm-TTY-Abbruch, commitlint-Scopes** (process, scripts) — Disposition: **kein Repo-Fix** — Vier bekannte Patterns mit je dokumentiertem Workaround: fixe `AGENT_LOCK_SID` (T002381), `run --separate-stderr` + `bats_require_minimum_version 1.5.0`, `CI=true pnpm install --prefer-offline`, gültige Scopes scripts/website/test. Alles in tests/CLAUDE.md bzw. Hook-Fehlermeldungen verankert; keine Wiederholungsanfälligkeit über das dokumentierte Maß hinaus.
- [x] **5. freshness:regenerate erzeugt Kollateral-Drift an .opencode/package.json** (drift, Taskfile freshness:regenerate) — Disposition: **beobachten (bis Zyklus 2026-09-05)** — Transient und im Nachfolge-Lauf nicht reproduzierbar ("vermutlich kontextabhängig"), aber die Ursache ist ungeklärt und der Eingriff (manueller Revert vor Commit) war real. Zwei Zyklen im Blick behalten; bei Rezurrenz Ursache in Taskfile/Regenerierung messen.
- [x] **6. Flaky G-CD03 --self-test in CI-Spec-Shards (PR #4959)** (suspicious, tests/spec health-goals G-CD03) — Disposition: **beobachten (bis Zyklus 2026-09-05)** — Einmaliger Fehlalarm, Re-Trigger grün, vermutete Ursache (zeit-/umgebungsabhängiger Vergleich CI-Runner vs. Worktree) unbelegt. Bei erneutem Auftreten Eskalation mit Messung statt Spekulation.
- [x] **7. agent-lock.sh claim aus Subshell erzeugt SID, die ticket.sh als fremde Session wertet** (degraded, scripts/agent-lock.sh) — Disposition: **kein Repo-Fix** — Bekanntes Pattern (T001268/T002381). agent-lock.sh warnt seit [T002381-M1] laut auf fehlende Session-Env ("SID driftet pro Bash-Call") und nennt die Abhilfe; Subshell-Aufrufe erben die Harness-Env, der Vorfall betraf den Fallback-Pfad ohne Env. Fix bleibt: stabile `AGENT_LOCK_SID` exportieren.
- [x] **8. test(mishap-rollup)-Scope fehlt in der test:changed-Allowlist** (degraded, task test:changed / find-changed-tests) — Disposition: **beobachten (bis Zyklus 2026-09-05)** — Teilweise entschärft: Änderungen an `rollup-carryover.sh` matchen inzwischen über die Verzeichnisform auf `tests/spec/mishap-rollup/rollup-carryover.bats`. Für `mishap-rollup.sh` selbst findet sich kein gleichnamiger Test (Suite heißt lifecycle/wakeup/…), manuelle Auswahl bleibt nötig. Bei erneutem Friction-Fall Namens-Mapping in find-changed-tests.sh ergänzen.
- [x] **9. Ad-hoc git-worktree-Parsing entfernte das falsche Worktree (selbst korrigiert)** (suspicious, scripts/hygiene worktree cleanup) — Disposition: **beobachten (bis Zyklus 2026-09-05)** — REZIDIV während dieses Rollup-Zyklus selbst beobachtet: der T013316-reuse-Worktree wurde mid-session extern neu erstellt (leerer Reflog, Stand Original-Commit), ein uncommitteter RED-Test ging verloren und wurde neu geschrieben. Lehre steht im Eintrag: Entfernung nur per direktem Pfad aus `git worktree list --porcelain`, nie via grep-Ableitung.
- [x] **10. Rollup-Eskalation scannt fremde Pläne über Worktree-Namen — False-Positive-needs_human-Tickets** (degraded, scripts/factory/rollup-carryover.sh) — Disposition: **gefixt** — RED-Test `tests/spec/mishap-rollup/carryover-worktree-scan.bats` (Decoy-Worktree mit Boilerplate-Plänen floss vor dem Fix in die Eskalation). Fix in `_cycle_plans()` (find auf `$SCAN_ROOT/openspec/changes` verankert) und `_line_title()`/`_line_meta()` (`sed -nE … p` verwirft Nicht-Matches statt Rohzeile durchzulassen). Fixture-Layouts von escalation-rule/watchlist-disposition aufs Produktionslayout korrigiert; volle mishap-rollup-Suite (52 Tests) grün.

## File Structure

```
scripts/factory/rollup-carryover.sh                      | geändert | Scan-Verankerung + Titel-Fallback [T013316 #10]
tests/spec/mishap-rollup/carryover-worktree-scan.bats    | neu      | RED/GREEN gegen .worktrees-Decoy
tests/spec/mishap-rollup/escalation-rule.bats            | geändert | Fixture-Layout openspec/changes/
tests/spec/mishap-rollup/watchlist-disposition.bats      | geändert | Fixture-Layout openspec/changes/
openspec/changes/mishap-incident-rollup-2026-08-22-T013316/tasks.md | geändert | Dispositionen
```

- [x] **Failing-Test-Step (RED).** Eintrag 10 bekam **gefixt**: `tests/spec/mishap-rollup/carryover-worktree-scan.bats` war vor dem Fix rot (Boilerplate aus dem Decoy-Worktree erschien in der Eskalationsausgabe), nach dem Fix grün. Die übrigen neun Dispositionen sind bereits gefixt / kein Repo-Fix / beobachten und brauchen keinen Test.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup/
# expected: 52 ok, 0 not ok
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
