---
title: "worktree-create-refactor-prefix — Implementation Plan"
ticket_id: T002811
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-create-refactor-prefix — Implementation Plan

_Ticket: T002811_

## File Structure

```
scripts/lib/branch-allowlist.sh                              (geändert — neue Funktion branch_suggest_prefix)
scripts/worktree-create.sh                                   (geändert — Suggested-Block nutzt die Abbildung)
tests/spec/divergence-guard/branch-prefix-suggestion.bats    (neu — bereits im Plan-Stage-Commit enthalten, RED)
openspec/changes/worktree-create-refactor-prefix/specs/divergence-guard.md  (Delta-Spec, wird beim Archive gemerged)
```

## Entscheidung und Nicht-Ziele

Gewählt ist **normalisieren statt verbreitern**: die Menge der erlaubten Branch-Präfixe bleibt bei
`feature/ fix/ chore/ docs/`; der Guard nennt bei einem Ticket-Typ-Präfix künftig die konforme
Alternative. Die Herleitung samt Rezeptor-Tabelle steht in `proposal.md`.

Ausdrücklich **nicht** angefasst — jede dieser Dateien würde bei der Verbreiterungs-Variante
mitziehen müssen, und genau das ist der Grund gegen sie:

| Datei | akzeptiert heute | bleibt unverändert |
|---|---|---|
| `.githooks/pre-commit` | feature, fix, chore, docs | ja |
| `scripts/factory/pipeline-partials.cjs` | feature, fix, chore | ja |
| `scripts/factory/dispatcher.js` | feature, fix, chore | ja |
| `scripts/factory/dispatcher-bridge.sh` | feature, fix, chore | ja |
| `scripts/vda/factory-prep.sh` | feature, fix, chore | ja |
| `scripts/preflight-pr-scope.sh` | feature, fix | ja |
| `openspec/specs/divergence-guard.md` (Zeilen 47–56) | vier Präfixe | ja |
| `openspec/specs/software-factory.md` (Zeile 1295) | drei Präfixe | ja |

Damit bleibt der Drift-Guard über die Präfix-Mengen
(`tests/spec/divergence-guard/branch-name-guard.bats`) unberührt grün — er vergleicht die Mengen,
und die ändert dieser Plan nicht.

Der Befund, dass `docs/` in der Vier-Präfix-Allowlist steht, aber nicht im Drei-Präfix-Hard-Guard
der Factory, ist real und in `proposal.md` festgehalten. Er wird hier **nicht** behoben; das ist
ein eigener Vorgang mit eigenem Ticket.

## S1-Budgets (wirksame Schwelle)

Extension-Limit `.sh` = 800 (`docs/code-quality/gates.yaml` → `s1.limits`). Keine der beiden
Dateien steht in `docs/code-quality/baseline.json`, die wirksame Schwelle ist also das Limit.

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/lib/branch-allowlist.sh` | 47 | 753 |
| `scripts/worktree-create.sh` | 548 | 252 |

Beide liegen weit unter 80 Prozent der wirksamen Schwelle; ein Split ist nicht erforderlich.

Die neue Datei `tests/spec/divergence-guard/branch-prefix-suggestion.bats` steht bewusst nicht in
dieser Tabelle: `.bats` ist in `docs/code-quality/gates.yaml` → `s1.limits` nicht aufgeführt, und
`scripts/code-quality/gates/s1-filesize.mjs` überspringt jede Extension ohne Limit-Eintrag. Für
diese Datei existiert damit keine S1-Schwelle, gegen die sich ein Budget angeben ließe.

## Partials

| # | Rolle | Zieldateien |
| --- | --- | --- |
| p1 | infra + test | `scripts/lib/branch-allowlist.sh`, `scripts/worktree-create.sh`, `tests/spec/divergence-guard/branch-prefix-suggestion.bats` |

Ein Partial: die Abbildung und ihr einziger Aufrufer sind nicht sinnvoll trennbar, und der Test
liegt bereits rot im Plan-Stage-Commit.

## Tasks

### Task 1 — RED bestätigen

Der Test liegt bereits im Plan-Stage-Commit dieses Branches. Vor jeder Implementierungsänderung
den roten Ausgangszustand reproduzieren:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/branch-prefix-suggestion.bats
# expected: FAIL — 3 von 6 Tests rot (refactor/, perf/, bug/ liefern keinen Vorschlag).
# Die drei uebrigen sind gruen und muessen es bleiben: der Positiv-Anker
# (chore/-Branch wird angelegt), die Nicht-Verbreiterung (refactor/ entsteht nicht)
# und das unbekannte Praefix (wip/ bekommt keinen Vorschlag).
```

Ist die Aufteilung anders als 3 rot / 3 grün, zuerst klären warum — ein rot gewordener
Positiv-Anker bedeutet, dass der Helper generell bricht, nicht dass die Abbildung fehlt.

### Task 2 — Abbildung in `scripts/lib/branch-allowlist.sh`

Die Datei ist bereits SSOT für branch-bezogene Regeln (`TICKETLESS_BRANCHES`,
`branch_is_ticketless`) und wird von `.githooks/pre-commit`, `.githooks/pre-push` und
`scripts/worktree-create.sh` bedingt gesourct. Die neue Funktion kommt daneben, im selben Stil:
ASCII-Kommentare, `return 0`-Konvention am Dateiende beibehalten.

Zu ergänzen: eine Funktion `branch_suggest_prefix <branch-name>`, die auf stdout den
Branch-Namen mit ersetztem Präfix ausgibt und 0 zurückgibt, wenn das führende Segment ein
bekannter Ticket-Typ außerhalb der Allowlist ist — sonst nichts ausgibt und 1 zurückgibt.

