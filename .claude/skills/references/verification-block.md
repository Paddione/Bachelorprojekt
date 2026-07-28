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
# → Artefakte committen (git add + git commit), siehe Freshness-Artefakte unten
task freshness:check        # CI-Äquivalent: Freshness + S1–S4-Ratchet + Baseline-Key-Count-Assertion
```

**Wichtig:** Nach `regenerate` müssen die generierten Artefakte **gecommittet** werden, bevor `check` läuft — sonst vergleicht `check` gegen HEAD und sieht die frischen Artefakte als "stale". Siehe Abschnitt „Freshness-Artefakte — git add nach `regenerate`" unten.

**Beide Freshness-Befehle sind nötig:**
- `regenerate` aktualisiert die generierten Artefakte (Liste unten) — ohne sie ist CI rot.
- `check` failt lokal **genau wie CI** — insbesondere am S1-Zeilen-Ratchet gegen
  `docs/code-quality/baseline.json`. Ohne lokalen `check` wird eine Limit-Überschreitung
  erst nach dem Push sichtbar → Firefight-Modus.

**Bei NEUEN Dateien (`git add` noch nicht passiert):** `task freshness:regenerate` baut
seine Datei-Universe aus `git ls-files` — untracked Dateien werden nicht erfasst. Das
führt zu einem zweiten Durchlauf: erst `git add` der neuen Datei, dann `task
freshness:regenerate` erneut, dann `freshness:check`. Planbar zwei Runden einplanen.

Bei Manifest-Änderungen zusätzlich: `./tests/runner.sh local <TEST-ID>` für die relevanten Tests.

Bei Änderungen an `tests/spec/` zusätzlich: `task test:spec:changed` — CI fährt eine separate spec-Suite, die `test:changed` nicht abdeckt. Ohne diesen Schritt werden spec-Guard-Verletzungen erst nach dem Push sichtbar (T002291).

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
  website/src/data/openspec-status.json \
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
  docs/generated/blast-radius.md \
  docs/diagrams/architecture.md \
  website/src/lib/goals-data.generated.json 2>/dev/null || true
git diff --cached --quiet || git commit -m "chore: regenerate freshness artifacts [$TICKET_ID]"
```

> Der Pre-commit-Hook automatisiert `regenerate` nach `task secrets:install-hooks` —
> ohne Hook immer manuell ausführen, wenn `.ts/.svelte/.astro/.sh/.mjs`-Dateien geändert wurden.

## Post-Commit-Verifikation (Pflicht)

Nach `git commit` (oder nachdem der Pre-commit-Hook gelaufen ist) prüfen, dass die
regenerierten Artefakte wirklich im Commit liegen:

```bash
git show --stat HEAD   # PFLICHT: bestätigt, dass die regenerierten Artefakte
                        # tatsächlich im Commit liegen — ein grüner `git commit` allein
                        # belegt das NICHT (T002284: pre-commit kann eine gestagte
                        # Änderung lautlos zu einem Leer-Diff neutralisieren).
```
