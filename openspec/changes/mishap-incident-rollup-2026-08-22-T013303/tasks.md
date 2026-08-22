---
title: "mishap-incident-rollup-2026-08-22-T013303 — Implementation Plan"
ticket_id: T013303
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013303 — Implementation Plan

_Container-Ticket: T013303_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 07:04 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-22 07:03 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | tests/spec/mishap-rollup | Unit-Test drohte, Live-Rollup-Container in Prod-DB anzulegen |
> | 2 | drift | scripts/plan-touched-files.sh | touched_files-Ableitung uebernimmt zitierte Pfade aus Plan-Prosa |
> | 3 | process | scripts/agent-lock.sh | Ticket-Claim aus dem Haupt-Checkout traegt den falschen Branch |
> | 4 | suspicious | scripts/agent-lock.sh | Toter Planner-Session-Lock erzwang --force beim Claim von feature/ki-deck-T013302 |
> | 5 | drift | openspec/plan-staging | Plan-Staging übersah spec-gekoppelte BATS-Suiten — Factory-CI-Shard 4 rot |
> | 6 | drift | openspec/delta-authoring | MODIFIED-Deltas schnürten SSOT-Szenarien ein — Archivierung zweimal am Validator gescheitert |
> | 7 | suspicious | scripts/devflow-post-merge-finalize.sh | Finalizer-Rezept erzeugte Archive-PR auf veraltetem main — DIRTY bis manueller Rebuild |
> | 8 | degraded | scripts/hooks/openspec-embed | openspec-embed Post-Commit-Hook timeoutet wiederholt (non-fatal, ~90s/Commit) |
> | 9 | process | openspec/plan-archival | Openspec-Change von T012967 nie archiviert — Plan-Scaffold nur unter Reaper-Archiv-Tag erhalten |
> | 10 | degraded | scripts | --only in health-goals-check.sh führte alle Messungen eager aus (Vollscan-Kosten für gezielten Rescan) |
> 
> **1. Unit-Test drohte, Live-Rollup-Container in Prod-DB anzulegen** (suspicious, tests/spec/mishap-rollup)
> 
> Dieselbe Datei wie der Gather-Defekt (PR #4940, Commit 87e53e702): hätte sie geparst, hätte sie `scripts/ticket.sh rollup-container --brand mentolder` direkt im Unit-Test ausgeführt — ohne den dokumentierten Fail-closed-Opt-in (T002224, TICKET_TEST_DB_OK/BATS-Sentinel-Kontext). Bei fehlendem offenen Container legt der Self-Heal-Pfad einen NEUEN Container in der Live-mentolder-DB an; ein Testlauf hätte also produktive Ticket-Daten erzeugen können. Keine Assertions über status=0 hinaus. Durch Entfernen der Datei (Commit 0810dcc93) entschärft; als Konvention vermerkt: neue BATS-Dateien brauchen entweder Output-Verifikation mit Skip-Pfad oder den Opt-in-Guard.
> **2. touched_files-Ableitung uebernimmt zitierte Pfade aus Plan-Prosa** (drift, scripts/plan-touched-files.sh)
> 
> Bei T013306 (stage-plan --partials 6) leitete die touched_files-Ableitung 27 Pfade ab, davon drei falsch: 'openspec/proposal.ts' (entstanden aus einem Prosa-Verweis auf openspec/changes/.../proposal.md neben einem TS-Pfad), 'docs/code-quality/baseline.json' und 'docs/code-quality/gates.yaml' — beide waren im Plan nur als Quelle der S1-Schwellen ZITIERT, nicht als Zieldateien.
> 
> Wirkung: dev-flow-execute bekaeme Dateien als Scope, die der Plan nicht aendert; 'openspec/proposal.ts' existiert nicht einmal. Konflikt-Tracking gegen andere Tickets wird dadurch zu breit.
> 
> Manuell korrigiert per set_touched_files auf die 12 realen Zieldateien.
> 
> Beobachtung: die Ableitung unterscheidet nicht zwischen einem Pfad in der '## File Structure'-Tabelle (Zieldatei) und einem Pfad in erklaerender Prosa oder in einem Code-Block (Beleg/Quelle). Ein Plan, der die Mess-Konvention aus CLAUDE.md befolgt und seine Schwellenquellen mit Befehl und Pfad belegt, erzeugt dadurch systematisch zu breite touched_files.
> **3. Ticket-Claim aus dem Haupt-Checkout traegt den falschen Branch** (process, scripts/agent-lock.sh)
> 
> 'agent-lock.sh claim ticket T013306' wurde ausgefuehrt, bevor die Session in den Worktree wechselte. Der Claim schrieb den Branch des Haupt-Checkouts (chore/qwen38-subagent-T013301) in die Lock-Datei. Der Pre-Commit-Guard (plan-preflight.sh) lehnte den Commit spaeter mit 'Branch-Mismatch' ab.
> 
> Die Fehlermeldung nannte die Abhilfe exakt ('claim ticket <id> --branch <branch>'), der Umweg kostete also wenig. Bemerkenswert ist die Reihenfolge, die dev-flow-plan vorgibt: Schritt 4.5 verlangt den Claim vor dem Guard in Schritt 5, sagt aber nicht, dass der Claim aus dem Worktree kommen muss. Wer die Schritte woertlich in der Reihenfolge des Skills abarbeitet und den Claim vor dem cd setzt, laeuft zuverlaessig in diesen Mismatch.
> 
> Zusaetzlich: worktree-create.sh verweigert den Dienst, wenn der Haupt-Checkout auf einem Fremdbranch steht (hier der Fall, mit fremder uncommitteter Arbeit). Ausweg war --unattended. Ein 'git checkout main' waere hier falsch gewesen, weil eine parallele Session dort arbeitet.
> **4. Toter Planner-Session-Lock erzwang --force beim Claim von feature/ki-deck-T013302** (suspicious, scripts/agent-lock.sh)
> 
> Beim Adoptieren des Feature-Branch für T013302 hielt eine Planner-Session den Branch-Lock, ihr Prozess (PID 1892798) existierte aber nicht mehr. Force-Claim nötig; Workaround: stabile AGENT_LOCK_SID=2130041 exportiert statt der pro-Bash-Aufruf driftenden opencode-SID (bekanntes Pattern T002381). Ein Reap-Hinweis im Session-Start oder automatischer Stale-Reap vor claim würde den manuellen Force ersparen.
> **5. Plan-Staging übersah spec-gekoppelte BATS-Suiten — Factory-CI-Shard 4 rot** (drift, openspec/plan-staging)
> 
> Der gestagte Plan für T013302 (KI-Deck-Konsolidierung) listete die von der software-factory-Spec gekoppelten BATS-Suiten nicht: CI-Shard 4 scheiterte an FA-SF-72 (catalog-eval-telemetry.bats) und T002369-D3 (factory-escalation-ladder.bats), weil der Code den Phase-Pin entfernte, die Tests aber noch das alte Verhalten zusicherten. Fix im selben PR (Tests invertiert + SF-Delta ergänzt). touched_files/Tests-Section des Plan-Templates sollte Spec-Kopplungen (grep nach Spec-Namen in tests/spec/) automatisch einbeziehen.
> **6. MODIFIED-Deltas schnürten SSOT-Szenarien ein — Archivierung zweimal am Validator gescheitert** (drift, openspec/delta-authoring)
> 
> Zweimal blockierte der OpenSpec-Validator die Archivierung, weil MODIFIED-Delta-Requirements weniger Szenarien trugen als die SSOT (Bonsai Provider Registration 1/5, danach A locked factory model 3/6). Die weggekürzten Szenarien waren weiterhin gültiger Inhalt (File-beats-Env-Rang, Fail-soft-Fallback, Retired-Model-Guard, Emergency-via-Gateway; Locked-Model-Szenarien 1–3). Der Validator fail-closed korrekt — die Reibung liegt in der Delta-Erstellung: propose/apply-Gerüst mahnt nicht explizit, bei MODIFIED ALLE SSOT-Szenarien zu übernehmen. Hinweis im Skill/Template würde das verhindern.
> **7. Finalizer-Rezept erzeugte Archive-PR auf veraltetem main — DIRTY bis manueller Rebuild** (suspicious, scripts/devflow-post-merge-finalize.sh)
> 
> Der Finalizer legte den Archiv-PR (#4954) auf Basis von origin/main VOR der Sichtbarkeit des Feature-Squash-Merges an; Auto-Merge hing ~13 Min auf mergeStateStatus=DIRTY (main war inzwischen um #4952/#4953/#4955 gewandert). Rebuild von aktuellem origin/main + Cherry-Pick des Delta-Fixes löste es — wobei der Cherry-Pick nur die erste Delta-Korrektur enthielt und die zweite Szenarien-Restaurierung erneut angewendet werden musste. Rezept-Verbesserung: Archiv-Branch erst nach bestätigtem Merge-Commit fetchen/rebase-sicher erstellen oder DIRTY automatisch gegen frisches main rebasen (vgl. CI-Watch T001408 Finding 2).
> **8. openspec-embed Post-Commit-Hook timeoutet wiederholt (non-fatal, ~90s/Commit)** (degraded, scripts/hooks/openspec-embed)
> 
> Der post-commit-Embed-Hook schlug in jedem Commit des Worktrees nach 3 Retry-Versuchen (>30s je Versuch) fehl: 'embed failed after 3 attempts (non-fatal)'. Commits und Pushes waren nicht blockiert, aber jeder Commit verlor ~90s Wartezeit. Ursache unklar (Embedding-Endpoint im Worktree-Kontext nicht erreichbar oder überlastet); da non-fatal bewusst, nur Performance-Drift — beobachtet an 5+ Commits in Session T013302.
> **9. Openspec-Change von T012967 nie archiviert — Plan-Scaffold nur unter Reaper-Archiv-Tag erhalten** (process, openspec/plan-archival)
> 
> repo-hygiene-Lauf 2026-08-22: Ticket T012967 (branch-reaper Netzfehler) ist done/fixed, PR #4894 gemergt — aber das Openspec-Change `branch-reaper-netzausfall` existiert weder unter openspec/changes/ noch unter openspec/changes/archive/. Der Plan-Scaffold (design.md, intel.json, tasks.md) lag auf dem separaten Plan-Branch fix/branch-reaper-netzausfall-T012967 (plan_ref), der nie gemergt wurde und inzwischen vom branch-reaper gelöscht wurde. Inhalt ist nur noch unter dem Archiv-Tag refs/tags/reaped/fix/branch-reaper-netzausfall-T012967 erhalten — kein Datenverlust, aber die Archivierung (Delta-Spec-Merge in die SSOT) fand nie statt. Ursachenhypothese: Code-Fix und Plan liefen auf getrennten Branches; der Finalizer archivierte nur, was im Merge-PR lag. Dedupe geprüft: Mishap-Buffer (Stand 8/10) enthält keinen solchen Eintrag.
> **10. --only in health-goals-check.sh führte alle Messungen eager aus (Vollscan-Kosten für gezielten Rescan)** (degraded, scripts)
> 
> health-goals-check.sh filterte mit --only nur die Reporting-Zeile in row(); die $(...)-Messsubstitutionen aller ~107 Ziele liefen trotzdem (Vitest-Coverage, pnpm audit/outdated, npx/lhci, task-Runs, kubectl). Ein gezielter Ein-Ziel-Rescan dauerte 2m47s. In T013306 (PR #4957) mit want()-Präfixen an 24 teuren Messstellen behoben (17s); strukturelle Konsumenten-Tests (id-parity etc.) bleiben grün.

## Aufgaben — ein Eintrag, eine Entscheidung

So wird dieser Container abgearbeitet: **jeder Eintrag unten bekommt eine Disposition**, und
zwar genau eine der drei folgenden. Erst dann wird seine Box abgehakt.

| Disposition | Wann | Was sie verlangt |
|---|---|---|
| **gefixt** | der Eintrag beschreibt ein Problem, das in diesem Zyklus behoben wird | Code- oder Konfigaenderung **plus** ein Test, der das Fehlverhalten vorher reproduziert |
| **bereits gefixt** | das Problem ist zwischenzeitlich anderswo behoben worden | den Beleg nennen (PR-Nummer oder Commit) und gegenpruefen, dass er auf `main` liegt |
| **kein Repo-Fix** | transientes Laufzeitereignis, Bedienfehler, oder bewusst so gewollt | begruenden, warum keine Repo-Aenderung folgt |

Ein Eintrag darf offen bleiben, wenn er den Rahmen dieses Zyklus sprengt — dann bleibt seine
Box leer und der Grund steht dahinter. Was nicht zulaessig ist: eine Box abhaken, ohne die
Disposition hinzuschreiben. Die Dispositionen zusammen sind der Nachweis, dass der Container
abgearbeitet wurde und nicht nur geschlossen.

- [ ] **1. Unit-Test drohte, Live-Rollup-Container in Prod-DB anzulegen** (suspicious, tests/spec/mishap-rollup) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **2. touched_files-Ableitung uebernimmt zitierte Pfade aus Plan-Prosa** (drift, scripts/plan-touched-files.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **3. Ticket-Claim aus dem Haupt-Checkout traegt den falschen Branch** (process, scripts/agent-lock.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **4. Toter Planner-Session-Lock erzwang --force beim Claim von feature/ki-deck-T013302** (suspicious, scripts/agent-lock.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **5. Plan-Staging übersah spec-gekoppelte BATS-Suiten — Factory-CI-Shard 4 rot** (drift, openspec/plan-staging) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **6. MODIFIED-Deltas schnürten SSOT-Szenarien ein — Archivierung zweimal am Validator gescheitert** (drift, openspec/delta-authoring) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **7. Finalizer-Rezept erzeugte Archive-PR auf veraltetem main — DIRTY bis manueller Rebuild** (suspicious, scripts/devflow-post-merge-finalize.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **8. openspec-embed Post-Commit-Hook timeoutet wiederholt (non-fatal, ~90s/Commit)** (degraded, scripts/hooks/openspec-embed) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **9. Openspec-Change von T012967 nie archiviert — Plan-Scaffold nur unter Reaper-Archiv-Tag erhalten** (process, openspec/plan-archival) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung
- [ ] **10. --only in health-goals-check.sh führte alle Messungen eager aus (Vollscan-Kosten für gezielten Rescan)** (degraded, scripts) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix>_ + Begruendung

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
