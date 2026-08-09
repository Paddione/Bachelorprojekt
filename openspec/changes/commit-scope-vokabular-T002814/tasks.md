---
title: "commit-scope-vokabular-T002814 — Implementation Plan"
ticket_id: T002814
domains: [bachelorprojekt-test, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# commit-scope-vokabular-T002814 — Implementation Plan

_Ticket: T002814_

## File Structure

```
commitlint.config.cjs                                  (MODIFIED — add 'mcp-gateway' alias to SCOPE_ALIAS_GROUPS.mcp)
scripts/validate-commit-msg.sh                          (MODIFIED — validate_subject(): note that the CI PR-title check does not validate scope)
tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats (NEW — RED/GREEN regression test)
```

## Partials

Single partial — both edits are a few lines each in unrelated-but-small files, and the test
covers both in one file. Splitting into multiple partials would add coordination overhead
without a corresponding benefit (D1 disjointness is trivially satisfiable with one partial).

## Task 1 (p1) — RED: Failing-Test schreiben

`commitlint.config.cjs` liegt bei 110/400 Zeilen (`.cjs`-Limit), `scripts/validate-commit-msg.sh`
bei 277/800 Zeilen (`.sh`-Limit) — beide unbaselined, reichlich Budget für die geplanten
Ein-/Zweizeiler.

- [ ] Neue Datei `tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats` anlegen. Kopfzeile
      referenziert SSOT `openspec/specs/ci-cd.md` (Requirement „Konsolidierte Scope-Namen nennen
      ihr Ziel" und „Ablehnung eines unbekannten Scopes verweist auf den scope-blinden
      PR-Titel-Check"). Testet `scripts/validate-commit-msg.sh message <file>` per `run` (Output-
      Verifikation, T002448-M4) — kein Grep auf den Quelltext:
  - Positiv-Anker (T002356-M1, MUSS zuerst stehen): `fix(ops): correct commit-lint scope`
    → Exit 0.
  - `fix(mcp-gateway): agy headless mcp tool permissions` → Exit 1, Output enthält (Substring,
    kein Wortlaut-Anker, T002716) `mcp` als genannten Zielscope.
  - `chore(tickets): register mcp tool params` → Exit 1, Output enthält `factory` als
    Zielscope (Regressionsschutz: `tickets` bleibt bewusst abgelehnt).
  - `fix(totally-not-a-real-scope): x` → Exit 1, Output enthält einen Hinweis, dass der
    CI-PR-Titel-Check keinen Scope prüft (Substring-Match auf den neuen Hinweistext, z. B.
    `grep -qi 'PR-Titel'` oder `grep -qi 'PR title'` — je nach gewählter Sprache in Schritt
    2, hier nur auf Vorhandensein prüfen, nicht auf exakten Wortlaut).

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats
tests/unit/lib/bats-core/bin/bats tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats
# expected: FAIL — 'mcp-gateway' test fails (no alias yet: generic "did you mean" instead of
# a named target), and the PR-title-check-hint test fails (line not yet added). The positive
# anchor and the 'tickets' case already pass today — only the two new assertions are red.
```

## Task 2 (p1) — GREEN: `mcp-gateway`-Alias ergänzen

- [ ] In `commitlint.config.cjs`, `SCOPE_ALIAS_GROUPS.mcp` von `['mcp-task-runner']` auf
      `['mcp-task-runner', 'mcp-gateway']` erweitern. Kein weiterer Code nötig —
      `scope_hint()` und `SCOPE_ALIASES` werden bereits generisch aus `SCOPE_ALIAS_GROUPS`
      abgeleitet.

```bash
node -e "console.log(require('./commitlint.config.cjs').scopeHint('mcp-gateway'))"
# expected: "'mcp-gateway' wurde zu 'mcp' konsolidiert (T002328)"
```

## Task 3 (p1) — GREEN: Hinweis auf den scope-blinden PR-Titel-Check

- [ ] In `scripts/validate-commit-msg.sh`, Funktion `validate_subject()`, direkt nach dem
      bestehenden `echo "  ✗ ${label}unknown scope '${scope}': ${subject}"`-Zweig (und nach
      dem bereits vorhandenen `scope_hint`/`suggest_scope`-Block) eine zusätzliche, immer
      gedruckte Zeile ergänzen, z. B.:
      `echo "    ↳ Hinweis: Der CI-PR-Titel-Check (amannn/action-semantic-pull-request) prueft keinen Scope — ein gruener PR-Titel ist keine Garantie fuer diesen Scope." >&2`
      (ASCII-sicher, keine Umlaute, analog zum bestehenden Skript-Stil). Kein Sonderfall für
      bekannte vs. unbekannte Scopes — die Zeile erscheint bei jeder Scope-Ablehnung.

```bash
f=$(mktemp); echo "fix(totally-not-a-real-scope): x" > "$f"
bash scripts/validate-commit-msg.sh message "$f"; rm -f "$f"
# expected output contains a line noting the PR-title check does not validate scope
```

## Task 4 (p1) — Final Verification

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats
tests/unit/lib/bats-core/bin/bats tests/spec/t001356-git02-conventional-commit.bats
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] All BATS assertions above pass GREEN, including the pre-existing
      `t001356-git02-conventional-commit.bats` suite (no regression on the shared validator).
