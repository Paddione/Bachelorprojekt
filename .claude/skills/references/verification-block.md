# Verifikationsblock — lokale CI-äquivalente Prüfung (SSOT)

Der operative Verify-Block vor jedem Commit/PR. Skills (`dev-flow-execute` Schritt 3,
`dev-flow-chore` Schritt 3, `git-workflow` Schritt 1) verlinken hierher statt die Sequenz
zu duplizieren. Die Gate-*Mathematik* (S1–S4, Baseline-Ratchet) ist in
[`plan-quality-gates.md`](plan-quality-gates.md) dokumentiert — diese Datei ist die
*Ausführungs*-Referenz.

## Die vier Befehle

```bash
task workspace:validate     # Kustomize-Manifeste (nur wenn k8s-Manifeste berührt)
task test:changed           # Gezielte Tests für geänderte Domains (vitest --changed + BATS + quality)
task freshness:regenerate   # Generierte Artefakte aktualisieren — sonst CI "stale artifact"
task freshness:check        # CI-Äquivalent: Freshness + S1–S4-Ratchet + Baseline-Key-Count-Assertion
```

**Beide Freshness-Befehle sind nötig:**
- `regenerate` aktualisiert die generierten Artefakte (Liste unten) — ohne sie ist CI rot.
- `check` failt lokal **genau wie CI** — insbesondere am S1-Zeilen-Ratchet gegen
  `docs/code-quality/baseline.json`. Ohne lokalen `check` wird eine Limit-Überschreitung
  erst nach dem Push sichtbar → Firefight-Modus.

Bei Manifest-Änderungen zusätzlich: `./tests/runner.sh local <TEST-ID>` für die relevanten Tests.

## S1-Ratchet — Kurzform

Das Ratchet vergleicht gegen den **eingefrorenen Baseline-Wert**, nicht nur gegen das statische
Extension-Limit. Eine bereits gebaselinete (gewachsene) Datei hat **0 Zeilen Budget** — schon
+1 Zeile macht CI rot. Dann die Datei **echt verkleinern/aufteilen**, nicht kosmetisch Zeilen
zusammenziehen. Details + Budget-Mathematik: [`plan-quality-gates.md`](plan-quality-gates.md) §S1.

**Restbudget-Check ohne Plan** (z. B. Chores — kein plan-lint vorhanden), pro geänderter Datei
mit derselben Mathematik wie der Linter:

```bash
for f in $(git diff --name-only); do
  PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget "$f" 2>/dev/null \
    | awk -v f="$f" '{print f": Restbudget "$0}'
done
```

Bei Restbudget ≤ 0: Datei echt verkleinern.

## Freshness-Artefakte — git add nach `regenerate`

Diese Pfadliste lebt NUR hier (wartungskritisch — bei neuen Generatoren hier ergänzen):

```bash
git add \
  website/src/data/test-inventory.json \
  website/src/data/route-manifest.json \
  website/src/lib/learning-assets.generated.json \
  "website/public/learning-assets/THIRD-PARTY-ASSETS.md" \
  docs/code-quality/repo-index.json \
  docs/agent-guide/10-ziele.md \
  docs/agent-guide/20-werkzeuge.md \
  docs/agent-guide/30-bausteine.md \
  docs/agent-guide/maps/goals-map.md \
  docs/agent-guide/maps/tools-map.md \
  docs/agent-guide/maps/danger-map.md \
  website/src/lib/agent-guide.generated.json \
  website/src/lib/platform-descriptions.generated.json \
  docs/generated/graph.json \
  docs/generated/api-map.json \
  docs/generated/blast-radius.md 2>/dev/null || true
git diff --cached --quiet || git commit -m "chore: regenerate freshness artifacts [$TICKET_ID]"
```

> Der Pre-commit-Hook automatisiert `regenerate` nach `task secrets:install-hooks` —
> ohne Hook immer manuell ausführen, wenn `.ts/.svelte/.astro/.sh/.mjs`-Dateien geändert wurden.
