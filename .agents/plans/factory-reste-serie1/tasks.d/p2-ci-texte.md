# P2 — CI-Texte: Kommentare und Hinweis-Texte ohne Semantik-Änderung

Ziel: tote Factory-Kommentare in Commitlint-Config und fünf Workflows
bereinigen. Keine Semantik-Änderung: Job-/Step-Namen, Scope-Keys und der
`test-factory`-Aggregator-Name bleiben.

## Target files
- `commitlint.config.cjs` (Ist 121, Budget 279)
- `.github/workflows/ci.yml`
- `.github/workflows/post-merge.yml`
- `.github/workflows/e2e-pr.yml`
- `.github/workflows/opencode.yml`
- `.github/workflows/codeql.yml`
<!-- vitest: kein neuer Test nötig, weil reine Kommentar-/String-Prosa ohne Logikänderung -->

## Steps
- [ ] 1. Rot-Stand protokollieren: `git grep -n -i factory --
  commitlint.config.cjs .github/workflows/ci.yml
  .github/workflows/post-merge.yml .github/workflows/e2e-pr.yml
  .github/workflows/opencode.yml .github/workflows/codeql.yml` — Treffer
  vorhanden, expected: FAIL (Reste vorhanden). Ausgabe in den PR-Body.
- [ ] 2. `commitlint.config.cjs`: nur die Hinweis-Texte zu den
  `factory`-/`factory-floor`-Scopes auf dev-flow-Begriffe umstellen
  (z. B. Verweis auf Ticket-Scope); die Scope-Keys selbst bleiben als
  Redirect-Guards erhalten. Danach `npx commitlint --print-config` Smoke
  oder Node-Syntaxcheck.
- [ ] 3. Workflows: nur Kommentar-Zeilen anfassen (`ci.yml` ca. Z. 13/47/
  201/333/387-388: Aggregator-Kommentar, „stacked Factory pushes",
  „Infrastruktur fuer Factory", Replay-Gate-Historie; `post-merge.yml`,
  `e2e-pr.yml` (TAG="factory" bleibt — nur umgebende Kommentare),
  `opencode.yml` (Modellname `gemma26-factory` bleibt — nur Kommentare),
  `codeql.yml`). TABU: `test-factory`-Job-/Aggregator-Name, `TAG="factory"`,
  Modell-Slugs, `feature/factory-*`-Branchmuster in Kommentaren mit
  Filterwirkung prüfen (falls Pattern aktiv matcht: stehenlassen +
  dokumentieren). Danach `yq`-Parsecheck bzw. `actionlint` falls vorhanden.
- [ ] 4. Grün-Nachweis: `git grep -I -i factory` auf den sechs Dateien zeigt
  nur noch bewusste aktive Namen (dokumentiert je Datei ein Satz im
  PR-Body), keine tote Prosa; `bats
  tests/spec/sf-retirement-rest.bats` grün.

## Akzeptanz
- Nur noch aktive Namen (Aggregator, TAG, Modell-Slug, Scope-Keys) mit
  Begründung im PR-Body; keine toten Factory-Kommentare.
- Guard aus Schritt 4 grün; Workflow-Semantik unverändert.
