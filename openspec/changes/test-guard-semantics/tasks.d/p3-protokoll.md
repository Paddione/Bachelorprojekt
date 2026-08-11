# p3 — Audit-Protokoll (T003796)

> Protokoll der Einzelfall-Entscheidungen je Fundstelle des Musters
> `grep -n … | head -1 | cut -d: -f1`. Kriterium (p3-Sweep): trifft die Assertion
> eine **Positions-/Reihenfolgeaussage** UND ist der Suchbegriff im Zieldokument
> **mehrfach** vorhanden (dann pickt `head -1` einen unverwandten Treffer) → fixen.
> Bei eindeutigen Begriffen oder deterministischem Command-Output ist `head -1`
> harmlos → bewusst lassen.

## Repariert

| Datei | Fundstelle | Grund |
|---|---|---|
| `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` | Guard in Schritt 4 | `git-crypt-Staging-Guard` oberhalb von Schritt 4 würde dokumentweites head -1 auf die falsche Zeile lenken (Ursprungsfall T003104) |
| `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` | T001147/T001148-Referenz | Referenz-Nachweis auf Bereich nach Schritt 4 gescoped |
| `tests/spec/ci-cd.bats` | T002272-M2 | `gh pr merge --auto` kommt 4x im SKILL vor; head -1 pickte den Arbeitsteilungs-Kommentar statt des Step-5-Aufrufs |
| `tests/spec/mishap-categorize-erden.bats` | T002401 | `_fetch_existing_categories` 2x (Definition + Aufruf), `DEEPSEEK_API_KEY` 3x — gemessen wird jetzt der Aufruf |
| `tests/spec/repo-hygiene/signal-gaps.bats` | T002823 | `update-branch` kommt 6x vor; Rezept wird erst NACH dem Hinweis gesucht |
| `tests/spec/software-factory/ticket-lifecycle.bats` | T002407-M7b | `exit 0` kommt 5x vor; No-op-exit (nach dem "nichts zu tun"-Hinweis) statt des fruehesten gemessen |

## Bewusst gelassen — <Grund>

| Datei | Fundstelle | Grund |
|---|---|---|
| `tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats` | 180-181 | Reihenfolge im deterministischen Command-Output ist die Assertion selbst |
| `tests/spec/agent-skills/worktree-mid-rebase-guard.bats` | 103 | Suche laeuft bereits ueber ein awk-Scoping (`/^## 1\./,/^## 2\./`); Begriffe im Abschnitt je 1x |
| `tests/spec/ci-cd.bats` | 1423 | Suche laeuft in einer bereits abgegrenzten `$block`-Variable |
| `tests/spec/ci-cd.bats` | 1650 | Suche laeuft in der bereits abgegrenzten `$body`-Variable |
| `tests/spec/ci-cd.bats` | 1857-1858 | Reihenfolge im deterministischen Mock-Log ist die Assertion |
| `tests/spec/dev-flow-plan.bats` | 403-404 | `ready on existing branch` und `--allow-empty` je 1x im Skript |
| `tests/spec/dev-flow-plan/red-phase-and-handoff-conventions.bats` | 37-39, 61-62, 81 | T002829/T002820/T002816 und die Pfad-Ueberschriften je 1x im SKILL |
| `tests/spec/devflow-selection-archive-hardening.bats` | 183-184 | `ticket.sh archive-plan` 1x, `mcp archive_plan` 2x aber beide nach dem Skript-Aufruf (Reihenfolge stabil) |
| `tests/spec/local-llm-proxy/loadout-env-property.bats` | 116 | `i_sep` sucht das `--`-Separator-Schild im deterministischen Output |
| `tests/spec/mcp-gateway/bge-host-routing.bats` | 80-81 | `^Environment=` und `^EnvironmentFile=` je 1x (Zeilenanker) |
| `tests/spec/openspec-workflow.bats` | 343-344 | `task freshness:regenerate` und Archiv-Commit je 1x |
| `tests/spec/openspec-workflow/half-archive-uncommitted.bats` | 70-71 | `half-archive` 4x, aber alle vor `_FRESHNESS_FILES=` (Reihenfolge stabil) |
| `tests/spec/react-login-edit-homepage.bats` | 56-58 | isAllowedOrigin/Allow-Origin je 1x, Allow-Credentials 2x aber auf korrekter Position |
| `tests/spec/repo-hygiene/worktree-stash-inspection.bats` | 54, 60 | Header-Suchen (`^## .*Stale Git Worktrees`, `^## .*[Ss]tash`) eindeutig |
| `tests/spec/sdlc-isolation/e3-poller.bats` | 74-75 | Reihenfolge im deterministischen SQL-Log ist die Assertion |
| `tests/spec/sdlc-isolation/sdlc-up-command.bats` | 54-89 | Reihenfolge im deterministischen `--dry`-Output ist die Assertion |
| `tests/spec/software-factory/catalog-eval-telemetry.bats` | 502 | `if (dryRun)` 1x, `WORKTREE_CREATE` nutzt `tail -1` (letzter Treffer) |
| `tests/spec/software-factory/dashboard.bats` | 162-163 | nur Existenz-Checks (`[ -n ]`), kein Positions-Vergleich |
| `tests/spec/software-factory/pipeline-and-ticket-cli.bats` | 97 | `blockend` ist nur Anker für eine awk-Range, kein Positions-Vergleich |
| `tests/spec/software-factory/ticket-lifecycle.bats` | 451-452 | `^if (REUSE)` und `read-partials` je 1x |
| `tests/spec/software-factory/ticket-lifecycle.bats` | 731 | `pr_is_plan_only "$pr_num"` 1x; der chore/openspec-Gate-Loop laeuft ueber leere Liste |
| `tests/spec/ticket-system.bats` | 405-406 | `ADD CONSTRAINT tickets_type_check` und `WHERE type IN` je 1x |
| `tests/spec/website-core.bats` | 47-48 | Reihenfolge im deterministischen grep-Output ist die Assertion |

## Budget

Keine der geaenderten Dateien nahe am 800-Zeilen-Limit; keine Verkleinerung noetig.
