---
title: "openspec-sh-propose-help — Implementation Plan"
ticket_id: T002908
domains: [scripts, openspec]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-sh-propose-help — Implementation Plan

_Ticket: T002908_

## File Structure

| Datei | Ist-Zeilen | Budget | Art |
|---|---|---|---|
| `scripts/openspec.sh` | 417 | 383 | geändert (Hilfe-Block in `cmd_propose`, +13 Zeilen) |
| `tests/spec/openspec-workflow/propose-help.bats` | 98 | 800 | neu (bereits in diesem Branch angelegt, RED) |
| `openspec/changes/openspec-sh-propose-help/specs/openspec-workflow.md` | — | — | Delta-Spec (bereits angelegt) |

`scripts/openspec.sh` ist nicht baselined (`jq -r '."S1:scripts/openspec.sh".metric // "nicht-baselined"'
docs/code-quality/baseline.json` → `nicht-baselined`), wirksame Schwelle ist damit das
statische `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`. Ist 417 → Budget 383, die
Änderung liegt weit darunter.

<!-- vitest: kein neuer Test nötig, weil ausschließlich Bash-Code unter scripts/ geändert wird -->

## Task 1 — RED: Testlage bestätigen

Der Test liegt bereits im Branch (`tests/spec/openspec-workflow/propose-help.bats`).
Zuerst ausführen und den roten Zustand belegen, bevor irgendetwas an
`scripts/openspec.sh` angefasst wird.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/propose-help.bats
# expected: FAIL — die drei --help-Tests sind rot (Exit 1 statt 0, Guard-Fehler
# statt Usage); die drei Guard-Regressions-Tests sind bereits grün.
```

- [ ] Lauf ausgeführt, Ausgabe zeigt `not ok 1`, `not ok 2`, `not ok 3` und `ok 4`–`ok 6`.
- [ ] Repro am Ursprungsbefehl gegengeprüft:
      `bash scripts/openspec.sh propose --help; echo "exit=$?"` → `ERROR: propose requires --ticket <ext-id>`, `exit=1`.

## Task 2 — GREEN: `--help` vor den Guards in `cmd_propose`

Muster: `scripts/worktree-create.sh` Zeilen 33–47 (T002783) — der Hilfe-Block steht
dort als erstes im Skript, vor jedem Guard, mit quoted Heredoc und `exit 0`.
Hier gehört der Block an den Anfang von `cmd_propose`, also vor
`local slug="${1:-}"`, damit `--help` nie als Slug konsumiert wird.

- [ ] In `scripts/openspec.sh` in `cmd_propose` als ersten Block einfügen:
      `if [[ "${1:-}" == "--help" ]]; then cat <<'HELP' … HELP; return 0; fi`.
      `return 0` statt `exit 0`, weil `cmd_propose` aus `main` heraus aufgerufen wird und
      `set -e` gilt — der Rückgabewert 0 propagiert korrekt bis zum Prozess-Exit.
- [ ] Der Hilfetext nennt die Aufrufform `scripts/openspec.sh propose <slug> --ticket <ext-id>`
      und beschreibt die drei Optionen `--ticket`, `--target-spec`, `--resume` sowie die
      Umgebungsvariable `OPENSPEC_ROOT`. Kein `ERROR:`-Präfix im Text — der Test prüft
      dessen Abwesenheit, weil genau das den Guard vom Hilfefall unterscheidbar macht.
- [ ] Heredoc-Delimiter quoten (`<<'HELP'`), sonst expandiert die Shell `$…` im Hilfetext.
- [ ] Der Block steht VOR dem `ticket.sh update-status`-Aufruf und vor `mkdir -p "$dir"`;
      ein Hilfeaufruf darf weder Dateien noch einen Ticket-Statuswechsel erzeugen.
- [ ] Die Zeile 105 `[[ -n "$ticket" ]] || die "propose requires --ticket <ext-id>"` bleibt
      unverändert bestehen — sie ist für echte Aufrufe weiterhin der richtige Guard.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/propose-help.bats
# erwartet: 6/6 grün
bash scripts/openspec.sh propose --help; echo "exit=$?"
# erwartet: Usage-Ausgabe, exit=0
```

## Task 3 — Regressionsfläche des Verbs prüfen

Die anderen Verben und die Skeleton-Seed-Logik dürfen von der Änderung nicht berührt sein.

- [ ] Bestehende OpenSpec-Suiten laufen lassen (Sammeldatei UND Verzeichnis, T002696):
      `tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow*`
- [ ] `tests/unit/lib/bats-core/bin/bats tests/spec/openspec-upstream-cli.bats`
- [ ] Der Positivpfad legt weiterhin an: gegen ein temporäres `OPENSPEC_ROOT` mit
      `TICKET_OFFLINE=1` einen Fixture-Change proposen und prüfen, dass
      `proposal.md`, `tasks.md` und `specs/` entstehen. Niemals gegen das echte
      `openspec/` des Repos ausführen — das erzeugte sonst einen Geister-Change.

## Task 4 — Testinventar und finale Verifikation

- [ ] `task test:inventory` regenerieren und `website/src/data/test-inventory.json`
      mitcommitten (die neue BATS-Datei muss im Inventar auftauchen, sonst failt CI).
- [ ] Die drei Pflicht-Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `bash scripts/plan-lint.sh openspec/changes/openspec-sh-propose-help/tasks.md` → Exit 0.
