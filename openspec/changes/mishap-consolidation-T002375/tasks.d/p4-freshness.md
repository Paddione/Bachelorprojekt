---
title: "p4 — Freshness-Gate und test:changed melden den tatsächlichen Zustand"
ticket_id: T002375
domains: [devtooling, ci-cd]
status: active
partial_id: p4
role: impl
target_files: ["scripts/code-quality/emit-index.mjs", "Taskfile.yml", ".claude/skills/references/verification-block.md", "tests/spec/ci-cd.bats"]
depends_on: []
---

# p4 — Freshness und Test-Selektion

_Ticket: T002375 · Partial p4 · Mishaps: T002273-M1, T002352-M3, T002364-M3_

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/code-quality/emit-index.mjs` | untracked-aber-nicht-ignorierte Dateien mitzählen |
| `Taskfile.yml` | `test:changed` prüft `localhost:4321`; `freshness:check` unterscheidet "stale" von "nicht committet" |
| `.claude/skills/references/verification-block.md` | beide Fälle benannt |
| `tests/spec/ci-cd.bats` | Tests für Skip-Meldung und unterschiedene Freshness-Meldungen |

## Kontext

Drei Mishaps, die alle dasselbe kosten: ein Agent befolgt die Pflicht-Verifikation wörtlich, sieht
Rot, und verbrennt Zeit mit der Diagnose eines Nicht-Fehlers.

**T002273-M1 — zwei Runden bei neuen Dateien.** `quality:index` (`emit-index.mjs`) baut sein
Datei-Universum aus `git ls-files`, also nur aus **getrackten** Dateien. Eine frisch angelegte
Skriptdatei ist beim ersten `freshness:regenerate` noch untracked und wird nicht mitgezählt; erst
nach `git add` erscheint sie, was den Index erneut ändert. Reproduzierbar zwei Runden:

```
freshness:regenerate → git add <neue Datei> → quality:index → git add repo-index.json → freshness:check
```

Beobachtet bei `scripts/filter-generated.sh` (T002255, `file_count` 548 → 549) und bei
`scripts/ticket-reclaim.sh` (T002267) — beide Male identisches Muster, beide Male ein zusätzlicher
Durchlauf des rund 9 Sekunden langen Gates plus ein Commit-Amend.

Das Ticket nennt beide Wege und bewertet sie: der Hinweis in `verification-block.md` ist die
billige Milderung, das Mitzählen von `git ls-files --others --exclude-standard` beseitigt die
zweite Runde ganz — ändert aber die Semantik des Scan-Universums und braucht eine eigene Bewertung.

**Entscheidung: beides.** Das Mitzählen ist der Fix (Schritt 1), der Hinweis bleibt als Netz für
den Fall, dass jemand mit `.gitignore`-Ausnahmen arbeitet.

**T002352-M3 — "stale" wo "uncommitted" zutrifft.** Beobachtet:

```
$ task freshness:regenerate
openspec-status-map: wrote …/website/src/data/openspec-status.json
$ task freshness:check
✗ website/src/data/openspec-status.json is stale — run 'task freshness:regenerate' locally and commit
```

Die Meldung ist **korrekt** (der Commit fehlt tatsächlich), liest sich aber wie ein
fehlgeschlagenes `regenerate`. Sie nennt `regenerate` zuerst und den Commit nur nachgestellt — man
läuft leicht in eine Schleife aus regenerate/check, statt zu committen.

**T002364-M3 — `test:changed` zieht E2E gegen `localhost:4321`.** `Taskfile.yml:914` ruft bei
gesetztem `RUN_E2E_SERVICES` automatisch `task test:e2e:services`. Bei jeder `k3d/`-Änderung
schlägt das ohne laufenden Dev-Stack mit 13 `ERR_CONNECTION_REFUSED` fehl.

Der entscheidende Punkt aus dem Ticket: CI führt für PRs nur `test:spec:changed` plus
`tests/unit/manifests.bats` und `changed-manifests.bats` aus, **nicht** das volle `task
test:changed`. Der lokale Lauf ist damit strenger als das Gate, das er simulieren soll — und
`test:changed` ist in `verification-block.md` als Pflicht-Verifikation vor dem PR gelistet. Ein
Agent, der die Anweisung wörtlich befolgt, steht vor der Wahl: fälschlich eine Regression melden,
blind weitermachen, oder Zeit mit einem Umgebungsproblem verbrennen.

## Schritte

- [ ] **RED zuerst.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# expected: FAIL (rot — test:changed hat keinen Reachability-Check, freshness:check unterscheidet die Faelle nicht)
```

