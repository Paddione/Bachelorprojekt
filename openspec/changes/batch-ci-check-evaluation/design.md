# Design: batch-ci-check-evaluation

Root-Cause- und Evidenz-Notizen je Kind-Ticket (Symptom-vs-Hypothese, T002448-M5). Die
Entscheidungen stehen in proposal.md; dieses Dokument hält die Befunde fest, auf denen sie
beruhen.

## T002827 — Pre-push validiert stale Scope-Commits

Befund aus `.githooks/pre-push` (aktueller Stand auf main):

- Zeile 45–51: `BASE=$(git rev-parse --verify "origin/main" 2>/dev/null || echo "${REMOTE_SHA:-}")`,
  danach `validate-commit-msg.sh range "${BASE}..${LOCAL_SHA}"`.
- Nach `git rebase origin/main` ist der alte Remote-Tip (REMOTE_SHA) nicht mehr Ancestor des
  neuen HEAD. Resolvt der lokale `origin/main`-Ref nicht (frischer/shallow Worktree) oder ist
  er älter als das main, auf das rebased wurde, enthält der Range bereits gemergte main-Commits
  mit Scopes, die seit T002328 konsolidiert wurden (ci-cd, mcp-gateway, e2e-testing, routes) →
  Push wird abgelehnt; Workaround damals: `rebase --onto`.
- Der Factory-Plan (`fix-prepush-stale-scope`, Worktree `.worktrees/fix-prepush-stale-scope-T002827-reuse`)
  zielt auf dieselbe Stelle: „git rev-list origin/main..HEAD statt git log".

Fix: Range = `git rev-list "$LOCAL_SHA" --not origin/main "$REMOTE_SHA"` — schließt beides aus
(origin/main UND Remote-Branch-Tip), damit stale Ref-Stände beider Richtungen unschädlich sind.
Extraktion in `scripts/pre-push-scope-range.sh`, damit die Logik gegen ein Temp-Git-Repo
testbar ist (Muster pre-push-artifact-guard.bats / check-freshness-artifacts.sh).

## T002922 — Cluster-BATS laufen in CI nie

Befund (T002871-RCA, Beleg PR #3873 19e792cdb + PR #3942 via `gh run view --log --job`):
weder ok/not-ok noch skip erscheint — die Dateien werden auf PRs gar nicht selektiert
(`test:spec:changed` diff-scoped), und die Full-Suite (nightly) skippt sie still
(`cluster_running()` false auf ubuntu-latest). Betroffen (Marker-Scan, Stand 2026-08-11):
`tests/spec/database.bats`, `fleet-operations/wg-gpu-pod-cidr.bats`,
`llm-pipeline/bge-thread-quota.bats`, `mcp-gateway.bats`,
`openspec-embedding/dynamic-port-T003077.bats`, `sdlc-isolation/e2-local-stack.bats`,
`sdlc-isolation/fleet-sequence-split.bats`, `sdlc-isolation/sdlc-up-command.bats`,
`sealed-secret-cluster-drift.bats`, `ticket-system/backfill-id-sequence.bats`,
`workspace-deploy.bats` (11 Dateien; exakte Registry ermittelt `scripts/ci-cluster-bats.mjs`
beim Umsetzen — Marker `cluster_running()`, `kubectl`, `--context`, `k3d-`).

Fix: dedizierter CI-Job mit k3d (Kontext `k3d-mentolder-dev`, minimaler Stack: Namespace
`workspace` mit shared-db-Postgres — reicht für die DB-abhängigen Fälle; Nodes-Check für die
Isolation-Fälle). Auswahl + sichtbarer Report über neues `scripts/ci-cluster-bats.mjs`;
fail-closed (Muster COCKPIT_DAEMON_REQUIRED). Nightly voll, PRs diff-scoped.

## T003138 — openspec/-Pfade triggern Live-E2E

Befund: Taskfile `test:changed` Zeile `echo "$CHANGED" | grep -qE "(korczewski)" &&
RUN_E2E_KORCZEWSKI=true` — reine Pfad-Substring-Prüfung über der Diff-Liste; `openspec/`-Pfade
werden dort nicht ausgeschlossen (der T002255-Filter entfernt nur generierte Artefakte).
T003129: reine openspec/-Änderung startete `test:e2e:korczewski`, scheiterte am Auth-Setup
(korczewski-auth-setup.spec.ts:44), 48 Tests liefen nicht, Exit 201; `test:spec:changed` war
220/0 grün, PR #4086 18/18 grün → Fehlalarm.

Fix: Relevanz- und Erreichbarkeitslogik in `scripts/test-changed.sh` (testbar); `^openspec/`
ist nie E2E-relevant; korczewski-Gruppe bekommt den T002375-p4-Erreichbarkeits-Guard
(sichtbarer Skip statt Live-Lauf).

## T003136 — Archiv lässt openspec-status.json aus dem Commit

Befund: `cmd_archive` (scripts/openspec.sh) regeneriert `openspec-status-map.sh` nach dem
Move (Zeile 291) mit `>/dev/null 2>&1 || true`; weder Skript noch
`.opencode/skills/openspec-archive-change/SKILL.md` stagen/committen das Artefakt. PR #4083
(archive-only) rot am Freshness-Gate, weil `website/src/data/openspec-status.json` regeneriert,
aber nicht im PR-Branch-Commit war.

Fix: `git add website/src/data/openspec-status.json` direkt nach der Regenerierung in
`cmd_archive`; Skill-Pflichtschritt „Artefakt ist Teil des Archive-Commits" mit
`git status`-Probe.

## T003109 — Warteschleifen außerhalb der gemeinsamen Funktion

Befund: `ci_checks_verdict` (scripts/lib/ci-checks.sh) existiert und ist in
`scripts/factory/pr-babysit-ticket.sh` (leere_rounds) verdrahtet; SSOT-Requirement
„Jedes Prädikat über einer Check-Liste braucht einen Nichtleere-Guard" verlangt die gemeinsame
Funktion für jede Warteschleife. `scripts/devflow-ci-watch.sh` bewertet weiterhin ad-hoc
(`statusCheckRollup` + `TOTAL_CHECKS==0 → exit 5`) — korrekt fail-closed, aber nicht über die
gemeinsame Funktion. `arbitration/detect.sh` (Zeile 119) ist bereits korrekt vorgeordnet
(`length == 0` vor `all(...)`).

Fix: devflow-ci-watch.sh auf `ci_checks_verdict` umstellen; Empty-Verdict behält Exit-5.

## T002815 — Push-Ausgabe als Commit-Bestätigung

Befund: `.claude/skills/git-workflow/SKILL.md` hat bereits eine Commit-Verifikation
(T000925: `HEAD_SHA != BASE_SHA` gegen git-crypt-Clean-Filter) und der pre-push
Empty-Branch-Guard [T002240] blockt die Neuanlage eines leeren Branches. Beide decken den
T002815-Fall nicht: der abgelehnte Commit ist durch einen FRÜHEREN Merge-Commit maskiert, der
Push pusht einen nicht-leeren Branch.

Fix (Runbook, wie vom Ticket vorgeschlagen): Commit-Verifikation um die
commit-msg-Hook-Ablehnung ergänzen — nach `git commit` `git log -1 --oneline` prüfen ODER
`git commit … && git push …` verketten; dokumentiert in `.claude/skills/git-workflow/SKILL.md`
und `.agents/skills/git-workflow/SKILL.md` (identischer Abschnitt, zwei Harnesses).
