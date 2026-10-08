# P3 — Docs: überholte Factory-Prosa in fünf Doku-Dateien

Ziel: überholte Factory-Prosa in fünf Doku-Dateien neutral umformulieren.
Keine Code-Änderung; ADRs, generierte Register und Frozen Records sind tabu.

## Target files
- `docs/sdlc-stack/README.md`
- `docs/sdlc-stack/e3-cutover.md`
- `docs/runbooks/freetoken-native.md`
- `docs/runbooks/db-audit-playbook.md`
- `docs/superpowers/references/factory-usage.md`

## Steps
- [ ] 1. Rot-Stand protokollieren: `git grep -n -i factory --
  docs/sdlc-stack/README.md docs/sdlc-stack/e3-cutover.md
  docs/runbooks/freetoken-native.md docs/runbooks/db-audit-playbook.md
  docs/superpowers/references/factory-usage.md` — Treffer vorhanden,
  expected: FAIL (Reste vorhanden). Ausgabe in den PR-Body.
- [ ] 2. Pro Datei aktiv/tot klassifizieren: tot (überholte Ablauf-
  beschreibung, erledigte Cutover-Historie) → neutral umformulieren mit
  Ticket-Ref (`per T900399 stillgelegt`); aktiv (Begriffserklärung für
  Altdaten/DB-Tabellen `tickets.factory_*`, Verweis auf ADR-005/ADR-006) →
  stehenlassen mit einem Satz Begründung im PR-Body. TABU:
  `docs/adr/*`, `docs/code-quality/repo-index.json`,
  `docs/finetune/tandem-candidates.json` (Frozen/Generiert) — auch bei
  Treffern nicht anfassen.
- [ ] 3. Grün-Nachweis: `git grep -I -i factory` auf den fünf Dateien zeigt
  nur noch begründete aktive Verweise; `bats
  tests/spec/sf-retirement-rest.bats` grün (läuft per bats-Runner).
- [ ] 4. Falls eine der fünf Dateien zur Test-Inventar- oder Freshness-
  Prüfung gehört: `task freshness:check`-relevante Artefakte beachten
  (keine generierten Dateien miteditieren).

## Akzeptanz
- Keine tote Factory-Prosa in den fünf Dateien; verbleibende Treffer je
  Datei begründet im PR-Body.
- Guard aus Schritt 3 grün.
