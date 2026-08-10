---
title: "gh-pr-checks-vacuous-all — Implementation Plan"
ticket_id: T003109
domains: [ci-cd, software-factory, agent-skills]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gh-pr-checks-vacuous-all — Implementation Plan

_Ticket: T003109 — `all(...)` über der leeren Checkliste ist vakuos wahr; die CI-Warteschleife
liest daraus Erfolg._

## File Structure

| Datei | Ist-Zeilen | Budget |
| --- | --- | --- |
| `scripts/lib/ci-checks.sh` | 0 | 800 |
| `scripts/factory/pr-babysit-ticket.sh` | 103 | 697 |

Weitere berührte Dateien (Markdown, kein S1-Limit für `.md`):

- `tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats` — **liegt bereits vor** (RED, in diesem
  Branch committet). Nicht neu anlegen, nur grün machen.
- `.claude/skills/references/repo-hygiene-ops.md` — §3 („ein leeres Signal ist kein Urteil")
  um die Regel zum vakuosen Prädikat ergänzen.
- `.claude/skills/references/ci-fix-loop.md` — das Snippet unter „Überblick: PR-Checks"
  (`gh pr checks --json name,state | jq '.[] | select(.state != "SUCCESS")'`) um den
  Nichtleere-Guard ergänzen.
- `openspec/specs/ci-cd.md` — wird beim Archivieren aus dem Delta gemerged, nicht von Hand.
- `website/src/data/test-inventory.json` — regeneriert, nicht von Hand editiert.

**Nicht anfassen** — die beiden Skripte devflow-ci-watch und arbitration/detect tragen den
Guard bereits (via `total_count` bzw. `length == 0`). Sie sind das Referenzmuster, kein
Umbauziel; sie stehen bewusst nicht in der Tabelle oben.

### MESSUNG (Stand `origin/main` = `f6f7e7f1996ab6beb33501d78c0de48f417d6a9c`)

Drei jq-Prädikate über Check-Listen existieren im Repo; zwei tragen bereits einen
Nichtleere-Guard, eines nicht:

```bash
PRE=f6f7e7f1996ab6beb33501d78c0de48f417d6a9c
# A — alle Prädikate über Check-Listen (3 Treffer)
git grep -n -E '(all|any)\((\.\[\]; *)?\.(state|conclusion|bucket|status)' "$PRE" \
  -- '*.sh' '*.md' '*.mjs' ':!openspec/changes/archive' ':!openspec/specs/archive'
# B — vorhandene Nichtleere-Guards (detect.sh, devflow-ci-watch.sh)
git grep -n -E 'length *== *0|total_count|TOTAL_CHECKS' "$PRE" -- 'scripts/*.sh' 'scripts/**/*.sh'
```

Ergebnis A: `scripts/arbitration/detect.sh:119`, `scripts/factory/babysit-prs.sh:92`,
`scripts/factory/pr-babysit-ticket.sh:37`. Ergebnis B deckt die ersten beiden ab
(`detect.sh` per `length == 0`; `devflow-ci-watch.sh` per `total_count`). `babysit-prs.sh:92`
nutzt `any(...)` nur als **Kandidatenfilter** — über der leeren Liste liefert `any` `false`,
der PR fällt also aus der Auswahl heraus, statt fälschlich als grün zu gelten; das ist
fail-safe und bleibt unverändert. Offen ist genau eine Stelle:
`scripts/factory/pr-babysit-ticket.sh`.

```bash
# C — Doku-Lücke: §3 kennt weder all() noch das Wort "vakuos" (0 Treffer)
git grep -c -E 'all\(|vakuos' "$PRE" -- .claude/skills/references/repo-hygiene-ops.md || echo 0
```

---

## Task 1 — RED belegen (Ausgangszustand messen)

- [ ] Den bereits committeten Test ausführen und den roten Ausgangszustand festhalten:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats
# expected: FAIL — 5 von 6 Tests rot.
# Der EINE grüne Test ist der Positiv-Anker
# "pr-babysit-ticket.sh terminiert bei NICHTLEERER roter Liste": er belegt,
# dass das gh-Stub-Gerüst das Skript korrekt treibt. Ohne ihn wäre der
# Timeout-Befund im Leer-Listen-Test nicht von einem kaputten Stub zu
# unterscheiden.
```

Erwartete rote Befunde:

- drei `ci_checks_verdict`-Tests: Exit 127, `scripts/lib/ci-checks.sh` existiert nicht.
- `pr-babysit-ticket.sh terminiert bei leerer Checkliste`: Exit **124** — `timeout` schlägt zu,
  die Schleife dreht ohne Fortschritt (`attempt` wird auf dem Nicht-Rot-Pfad nie erhöht).
- Doku-Test: `grep -qF 'all(' repo-hygiene-ops.md` schlägt fehl.

## Task 2 — `scripts/lib/ci-checks.sh` anlegen

- [ ] Neue Datei mit der Funktion `ci_checks_verdict`. Kontrakt (aus dem Delta-Spec):
      liest ein JSON-Array vom gh-Schema `[{name,state}]` **von stdin**, gibt genau ein Wort
      auf stdout aus und setzt den Exit-Code:

  | Eingabe | Verdict | Exit |
  | --- | --- | --- |
  | `[]`, leerer String oder kein gültiges JSON-Array | `empty` | ≠ 0 |
  | mindestens ein `FAILURE`/`ERROR`/`CANCELLED` | `red` | ≠ 0 |
  | nichtleer, kein rot, mindestens ein Nicht-`SUCCESS` | `pending` | ≠ 0 |
  | nichtleer, alle `SUCCESS` | `green` | 0 |

- [ ] Die Reihenfolge der Prüfungen ist tragend: **zuerst** die Nichtleere-Bedingung, danach
      erst das Prädikat. `jq 'length == 0'` als eigenständiger Schritt, nicht als Zweig in
      einem `all(...)`-Ausdruck — die Trennung ist genau das, was hier belegbar sein soll.
- [ ] Die Funktion darf `gh` nicht selbst aufrufen (Testbarkeit ohne Netz) und keine stderr-
      Ausgabe nach `/dev/null` verschlucken.
- [ ] Datei-Header: Zweckangabe, Ticket-Referenz `T003109`, Verweis auf
      `openspec/specs/ci-cd.md`.
- [ ] S4-Orphan-Check: Die Datei wird in Task 3 von `pr-babysit-ticket.sh` gesourct und ist
      damit erreichbar — die Reihenfolge Task 2 → Task 3 nicht auf zwei Commits aufteilen,
      sonst ist sie zwischendurch ein Orphan.

## Task 3 — `pr-babysit-ticket.sh` auf die Funktion umstellen

- [ ] `scripts/lib/ci-checks.sh` sourcen (analog zum bestehenden
      `source "$REPO/scripts/factory/classify-failure.sh"`).
- [ ] `_has_red` und die Poll-Schleife über das Verdict statt über das nackte
      `jq -e 'any(...)'` entscheiden lassen.
- [ ] Auf Verdict `empty` einen eigenen Pfad: nicht schweigend weiterpollen. Vorschlag —
      eine begrenzte Anzahl aufeinanderfolgender `empty`-Runden tolerieren (die CI braucht
      Anlauf), danach mit Diagnose und Exit ≠ 0 terminieren. Die Diagnose muss die leere
      Checkliste benennen (der Test prüft auf `leer|empty|keine checks|no checks`) und den
      wahrscheinlichen Grund nennen: ein PR mit `mergeStateStatus=DIRTY` startet die CI gar
      nicht erst — Rebase nötig.
- [ ] Der bestehende Rot-Pfad (`attempt`-Zähler, Fix-Subagent, Requeue des Auto-Merge) bleibt
      unverändert; der Positiv-Anker-Test aus Task 1 muss weiterhin grün sein.
- [ ] Zeilenbudget beachten: Ist 103, Budget 697 — reichlich Luft, kein Split nötig.

## Task 4 — Doku-Regel nachziehen

- [ ] `.claude/skills/references/repo-hygiene-ops.md` §3: Eine Zeile in die Tabelle
      „Belegte Fundstellen" mit dem Signal `all(...)`-Prädikat über der Checkliste [T003109],
      Ursache „`all` über der leeren Menge ist wahr", Gegenprobe „Nichtleere zuerst prüfen".
      Dazu ein kurzer Absatz, der den Unterschied zu T002822 benennt: dort die manuelle
      Fehllesart (man sieht die leere Liste), hier das automatisierte Prädikat (man sieht nur
      `true`). Querverweis auf die Positiv-Anker-Pflicht in CLAUDE.md (T002356-M1) — dieselbe
      Struktur, anderer Gegenstand.
- [ ] `.claude/skills/references/ci-fix-loop.md`, Abschnitt „Überblick: PR-Checks": Das
      Snippet zeigt heute nur `select(.state != "SUCCESS")` — leere Ausgabe liest sich als
      „alles grün". Den Nichtleere-Guard ergänzen bzw. auf `ci_checks_verdict` verweisen.
- [ ] Keine Wortlaut-Zusicherung erfinden, die der Test nicht trägt: der Doku-Test prüft
      Semantik (`all(` kommt vor, Nichtleere/vakuos wird benannt), nicht die Formulierung
      (T002716).

## Task 5 — GREEN belegen

- [ ] Denselben Runner erneut, jetzt vollständig grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats
```

- [ ] Beide Formen der Spec-Suite erfassen (Sammeldatei **und** Verzeichnis, CLAUDE.md
      T002696) — eine gezielte Suche nach nur einer der beiden findet die Hälfte:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd*
```

- [ ] Test-Inventar regenerieren und mitcommitten (CI-Gate):

```bash
task test:inventory
```

## Task 6 — Finale Verifikation

- [ ] Die drei verpflichtenden Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `bash scripts/plan-lint.sh openspec/changes/gh-pr-checks-vacuous-all/tasks.md` → Exit 0.
- [ ] `task openspec:validate` → Exit 0.
