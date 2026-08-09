---
title: "freshness-gate-artifacts — Implementation Plan"
ticket_id: T003075
domains: [git-workflow, ci-cd]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freshness-gate-artifacts — Implementation Plan

_Ticket: T003075_

## File Structure

```
.githooks/pre-commit                          (changed — freshness block: failure branch of
                                                 `task freshness:regenerate` now blocks with
                                                 `exit 1` instead of only warning; new
                                                 SKIP_FRESHNESS_REGEN=1 bypass)
                                                 | Ist 209 | Budget: nicht limitiert (keine
                                                 Dateiendung, kein s1.limits-Match, nicht
                                                 baselined) |
tests/spec/pre-commit-freshness.bats           (changed — RED tests already added in the
                                                 plan-stage commit, see Task 1)
                                                 | Ist 279 | Budget: nicht limitiert (`.bats`
                                                 nicht in s1.limits, nicht baselined) |
openspec/specs/ci-cd.md                        (changed on archive — delta from
                                                 openspec/changes/freshness-gate-artifacts/specs/ci-cd.md
                                                 merges in on `/opsx:archive`)
                                                 | Budget: n/a — `openspec/specs/**/*.md` ist per
                                                 gates.yaml von S1 ausgenommen |
```

Budget-Herleitung (S1): `.githooks/pre-commit` hat keine Dateiendung und ist in
`docs/code-quality/gates.yaml` → `s1.limits` nicht erfasst (kein Extension-Match) → kein
S1-Limit wirksam. `tests/spec/*.bats` ist ebenfalls nicht in `s1.limits` (keine `.bats`-
Extension dort gelistet) → kein S1-Limit wirksam. Beide Dateien sind zusätzlich nicht in
`docs/code-quality/baseline.json` gebaselined
(`jq -r '."S1:.githooks/pre-commit".metric // "nicht-baselined"'` → `nicht-baselined`,
analog für die Testdatei). Kein Split/Shrink-Schritt nötig.

## Task 1 — RED: Failing Tests (bereits geschrieben, verifiziert rot)

Die drei neuen Tests in `tests/spec/pre-commit-freshness.bats` (Abschnitt "T003075") sind bereits
Teil dieses Plan-Stage-Commits. Lokal verifiziert:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pre-commit-freshness.bats
# expected: FAIL — Test 13 "pre-commit blocks the commit (exit 1) when task
# freshness:regenerate fails" und Test 14 "pre-commit supports
# SKIP_FRESHNESS_REGEN=1" schlagen auf dem aktuellen Hook-Stand fehl; Test 15
# (Kontrolle: tool-missing bleibt fail-open) ist bereits grün und bleibt es.
```

Bestätigter Rot-Stand (siehe Session-Log): 13/15 grün, Test 13 und 14 rot mit den erwarteten
Meldungen ("freshness block has no 'exit 1' in its failure branch", "MISSING
'SKIP_FRESHNESS_REGEN'").

## Task 2 — GREEN: Fehlerzweig blockierend machen + Bypass ergänzen

Ändere in `.githooks/pre-commit` ausschließlich den `else`-Zweig der
`task freshness:regenerate`-Prüfung (aktuell Zeilen 110–112) sowie die vorangehende Bedingung
(Zeile 94), um den Bypass zu berücksichtigen. Der äußere `command -v task`-Guard (Zeile 87,
"Werkzeug fehlt → fail-open") bleibt **unverändert** — das ist der Kontrollfall aus Task 1/Test
15 und darf nicht angefasst werden.

Konkrete Änderung (Ersetzung des bestehenden Blocks Zeilen 94–112):

```bash
      if [ "${SKIP_FRESHNESS_REGEN:-0}" = "1" ]; then
        echo "  ⚠ freshness: SKIP_FRESHNESS_REGEN=1 — regeneration skipped, artifacts may be stale." >&2
      elif (cd "$repo_root" && task freshness:regenerate > /dev/null 2>&1); then
        _staged=0
        for _f in "${_FRESHNESS_FILES[@]}"; do
          if ! git -C "$repo_root" diff --quiet -- "$_f" 2>/dev/null; then
            git -C "$repo_root" add -- "$_f"
            echo "  ↻ freshness: auto-staged $_f"
            _staged=$((_staged + 1))
          fi
        done
        for _f in "${_pre_staged_freshness[@]:-}"; do
          if [ -n "$_f" ] && git -C "$repo_root" diff --cached --quiet -- "$_f" 2>/dev/null; then
            echo "  ⚠ freshness: your staged change to $_f was neutralized by regeneration" >&2
            echo "    (working copy now matches HEAD) — verify with 'git show --stat HEAD' after commit" >&2
          fi
        done
        [ "$_staged" -gt 0 ] && echo "  ↻ freshness: $_staged artifact(s) updated — included in this commit."
      else
        echo "  ✗ freshness:regenerate failed — refusing to commit with possibly stale generated artifacts." >&2
        echo "    Run 'task freshness:regenerate' manually to see the underlying error." >&2
        echo "    Emergency bypass (use sparingly): SKIP_FRESHNESS_REGEN=1 git commit ..." >&2
        exit 1
      fi
