---
title: "freshness-regen-rebase-guard — Implementation Plan"
ticket_id: T002669
domains: [scripts/freshness, git-workflow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freshness-regen-rebase-guard — Implementation Plan

_Ticket: T002669_

## File Structure

```
.claude/skills/git-workflow/SKILL.md                       (changed — Schritt 1: rebase preflight before freshness:regenerate)
tests/spec/ci-cd/freshness-regen-rebase-guard.bats          (new — RED test, already committed in the stage commit)
```

## Task 1 — RED: Failing test (bereits geschrieben, verifiziert rot)

Die Testdatei `tests/spec/ci-cd/freshness-regen-rebase-guard.bats` ist bereits im
Stage-Commit dieses Plans enthalten. Zwei Tests:
1. Kontroll-Anker (grün): `## Schritt 0 — Pull-First` enthält weiterhin
   `git pull --rebase origin main`.
2. Rot-Test: `## Schritt 1 — Verifikation & Freshness Guard` enthält VOR der
   `freshness:regenerate`-Referenz einen `git rev-list --count HEAD..origin/main`
   Divergenz-Check plus eine Rebase-Anweisung. Aktuell fehlt das.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/freshness-regen-rebase-guard.bats
# expected: FAIL — Test 2 rot (Test 1 bleibt grün als Kontroll-Anker)
```

Verifiziert am 2026-08-09: Test 1 `ok`, Test 2 `not ok` mit Meldung
"MISSING 'git rev-list --count HEAD..origin/main' divergence check BEFORE the
freshness:regenerate reference in Schritt 1".

## Task 2 — GREEN: Rebase-Preflight in `git-workflow` Schritt 1 ergänzen

`.claude/skills/git-workflow/SKILL.md` — Ist 240 Zeilen, nicht gebaselined (S1-Limit für
`.md` nicht in `docs/code-quality/gates.yaml` → `s1.limits` gelistet, also nicht S1-gegated;
Budget faktisch unbegrenzt für diesen Dateityp).

Ändere den Abschnitt "## Schritt 1 — Verifikation & Freshness Guard" (aktuell Zeilen ~57–65):
füge VOR dem bestehenden "Kurzform"-Absatz und VOR jedem Verweis auf `task freshness:regenerate`
einen neuen Unterabsatz "Rebase-Preflight (T002669)" mit folgendem Inhalt ein:

- Begründung: Schritt 0 lief ggf. vor Minuten/Stunden; in langen Sessions kann `origin/main`
  seither weitergerückt sein (z. B. parallele Releases oder andere gemergte PRs, die ebenfalls
  generierte Artefakte berühren). `task freshness:regenerate` erzeugt Artefakte aus dem
  aktuellen Arbeitsbaum — ist der veraltet, produziert die Regeneration Artefakte, die beim
  Push erneut hinter `origin/main` zurückliegen (beobachtet bei PR #3788 / T002634, zwei
  Regen-Commit-Push-Zyklen à ~1–2 min).
- Befehl-Snippet:
  ```bash
  git fetch origin main
  BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
  if [ "${BEHIND:-0}" -gt 0 ]; then
    echo "⚠ ${BEHIND} commit(s) hinter origin/main — rebase VOR dem Freshness-Regen-Lauf:"
    git pull --rebase origin main
    # Konflikte? Dem User anzeigen und klären (wie Schritt 0).
  fi
  ```
- Danach: "Erst danach `task freshness:regenerate` ausführen — sonst regeneriert man gegen
  eine bereits veraltete Basis und der Zyklus beginnt von vorn."
- Der bestehende "Kurzform"-Absatz (`task freshness:regenerate` + `task freshness:check`)
  bleibt unverändert darunter stehen.

Der neue Block muss VOR dem `freshness:regenerate`-Verweis im Abschnitt stehen, damit
`_schritt1_block` (der Test) den `rev-list --count HEAD..origin/main`-Check und die
Rebase-Anweisung findet, bevor er auf `freshness:regenerate` trifft.

Keine anderen Dateien ändern — Schritt 0 bleibt unangetastet (Kontroll-Anker des Tests).

## Task 3 — Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/freshness-regen-rebase-guard.bats
# beide Tests gruen
task test:changed
task freshness:regenerate
task freshness:check
```
