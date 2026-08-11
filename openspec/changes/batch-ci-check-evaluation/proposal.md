# Proposal: batch-ci-check-evaluation

## Why

Batch-Gruppe aus sechs Tickets, deren gemeinsamer Nenner die CI/Check-Auswertung ist:
Signale werden falsch gelesen (leere Checkliste als grün, Push-Ausgabe als Commit-Bestätigung,
stale Scope-Commits als eigene Änderung), Verifikation läuft an der Realität vorbei
(cluster-abhängige BATS werden in CI nie ausgeführt, reine Spec-Änderungen starten Live-E2E),
und ein Archiv-Vorgang lässt das regenerierte Status-Artefakt aus dem Commit fallen.

- T002815: Abgelehnter Commit gefolgt von erfolgreichem Push sieht aus wie ein erfolgreicher Push
- T002827: Pre-push hook rejects valid push due to stale scope commits from rebased main
- T002922: Cluster-abhängige tests/spec/*.bats werden von CI nie tatsächlich ausgeführt
- T003109: gh pr checks --jq 'all(...)' vakuos true auf leerer Checkliste (Fix shipped — Rest: Warteschleifen nutzen die gemeinsame Funktion)
- T003136: Archive PR #4083 failed freshness gate — openspec-status.json not committed after archive
- T003138: test:changed startet Live-E2E gegen korczewski bei reiner openspec/-Änderung

## What

EIN OpenSpec-Change `batch-ci-check-evaluation` mit einem 7-Partial-Plan (6 Impl-Partials je
Kind-Ticket + Tests-Partial). Dateimenge: `.githooks/pre-push` (pre-push scope guard) plus
neuer Helfer `scripts/pre-push-scope-range.sh`, `scripts/ci-cluster-bats.mjs` +
`.github/workflows/ci.yml` (Cluster-BATS-Job), `scripts/test-changed.sh` + `Taskfile.yml`
(E2E-Relevanz), `scripts/openspec.sh` + `.opencode/skills/openspec-archive-change/SKILL.md`
(Archive-Freshness), `scripts/devflow-ci-watch.sh` (gemeinsames Verdict), git-workflow-Skills
(Commit-Verifikation), Tests unter `tests/spec/ci-cd/` + `tests/spec/batch-ci-check-evaluation.bats`.

## Entscheidungen (Brainstorming)

### T002827 — Pre-push: nur tatsächlich neue Commits validieren

Ursache (aus Hook-Quelltext + Factory-Plan fix-prepush-stale-scope): `.githooks/pre-push`
validiert `${BASE}..${LOCAL_SHA}` mit `BASE=origin/main`; der Fallback auf `REMOTE_SHA`
bzw. ein veralteter lokaler `origin/main`-Ref ziehen nach `git rebase origin/main` bereits
gemergte main-Commits in den Range — deren Scopes (ci-cd, mcp-gateway, e2e-testing, routes)
sind seit T002328 ungültig. **Entscheidung:** Die Commit-Menge wird als
`git rev-list "$LOCAL_SHA" --not origin/main "$REMOTE_SHA"` berechnet (ausgeschlossen:
alles von origin/main ODER vom Remote-Branch-Tip Erreichbare; bei neuem Branch
REMOTE_SHA=Nullen entfällt der zweite Ausschluss). Die Range-Logik wandert in den neuen
testbaren Helfer `scripts/pre-push-scope-range.sh` (Muster: `scripts/hooks/check-freshness-artifacts.sh`).
Abstimmung: Der Factory-Worktree `.worktrees/fix-prepush-stale-scope-T002827-reuse` arbeitet
parallel an derselben Stelle — der Batch-Plan wird NICHT dort hinein implementiert; falls der
T002827-PR vor dem Batch-Executieren merged, rebased der Batch und übernimmt nur den
Test/Helper-Teil, der noch fehlt.

### T002922 — Cluster-BATS in CI wirklich ausführen

Ursache (T002871-RCA): GH-Actions-Runner haben keinen erreichbaren k3d-Cluster →
`cluster_running()` liefert immer false → stille Skips; `test:spec:changed` selektiert
diff-scoped → Dateien, die kein PR berührt, tauchen nie im Log auf (Beleg PR #3873/#3942).
**Entscheidung:** Dedizierter CI-Job `cluster-spec-shard` mit echtem k3d-Cluster
(Kontext `k3d-mentolder-dev`, minimal: Namespace `workspace` mit shared-db-Postgres) für die
Untermenge cluster-abhängiger Spec-Dateien; Auswahl/Report über neues
`scripts/ci-cluster-bats.mjs` (Registry-Detection per Marker-Scan). Fail-closed: Cluster-Setup
oder Lauf schlägt laut fehl, nie still. Nightly + diff-scoped auf PRs. Damit ist auch das
Ticket-Ziel „sichtbarer Report statt stillem Skip" erfüllt: der Job führt die Tests aus und
meldet die Anzahl.

### T003138 — Spec-Dateien sind kein Website-Code

Ursache: `task test:changed` triggert `RUN_E2E_KORCZEWSKI` per `grep -qE "(korczewski)"` auf
die Pfadliste — ein `openspec/`-Pfad (Spec/Delta) mit „korczewski" im Namen startet die
Live-E2E (Auth-Setup gegen die Live-Site scheitert, Exit 201; beobachtet T003129).
**Entscheidung:** Relevanz-Entscheidung in neuen Helfer `scripts/test-changed.sh` extrahieren
(testbar): `^openspec/` und generierte Artefakte sind NIE website/E2E-relevant; zusätzlich
Erreichbarkeits-Guard für die korczewski-E2E wie für die k3d-Gruppe (T002375-p4): sichtbarer
Skip statt Live-Lauf, wenn die Ziel-Site nicht erreichbar ist.

### T003136 — Archive-Commit enthält das regenerierte Status-Artefakt

Ursache: `cmd_archive` (scripts/openspec.sh) ruft `openspec-status-map.sh` nach dem
Verzeichnis-Move auf (Zeile ~291, `>/dev/null 2>&1 || true`), aber weder `cmd_archive` noch
das Archiv-Skill stagen/committen das regenerierte `website/src/data/openspec-status.json` —
PR #4083 fiel am Freshness-Gate. **Entscheidung:** `cmd_archive` staged das Artefakt direkt
nach der Regenerierung (`git add website/src/data/openspec-status.json`); das Skill
`openspec-archive-change` erhält einen Pflicht-Schritt „Status-Artefakt ist Teil des
Archive-Commits" (Prüfung via `git status` vor dem Commit).

### T003109 — Warteschleifen nutzen das gemeinsame Verdict

Stand: Kern-Fix shipped (scripts/lib/ci-checks.sh `ci_checks_verdict` + Guard-Test + SSOT-
Requirement + pr-babysit-ticket.sh). Lücke: `scripts/devflow-ci-watch.sh` bewertet Checks
weiterhin ad-hoc (`statusCheckRollup` + `TOTAL_CHECKS==0 → exit 5`) statt der gemeinsamen
Funktion; das SSOT-Requirement verlangt die gemeinsame Bibliotheksfunktion für JEDE
Warteschleife. **Entscheidung:** devflow-ci-watch.sh auf `ci_checks_verdict` umstellen
(Empty-Verdict behält Exit-5-Semantik), ohne das `--watch`-Verhalten zu ändern.

### T002815 — Commit-Verifikation nach abgelehnter Hook-Ablehnung

Ursache: `git commit` von commit-msg-Hook abgelehnt, nachfolgendes `git push` in derselben
Kommando-Kette läuft durch und pusht nur den älteren Merge-Commit — Ausgabe ununterscheidbar
von Erfolg (PR #3915/#3918). Der pre-push Empty-Branch-Guard [T002240] deckt nur den
Neuanlage-Fall. **Entscheidung (Runbook-Ebene, wie vom Ticket vorgeschlagen):** In den
git-workflow-Skills wird die bestehende Commit-Verifikation (T000925) um die
commit-msg-Hook-Ablehnung ergänzt: nach `git commit` SHA per `git log -1 --oneline` prüfen
oder Commit und Push mit `&&` verketten.

_Ticket: T003540_
