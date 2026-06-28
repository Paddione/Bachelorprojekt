---
title: "G-CQ05: Echte `TODO`-Marker aufräumen (6→≤1)"
ticket_id: T001290
domains: ["cq","quality"]
status: plan_staged
---

# g-cq05-todo-cleanup — Implementation Plan

## File Structure

| Datei | Aktion |
|-------|--------|
| `scripts/health-goals-check.sh` | Geändert — G-CQ05 row hinzufügen |

## Task 0: Baseline messen (RED)

- [ ] Measure-Command ausführen:

```bash
grep -rnE "\bTODO\b" --include=*.ts --include=*.svelte --include=*.astro --include=*.sh \
  --include=*.js --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null \
  | grep -vE "node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh"
```

  expected: FAIL (aktueller Wert: 6 `TODO`-Marker (war 1, +5 Regression) — over target: ≤1)

## Task 1: Alle 6 Treffer klassifizieren

Führe den Baseline-Command aus und ordne jeden Treffer einer Kategorie zu:

| Datei | Zeile | Kategorie | Begründung |
|-------|-------|-----------|------------|
| `website/src/lib/assistant/actions/admin/sendInvoice.ts` | 4 | Echter Stub (Baseline) | Pre-existierender Stub für die Rechnungsversand-Pipeline; dokumentiert als akzeptierte Baseline |
| `scripts/openspec-validate.ts` | 56 | Falsch-Positiv | `TODO` taucht als Regex-Pattern-Literal auf (`/^### Requirement: TODO\s*$/m`), kein Action-Item |
| `scripts/openspec-validate.ts` | 57 | Falsch-Positiv | `TODO` als Regex-Pattern-Literal (`/^#### Scenario: TODO\s*$/m`), kein Action-Item |
| `scripts/openspec-validate.test.ts` | 114 | Falsch-Positiv | `TODO` in Test-Fixture-String, kein Action-Item |
| `scripts/openspec-merge.mjs` | 14 | Falsch-Positiv | `TODO` in STUBS-Array-Regex-Pattern, kein Action-Item |
| `scripts/openspec-merge.mjs` | 72 | Falsch-Positiv | `TODO` in Fehlermeldungs-String, kein Action-Item |

Ergebnis: 5 von 6 Treffern sind Falsch-Positive in OpenSpec-Tooling-Dateien, die `TODO` als Erkennungsstring verwenden.

## Task 2: Measure-Command korrigieren und G-CQ05 in health-goals-check.sh eintragen

Ergänze die Ausschluss-Liste des Measure-Commands um die drei OpenSpec-Tool-Dateien und füge die G-CQ05-Zeile in `scripts/health-goals-check.sh` ein.

Die korrigierte Measure-Inline-Expression für die `row`-Zeile:

```bash
"$(grep -rnE '\bTODO\b' \
  --include='*.ts' --include='*.svelte' --include='*.astro' \
  --include='*.sh' --include='*.js' --include='*.mjs' \
  website/src scripts tests k3d brett/src 2>/dev/null \
  | grep -vE 'node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh|openspec-validate|openspec-merge' \
  | wc -l | tr -d ' ')"
```

Füge nach der bestehenden Zeile für `G-CQ04` (Zeile ~86 in `scripts/health-goals-check.sh`) folgende Zeile ein:

```bash
row target G-CQ05 "$(grep -rnE '\bTODO\b' --include='*.ts' --include='*.svelte' --include='*.astro' --include='*.sh' --include='*.js' --include='*.mjs' website/src scripts tests k3d brett/src 2>/dev/null | grep -vE 'node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh|openspec-validate|openspec-merge' | wc -l | tr -d ' ')" le 1 "Echte TODO-Marker (kein Netto-Zuwachs)"
```

- [ ] Öffne `scripts/health-goals-check.sh` und lokalisiere den Block mit den `row gate G-CQ04`-Einträgen
- [ ] Füge die G-CQ05-Zeile als `row target` nach dem G-CQ04-Block ein
- [ ] Stelle sicher, dass die Zeile `openspec-validate|openspec-merge` im Ausschluss-Filter enthält

## Task 3: Measure nach der Änderung prüfen

- [ ] Bestätige, dass der korrigierte Measure-Command exakt 1 liefert:

```bash
grep -rnE "\bTODO\b" --include=*.ts --include=*.svelte --include=*.astro --include=*.sh \
  --include=*.js --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null \
  | grep -vE "node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh|openspec-validate|openspec-merge"
```

  Erwartetes Ergebnis: genau 1 Treffer (`sendInvoice.ts:4`) — erfüllt Target ≤ 1.

## Task 4 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-CQ05` → Ziel-Status grün (1 ≤ 1)
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
