# p2 — plan-qa-check: kein Boilerplate-Anhang bei grün, Kriterium 5 deterministisch (T003621 + T003381)

## Ziel

Zwei Defekte in `scripts/plan-qa-check.sh`:

- **T003621:** Der Auto-Fix-Loop hängt bei FAIL eine `## QA-Ergänzungen (Iteration N/M)`
  -Sektion an die Plandatei an. Endet die Folge-Iteration mit PASS, bleibt die Sektion
  im Artefakt zurück („grün, aber Datei mutiert") und muss manuell entfernt werden —
  plan-lint/plan-qa werten die TODO-artigen Anweisungen sonst als offene P1-Platzhalter.
- **T003381:** Kriterium 5 („Der letzte Task enthält task test:changed, task
  freshness:regenerate und task freshness:check als Steps") urteilte falsch-positiv,
  wenn die drei Kommandos als Checkbox-Task im Index stehen — plan-lint STRUCT3 prüft
  dieselbe Eingabe per grep (Zeile 358: `grep -qE "task[[:space:]]+$cmd"`) als konform.
  Ein falsch-positives Kriterium kann über den Auto-Fix-Loop einen konformen Plan
  verändern.

## Steps

1. **RED.** Neue Tests in `tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats`
   (bestehender Fixture-Gateway-Pattern, stateful erweitern):
   - **T003621:** Gateway liefert Request 1 → FAIL mit suggestions, Request 2 → PASS.
     Erwartung: `RESULT: PASS`, exit 0, Plandatei byte-identisch zum Eingang (md5),
     keine `## QA-Ergänzungen`-Sektion. Alter Code: Sektion bleibt zurück → rot.
   - **T003381 (deterministisch):** Plan OHNE `task freshness:check` + Gateway PASS.
     Erwartung: `RESULT: FAIL` (deterministisch, ohne Gateway-Kontakt), Exit 1, Nennung
     des fehlenden Kommandos. Alter Code: kein Pre-Check → rot.
   - **T003381 (kein Widerspruch):** Plan mit den drei Kommandos als Checkbox-Task +
     Gateway PASS. Erwartung: `RESULT: PASS`, Ausgabe nennt Kriterium 5 als
     deterministisch geprüft. Alter Code: Ausgabe ohne Determininistik-Nachweis → rot.
   `expected: FAIL`.

2. **GREEN — T003621 (kein Boilerplate bei PASS):** Im PASS-Zweig (Zeile ~235-240)
   VOR `result PASS` das Backup zurückspielen (`cp "$BACKUP_FILE" "$PLAN_FILE"`), damit
   ein grüner Lauf das Artefakt nie verändert zurücklässt. Die FAIL-Pfade spielen das
   Backup bereits zurück (Zeile 253-254, 281) — der PASS-nach-Append-Pfad war die
   einzige Leerstelle. Backup-Datei weiterhin über die EXIT-Trap aufräumen.

3. **GREEN — T003381 (deterministisches Kriterium 5):** Strukturelle Angleichung an
   plan-lint STRUCT3:
   - Vor dem Gateway-Kontakt (nach den bestehenden Pre-Checks) die drei Kommandos per
     grep prüfen: `for cmd in test:changed freshness:regenerate freshness:check; do
     grep -qE "task[[:space:]]+$cmd" "$PLAN_FILE" || missing; done` (exakt die
     STRUCT3-Regex aus plan-lint.sh Zeile 358).
   - Fehlt eines → sofort `result FAIL "Kriterium 5 (deterministisch): fehlende
     Abschluss-Kommandos: …"` + exit 1, OHNE LLM-Aufruf (ein Plan, der plan-lint
     STRUCT3 verfehlt, kann nicht QA-grün sein).
   - Erfüllt → Kriterium 5 aus dem LLM-SYSTEM_PROMPT entfernen (Kriterienliste wird
     5er: 1,2,3,4,6) und im Prompt als deterministisch geprüft ausweisen. Die
     RESULT-Zeile nennt den Kriterium-5-Status transparent.
   - `plan-qa-payload.bats` (T002595) nicht brechen: Wort „Kriterien" und das
     `< file`-Beispiel (Kriterium 6) müssen im Prompt erhalten bleiben.

4. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats
   tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-payload.bats
   ```

## Acceptance

- Grüner Lauf (PASS, auch nach Auto-Fix-Iteration) hinterlässt die Plandatei
  byte-identisch zum Eingang — keine `## QA-Ergänzungen`-Boilerplate.
- Kriterium 5 wird nicht mehr vom LLM beurteilt: identische Eingabe kann nicht mehr zu
  plan-lint-PASS und plan-qa-FAIL führen.
- Fehlende Abschluss-Kommandos werden deterministisch und ohne Gateway erkannt.
- Bestehende Verträge bleiben: `RESULT: PASS|FAIL|SKIPPED|ERROR`-Zeile, `--emit-payload`
  offline-fähig, `enable_thinking: false`, Modell aus `PLAN_QA_MODEL`.