Die Abbildung ist eine explizite Aufzählung, kein Muster — analog zur Begründung im
Dateikopf, warum `TICKETLESS_BRANCHES` exakte Namen statt Globs führt:

| Eingangs-Präfix | Ausgabe-Präfix |
| --- | --- |
| `refactor`, `perf`, `test`, `ci`, `build` | `chore` |
| `feat`, `project` | `feature` |
| `bug` | `fix` |

Ein Präfix, das bereits in der Allowlist steht (`feature`, `fix`, `chore`, `docs`), sowie jedes
unbekannte Segment liefern 1 und keine Ausgabe — sonst würde `wip/…` einen erfundenen Vorschlag
bekommen und der letzte Test rot.

Die Funktion darf keine Seiteneffekte haben und nichts nach stderr schreiben; sie wird in einer
Kommandosubstitution im Fehlerpfad aufgerufen.

### Task 3 — Aufruf im Suggested-Block von `scripts/worktree-create.sh`

Der Block liegt in `scripts/worktree-create.sh` ab etwa Zeile 120 und baut heute `_suggested` aus
zwei Regeln: `feat/` nach `feature/` und kleingeschriebene Ticket-ID nach Großschreibung. Beide
setzen `_suggested_changed=1`, und nur dann wird die Zeile `Suggested: …` gedruckt.

Die bestehende `feat/`-Sonderregel wird durch den Aufruf der neuen Funktion **ersetzt**, nicht
ergänzt — `feat` steht in der Abbildung aus Task 2 und würde sonst zweimal behandelt. Der Aufruf
gehört vor die Ticket-ID-Korrektur, damit ein Name mit beiden Fehlern (`refactor/foo-t002627`)
einen in beiden Punkten korrigierten Vorschlag erhält.

Bedingung des Aufrufs: die Funktion ist per `command -v branch_suggest_prefix` zu prüfen, genau
wie `branch_is_ticketless` weiter oben im Skript. Fehlt `scripts/lib/branch-allowlist.sh`, bleibt
der Vorschlag aus und der Guard verhält sich wie vor dieser Änderung. Die Datei wird bereits am
Skriptkopf bedingt gesourct; ein zweiter `source`-Aufruf ist nicht nötig.

Nicht ändern: der Guard bleibt bei `exit 1`, die Präfix-Prüfung
(`[[ "$_bn" =~ ^feature/|^fix/|^chore/|^docs/ ]]`) und der Meldungstext
`Erlaubt: feature/ fix/ chore/ docs/` bleiben wörtlich stehen. Beide sind Gegenstand des
Drift-Guards gegen `.githooks/pre-commit`.

### Task 4 — GREEN

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard/branch-prefix-suggestion.bats
```

Alle sechs Tests grün. Danach die Nachbarn derselben Spec, weil beide Formen gleichzeitig gültig
sind und eine gezielte Suche nach der Sammeldatei nur die Hälfte findet:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/divergence-guard*
```

Erwartung: unverändert grün, insbesondere der Präfix-Mengen-Drift-Guard in
`tests/spec/divergence-guard/branch-name-guard.bats`. Wird der rot, wurde entgegen Task 3 doch die
Allowlist angefasst.

Zusätzlich die Guards, die `scripts/lib/branch-allowlist.sh` mitprüfen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup
```

### Task 5 — Registrierung und Doku

`scripts/lib/branch-allowlist.sh` und `scripts/worktree-create.sh` sind beide bereits erreichbar
referenziert; S4 fordert für diese Änderung nichts Neues. Zu prüfen bleibt, ob die neue Testdatei
vom Runner erfasst wird:

```bash
grep -rn 'tests/spec' tests/runner.sh | head
tests/unit/lib/bats-core/bin/bats --count tests/spec/divergence-guard/branch-prefix-suggestion.bats
```

Der Runner läuft seit T002416 mit `bats -r tests/spec/` und erfasst Verzeichnisdateien
automatisch. Ergibt der erste Befehl, dass hier stattdessen einzelne Pfade aufgezählt werden, ist
die neue Datei dort zu ergänzen — sonst liefe sie lokal grün und in CI gar nicht.

Das Testinventar nach der Teständerung neu erzeugen und mitcommitten:

```bash
task test:inventory
```

In `docs/superpowers/references/gotchas-footguns.md` einen kurzen Eintrag ergänzen: Ticket-Typen
und Branch-Präfixe sind zwei getrennte Vokabulare; ein `refactor`-Ticket bekommt einen
`chore/`-Branch, und der Guard sagt das jetzt selbst. Der Eintrag verweist auf T002811 und nennt
den Fundort der Abbildung.

### Task 6 — Ende-zu-Ende-Probe des gemeldeten Falls

Diese Probe läuft im realen Repo statt im BATS-Wegwerf-Repo und zeigt damit die Wirkung unter den
echten Guards (Divergence-Guard, main-Checkout-Guard). Sie darf keinen Worktree hinterlassen:

```bash
bash scripts/worktree-create.sh refactor/sdlc-routes-remove-T002627 /tmp/wt-probe-T002811 HEAD; echo "rc=$?"
test ! -d /tmp/wt-probe-T002811 && echo "kein Worktree entstanden — korrekt"
```

Erwartet: Exit ungleich 0, kein Verzeichnis, und in der Ausgabe die Zeile mit
`chore/sdlc-routes-remove-T002627`.

### Task 7 — Finale Verifikation

Die drei Gates sind die letzten Schritte des Plans; nach ihnen folgt keine weitere Prüfung:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
