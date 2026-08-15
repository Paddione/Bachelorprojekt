---
title: "mishap-incident-rollup-2026-08-15-T007877 — Implementation Plan"
ticket_id: T007877
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-15-T007877 — Implementation Plan

_Container-Ticket: T007877_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-15 18:17 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
commitlint.config.cjs                                                  # [9] Alias-Gruppen als DEPRECATED gekennzeichnet (Nur-Hinweis, kein Scope-Nachweis)
openspec/specs/*.md (36 Nicht-Archiv-Dateien)                          # [6] website/src → components/website/src Pfad-Sweep (204 Zeilen)
openspec/changes/mishap-incident-rollup-2026-08-15-T007877/tasks.md    # Entscheidungen + Verify-Doku
tests/spec/agent-skills/worktree-write-guard-session-propagation.bats  # [10] T5-Regressionstest: zwei Claims derselben SID → beide Worktrees beschreibbar
```

Nicht angefasst (bewusst): `.opencode/package.json` + `.opencode/package-lock.json`
(unstaged tooling-Drift 1.18.16→1.18.18, nicht Teil des Tickets).

## Entscheidungen je Mishap-Eintrag

| # | Entscheidung | Begründung |
|---|---|---|
| 1 | RED nicht anwendbar (Verify), Prozess-Hinweis dokumentiert | Auto-Merge-Gate lebt in `.github/workflows/auto-enable-automerge.yml` + `scripts/check-pr-automerge.sh` (Live-`gh`-API-Zustand) — nicht hermetsch in bats reproduzierbar; Fix ist eine Merge-Policy-Änderung, die dem Workflow-Besitzer gehört (kein kleiner sauberer Fix) |
| 2 | `deferred` | `scripts/devflow-post-merge-finalize.sh` wird diesen Zyklus von T007067 geführt (paralleler Branch) — Konfliktvermeidung |
| 3 | fixed-externally (Umgebung) | 13 Symlinks im Haupt-Checkout zeigen wieder auf gültige Ziele (0 broken, `.pnpm` vorhanden); Gate-Läufe wieder möglich. Remediation bei Rezidiv: `pnpm install`/`npm install` im Haupt-Checkout |
| 4 | `deferred` | Operator-Zustand (Haupt-Checkout auf abgeschlossenem Branch T007035 mit uncommitteten Änderungen einer laufenden Session) — kein Code-Problem, keine Aktion aus dem Worktree |
| 5 | fixed-externally (beobachtet) | mcp-postgres-Gateway liefert wieder `200` auf `/health` (curl-Probe); M2-Fallback nicht mehr nötig |
| 6 | fixed | Pfad-Sweep `website/src` → `components/website/src` in 36 Nicht-Archiv-OpenSpec-Specs (204 Zeilen, rein mechanisch, Regex-sicher gegen `components/website/src`-Doppelersatz). `docs/`-Sweep (126 Dateien) + `archive/` (30 Vorkommen, historische Protokolle) bewusst `deferred` — eigener Chore laut Mishap-Fix-Idee |
| 7 | `deferred` | `dev-flow-execute`-Docs werden von T006367 umgeschrieben (paralleler Branch) |
| 8 | fixed-externally | Bonsai-Guard-Entfernung bereits durch PR #4666 (T007956) gemergt — `.githooks/pre-commit` auf origin/main enthält keinen Bonsai-Block mehr |
| 9 | fixed | `SCOPE_ALIAS_GROUPS` in commitlint.config.cjs als DEPRECATED (Nur-Hinweis, keine gültigen Scopes) markiert; kanonische Abfrage `bash scripts/validate-commit-msg.sh scopes` im Kommentar verankert (git-workflow-SKILL.md Zeile 150 dokumentiert sie bereits) |
| 10 | fixed-externally (bereits behoben) + Regressionstest | MY_WTS sammelt seit T002412 ALLE eigenen Claims; SID-Propagation für delegierte Subagenten seit T006365 (05:06 UTC heute, vor Mishap-Batch). Live-Test bestätigt: zwei Claims derselben SID → beide Worktrees beschreibbar. T5-Regressionstest verankert das Verhalten |

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-15 17:58 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | process | dev-flow-execute | Auto-Merge rannte dem Code-Review-Gate davon — Review-Fixes verpassten den Merge |
> | 2 | process | devflow-post-merge-finalize.sh | finalize.sh Schritt 8 kennt kein --create-new für neue SSOT-Specs |
> | 3 | degraded | repo/node_modules | 13 broken node_modules-Symlinks im Haupt-Checkout blockieren lokale Quality-Gates |
> | 4 | drift | repo/main-checkout | Haupt-Checkout hängt auf abgeschlossenem Branch statt main (T007035 done, Branch nicht aufgeräumt) |
> | 5 | degraded | mcp-postgres-gateway | mcp-postgres-Gateway nicht erreichbar (curl-Probe 000) — M2-Fallback nötig |
> | 6 | drift | openspec/specs | Repo-Reorg T006999 zog OpenSpec-Spec-Pfade nicht nach (website/src → components/website/src) |
> | 7 | degraded | skills/dev-flow-execute | cwd-Persistenz: Chore-Verify lief im falschen Worktree (Bash-cwd erbt zwischen Calls) |
> | 8 | degraded | githooks/pre-commit | Bonsai-Guard blockte seine eigene Löschung (Self-Referenz + absoluter hooksPath) |
> | 9 | drift | commitlint | Scope-Allowlist: veraltetes 'hooks' in commitlint.config.cjs führt Agenten in die Irre |
> | 10 | degraded | scripts/hooks/worktree-write-guard.sh | SID-Doppel-Claim: zweiter Branch-Claim derselben Session blockte Edit-Tools des Implementers |
> 
> **1. Auto-Merge rannte dem Code-Review-Gate davon — Review-Fixes verpassten den Merge** (process, dev-flow-execute)
> 
> Der Enable-Auto-Merge-Workflow (bzw. der erste Implementer-Lauf) aktivierte Auto-Merge auf PR #4659, BEVOR das Code-Review-Gate lief. Das Auto-Merge mergerte, sobald die Checks grün waren — die 10 Important-Findings des Reviews (17 Dateien, darunter funktional: totes post-merge-Restore, Renovate-Scope-Ausweitung, .dockerignore) verpassten den Merge-Schnitt und mussten als eigenes Fix-Ticket T007855 nachgezogen werden. T001899-M1 verbietet Auto-Merge vor dem Implementierungs-Push — der Enable-Auto-Merge-Workflow umgeht diese Schutzebene. Vorschlag: Enable-Auto-Merge nur nach bestandenem Code-Review-Gate zulassen bzw. der Gate-Check check-pr-automerge.sh sollte bei Review-ausstehend den Auto-Merge deaktivieren statt nur zu melden.
> **2. finalize.sh Schritt 8 kennt kein --create-new für neue SSOT-Specs** (process, devflow-post-merge-finalize.sh)
> 
> Finalize-Schritt 8 (OpenSpec-Archiv) scheitert mit Exit 1, wenn der Change eine genuinely new SSOT-Spec erzeugt (Parent-Spec existiert nicht): openspec.sh archive verlangt --create-new, das Skript weiß davon nichts. Finalizer musste den Archiv-Schritt manuell nachziehen (inkl. zweitem Versuch, weil die git-add-pathspecs die components/-Moves auf main nicht enthielten). Vorschlag: Skript erkennt fehlende Parent-SSOT und setzt --create-new automatisch; zusätzlich die git-add-pathspecs für archivierte Changes auf git add -A des Change-Verzeichnisses vereinfachen.
> **3. 13 broken node_modules-Symlinks im Haupt-Checkout blockieren lokale Quality-Gates** (degraded, repo/node_modules)
> 
> Nach Entfernen des repo-structure-reorg-Worktrees (T006999) blieben 13 pnpm-Symlinks (yaml, vitest, drizzle-orm, openai, typescript, ...) in /home/patrick/Bachelorprojekt/node_modules auf den gelöschten Worktree zeigen. task quality:check/freshness:check sterben mit ERR_MODULE_NOT_FOUND (load.mjs: Cannot find package 'yaml'), pre-push blockierte → SKIP_CI_CHECK=1-Bypass nötig. CI (GitHub) lief grün. Hygiene-Folgeticket empfohlen.
> **4. Haupt-Checkout hängt auf abgeschlossenem Branch statt main (T007035 done, Branch nicht aufgeräumt)** (drift, repo/main-checkout)
> 
> Main checkout steht auf chore/pocktid-fqdn-devstack-T007035 (Ticket done|shipped) mit uncommitteten Änderungen (.opencode/skills/*, k3d/network-policies.yaml) — Arbeit einer laufenden Session. worktree-create.sh verweigert den Start vom Fremd-Branch (FATAL: muss vom main-Branch ausgeführt werden); nur --unattended half. Zudem erzeugte die node_modules-Symlink-Logik im neuen Worktree leere website//brett/-Verzeichnisse (pnpm-workspace.yaml-Marker des Pre-Reorg-Checkouts), wodurch 2 repo-structure-Guards lokal rot laufen (CI grün).
> **5. mcp-postgres-Gateway nicht erreichbar (curl-Probe 000) — M2-Fallback nötig** (degraded, mcp-postgres-gateway)
> 
> localhost:13001/health lieferte 000 statt 200; alle mcp-postgres-Query-Aufrufe scheiterten mit 'Unable to connect'. Triage-Lauf nutzte den dokumentierten M2-Fallback (kubectl exec psql auf shared-db). Erreichbarkeit des Gateways nach dem Tick prüfen.
> **6. Repo-Reorg T006999 zog OpenSpec-Spec-Pfade nicht nach (website/src → components/website/src)** (drift, openspec/specs)
> 
> Nach Merge von #4659 (T006999, website/ → components/website/) referenziert openspec/specs/sdlc-cockpit.md auf origin/main weiterhin 4× den alten Pfad-Präfix website/src und 0× components/website. Vermutlich betrifft das weitere Specs/Doku (nicht ausgezählt). Messbefehl: git show origin/main:openspec/specs/sdlc-cockpit.md | grep -c 'website/src' (=4) bzw. grep -c 'components/website' (=0), gemessen 2026-08-15 gegen origin/main nach de4c5be7c. Folgewirkung konkret beobachtet: der offene PR #4663 (T007559) hätte per Auto-Merge neue Dateien am toten Alt-Pfad eingebracht — Auto-Merge wurde manuell deaktiviert. Fix-Idee: Sweep über openspec/specs/ + docs/ mit Pfad-Ersetzung als eigenes Chore, plus Erwähnung im Reorg-Abschlussbericht.
> **7. cwd-Persistenz: Chore-Verify lief im falschen Worktree (Bash-cwd erbt zwischen Calls)** (degraded, skills/dev-flow-execute)
> 
> Orchestrator-CWD-Persistenz: Nach einem cd in den T007559-Worktree (SHA-Lookup für den Reviewer) liefen der Chore-test:changed (590s-Timeout-Lauf) und task freshness:regenerate im FALSCHEN Worktree — Folge-Aufrufe ohne explizites cd erben das persistierte Shell-cwd. Die 10 not-ok im Fehllauf sahen wie bekannte Env-Artefakte aus, weil es derselbe Stand war; der Verify-Schluss "kein Befund durch den Chore" war gegenstandslos und wurde durch einen erneuten Lauf im korrekten Worktree (1526 ok, 0 not-ok) ersetzt. Zusätzlich schrieb das falsch platzierte Regenerat eine dirty openspec-status.json in den T007559-Worktree (vom Finalizer mit entfernt). Lehre: JEDEN Bash-Call mit explizitem cd präfixen, wenn mehrere Worktrees in einer Session koordiniert werden; /proc/<pid>/cwd zur Verifikation von Background-Runs.
> **8. Bonsai-Guard blockte seine eigene Löschung (Self-Referenz + absoluter hooksPath)** (degraded, githooks/pre-commit)
> 
> Der Bonsai-Write-Guard blockierte den Commit, der ihn selbst entfernt (T007956): Er revertete die staged Deletion seines eigenen Skripts und brach mit exit 1 ab. Ursachenkette: core.hooksPath zeigt absolut auf das .githooks/ des Haupt-Checkouts — der Hook (mit Bonsai-Block) läuft also auch für Worktree-Commits; der erste Commit-Versuch lief zudem wegen cwd-Drift im Haupt-Checkout (main-commit-guard-Block). Lösung war der dokumentierte Bypass SKIP_BONSAI_GUARD=1 — legitim, weil die Guard-Entfernung der Zweck des Commits war. Durch den Chore (PR #4666) behoben; der Vorfall belegt das Konsolidierungs-Motiv (T004533-Klasse).
> **9. Scope-Allowlist: veraltetes 'hooks' in commitlint.config.cjs führt Agenten in die Irre** (drift, commitlint)
> 
> Scope-Allowlist-Drift: grep auf commitlint.config.cjs ergab 'hooks' als NAMED_SCOPE-Kandidat, der commit-msg-Hook lehnte chore(hooks) jedoch ab — 'hooks' wurde zu 'factory' konsolidiert (T002328), die veralteten Aliase stehen weiter als Text in der Config. Der Hook nannte die richtige Quelle (scripts/validate-commit-msg.sh scopes), die grep-basierte Ermittlung hätte das nie erkannt. Folge: ein abgelehnter Commit + Diagnose-Runde. Empfehlung: Deprecated-Aliase in der Config kennzeichnen oder validate-commit-msg.sh scopes als kanonische Abfrage in CLAUDE.md/git-workflow verankern.
> **10. SID-Doppel-Claim: zweiter Branch-Claim derselben Session blockte Edit-Tools des Implementers** (degraded, scripts/hooks/worktree-write-guard.sh)
> 
> Multi-Worktree-Orchestrierung unter einer SID: Als der Orchestrator parallel zum laufenden T007559-Implementer den Chore-Branch T007956 claimte (gleiche AGENT_LOCK_SID), blockte der Worktree-Write-Guard zeitweise die Edit-Tools des Implementers — dessen Worktree stand nicht mehr in der MY_WTS-Liste der geteilten SID. Der Implementer löste es durch eigenen Re-Claim seines Branches (Claims koexistierten danach korrekt). Befund: Die MY_WTS-Logik scheint einen Worktree pro SID zu erwarten; zwei parallele Claims derselben Session (Orchestrator + delegierter Implementer) sind ein realistischer Betriebsfall, der ohne Re-Claim nicht trägt.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED) — nicht anwendbar, begründet.** Eintrag 1 ist eine
      Prozess-Beobachtung (Auto-Merge rannte dem Code-Review-Gate davon). Das
      Verhalten wird von `.github/workflows/auto-enable-automerge.yml` (setzt
      `gh pr merge --auto` inline bei jedem Nicht-Draft-PR) und
      `scripts/check-pr-automerge.sh` (Live-`gh`-API-Zustand) bestimmt — beides
      ist ohne GitHub-API-Mocking nicht hermetsch in bats reproduzierbar, und
      ein Mock würde nur den Mock testen. Ein aussagekräftiger RED-Test müsste
      die Merge-Policy ändern (Auto-Merge nur nach bestandenem Review-Gate),
      was eine Workflow-Änderung ist und nicht in ein Rollup-Chore gehört
      (Fix-Idee als Prozess-Empfehlung im Eintrag 1 dokumentiert).

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
# real: nicht anwendbar — siehe Begründung oben (kein hermetsches Testziel vorhanden)
```

- [x] **Fix-Step (GREEN).** Einträge 6 (Spec-Pfad-Sweep), 9 (Deprecated-Alias-Markierung)
      und 10 (Regressionstest T5, zwei Claims derselben SID) umgesetzt; Einträge 2, 4, 7
      als `deferred` dokumentiert; Einträge 3, 5, 8 als fixed-externally beobachtet/verifiziert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-write-guard-session-propagation.bats
# result: 5 ok (inkl. neuem T5 für Eintrag 10)
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
