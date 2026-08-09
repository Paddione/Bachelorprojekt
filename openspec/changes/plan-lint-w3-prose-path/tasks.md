---
title: "plan-lint-w3-prose-path — Implementation Plan"
ticket_id: T002807
domains: [test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-lint-w3-prose-path — Implementation Plan

_Ticket: T002807_

**Root Cause (verifiziert, nicht Hypothese — siehe proposal.md und
`docs/superpowers/specs/2026-08-09-plan-lint-w3-prose-path-design.md`):**
`scripts/plan-lint.sh` extrahiert fuer W3 (Zeile 436, Scan-Quelle `FS_SECTION`) und
B1a/B1b (Zeile 383, Scan-Quelle `PLAN_PROSE` — das gesamte Dokument) jeden
Backtick-Pfad-Token mit Quellcode-Endung, unabhaengig davon, ob die Zeile eine
Tabellenzeile, ein Listenpunkt oder ein freier Prosa-Satz ist. Reproduziert am
2026-08-09: ein Fliesstext-Satz wie "Positiv-Kontrolle: `scripts/agent-lock.sh` gibt
... 265 zurueck" innerhalb `## File Structure` loest W3 aus; eine analoge
Prosa-Erwaehnung einer budget-erschoepften Datei loest B1b aus — beide, obwohl die
Datei nirgends tabellarisch/als Listenpunkt gelistet ist.

## File Structure

| File | Ist | Budget |
|------|-----|--------|
| `scripts/plan-lint.sh` | 522 | 278 |

- Create: `tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats` (bereits committiert, RED)
- Create: `tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats` (bereits committiert, RED)

## Task 1 — RED: Failing Tests bereits geschrieben und verifiziert rot

Beide Tests wurden vor diesem Plan geschrieben und liegen bereits auf dem Branch:

- `tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats` — Positiv-Anker (echter
  Tabelleneintrag `scripts/example.sh` loest W3 aus) plus Negativ-Aussage (reine
  Prosa-Erwaehnung von `scripts/agent-lock.sh` darf keine W3-Warnung ausloesen).
- `tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats` — Positiv-Anker (echte
  Tabellenzeile `InboxApp.svelte`, Restbudget 0, loest B1b aus) plus Negativ-Aussage
  (reine Prosa-Erwaehnung von `InboxDetail.svelte` darf keine B1b-Warnung ausloesen).

- [ ] **Step 1: Beide Tests ausfuehren und den Rot-Stand bestaetigen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats
```
Expected: FAIL — beide Tests schlagen jeweils an der Negativ-Aussage fehl (der
Positiv-Anker besteht bereits heute), weil `plan-lint.sh` noch nicht zwischen
strukturellen Zeilen und Prosa unterscheidet.

## Task 2 — GREEN: `_structural_file_tokens`-Helfer einfuehren und in W3/B1a/B1b verdrahten

- [ ] **Step 1: Hilfsfunktion `_structural_file_tokens` hinzufuegen**

In `scripts/plan-lint.sh`, vor dem W3-Block (vor Zeile 399), eine neue Funktion
ergaenzen, die aus einem uebergebenen Text nur Zeilen beruecksichtigt, die nach
optionalem Leerraum mit `|`, `-` oder `*` beginnen, und daraus die bekannten
Backtick-Pfad-Tokens extrahiert:

```bash
# _structural_file_tokens <text> — liefert eindeutige Backtick-Pfad-Tokens mit
# Quellcode-Endung, aber NUR aus Zeilen, die wie eine Tabellenzeile (`|...`) oder
# ein Listenpunkt (`-`/`*` am Zeilenanfang) aussehen. Eine freie Prosa-Zeile mit
# demselben Backtick-Pfad liefert keinen Kandidaten (T002807).
_structural_file_tokens() {
  grep -E '^[[:space:]]*([|]|[-*])' <<<"$1" \
    | grep -oE '`[A-Za-z0-9_./-]+\.(sh|bash|ts|tsx|js|jsx|mjs|mts|cjs|py|svelte|astro|java|php|css)`' \
    | tr -d '`' | sort -u
}
```

- [ ] **Step 2: W3 auf den Helfer umstellen (Zeile ~436)**

Ersetze die bisherige Extraktions-Pipeline
`grep -oE '...' <<<"$FS_SECTION" | tr -d '`' | sort -u`
durch `_structural_file_tokens "$FS_SECTION"`. Die Scan-Grenze (FS_SECTION selbst,
Zeile 409) bleibt unveraendert.

- [ ] **Step 3: B1a/B1b auf denselben Helfer umstellen (Zeile ~383)**

Ersetze die bisherige Extraktions-Pipeline
`grep -oE '...' <<<"$PLAN_PROSE" | tr -d '`' | sort -u`
durch `_structural_file_tokens "$PLAN_PROSE"`. Die Budget-Wert-Extraktion
("claimed", Zeilen 360-366) bleibt unveraendert — nur die Liste der ueberhaupt
geprueften Dateien wird eingeschraenkt.

- [ ] **Step 4: Beide RED-Tests erneut ausfuehren — jetzt GREEN**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats
```

## Task 3 — Regressionslauf gegen bestehende plan-lint-Fixtures

- [ ] **Step 1: Bestehende plan-lint-Testsuiten ausfuehren**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-flow-plan
```
Alle bestehenden Fixtures (`tests/unit/fixtures/plan-lint/*.md`) nutzen
ausschliesslich Tabellen- oder Bullet-Form fuer File-Structure-Eintraege — sie
muessen unveraendert gruen bleiben.

## Verify (RED → GREEN)

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
