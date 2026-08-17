---
title: "mishap-incident-rollup-2026-08-17-T011656 — Implementation Plan"
ticket_id: T011656
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-17-T011656 — Implementation Plan

_Container-Ticket: T011656_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-17 23:24 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ## Vorab-Notiz für den nächsten Zyklus (2026-08-18, ticket-ops)
> 
> Zwei Buffer-Einträge sind durch direkte PRs bereits erledigt — der Generator kann sie beim Extrahieren überspringen:
> 
> 1. **„Verwaister Worktree für T011582"** → erledigt durch PR #4719 (Rettung der Arbeit, 19 Tests gemergt via Auto-Merge).
> 2. **„Rollup-Container-Vermehrung: T011583 + T011656 neben aktivem T009369"** → Root-Cause geklärt und gefixt durch PR #4721 / T011789 (Dedupe-Guard-Ausnahme für ephemerale Rollup-Container im ticket-ops-Skill).
> 
> Container-Zustand heute: genau ein offener Container (dieser, Collect Mode). T009369 (Korczewski-Zyklus) done, T011583 obsolete (fälschlicher Dedupe, siehe T011789).
> ### Mishap-Rollup — 10 Eintraege (2026-08-17 23:23 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | repo/chore/git-worktree-health | git-worktree-health.sh objects meldet Befund obwohl erreichbarer Objektgraph intakt ist |
> | 2 | drift | repo/chore/openspec-archive | Vier Change-Archive vom 2026-08-17 tragen status: active statt completed |
> | 3 | process | infra | Welle-1-Dispatch lief gegen bereits gemergte Fixes (stale Audit-Basis) |
> | 4 | drift | ticket-mcp | Rollup-Container-Vermehrung: T011583 + T011656 neben aktivem T009369 |
> | 5 | suspicious | worktrees | Verwaister Worktree für T011582: Branch nur lokal, kein Lock, Ticket unverändert triage |
> | 6 | degraded | scripts/devflow | devflow-post-merge-finalize.sh: Worktree-Pfad aus Slug statt Branch → Schritt-8-Selbstkonflikt (T008014-Klasse) |
> | 7 | degraded | factory/mishap-rollup | T009369-Rollup-Zyklus schloss ohne Implementierung — 10 Mishap-Fixes teilweise verloren |
> | 8 | suspicious | repo/hooks | Rebase verliert test-inventory.json-Änderung auf Feature-Branches |
> | 9 | drift | scripts/check-commit-vs-diff.sh | check-commit-vs-diff.sh schlaegt Scope 'plan' vor, den validate-commit-msg.sh ablehnt |
> | 10 | process | skills/git-workflow | Zwei Sessions reparierten denselben roten main parallel — eine Arbeit war umsonst |
> 
> **1. git-worktree-health.sh objects meldet Befund obwohl erreichbarer Objektgraph intakt ist** (suspicious, repo/chore/git-worktree-health)
> 
> Guard-Lauf (repo-hygiene 2026-08-17) meldete rc=1 "BEFUND: git fsck meldet Fehler" mit vielen dangling commits sowie missing trees/blobs. Gegenprobe: git fsck --connectivity-only ist sauber (rc=0, keine fehlenden Objekte an erreichbaren Refs), kein partial clone konfiguriert (remote.origin.promisor leer). Die missing-Objekte werden ausschließlich von dangling commits referenziert — normal nach Squash-Merges und Reaps. Der Guard wertet offenbar die rohe fsck-Ausgabe ungefiltert als Fehler und erzeugt damit einen Fehlalarm, solange nur der unerreichbare Teil betroffen ist. Empfehlung: Guard zwischen "missing an erreichbaren Objekten" (echter Befund) und "dangling/missing im unerreichbaren Teil" (kosmetisch, gc-Aufgabe) unterscheiden.
> **2. Vier Change-Archive vom 2026-08-17 tragen status: active statt completed** (drift, repo/chore/openspec-archive)
> 
> Verifiziert (2026-08-17): alle 2026-08-16-Archive tragen in tasks.md `status: completed`, die vier 2026-08-17-Archive tragen `status: active`: 2026-08-17-sdlc-deck-leiste-overflow, 2026-08-17-sdlc-deck-leiste-resize, 2026-08-17-sdlc-deck-resize-freeze-fix, 2026-08-17-sdlc-deck-resize-handle-fix. Der lokale stash@{0} enthält genau den Fix (status: completed) für resize — ein bg-job hat ihn als "stale" gestasht, weil er einen ff-pull blockierte. Die Häufung (4 von 4 heutigen Archiven) deutet auf Drift im Archivierungsprozess (plan-archive-Schritt), nicht auf Einzelfälle.
> **3. Welle-1-Dispatch lief gegen bereits gemergte Fixes (stale Audit-Basis)** (process, infra)
> 
> T011623 (weekly schema + dependency audit) wurde per Welle-1-Dispatch an dev-flow-chore übergeben, obwohl der Fix (Commit 7d74cf89b, PR #4706) bereits 21:35 UTC gemergt war — der Issue-Audit von 07:00 UTC war stale. Der Dispatch selbst verlangte die Stand-Prüfung; beide Fixpunkte verifiziert grün, Ticket auf done gesetzt, kein PR erstellt. Muster: Audit-Issue → Ticket-Erstellung → Dispatch-Bearbeitung laufen asynchron zum Factory-Merge desselben Issues; keine Doppel-Änderung entstanden, aber ein vollständiger Dispatch-Lauf ohne Änderung.
> **4. Rollup-Container-Vermehrung: T011583 + T011656 neben aktivem T009369** (drift, ticket-mcp)
> 
> Beim ticket-ops-Lauf am 2026-08-17 entdeckt: Drei Rollup-Container-Kandidaten an einem Abend. T009369 (in_progress, aktiv) existierte bereits, als um 20:42 T011583 und um 21:51 T011656 — beide mit identischem Titel/Beschreibung "Mishap Rollup — fortlaufende Sammlung" — als neue Zeilen entstanden. T011583 wurde per Dedupe-Guard als duplicate_of T009369 geschlossen (done · obsolete); T011656 bleibt offen (triage). Die Container-Suche (rollup-container/Flush-Pfad) legt Duplikate an, statt den existierenden offenen Container zu finden — damit kann der Rollup-Driver nicht mehr "genau einen" Container treffen und Batches verteilen sich auf mehrere Zeilen. Beleg: tickets.tickets-Abfrage vom 2026-08-17 (external_id, title, description identisch, desc_len=249 alle drei).
> **5. Verwaister Worktree für T011582: Branch nur lokal, kein Lock, Ticket unverändert triage** (suspicious, worktrees)
> 
> Worktree .worktrees/factory-dev-flow-e2e-coverage-T011582 existiert mit Branch feature/factory-dev-flow-e2e-coverage-T011582 (HEAD 5e57eaee8), aber: kein Remote-Branch (git ls-remote leer), kein agent-lock (check ticket → free, list ohne Eintrag), Ticket T011582 weiterhin triage. Eine Session hat die Arbeit begonnen und ist verschwunden (oder abgebrochen), ohne Branch zu pushen, zu claimen oder den Ticket-Status zu ändern — ticket-ops hätte T011582 sonst in Welle 2 dispatchen lassen (Doppelarbeit-Risiko). Verifiziert 2026-08-17 via git worktree list + agent-lock.sh. Nicht von mir angefasst (laufende-Arbeit-Regel).
> **6. devflow-post-merge-finalize.sh: Worktree-Pfad aus Slug statt Branch → Schritt-8-Selbstkonflikt (T008014-Klasse)** (degraded, scripts/devflow)
> 
> Beim Finalize-Lauf für T011580 (2026-08-17/18): devflow-post-merge-finalize.sh leitet den Worktree-Pfad aus dem Plan-Slug ab (.worktrees/fix-alibaba-token-key-guard-tmpdir), während dev-flow-plan den Worktree branch-basiert benannt hatte (.worktrees/alibaba-token-key-guard-T011580). Folge: Schritt 7 des Skripts setzt die Haupt-Checkout-tasks.md per sed auf status: completed → Haupt-Checkout wird dirty → Schritt 8 (git checkout -B im für das Archiv genutzten Baum) scheitert. Der Finalizer hat per Symlink (.worktrees/fix-alibaba-token-key-guard-tmpdir → alibaba-token-key-guard-T011580) gearbeitet; Skript-Lauf 2 lief dann durch. Gehört zur Fallenklasse des offenen Tickets T008014 (in_progress: "Worktree-Pfad ohne -T<id>-Suffix + cat-file mit absolutem Plan-Pfad → falsche Skips") — dort als weiterer Beleg nachtragen, kein neues Ticket.
> **7. T009369-Rollup-Zyklus schloss ohne Implementierung — 10 Mishap-Fixes teilweise verloren** (degraded, factory/mishap-rollup)
> 
> PR #4711 (T009369-Zyklus, merged 2026-08-17 22:24) enthielt nur die Plan-Dateien (proposal/spec/tasks), keine der 10 Fixes aus dem Batch vom 20:20. Das Ticket wurde trotzdem geschlossen (Kommentar 22:32: "PR bereits auf main gemergt — Ticket geschlossen statt dispatched (T006297)"). Uncommittete Fix-Anfänge liegen im reuse-Worktree .worktrees/mishap-incident-rollup-2026-08-17-T009369-reuse (tests/spec/software-factory/astro-syntax.bats für Mishap 1, --keep-worktree-Edit für Mishap 4) — ungepusht, keine Session aktiv. Einzelne Fixes kamen über andere Kanäle an (ticket-ops-procedures.md existiert inzwischen). Erwartung: Unerledigte Batch-Einträge müssen im nächsten Zyklus erneut aufgegriffen oder einzeln nachgetickert werden; der Closure-Pfad darf bei nur-Plan-Merge nicht als erledigt werten.
> **8. Rebase verliert test-inventory.json-Änderung auf Feature-Branches** (suspicious, repo/hooks)
> 
> Beim Rebase des verwaisten T011582-Branches auf origin/main verschwand die committete test-inventory.json-Änderung (+12 Zeilen) aus dem rebasierten Commit — vermutlich durch das post-merge-Hook-Verhalten, das generierte Artefakte (test-inventory.json, repo-index.json) nach einem Merge auf HEAD zurückstellt. Erkannt erst durch manuelle Prüfung; ohne Regeneration wäre der PR in CI (inventory gate) rot gelaufen. Verifiziert: git show des rebasierten Commits enthielt die Datei nicht mehr, task test:inventory stellte die +12 Zeilen wieder her. Betrifft jede Session, die einen Test-branch rebased.
> **9. check-commit-vs-diff.sh schlaegt Scope 'plan' vor, den validate-commit-msg.sh ablehnt** (drift, scripts/check-commit-vs-diff.sh)
> 
> Der commit-vs-diff-Guard (T001434) nennt in seiner Fehlermeldung woertlich `chore(plan):` als Ausweg fuer Plan-only-Diffs. Die Scope-Allowlist kennt aber nur `plans` (Plural) — `plan` ist dort lediglich ein Alias-Eintrag unter `plans:` in commitlint.config.cjs:47, kein gueltiger Scope.
> 
> Wer der Fehlermeldung woertlich folgt, wird vom naechsten Hook abgelehnt und braucht einen dritten Anlauf.
> 
> REPRODUKTION (2026-08-17, Commit 832f94815):
  > for s in "chore(plan): test" "chore(plans): test"; do
    > echo "$s" > /tmp/m.txt
    > bash scripts/validate-commit-msg.sh message /tmp/m.txt; echo "exit=$?"
  > done
  > # chore(plan)  -> exit=1  unknown scope 'plan'
  > # chore(plans) -> exit=0  message OK
> 
> FUNDSTELLEN:
  > scripts/check-commit-vs-diff.sh:15  (Kopfkommentar)
  > scripts/check-commit-vs-diff.sh:215 (Fehlermeldung an den Nutzer)
  > commitlint.config.cjs:15            ('plans' als Scope)
  > commitlint.config.cjs:47            (plans: ['plan', 'openspec', ...] — Alias, kein Scope)
> 
> FIX: In beiden Fundstellen des Guards `chore(plan):` zu `chore(plans):` korrigieren. Die Selbsttest-Zeile 100 desselben Skripts verwendet bereits korrekt `chore(plans)` — der Widerspruch steht also innerhalb einer Datei.
> 
> Beobachtet bei T011788/T011791; kostete zwei zusaetzliche Commit-Anlaeufe.
> **10. Zwei Sessions reparierten denselben roten main parallel — eine Arbeit war umsonst** (process, skills/git-workflow)
> 
> main war rot durch einen halb gemergten OpenSpec-Change (fix-spec-suite-leaks-website, aus PR #4716). Zwei Sessions bemerkten das unabhaengig und legten je einen Fix-PR mit identischem Diff an:
> 
  > 4722 MERGED chore(plans): halb gemergten Change fix-spec-suite-leaks-website entfernen [T008635]
  > 4723 CLOSED chore(plans): remove incomplete change fix-spec-suite-leaks-website [T011791]
> 
> #4723 wurde geschlossen, weil #4722 zuerst mergte und der Diff danach leer war. Worktree, Verify-Lauf (task test:changed, freshness:regenerate/check) und zwei Commit-Anlaeufe waren umsonst.
> 
> URSACHE: Ein roter main blockiert jeden offenen PR gleichzeitig. Damit bemerken ihn mehrere Sessions im selben Zeitfenster und reagieren gleich. Der agent-lock schuetzt hier nicht — er greift pro Branch, und beide Sessions waehlten verschiedene Branch-Namen fuer dieselbe Ursache.
> 
> VORSCHLAG: Bevor ein Fix-Worktree fuer einen CI-Fehlschlag angelegt wird, pruefen ob bereits ein offener PR dieselbe Ursache adressiert:
  > gh pr list --state open --json number,title -q '.[]|select(.title|test("<stichwort>"))'
> 
> Redaktioneller Hinweis fuer den CI-Fix-Loop in git-workflow, kein automatisierbarer Guard — die Zuordnung PR->Ursache ist nur ueber den Titel raten.
> 
> Beobachtet 2026-08-17 in T011788/T011791.

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
