# Design: Nightly Repo-Health-Messung + measured_at-Fix

**Ticket:** T002162
**Branch:** `fix/repohealth-nightly-T002162`
**Datum:** 2026-07-26

## Purpose

Das Dashboard unter `/admin/repohealth` liefert eingefrorene Health-Goal-Werte. Vier Prio-C
Green Gates stehen als „0 ✓" in `.claude/lib/goals.md` und werden dadurch im Dashboard in die
zugeklappte Green-Gates-Sektion einsortiert, obwohl eine frische Messung Verletzungen zeigt.
Ursache ist keine defekte Pipeline, sondern eine nie automatisierte Messung. Dieses Change
schließt die Lücke und behebt einen davon unabhängigen Parserbug beim Mess-Stichtag.

## Root Cause

### RC1 — Glied [1] der Datenkette läuft nirgends automatisch

```
[1] task health:goals:update  →  .claude/lib/goals.md          MISST live   ✗ kein Trigger
[2] task health:goals:emit    →  goals-data.generated.json     parst nur    ✓ freshness-regen.yml
[3] build-website.yml         →  Image → Flux → Prod                        ✓ verifiziert grün
```

`gen-goals-data.mjs` misst nichts — es parst `goals.md`. Da sich die Eingabe nie ändert,
erzeugt der Regenerate-Lauf bitgleiche Ausgabe, sieht keinen Diff, committet nichts.

Verifiziert: `GOALS_JSON_OUT=… node scripts/gen-goals-data.mjs` liefert Ausgabe **identisch**
zur committeten Datei — `generated.json` ist *nicht* stale gegenüber `goals.md`.

Die einzigen `schedule:`-Workflows sind `quality-loop.yml` (`0 2 * * *`, erzeugt CQ-GATE-Tickets),
`e2e.yml` (`0 3 * * *`) und `renovate.yml` (`0 7 * * 1`). Keiner misst Health-Goals.

**Warum kein Test anschlägt:** `openspec/specs/health-goals.md` spezifiziert SSOT, Generator,
Freshness-Gate und Fail-Loud-Parsing — aber keine automatische Messung. `task freshness:check`
prüft die Determinismus-Invariante `generated.json == f(goals.md)`, nicht Aktualität. Ein
Freshness-Gate kann per Konstruktion nicht sehen, dass seine Eingabe veraltet ist.

### RC2 — `measured_at` nimmt Dokument-Reihenfolge statt jüngstes Datum

`scripts/gen-goals-data.mjs:126-130`:

```js
const updateMatches = [...content.matchAll(/\*\*Baseline-Update\s+([\d-]+)/g)];
const measuredAt = updateMatches.length > 0
  ? updateMatches[updateMatches.length - 1][1]   // letzter im DOKUMENT
  : (dateMatch ? dateMatch[1] : '');
```

In `goals.md` steht das `2026-07-25`-Update auf Zeile 108 (Prio-A-Abschnitt), die
`2026-07-22`-Updates auf Zeile 577/595/604. Alle 95 Ziele tragen daher
`measured_at: "2026-07-22"`. Die Marker stehen bewusst thematisch, nicht chronologisch —
die Annahme „letzter Treffer = jüngster" ist an dieser Datei strukturell falsch.

## Fix-Ansatz

### F1 — Neuer Workflow `.github/workflows/health-goals.yml`

- **Cron `0 1 * * *`** — eine Stunde vor `quality-loop.yml` (02:00), damit dessen CQ-GATE-Tickets
  auf frisch gemessenen Zahlen basieren statt auf dem Stand der letzten manuellen Redaktion.
- **`workflow_dispatch`** mit `dry_run`-Input für manuelle Verifikation ohne Schreibzugriff.
- **`--full` statt `--fast`** (siehe E1).
- **kubectl/fleet-Setup** analog `quality-loop.yml:42-58` inkl. Context-Guard.
- **Commit+Push** analog `freshness-regen.yml:56-76` mit `GH_PAT`.

### F2 — `measured_at` per Datums-Maximum

`updateMatches` auf gültige ISO-Daten filtern und lexikografisch maximieren (`YYYY-MM-DD` ist
lexikografisch = chronologisch sortierbar), statt den letzten Dokument-Treffer zu nehmen.
Fallback auf `Baseline-Stichtag` bleibt unverändert.

### F3 — Frische Messung + redaktioneller Block