- [ ] **Schritt 1 — Untracked mitzählen.** In `emit-index.mjs` das Datei-Universum um
      `git ls-files --others --exclude-standard` erweitern. Die Semantik-Änderung gehört als
      Kommentar in die Datei: der Index beschreibt ab jetzt den **Arbeitsbaum ohne ignorierte
      Dateien**, nicht den getrackten Stand.

      **Gegenprobe, die nicht fehlen darf:** dass `freshness:check` dadurch nicht in einer
      Endlosschleife landet. `docs/code-quality/repo-index.json` ist selbst eine generierte Datei
      und ist bis zum `git add` untracked — sie muss aus dem Universum ausgeschlossen bleiben,
      sonst zählt der Index sich selbst und ändert sich bei jedem Lauf. Das ist der einzige Weg,
      auf dem dieser Schritt echten Schaden anrichten kann.

- [ ] **Schritt 2 — Freshness-Meldung differenzieren.** Im `freshness:check`-Task unterscheiden:
      ist die Datei im Arbeitsverzeichnis aktuell, aber nicht committet, lautet die Meldung
      `regenerated but not committed — run 'git add <datei>'`. Ist sie wirklich veraltet, bleibt
      die bisherige Meldung.

      Der Unterschied ist mechanisch feststellbar: regenerieren, dann den Arbeitsbaum-Stand gegen
      den committeten Stand vergleichen statt nur den committeten gegen die Erwartung.

- [ ] **Schritt 3 — Reachability-Check vor E2E.** In `test:changed` vor dem Aufruf von
      `test:e2e:services` prüfen, ob auf `localhost:4321` etwas lauscht. Wenn nicht: die Gruppe
      mit **sichtbarer** Meldung überspringen, nicht still.

      Die Meldung muss sagen, dass das kein PR-Blocker ist — sonst hat der nächste Agent dieselbe
      Frage, nur eine Ebene später. Vorschlag: `→ e2e services uebersprungen: localhost:4321
      antwortet nicht. Kein PR-Blocker — CI fuehrt diese Gruppe fuer PRs ohnehin nicht aus.`

      Bewusst **nicht** gewählt: `test:e2e:services` ganz aus `test:changed` herausnehmen. Wer
      einen Dev-Stack laufen hat, soll die Gruppe weiterhin bekommen; der Fehler war die
      Bedingungslosigkeit, nicht die Zugehörigkeit.

- [ ] **Schritt 4 — `verification-block.md`.** Beide Fälle benennen: (a) bei **neuen Dateien** erst
      `git add`, dann `quality:index`, dann `freshness:check` — bleibt als Netz stehen, auch wenn
      Schritt 1 den Regelfall beseitigt; (b) rote E2E-Services bei reinen Manifest-Änderungen sind
      kein PR-Blocker, und die CI-äquivalenten Kommandos werden genannt.

- [ ] **Schritt 5 — Tests.** Je ein `@test` für: Skip-Meldung bei nicht erreichbarem Port,
      Ausführung bei erreichbarem Port (Positiv-Anker — ohne ihn prüft der Skip-Test nichts),
      `regenerated but not committed` gegen `is stale`.

      Die Taskfile-Tests laufen gegen ein `$BATS_TEST_TMPDIR`-Repo, nicht gegen den echten
      Arbeitsbaum.

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
task freshness:regenerate && task freshness:check   # muss im ERSTEN Lauf gruen sein
node --check scripts/code-quality/emit-index.mjs
```

Gegenbeweis für Schritt 1: eine neue Datei anlegen, `git add`, dann **einmal**
`freshness:regenerate` und `freshness:check` — der zweite Durchgang aus T002273-M1 darf entfallen.

## Abgrenzung

- `scripts/devflow-ci-watch.sh` (Freshness nach Auto-Rebase, T002282-M1) gehört zu PR #3400 und
  wird hier nicht angefasst.
- `.gitattributes` und die `merge=ours`-Phantom-Konflikte (T002347-M2) gehören zum bereits
  gestagten Plan von T002347.
