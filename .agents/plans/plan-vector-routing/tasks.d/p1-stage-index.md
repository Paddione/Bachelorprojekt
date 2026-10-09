# p1 — Stage-time-Indexierung von Plan-Partials

Target files: `scripts/llm/plan-stage-index.mjs`, `scripts/vda/ticket/stage-plan.sh`.

### Task 1: RED — Staging ohne Index schlägt fehl

- Lege `tests/spec/llm-local-dev/plan-vector-routing.bats` (siehe p3) zuerst an und schreibe einen Test, der `node scripts/llm/plan-stage-index.mjs --plan-dir <dir-mit-tasks.md>` aufruft und einen Index-Beleg (JSON mit `partials`, `collection`, `receipt`) erwartet.

```bash
bats tests/spec/llm-local-dev/plan-vector-routing.bats
```

expected: FAIL (Skript existiert noch nicht).

### Task 2: plan-stage-index.mjs implementieren

- Neues Skript `scripts/llm/plan-stage-index.mjs` (Node, Pfad-Konvention wie `scripts/context-retrieve.mjs`): parst das `tasks.md`-Manifest (ids + files, gleiche Parser-Regeln wie `scripts/llm/plan-runner/plan.mjs`), liest jede Partial-Datei aus `tasks.d/`, und schreibt pro Partial genau einen Chunk in die bestehende K1-Pipeline (gleicher Pfad wie der Merge-Job `k3d/k1-embed-job.yaml`, Collection `specs_plans` als neuer Doctype `plan_partial` mit Feldern `ticket_id`, `plan_slug`, `partial_id`, `depends_on`).
- Kein paralleler Vektor-Store, keine neue Collection: nur ein Doctype im bestehenden Index. Chunks sind top-k-fähig (ein Partial = ein Chunk, nie der Vollplan — SELECT-*-Footgun beachten).
- Backend-Ausfall ist fail-soft mit Warnung (Staging darf nie an fehlendem Embed-Gateway scheitern); bei Erfolg Beleg-JSON auf stdout (`partials`, `collection`, `receipt`).
- Existierende Dateien nicht ändern in diesem Partial.

### Task 3: Staging-Hook verdrahten

- In `scripts/vda/ticket/stage-plan.sh` nach erfolgreichem Stagen `plan-stage-index.mjs --plan-dir <plan-dir>` aufrufen (Warnung statt Abbruch bei Fehler, siehe Task 2).
- Bestehende Merge-Pipeline (`.github/workflows/k1-embed.yml`, nur auf main-Push) bleibt unberührt: Staging indexiert pre-merge Branches, der Merge-Job dedupliziert per content-hash.