`task health:goals:update -- --full` schreibt die Aktuell-Spalte der Prio-C-Tabelle.
Zusätzlich ein von Hand verfasster `**Baseline-Update 2026-07-26**`-Block mit den Root-Cause-
Notizen zu den gerissenen Gates — das ist Fließtext, den kein Skript erzeugen kann und der
der Konvention aller bisherigen Einträge folgt.

## Edge-Cases

### E1 — Nicht durchführbare Messung darf kein „grün" erzeugen  ✅ bereits sicher

`health-goals-check.sh` ist fail-safe: jede Messfunktion liefert bei fehlendem Werkzeug,
Timeout oder nicht-numerischer Ausgabe den Sentinel `"-"` (`db_scalar:99-107` — vier
Fallback-Pfade; `ops_kubectl_count:135`; `db_backup_age_h:110`). In `row()` führt
`actual="-"` zu `SKIP` **mit `return` vor** dem `HG_VALUES_FILE`-`printf` (Zeile ~50 vs. ~62).
Nicht messbare Ziele landen also gar nicht in der Wertedatei, und `health-goals-update.sh`
schreibt nur, was dort steht.

**Konsequenz für den Workflow:** `--fast` ist unbrauchbar, weil `db_scalar` mit
`[ "$FAST" = 1 ] && { echo "-"; return; }` beginnt — alle DB-Ziele würden stumm geskippt und
ihre dokumentierten Werte blieben unverändert stehen. Deshalb `--full` + kubectl-Setup.

### E2 — Inkonsistenz-Fenster auf `main` würde fremde PR-CI rot färben  ⚠ muss adressiert werden

Naive Variante: Workflow committet nur `goals.md`, `freshness-regen.yml` zieht `generated.json`
in einem zweiten Commit nach. Dazwischen liegt ein Fenster (Workflow-Laufzeit + Queue), in dem
`main` einen Zustand hat, in dem `goals.md` neu und `generated.json` alt ist. **Jeder PR, dessen
CI in diesem Fenster `task freshness:check` läuft, schlägt fehl** — mit einer Fehlermeldung, die
auf ein Artefakt zeigt, das der PR-Autor nie angefasst hat.

**Lösung:** Der Workflow läuft `health:goals:update` **und** `health:goals:emit` und committet
beide Dateien **atomar**. `main` verletzt die Freshness-Invariante damit zu keinem Zeitpunkt,
und `freshness-regen.yml` findet anschließend nichts mehr zu tun.

### E3 — Der Commit muss `build-website.yml` auslösen

`freshness-regen.yml:70-74` setzt `[skip ci]` nur, wenn **kein** `website/`-Pfad betroffen ist
(T002158). Der neue Workflow committet `website/src/lib/goals-data.generated.json` mit — also
**kein `[skip ci]`**, damit `build-website.yml` (Trigger auf `website/**`) das Image baut und
ausrollt. Ohne diesen Schritt bliebe das Dashboard trotz frischer Daten auf dem alten Stand.

### E4 — Nebenläufigkeit mit `freshness-regen.yml`

Eigene `concurrency`-Gruppe. `cancel-in-progress: false` — ein laufender Mess-Job darf nicht
mittendrin abgebrochen werden, sonst entsteht ein Teil-Commit.

### E5 — Kein Diff ⇒ kein Commit

Wenn sich in 24 h nichts geändert hat, ist der `git diff`-Check leer und der Workflow committet
nicht. Das ist der Normalfall an ruhigen Tagen und erzeugt keinen leeren Commit-Lärm.

## Betroffene Subsysteme

| Datei | Art |
|---|---|
| `.github/workflows/health-goals.yml` | neu |
| `scripts/gen-goals-data.mjs` | Bugfix (`measured_at`) |
| `.claude/lib/goals.md` | Datenupdate + redaktioneller Block |
| `website/src/lib/goals-data.generated.json` | regeneriert (Folge) |
| `tests/spec/health-goals.bats` | RED-Tests |
| `openspec/specs/health-goals.md` | Delta: Requirement für automatische Messung |

## Nicht im Scope

- Die vier gerissenen Gates *inhaltlich* fixen (OVERVIEW.md-Zähler, verwaiste Skills, tote
  Script-Pfade). Dieses Change macht sie **sichtbar**; die Behebung ist eigene Arbeit mit
  eigenen Tickets — sonst vermischt sich Infrastruktur-Fix mit Inhalts-Fix in einer PR.
- Prio-A/B-Fließtext automatisch fortschreiben. Bleibt bewusst menschlicher Redaktion
  vorbehalten (`health-goals-update.sh:5-9`).
