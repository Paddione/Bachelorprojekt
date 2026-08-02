# Proposal: fix-commit-scope-plan-T002529

## Why

T002328 konsolidierte den Scope `plan` → `plans`. `validate-commit-msg.sh` prüft
seither gegen `plans`, aber `check-commit-vs-diff.sh` empfiehlt weiterhin
`chore(plan):`. Folge: Wer der Empfehlung folgt, wird vom zweiten Hook abgewiesen.

## What

- `scripts/check-commit-vs-diff.sh`: `chore(plan):` → `chore(plans):` (2 Stellen)
- Guard-Test: Prüft dass alle von `check-commit-vs-diff.sh` empfohlenen Scope-Präfixe
  in der Allowlist von `validate-commit-msg.sh scopes` enthalten sind.

_Ticket: T002529_
