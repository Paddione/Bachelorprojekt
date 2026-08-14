---
title: cfr-gates
ticket_id: T005307
domains: [ci-cd, scripts]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cfr-gates — Implementation Plan

## File Structure

| Datei | Art | Rolle |
|---|---|---|
| `scripts/vda.sh` | MODIFY | cfr-Fall um 4-Wochen-Trend-Zeile erweitern |
| `scripts/check-fix-ticket-guard.sh` | NEW | Guard: fix()-Commit ohne Ticket-ID blocken |
| `.githooks/commit-msg` | MODIFY | Aufruf des neuen Guards nach dem commit-vs-diff-Check |
| `tests/spec/ci-cd/cfr-trend-window.bats` | NEW | RED-Test: beide Messfenster (liegt im Stage-Commit) |
| `tests/spec/ci-cd/fix-ticket-commit-guard.bats` | NEW | RED-Test: Guard-Exit-Codes (liegt im Stage-Commit) |

## S1-Budgets (wirksame Schwelle)

| Datei | Ist | Schwelle | Budget |
|---|---|---|---|
| `scripts/vda.sh` | 96 | 800 (nicht baselined, .sh-Limit) | 704 |
| `.githooks/commit-msg` | 53 | 800 (nicht baselined) | 747 |
| `scripts/check-fix-ticket-guard.sh` | neu | 800 (.sh-Limit) | 800 |
| Testdateien | neu | .bats-Limit | großzügig |

## Task 1: CFR-Trend-Zeile in `scripts/vda.sh` (Partial 1)

- [ ] 1.1 cfr-Case um eine zweite Messung ergänzen: nach der bestehenden breiten
  Zeile wird „CFR 4w (Trend)" mit festem internem Fenster `4 weeks ago`
  ausgegeben (gleicher Algorithmus: first-parent main, fix()-Proxy; eigenes
  n/a-Handling bei 0 Merges). `CFR_WINDOW` steuert weiterhin nur die breite
  Zeile, damit die Trend-Messung vergleichbar bleibt.
- [ ] 1.2 Roter Lauf des neuen Guards:
  `tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/cfr-trend-window.bats` —
  expected: FAIL (Trend-Zeile fehlt noch).
- [ ] 1.3 Grüner Lauf nach 1.1: derselbe bats-Aufruf — 1 Test grün, Ausgabe
  enthält breite Messung und 4-Wochen-Trend.

## Task 2: Fix-Commit-Ticket-Guard (Partial 2)

- [ ] 2.1 `scripts/check-fix-ticket-guard.sh` anlegen: liest die Commit-Message
  aus der als Argument übergebenen Datei; Subject mit `fix(`-Präfix UND
  Ticket-ID (`T[0-9]{6}`) → Exit 0; `fix(`-Präfix OHNE Ticket-ID → Exit 1 mit
  Hinweis auf `bash scripts/ticket.sh create --type fix …`; kein
  `fix(`-Präfix → Exit 0; `SKIP_FIX_TICKET_GUARD=1` → Exit 0 (Bypass).
- [ ] 2.2 `.githooks/commit-msg` um den Aufruf ergänzen (nach dem
  commit-vs-diff-Check, gleiches Muster): bei Exit 1 Abbruch mit Hinweis,
  gleiche „No commit was created"-Ausgabe-Konvention wie der bestehende Check.
- [ ] 2.3 Roter Lauf des neuen Guards:
  `tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/fix-ticket-commit-guard.bats` —
  expected: FAIL (Guard-Skript existiert noch nicht, Positiv-Anker rot).
- [ ] 2.4 Grüner Lauf nach 2.1: derselbe bats-Aufruf — 4 Tests grün
  (mit Ticket: 0 · ohne Ticket: 1 · Bypass: 0 · feat(): 0).

## Verify (nach beiden Partials)

- [ ] `task test:changed` — betroffene Specs inklusive der beiden neuen
  Testdateien grün
- [ ] `task freshness:regenerate` — Inventare/Baselines aktualisieren
- [ ] `task freshness:check` — Fail-Closed-Gate grün
- [ ] `bash scripts/vda.sh cfr` manuell: beide Zeilen sichtbar
