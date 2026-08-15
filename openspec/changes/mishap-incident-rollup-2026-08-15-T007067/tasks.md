---
title: "mishap-incident-rollup-2026-08-15-T007067 — Implementation Plan"
ticket_id: T007067
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-15-T007067 — Implementation Plan

_Container-Ticket: T007067_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-15 15:42 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
scripts/worktree-create.sh                                  # E1: Guard prueft Haupt-Checkout-Branch (git-common-dir) statt pwd-HEAD
scripts/devflow-post-merge-finalize.sh                      # E2: Schritt 8 prueft Change-Zustand gegen origin/main, fail-closed
scripts/branch-reaper.sh                                    # E4: Tag-Push-Fehler wird gegen origin verifiziert (ls-remote) vor KEEP
scripts/plan-qa-check.sh                                    # E6: liest tasks.d/*.md in den QA-Payload (Index+Partials-Plaene)
tests/spec/worktree-create-main-checkout-guard.bats         # E1: RED→GREEN Test (Fremdbranch im Haupt-Checkout, Aufruf aus Worktree)
tests/spec/agent-skills/post-merge-finalize-guards.bats     # E2: T007067-Guards (ls-tree origin/main, fail-closed)
tests/spec/ci-cd/branch-reaper-archiv-tag-verify.bats       # E4: Tag-liegt-auf-origin-trotz-Push-Fehler (Positiv/Negativ)
tests/spec/dev-flow-plan/plan-qa-payload.bats               # E6: Partials-in-Payload + Single-Plan-unveraendert
components/website/src/data/openspec-status.json            # E9: regeneriert (kanonischer Generator openspec-status-map.sh)
components/website/src/data/test-inventory.json             # freshness:regenerate (neue Tests)
docs/code-quality/repo-index.json                           # freshness:regenerate (neue Tests)
openspec/changes/mishap-incident-rollup-2026-08-15-T007067/tasks.md  # dieser Plan: File Structure + Verify + Entscheidungen
```

## Mishap-Entscheidungen (2026-08-15 Rollup)

| # | Entscheidung | Begruendung |
|---|---|---|
| 1 | **fixed** | Guard in worktree-create.sh prueft jetzt den echten Haupt-Checkout-Branch (Elternverzeichnis des git-common-dir) statt pwd-relatives HEAD. RED-Test in tests/spec/worktree-create-main-checkout-guard.bats. |
| 2 | **fixed** | devflow-post-merge-finalize.sh Schritt 8 prueft den Change-Ordner gegen origin/main (git ls-tree). Ist er dort noch aktiv, bricht das Skript fail-closed mit klarer Meldung ab statt still "bereits archiviert?" zu melden. |
| 3 | **deferred** | Guard gegen Pushes auf gemergte Branches braeuchte eine gh-MERGED-PR-Abfrage im pre-push-Hook (Netzwerkabhaengigkeit, Hook-Chirurgie). Kein trivialer Fix; bleibt im Container fuer spaeteren Rollup. |
| 4 | **fixed** | branch-reaper.sh verifiziert nach fehlgeschlagenem Archiv-Tag-Push den Tag-Zustand gegen origin (git ls-remote). Liegt der Tag am Branch-SHA, laeuft der Delete weiter (Sicherheitsnetz erfuellt); sonst KEEP wie bisher. |
| 5 | **fixed-externally** | Die bash-Fehler (`${#MERGED_HEADS[@]:-0}` bad substitution, toter `-z`-Lazy-Load-Guard) wurden vom T007032-Implementer bereits behoben (numerischer `-eq 0`-Check, `${MERGED_HEADS[@]:-}`), verifiziert in scripts/branch-reaper.sh Zeile 175/310. Kein Rest-Code-Fehler; Prozess-Lehre (Plan-Code erst im BATS-Lauf sichtbar) ist dokumentiert. |
| 6 | **fixed** | plan-qa-check.sh liest tasks.d/*.md in den QA-Payload, wenn neben der tasks.md ein tasks.d/-Verzeichnis mit `## Partials`-Manifest liegt (T002074-Struktur). Kein strukturelles False-FAIL mehr fuer Index+Partials-Plaene. |
| 7 | **deferred** | post-commit-embed-Hang bei belegtem Port 15432: Hook-Chirurgie (Verbindungs-Timeout-Guard). Kern-Mitigationen (Probe-Timeout 20s, Retries, non-fatal WARN) existieren bereits in openspec-embed-local.sh; der 2-Minuten-Hang ist der 3x20s-Worst-Case. Bleibt im Container. |
| 8 | **deferred** | .claude/skills/dev-flow-plan wird von Branch T006367 umgeschrieben (paralleler Owner). Doku-Kontrakt-Drift (Rollen-Literal 'tests', Claim-Flags) wird dort behandelt. |
| 9 | **fixed** | openspec-status.json war in diesem Branch-Kontext stale (T007067-Eintrag fehlte). Kanonische Regeneration via `bash scripts/openspec-status-map.sh` ausgefuehrt und committet. (Erster Regenerations-Lauf produzierte `{}` — vermutlich OPENSPEC_ROOT-/cwd-Einfluss — verworfen und aus dem Worktree-Root erneut generiert; Ergebnis: genau +1 Eintrag T007067 gegen HEAD.) |
| 10 | **deferred/observed** | mcp-postgres (localhost:13001) war zum Mishap-Zeitpunkt down (kein Listener). Aktueller Zustand (2026-08-15 Abend): Server laeuft wieder, MCP-Initialize antwortet HTTP 200. Environment-Zustand, kein Code-Defekt; kein Ticket. |

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-15 15:41 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | scripts/worktree-create.sh | worktree-create.sh legt bei Fremdbranch im Hauptcheckout Worktree auf falschem Branch an |
> | 2 | suspicious | scripts/devflow-post-merge-finalize.sh | Post-Merge-Finalize ueberspringt OpenSpec-Archiv still bei fremdem Hauptcheckout-Branch |
> | 3 | drift | repo/git-workflow | Post-Merge-Push auf gemergten Branch verliert Commits (2. Vorkommen, k3-messung.sh) |
> | 4 | suspicious | scripts/branch-reaper.sh | branch-reaper meldet "Archiv-Tag konnte nicht gepusht werden", Tag liegt aber auf origin |
> | 5 | process | dev-flow-plan | Plan-Code-Fehler (bad substitution, -z-Default) erst im BATS-Lauf sichtbar |
> | 6 | degraded | scripts/plan-qa-check.sh | plan-qa-check bewertet Index+Partials-Pläne als FAIL (liest tasks.d/ nicht) |
> | 7 | degraded | .githooks/post-commit-embed | post-commit-embed hängt bei belegtem Port 15432 und lässt git commit scheinbar fehlschlagen |
> | 8 | drift | .claude/skills/dev-flow-plan | dev-flow-plan-Doku drifted von plan-lint/agent-lock-Kontrakten (Rollen-Literal, Claim-Flags) |
> | 9 | drift | repo/chore/plan-archive | Rebase nach Reorg verlor openspec-status.json-Änderung still |
> | 10 | degraded | mcp/postgres | mcp-postgres (localhost:13001) nicht erreichbar — DB-Abfrage via kubectl exec umgangen |
> 
> **1. worktree-create.sh legt bei Fremdbranch im Hauptcheckout Worktree auf falschem Branch an** (suspicious, scripts/worktree-create.sh)
> 
> Verifiziert 2026-08-15: Der Hauptcheckout stand durch eine Parallelsession auf chore/cosign-sign-reference-T007035. worktree-create.sh brach NICHT fail-closed ab, sondern legte den Worktree auf dem fremden Branch an (Worktree-Branch = chore/cosign... statt feature/...-T007055). Reparatur: manueller git worktree add von origin/main + Branch-Reset. Erwartung: Skript soll bei Fremdbranch mit klarer Meldung abbrechen statt weiterzuarbeiten.
> **2. Post-Merge-Finalize ueberspringt OpenSpec-Archiv still bei fremdem Hauptcheckout-Branch** (suspicious, scripts/devflow-post-merge-finalize.sh)
> 
> Verifiziert 2026-08-15: Bei fremdem Branch im Hauptcheckout fand der Finalize den Change-Ordner nicht und uebersprang das OpenSpec-Archiv still (Meldung „bereits archiviert?"), obwohl der Change auf origin/main noch AKTIV lag (halb-archivierter Zustand, Delta nicht in die SSOT gemerged). Reparatur: manuelles openspec.sh archive in eigenem Worktree + Archiv-PR. Erwartung: Finalize soll den Change-Zustand gegen origin/main pruefen statt gegen den lokalen Hauptcheckout-Baum.
> **3. Post-Merge-Push auf gemergten Branch verliert Commits (2. Vorkommen, k3-messung.sh)** (drift, repo/git-workflow)
> 
> Zweites Vorkommen des #4619-Musters am 2026-08-15: Commits, die nach dem Auto-Merge auf den bereits gemergten Branch gepusht werden, landen nie auf main (k3-messung.sh aus Commit 83fa33c44 fehlte auf origin/main, obwohl PR #4622 gemergt war — Nachreich-PR #4637 noetig). Erwartung: Guard, der Pushes auf gemergte Branches warnt/verhindert.
> **4. branch-reaper meldet "Archiv-Tag konnte nicht gepusht werden", Tag liegt aber auf origin** (suspicious, scripts/branch-reaper.sh)
> 
> Sweep 2026-08-15 (~11:55Z, repo-hygiene): Der Reaper meldete für feature/unterstuetzermodelle-e2b-slot-T007055 "KEEP — Archiv-Tag konnte nicht gepusht werden, kein Delete". Direkt danach zeigt git ls-remote --tags origin refs/tags/reaped/feature/unterstuetzermodelle-e2b-slot-T007055 den Tag exakt am Branch-Tip (538d6dffe). Entweder ging der Push doch durch (dann prüft der Reaper falsch) oder ein paralleler Prozess pushte ihn. Das fail-closed-Ergebnis war korrekt (Branch blieb erhalten), aber die Meldung widerspricht dem beobachteten Endzustand und erschwert die Diagnose.
> **5. Plan-Code-Fehler (bad substitution, -z-Default) erst im BATS-Lauf sichtbar** (process, dev-flow-plan)
> 
> Plan-Code zu T007032 (branch-reaper-keep-allowlist, tasks.d/p1-implement.md) enthielt zwei bash-Fehler, die erst der BATS-Lauf fand: (1) `${#MERGED_HEADS[@]:-0}` — bad substitution, bricht bei set -u mit Exit 1 ab; (2) Guard `[ -z "${MERGED_HEADS_LOADED:-}" ]` mit Default `MERGED_HEADS_LOADED=0` ist immer false ("0" ist nicht leer) — der Lazy-Load lief nie, Nachfolge-Signal blieb tot. Beide im Implementer fixiert und durch die 9 neuen Tests verifiziert. Muster wie T002700: Plan-Code wird als verifiziert vorausgesetzt, erst die Ausführung deckt Syntax/Semantik-Fehler auf. Zusatzbefund: scripts/check-pr-automerge.sh meldete beim ersten Lauf einen fremden PR (#4650) statt des eigenen (#4651) — paralleler gh-pr-create-Kontext; direkter Re-Check war korrekt, kein Gate-Defekt.
> **6. plan-qa-check bewertet Index+Partials-Pläne als FAIL (liest tasks.d/ nicht)** (degraded, scripts/plan-qa-check.sh)
> 
> Bei T007559 (Change sdlc-leitstand-e1-e2) meldete scripts/plan-qa-check.sh RESULT: FAIL mit Begründung "der Plan delegiert die eigentliche Arbeit an Partials, die nicht im Dokument enthalten sind" — die konkreten Dateipfade, Budgets und Test-Schritte stehen aber konventionsgemäß in tasks.d/p1..p3.md (T002074-Struktur), die der harte Linter plan-lint.sh korrekt einbezieht (PASS). Das Advisory-Urteil ist damit für jeden Partial-Plan strukturell falsch-negativ und verwässert den Signalwert der QA. Fix-Idee: plan-qa-check.sh sollte tasks.d/*.md des Change mit einlesen, wenn ein ## Partials-Manifest existiert.
> **7. post-commit-embed hängt bei belegtem Port 15432 und lässt git commit scheinbar fehlschlagen** (degraded, .githooks/post-commit-embed)
> 
> Beim Plan-Stage-Commit von T007559 lief `git commit` in ein 2-Minuten-Timeout (Exit 143), obwohl der Commit selbst erfolgreich erstellt wurde (64c56f0b5 auf feature/sdlc-leitstand-e1-e2-T007559). Ursache: der post-commit-Embed-Pfad (.githooks/post-commit-embed) blockiert, während Port 15432 von einem kubectl-Port-Forward belegt ist (ss zeigte kubectl pid=3708730 auf 127.0.0.1:15432). Verwandt mit dem bekannten openspec-embed-Fall, aber neue Ausprägung: Der Hook bricht nicht ab, sondern HÄNGT — für Agenten sieht der Commit-Befehl dadurch wie ein Fehlschlag aus und verleitet zu gefährlichen Retries. Fix-Idee: Verbindungs-Timeout (wenige Sekunden) bzw. Erreichbarkeits-Guard im Embed-Hook, danach non-blocking skip mit Warnung.
> **8. dev-flow-plan-Doku drifted von plan-lint/agent-lock-Kontrakten (Rollen-Literal, Claim-Flags)** (drift, .claude/skills/dev-flow-plan)
> 
> Zwei Doku-Kontrakt-Drifts im selben Lauf (T007559): (a) plan-lint.sh erzwingt in der letzten ## Partials-Manifest-Zeile das wörtliche Rollen-Literal 'tests' (STRUCT-PARTIAL: "last manifest row must have role 'tests' (found 'bachelorprojekt-test')"), während die dev-flow-plan-Doku durchgehend volle Rollennamen (bachelorprojekt-test) verwendet und das Literal nirgends nennt — der erste Index-Entwurf mit vollem Rollennamen fiel hart durch. (b) dev-flow-plan Schritt 4.5 zitiert den Ticket-Claim als `agent-lock.sh claim ticket "$TICKET_EXT_ID" …` — die Ellipse verdeckt, dass claim einen Flag-Satz verlangt (--label/--worktree/--branch/--ticket); der doku-getreue Aufruf ohne Flags schlägt fehl. Fix-Idee: Rollen-Literal-Konvention und vollständige Claim-Signatur in dev-flow-plan bzw. plan-quality-gates.md dokumentieren.
> **9. Rebase nach Reorg verlor openspec-status.json-Änderung still** (drift, repo/chore/plan-archive)
> 
> Beim Rebase des Archiv-Commits 7be6ba0d7 (chore/plans: archive branch-reaper-keep-allowlist, PR #4654) auf den post-Reorg-main (de4c5be7c) hat git die Modifikation an website/src/data/openspec-status.json STILL verworfen: die Datei war durch T006999 nach components/website/src/data/openspec-status.json gezogen, der Patch auf den Alt-Pfad wurde ohne Konfliktmeldung gedroppt. Nur die 8 Change-Verzeichnis-Renames + ci-cd.md-Delta wurden angewendet. Ohne Diff-Review (git diff origin/main --stat) wäre der PR ohne Status-Update gemergt — die Website hätte T007032 weiter als plan_staged gezeigt. Fix: bash scripts/openspec-status-map.sh regeneriert die Datei (kanonischer Generator), dann amend. VERIFIZIERT: git show 8ba5b41f7 --name-status enthielt kein status.json, Datei zeigte plan_staged; nach Regen diff genau 2+/2-.
> **10. mcp-postgres (localhost:13001) nicht erreichbar — DB-Abfrage via kubectl exec umgangen** (degraded, mcp/postgres)
> 
> Der mcp-postgres-Server (http://localhost:13001/mcp laut .mcp.json) antwortet nicht (curl timeout, kein Listener auf 13001; ss zeigt nur 13003 factory-mcp und 13005). Die Tickets-DB-Abfrage musste daher über scripts/ticket.sh bzw. kubectl exec auf den shared-db-Pod (Context k3d-mentolder-dev, DB website, Schema tickets) ausweichen. Zusätzlich war der Port-Forward auf 127.0.0.1:5432 (fleet) während des Laufs flaky (Connection refused bei zweiten Aufruf). VERIFIZIERT: curl -m 3 localhost:13001/mcp schlug fehl; ss -tlnp zeigt keinen 13001-Listener.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/worktree-create-main-checkout-guard.bats
# expected: FAIL (rot) — der Test reproduziert Mishap 1: worktree-create.sh legt
# bei Fremdbranch im Haupt-Checkout (Aufruf aus einem Worktree) den Worktree an,
# statt fail-closed abzubrechen. RED belegt 2026-08-15: Test 1 scheiterte vor dem
# Fix an `[ "$status" -ne 0 ]` (Skript lief durch, exit 0).
```

- [x] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/worktree-create-main-checkout-guard.bats
# GREEN: ok 1 T007067-M1 ...
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-archiv-tag-verify.bats
# GREEN: ok 1..3 (Positiv-Anker, Tag-trotz-Push-Fehler, Negativ-KEEP)
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats
# GREEN: ok 1..10 (8x T006348 + 2x T007067)
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-payload.bats
# GREEN: ok 1..7 (5x T002595 + 2x T007067)
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-infra-testspec-ci.bats
# GREEN: ok 1..10 (keine Regression T002448-M1)
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
