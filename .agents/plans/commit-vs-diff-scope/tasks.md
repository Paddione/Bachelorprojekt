---
title: check-commit-vs-diff Meldung nennt gueltigen Scope plans
ticket_id: T901882
domains: [ci, gates]
status: staged
---

# commit-vs-diff-scope — Implementation Plan

Single-Plan (zwei Meldungen + Tests). Die Guard-Meldung empfiehlt den
Singular-Scope `plan`, der Scope existiert nicht (Allowlist kennt nur `plans`,
T001434-Gotcha schreibt `chore(plans):` vor). Wer der Meldung folgt,
produziert Commits, die commitlint ablehnt. Der Fix korrigiert den Scope in
der Meldung, im Kopfkommentar und im Hook-Hint; die Alternative (Scope `plan`
in die Allowlist aufnehmen) entfällt, weil Gotcha, Guard-Self-Test und
Plan-Konvention bereits auf `plans` stehen.

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/check-commit-vs-diff.sh` | Zeilen 15 und 213: Singular-Scope zu `chore(plans):` |
| `.githooks/commit-msg` | Hint-Zeile 49: Singular-Scope zu `chore(plans):` |
| `tests/py/unit/ported/test_check_commit_vs_diff.py` | Pin Zeile 140 auf `chore(plans):` nachziehen |
| `tests/py/spec/ci_cd_specs/test_commit_vs_diff_scope.py` | RED-Tests (bereits im Branch, 62 Zeilen) |
| `components/website/src/data/test-inventory.json` | Regenerieren falls verändert |

`scripts/check-commit-vs-diff.sh` hat Ist 225 bei Budget 575.
`tests/py/unit/ported/test_check_commit_vs_diff.py` hat Ist 218 bei Budget 582.
`tests/py/spec/ci_cd_specs/test_commit_vs_diff_scope.py` hat Ist 62 bei Budget 738.
`.githooks/commit-msg` ist ohne Extension nicht S1-vermessen, Ein-Wort-Änderung.
Kein Split nötig.

## Task 1 — RED-Bestätigung

- Step: `python3 -m pytest tests/py/spec/ci_cd_specs/test_commit_vs_diff_scope.py -q` — expected: FAIL, die beiden Meldungs-Tests rot.
- Acceptance: `test_guard_empfiehlt_plans_scope` und
  `test_kein_singular_scope_in_meldung_und_hook` scheitern;
  `test_gueltiger_plans_commit_bleibt_gruen` bleibt grün.

## Task 2 — Meldung auf chore(plans) korrigieren

- In `scripts/check-commit-vs-diff.sh` die beiden Singular-Stellen
  (Kopfkommentar und Fehlermeldung) auf `chore(plans):` korrigieren.
- In `.githooks/commit-msg` den Hint auf `chore(plans):` korrigieren.
- In `tests/py/unit/ported/test_check_commit_vs_diff.py` den Pin auf die
  alte Meldung auf `chore(plans):` nachziehen (der Pin kodiert den Defekt).
- Acceptance: `bash scripts/check-commit-vs-diff.sh --self-test` ist grün,
  `python3 -m pytest tests/py/spec/ci_cd_specs/test_commit_vs_diff_scope.py
  tests/py/unit/ported/test_check_commit_vs_diff.py -q` meldet alles grün und
  `grep -rnE "chore\(plan\):" scripts/check-commit-vs-diff.sh .githooks/commit-msg`
  findet keine Treffer mehr.

## Task 3 — Verifikation und Inventar

- Step: `task test:changed`
- Step: `task test:inventory` nach der Test-Änderung, danach
  `components/website/src/data/test-inventory.json` mitcommitten.
- Step: `task freshness:regenerate`
- Step: `task freshness:check`
- Acceptance: alle drei Verify-Kommandos grün, Inventar committet.