```

Anmerkungen für die Umsetzung:
- `SKIP_FRESHNESS_REGEN` MUSS am Anfang des Hooks (nahe den anderen `SKIP_*`-Bypass-Kommentaren,
  analog zur bestehenden Doku-Zeile "Bypass: SKIP_BRANCH_CHECK=1 …") kurz dokumentiert werden —
  ein Konsistenz-Detail, kein separater Test dafür nötig (Test 14 deckt die reine Existenz ab).
- Der `command -v task`-Guard (Zeile 87) bleibt exakt wie er ist — nur der innere Erfolg/
  Fehlschlag-Zweig der `task freshness:regenerate`-Ausführung ändert sich.
- Kein Verhalten für den `FRESHNESS_HOOK_DISABLED=1`-Pfad (Rebase/Merge in Arbeit) ändert sich —
  dieser Zweig bleibt bei Zeile 114–116 unverändert (das ist explizit T003105-Territorium, nicht
  dieses Tickets).

Nach der Änderung lokal verifizieren:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pre-commit-freshness.bats
# expected: alle 15 Tests grün (Test 13, 14 jetzt GREEN, Test 15 weiterhin GREEN)
```

## Task 3 — Regressionsnachweis gegen bestehende pre-commit-Suite

Stelle sicher, dass die bereits bestehenden T001388/T001973/T002239-M1/T002284-Tests in
derselben Datei weiterhin grün bleiben (keine Kollateralschäden am Rest des Hooks):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pre-commit-freshness.bats
# expected: 1..15 alle "ok" — insbesondere Test 6 ("pre-commit hook contains a guard around
# the freshness auto-stage block") und Test 12 ("pre-commit hook still calls task
# freshness:regenerate") dürfen durch die Umstrukturierung des if/elif/else nicht brechen.
```

Zusätzlich einen manuellen Smoke-Test in einer Sandbox durchführen (kein automatisierter Test,
nur Beleg): einen `PATH` ohne `task` simulieren und bestätigen, dass der Hook weiterhin
fail-open bleibt (deckt sich mit Test 15, aber als End-to-End-Nachweis statt reiner
Source-Inspektion):

```bash
env PATH="/usr/bin:/bin" bash -c 'command -v task || echo "task not found — outer guard would skip freshness block"'
```

## Task 4 — Final Verification

- [ ] **Step 1 — gezielte Tests für geänderte Domains:**
  ```bash
  task test:changed
  ```
- [ ] **Step 2 — generierte Artefakte aktualisieren:**
  ```bash
  task freshness:regenerate
  ```
- [ ] **Step 3 — CI-Äquivalent (Freshness + S1–S4-Ratchet):**
  ```bash
  task freshness:check
  ```
