---
title: "worktree-branch-name-guard — Implementation Plan"
ticket_id: T002470
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-branch-name-guard — Implementation Plan

_Ticket: T002470 — Design-Spec: `docs/superpowers/specs/2026-07-29-worktree-branch-name-guard-design.md`_

## File Structure

```
scripts/worktree-create.sh                          (geaendert, +~35 Zeilen)
tests/spec/divergence-guard/branch-name-guard.bats  (neu, liegt im Stage-Commit)
tests/unit/worktree-create.bats                     (geaendert, +1 Zeile in setup)
openspec/changes/worktree-branch-name-guard/        (Proposal + Delta-Spec)
docs/superpowers/specs/2026-07-29-worktree-branch-name-guard-design.md (neu)
```

**S1-Zeilenbudget** (Limit 500; fuer diese Dateien existiert keine Baseline-Ausnahme, es gilt
also das Limit selbst als wirksame Schwelle):

| Datei | jetzt | nach Umsetzung | Restbudget |
|---|---|---|---|
| `scripts/worktree-create.sh` | 327 | ~362 | ~138 |
| `tests/unit/worktree-create.bats` | 236 | 237 | 263 |
| `tests/spec/divergence-guard/branch-name-guard.bats` | 139 | 139 | 361 |

Kein Budget laeuft gegen null; ein Verkleinerungs- oder Split-Schritt ist nicht erforderlich.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die Testdatei
      `tests/spec/divergence-guard/branch-name-guard.bats` ist geschrieben und liegt im
      Stage-Commit. Sie muss auf dem aktuellen Branch fehlschlagen: 10 der 13 Tests sind rot,
      waehrend die drei Regressionstests (Positiv-Anker, Exemption, Bypass) bereits gruen laufen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/branch-name-guard.bats
# expected: FAIL — 10 von 13 rot, weil der Guard noch nicht existiert
```

## Task 1 — Altsuite vom Guard entkoppeln

- [ ] In `tests/unit/worktree-create.bats` im `setup()` `export WT_SKIP_NAME_CHECK=1` ergaenzen.

Begruendung: Alle 11 dort verwendeten Branch-Namen (`feature/x`, `fix/z`, `fix/smudge-broken`, …)
sind konventionswidrig. Diese Suite prueft git-crypt-Verhalten, nicht die Namenskonvention; ein
Umbenennen aller Namen waere unnoetig invasiv in einer Datei, die haeufig in mehreren offenen PRs
zugleich liegt. Der Bypass ist die kleinste Aenderung, die den Guard ueberall sonst scharf laesst.

Ein Test-Mode-Skip fuer `/tmp`-Pfade (analog zum Pfad-Redirect aus T001936) scheidet aus: die neue
Guard-Suite legt ihre Worktrees ueber `mktemp -d` ebenfalls unter `/tmp` an und waere damit selbst
nicht mehr pruefbar.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/worktree-create.bats
# erwartet: unveraendert gruen, sowohl vor als auch nach Task 2
```

## Task 2 — Guard in scripts/worktree-create.sh

- [ ] Guard-Block unmittelbar nach `set -euo pipefail` (Zeile 31) einfuegen, **vor** dem
      Divergence-Guard (Zeilen 33–69).

Der Block liest `${1:-}` pruefend; die kanonischen Zuweisungen `BRANCH=` / `WT_PATH=` (Zeilen
71/72) bleiben unveraendert, damit der Eingriff lokal bleibt.

Verhalten:

- Bei gesetztem `WT_SKIP_NAME_CHECK=1` wird der Block uebersprungen.
- Exempte Namen (`main`, `develop`, `master`, `release-please--*`, `dependabot/*`,
  `renovate/*`) passieren ohne Pruefung.
- Geprueft wird das Typ-Praefix (`^feature/|^fix/|^chore/|^docs/`) und die Ticket-ID
  (`T[0-9]{6,}`, case-sensitiv). Beide Muster werden woertlich aus `.githooks/pre-commit`
  uebernommen, weil drei Drift-Tests die Zeichengleichheit pruefen.
- Bei Verstoss: Meldung auf stderr, die jede verletzte Bedingung einzeln benennt, danach
  `exit 1`. Keine Mutation, kein Verzeichnis.
- Ist eine Korrektur ableitbar — Kleinschreibung der ID, oder `feat/` statt `feature/` — wird der
  korrigierte Aufruf als kopierbare Zeile ausgegeben. Sonst entfaellt diese Zeile, statt zu raten.
- Der Hinweis auf `WT_SKIP_NAME_CHECK=1` steht am Ende der Meldung.

Die Pruefung ist unabhaengig von `BRANCH_EXISTS`: ein Commit auf einen bestehenden, falsch
benannten Branch scheitert genauso.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/branch-name-guard.bats
# erwartet: 13 von 13 gruen
```

## Task 3 — Kommentar-Kontext im Skript

- [ ] Ueber dem Guard einen Kommentarblock setzen, der die Herkunft festhaelt: T002240 (derselbe
      Bug, gefixt nur in `scripts/factory/auto-chore-plan.sh`), T002409 Mishap 2 (Wiederholung mit
      `feat/`), und die Messung vom 2026-07-29 (4 von 13 aktiven Worktrees betroffen).
- [ ] Ebenfalls festhalten, warum die Regel dupliziert und nicht nach `scripts/lib/` ausgelagert
      ist: der `pre-commit`-Hook hat heute keine Abhaengigkeit auf eine Repo-Datei, und eine
      fehlende Lib-Datei wuerde jeden Commit blockieren. Die drei Drift-Tests in
      `tests/spec/divergence-guard/branch-name-guard.bats` sichern die Uebereinstimmung.

Ohne diesen Kontext liest der naechste Bearbeiter die Duplikation als Versehen und raeumt sie auf
— genau der Weg, auf dem dieser Bug bereits zweimal zurueckkam.

## Task 4 — Verifikation

- [ ] Testkette und Freshness-Artefakte:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Beide beruehrten BATS-Dateien einzeln:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/branch-name-guard.bats
tests/unit/lib/bats-core/bin/bats tests/unit/worktree-create.bats
```

- [ ] Realprobe gegen den Fall, der das Ticket ausgeloest hat:

```bash
bash scripts/worktree-create.sh chore/mishap-t002407 /tmp/should-not-exist
# erwartet: exit != 0, /tmp/should-not-exist existiert nicht,
#           Ausgabe nennt chore/mishap-T002407 als Korrektur
```

## Abgrenzung

Nicht Teil dieses Plans:

- Aufraeumen der vier bestehenden konventionswidrigen Worktrees (`chore/mishap-t002407`,
  `chore/mishap-t002424`, `chore/mishap-t002429`, `feature/t2450-loc-gates-headroom`). Sie sind
  sauber (0 dirty, 0 staged); es liegt keine Arbeit fest. Gehoert zu `repo-hygiene`.
- Haertung der einzelnen Aufrufer von `worktree-create.sh`. Der Engpass genuegt; jede weitere
  Stelle waere die Duplikation, aus der dieses Problem entstanden ist.
