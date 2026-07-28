---
title: PR-Konfliktreduktion bei paralleler Agentenarbeit
date: 2026-07-28
domains: [scripts, ci, tests, factory]
status: approved
tickets: [T002413]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# PR-Konfliktreduktion bei paralleler Agentenarbeit

## Zweck

Bei paralleler Agentenarbeit stauen sich Pull Requests, die sich gegenseitig blockieren.
Dieses Dokument hält fest, **was tatsächlich kollidiert**, welche naheliegenden Lösungen
messbar falsch sind, und in welcher Reihenfolge die drei wirksamen Änderungen kommen.

## Befund

Messung am 2026-07-28 über acht offene PRs (#3442–#3452).

### Es ist keine Branch-Staleness

```
repos/Paddione/Bachelorprojekt/branches/main/protection
  required_status_checks.strict = false
```

GitHub verlangt nicht, dass Branches up-to-date sind. Ein Merge invalidiert die anderen
PRs also nicht. Das klassische „jeder Merge macht die übrigen stale"-Problem existiert
hier nicht, und eine GitHub Merge Queue würde nur den Durchsatz auf einen PR pro
CI-Zyklus drosseln, ohne ein reales Problem zu lösen.

Von acht PRs waren fünf `MERGEABLE`/`BLOCKED` — also sauber mergebar und nur auf
Required Checks wartend — und drei `CONFLICTING`/`DIRTY`.

### Was tatsächlich kollidiert

Datei-Overlap über alle acht PRs:

| Vorkommen | Datei | PRs |
|---|---|---|
| 4× | `docs/code-quality/repo-index.json` | 3442 3447 3449 3450 |
| 3× | `website/src/data/openspec-status.json` | 3447 3449 3450 |
| 3× | `tests/spec/ci-cd.bats` | 3446 3449 3452 |
| 3× | `scripts/agent-lock.sh` | 3446 3448 3449 |
| 2× | `tests/spec/ticket-system.bats` | 3442 3447 |
| 2× | `Taskfile.yml` | 3450 3452 |

Drei getrennte Ursachen:

1. **Generierte Artefakte.** Bereits in `.gitattributes` als `merge=ours` geführt, lokaler
   Treiber gesetzt (`merge.ours.driver=true`). Lokal rebasen sie konfliktfrei.
   **GitHub ignoriert `.gitattributes`-Merge-Treiber vollständig** — weder die
   Mergeability-Berechnung noch Auto-Merge kennen sie. Deshalb bleiben die PRs als
   `CONFLICTING` stehen, obwohl der Konflikt lokal trivial auflösbar ist.
2. **`tests/spec/*.bats`-Append-Konflikte.** Die Konvention „eine Datei pro SSOT-Spec"
   führt dazu, dass Parallelarbeit strukturell am Dateiende kollidiert (T002351-M2).
3. **Echter fachlicher Overlap.** T002341, T002373 und T002374 arbeiten alle an
   `scripts/agent-lock.sh`. Das ist ein Zuschnittfehler beim Dispatch, kein Merge-Problem.

## Verworfene Ansätze

### Freshness-Gate lockern

Naheliegend: `task freshness:check` prüft nur noch, ob die 16 generierten Artefakte
regenerierbar sind, statt zu verlangen, dass sie committet sind. Der Datei-Overlap aus
Zeile 1–2 der Tabelle verschwände vollständig.

**Messbar falsch.** Das ist exakt der Zustand vor T002252. Damals hinterließ nahezu jeder
PR stale Artefakte auf `main`, die `freshness-regen.yml` per Bot-Commit heilte — 21 an
einem einzigen Tag —, was unter anderem die Renovate-Abbrüche aus T002249 verursacht.

Gemessen über sieben Tage vor dem 2026-07-28:

| Metrik | Wert |
|---|---|
| Merges nach `main` | 432 |
| Bot-Commits `chore: auto-regenerate freshness artifacts` | 61 (~14 %) |

Das Gate wirkt. Es bleibt unverändert.

### `merge=union` für `tests/spec/*.bats`

Naheliegend: Append-Konflikte automatisch auflösen, indem beide Seiten behalten werden —
genau das, was die Konvention in CLAUDE.md ohnehin von Hand vorschreibt.

**Empirisch widerlegt.** `merge=union` arbeitet zeilenweise und kennt keine Blockstruktur.
Zwei Branches, die je einen `@test`-Block anhängen, ergeben:

```bash
@test "from B" {
  run b            # Block B wird nie geschlossen
@test "from A" {   # A schiebt sich mitten hinein
  run a
  [ "$status" -eq 0 ]
}
```

Dabei entsteht **kein Konfliktmarker** — der Merge gilt als erfolgreich. Ein sichtbarer
Konflikt würde zu still kaputtem Code. Für Append-only-Listen ohne Blockstruktur
(`CHANGELOG`-artig) wäre `union` richtig; für `.bats` ist es strikt schlechter als der
Status quo.

## Lösung

Drei Änderungen, in dieser Reihenfolge. Jede ist für sich nutzbar.

### B — `task pr:refresh` (T002413, zuerst)

Heilt den bestehenden Stapel. Neues `scripts/pr-refresh.sh` plus Taskfile-Einsprung:

1. PR-Zustand per `gh-axi` prüfen — nur fortfahren bei `mergeable=CONFLICTING`
2. Branch in temporärem Worktree auschecken (nie im Hauptcheckout)
3. `git rebase origin/main` — der `merge=ours`-Treiber räumt die generierten Artefakte
4. `task freshness:regenerate`, Artefakte nachcommitten
5. `git push --force-with-lease`

Guards:

- Nur PRs des eigenen Accounts — kein Force-Push auf fremde Branches
- Abbruch, wenn der Branch in `agent-lock.sh list` als `live` geführt wird
- Abbruch, wenn nach dem Rebase Konflikte in **nicht**-generierten Dateien verbleiben —
  die gehören von Hand aufgelöst
- `--force-with-lease`, nie `--force`
- Dry-run als eigenständiger Modus

Zuerst, weil es nur `Taskfile.yml` und eine neue Datei berührt und den Stapel sofort
verkleinert.

### C — Verzeichniskonvention für `tests/spec/`

Verhindert, dass **neue** Append-Konflikte entstehen.

```
vorher:   tests/spec/ci-cd.bats            ← alle hängen hier an
nachher:  tests/spec/ci-cd/<kurz-slug>.bats ← jedes Ticket eigene Datei
```

Verifiziert: `bats <verzeichnis>` findet `.bats` direkt darin, `-r` macht es rekursiv.
Der Glob `tests/spec/*.bats` in `Taskfile.yml:762` erfasst Unterverzeichnisse **nicht** —
`bats -r tests/spec/` erfasst beide Formen und ist damit der Migrationspfad.

Umfang bewusst begrenzt: Runner-Aufruf, Zähl-Logik (`Taskfile.yml:779`),
`find-changed-tests.sh`, `build-test-inventory.sh`, Konvention in CLAUDE.md, plus ein
Guard-Test gegen `merge=union` auf `.bats`. Die 139 Bestandsdateien (24.433 Zeilen)
bleiben unangetastet — eine Migration von `ci-cd.bats` würde die drei PRs, die sie
gerade offen halten, konfliktbehaftet machen und damit genau das Problem verschärfen,
das sie behebt.

### A — Factory-Conflict-Gate

Verhindert, dass fachlich überlappende Tickets überhaupt gleichzeitig dispatcht werden.
Die Kette hat vier Löcher:

| # | Ort | Defekt |
|---|---|---|
| A1 | `conflict-check.sh` SQL | `status IN ('in_progress','in_review')` verpasst `plan_staged` — genau die Phase, in der parallel dispatcht wird. Typfilter kennt `bug`/`fix` nicht. |
| A2 | `pipeline-runner.js` | kein `conflict-check`-Kommando — nur `conflict-escalate` ist deterministisch |
| A3 | `pipeline.mjs:246` | `if (/\"T0/.test(conflict))` — Regex auf LLM-Prosa statt auf den Exit-Code |
| A4 | `pipeline.mjs:199` | `scout.touched_files` wird an den unmittelbaren Check gereicht und dann verworfen, nie ins Ticket persistiert |

A4 ist der Hebel: Weil `touched_files` in der DB `null` bleibt (verifiziert an T002341),
ist jedes Ticket für nachfolgende Kollisionsprüfungen unsichtbar — das Gate hat
strukturell kein Gedächtnis. Zusätzlich ruft `schedule.sh:73` `conflict-check.sh` ohne
Dateiliste auf, was bei `null` zu `rc 2` führt und als „schedulable" gewertet wird.
A1–A3 sind ohne A4 wirkungslos.

A3 folgt dem bereits etablierten `runRunner()`-Muster (`pipeline.mjs:29`): Der
Workflow-Sandbox hat keinen Node-API-Zugriff, deterministische Operationen werden an
`pipeline-runner.js` delegiert und liefern strukturiertes JSON zurück.

Zuletzt, weil `pipeline.mjs` derzeit in PR #3450 offen ist.

## Reihenfolge und Kollisionsrisiko

| PR | Teil | Zieldateien | Kollidiert heute mit |
|---|---|---|---|
| 1 | B | `scripts/pr-refresh.sh` (neu), `Taskfile.yml` | #3450, #3452 (nur `Taskfile.yml`) |
| 2 | C | `Taskfile.yml`, `find-changed-tests.sh`, `build-test-inventory.sh`, CLAUDE.md | — |
| 3 | A | `pipeline.mjs`, `pipeline-runner.js`, `conflict-check.sh`, `schedule.sh` | #3450 (bis gemergt) |

## Testbarkeit

Jeder Teil bekommt BATS-Tests nach der neuen Verzeichniskonvention, mit Positiv-Anker bei
Negativtests (T002356-M1). Für B heißt das insbesondere: der Guard „bricht bei Konflikten
in nicht-generierten Dateien ab" braucht im selben Test den Nachweis, dass der Lauf bei
rein generierten Konflikten durchgeht — sonst besteht er vakuos.

## Nicht in diesem Vorhaben

- GitHub Merge Queue (löst ein Problem, das wegen `strict: false` nicht existiert)
- Migration der 139 Bestandsdateien in `tests/spec/`
- Änderungen am Freshness-Gate
