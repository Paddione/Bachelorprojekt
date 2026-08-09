---
title: "spec-test-tracked-file-isolation — Implementation Plan"
ticket_id: T002779
domains: [bachelorprojekt-test, bachelorprojekt-infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# spec-test-tracked-file-isolation — Implementation Plan

_Ticket: T002779_

## File Structure

```
scripts/spec-tracked-file-guard.sh          (neu)  Snapshot/Verify des getrackten Arbeitsbaums
Taskfile.yml                                (edit) test:spec und test:spec:changed klammern bats in den Guard
tests/spec/mcp-tooling.bats                 (edit) zwei Tests auf MCP_REGISTRY/MCP_OUT_DIR umgestellt
tests/spec/ci-cd/spec-tracked-file-guard.bats (vorhanden, RED) wird nicht geaendert
website/src/data/test-inventory.json        (regeneriert) neue Testdatei im Inventar
```

### S1-Zeilenbudget (ermittelt, nicht geschaetzt)

| Datei | Ist-Zeilen | Wirksame Schwelle | Konsequenz fuer diesen Plan |
|---|---|---|---|
| `scripts/spec-tracked-file-guard.sh` | 0 (neu) | Extension-Limit `.sh` = 800, nicht baselined | Zielgroesse unter 150 Zeilen — grosse Wachstumsreserve |
| `Taskfile.yml` | 5179 | `.yml` steht nicht in `docs/code-quality/gates.yaml` → kein S1-Gate | keine Auflage |
| `tests/spec/mcp-tooling.bats` | 140 | `.bats` hat kein S1-Limit → kein S1-Gate | keine Auflage; der Umbau senkt die Zeilenzahl eher |

Keine der drei Dateien ist in `docs/code-quality/baseline.json` eingetragen, es entsteht also
kein neuer Baseline-Key. Ein Split oder Shrink ist nicht erforderlich.

<!-- vitest: kein neuer Test noetig, weil dieser Plan keine Datei unter website/src/lib oder
     website/src/pages/api anfasst — er beruehrt Shell, Taskfile und BATS. -->

## Task 1 — RED bestaetigen: der vorhandene Guard-Test ist rot

Der Failing-Test wurde bereits geschrieben und liegt unveraendert im Branch. Er wird in diesem
Plan **nicht** abgeschwaecht, sondern durch die Tasks 2 bis 4 gruen gemacht.

- [ ] Den vorhandenen RED-Test lesen und seinen Vertrag notieren:
      `tests/spec/ci-cd/spec-tracked-file-guard.bats` fordert ein Skript
      `scripts/spec-tracked-file-guard.sh` mit den Unterkommandos `--help`, `snapshot <datei>`
      und `verify <datei>`, das sich auf `git ls-files` im **aktuellen Arbeitsverzeichnis**
      bezieht (damit es gegen ein Sandbox-Repo in `$BATS_TEST_TMPDIR` laufen kann).
- [ ] Syntax-Sanity der Testdatei mit `bats --count` pruefen — `bash -n` taugt fuer `.bats`
      nicht, weil `@test "name" { … }` keine gueltige Bash-Syntax ist [T002351-M2].
- [ ] Den Testlauf ausfuehren und den roten Zustand festhalten.

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/ci-cd/spec-tracked-file-guard.bats
# erwartet: 6

tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-tracked-file-guard.bats
# expected: FAIL — alle 6 Tests rot: das Guard-Skript existiert nicht, die Taskfile-Verdrahtung
# fehlt, und mcp-tooling.bats mutiert weiterhin die getrackte Registry.
```

Erwartete Zuordnung der sechs roten Tests zu den Folge-Tasks:

| Test | Wird gruen durch |
|---|---|
| `mcp-tooling.bats laesst die getrackte MCP-Registry unberuehrt` | Task 4 |
| `das Guard-Skript existiert und ist ausfuehrbar` | Task 2 |
| `der Guard meldet eine beruehrte getrackte Datei mit Pfad` | Task 2 |
| `der Guard bleibt gruen, wenn nichts angefasst wurde` | Task 2 |
| `untracked-Dateien sind kein Verstoss` | Task 2 |
| `task test:spec ruft den Guard auf` | Task 3 |

## Task 2 — Guard-Skript `scripts/spec-tracked-file-guard.sh` anlegen

- [ ] Datei anlegen mit `#!/usr/bin/env bash` und `set -euo pipefail`, ausfuehrbar (`chmod +x`).
- [ ] Kopfkommentar schreiben, der die Entscheidung aus dem Design traegt: **verglichen werden
      mtime und Groesse, nicht der Inhalt und nicht `git status`.** Begruendung im Kommentar:
      die mutierenden Tests restaurieren den Originalinhalt selbst, danach ist der Arbeitsbaum
      sauber und der Hash identisch — ein Endzustands-Check meldete Erfolg fuer genau den
      Fehlermodus, gegen den der Guard existiert. Die mtime ueberlebt die Wiederherstellung,
      weil `cp` ohne `-p` neu stempelt (empirisch bestaetigt 2026-08-09: Hash `c9e870f0` vor
      und nach Mutation identisch, mtime von `1786252108` auf `1786252109` gewandert).
      Ticket-Referenz `T002779` und Verweis auf `openspec/specs/ci-cd.md` in den Kopf.
- [ ] Unterkommando `--help` (auch `-h` und `help`): Usage auf stdout, Exit 0. Die Usage nennt
      die drei Unterkommandos.
- [ ] Unterkommando `snapshot <datei>`: erzeugt aus `git ls-files -z` im **aktuellen
      Arbeitsverzeichnis** je Zeile `<pfad> <mtime> <groesse>`, stabil sortiert, und schreibt
      sie in `<datei>`. Fehlt der Zielpfad als Argument, Exit ungleich 0 mit Fehlermeldung.
      Ein Pfad, den `stat` nicht lesen kann (geloescht oder ersetzt), wird als
      `<pfad> MISSING MISSING` geschrieben statt verschluckt — sonst faellt eine Loeschung
      durch das Raster.
- [ ] Unterkommando `verify <datei>`: erzeugt denselben Snapshot erneut, vergleicht ihn mit
      `<datei>` und gibt bei Abweichung **die betroffenen Pfade** aus (der RED-Test prueft auf
      das Vorkommen von `tracked.txt` in `$output`). Exit 0 bei Gleichheit, Exit ungleich 0
      sonst. Fehlt die Snapshot-Datei, Exit ungleich 0 mit klarer Meldung — ein stiller
      Gruen-Lauf ohne Vergleichsbasis waere schlimmer als ein Fehler.
- [ ] Unbekanntes Unterkommando: Usage auf stderr, Exit ungleich 0.
- [ ] Robustheit gegen `git ls-files` mit vielen Pfaden: `xargs -0` mit Batching statt einer
      einzelnen Kommandozeile.
- [ ] Positiv-Anker im Verify-Pfad einbauen [T002495-M10]: die Anzahl der verglichenen
      Zeilen wird mitgezaehlt und bei 0 als Fehler behandelt. Eine leere Kandidatenliste darf
      nicht als „keine Abweichung" durchgehen.
- [ ] Shell-Sanity: `bash -n scripts/spec-tracked-file-guard.sh` und `shellcheck` sofern
      lokal verfuegbar.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-tracked-file-guard.bats
# erwartet: die vier Guard-Tests (help, Verstoss, sauber, untracked) sind gruen;
# der Registry-Test und der Taskfile-Test bleiben rot bis Task 3 und Task 4.
```

## Task 3 — `test:spec` und `test:spec:changed` in den Guard klammern

- [ ] In `Taskfile.yml`, Task `test:spec`: der Snapshot wird **unmittelbar vor** dem
      bats-Aufruf genommen, nicht am Task-Anfang. Grund als Kommentar in die Datei:
      `test:spec:build-mcp-runner` laeuft vorher und erzeugt legitime Ausgabe — ein Snapshot
      am Task-Anfang meldete diese Vorarbeit als Verstoss.
- [ ] In `Taskfile.yml`, Task `test:spec:changed`: dieselbe Klammer, an derselben Stelle
      (direkt vor `./tests/unit/lib/bats-core/bin/bats … $CHANGED_FILES`).
- [ ] **Der bats-Exit-Code darf nicht maskiert werden.** Der bats-Status wird gesichert, der
      Guard laeuft danach, und der Task endet mit dem bats-Status, sobald dieser ungleich 0
      ist; nur bei gruenem bats entscheidet der Guard-Status. Ein gruener Guard nach rotem
      bats bleibt rot. Muster:

```bash
GUARD_SNAP="$(mktemp)"
bash scripts/spec-tracked-file-guard.sh snapshot "$GUARD_SNAP"

set +e
./tests/unit/lib/bats-core/bin/bats -j $(nproc 2>/dev/null || echo 2) --no-parallelize-within-files $FILES
BATS_STATUS=$?
bash scripts/spec-tracked-file-guard.sh verify "$GUARD_SNAP"
GUARD_STATUS=$?
set -e

rm -f "$GUARD_SNAP"
if [ "$BATS_STATUS" -ne 0 ]; then exit "$BATS_STATUS"; fi
exit "$GUARD_STATUS"
```

- [ ] Frueh-Exits pruefen: `test:spec:changed` verlaesst den Task an zwei Stellen mit
      `exit 0` (leere Auswahl, leerer Shard). Beide liegen **vor** dem Snapshot, es entsteht
      also keine verwaiste temporaere Datei. Bestaetigen statt annehmen.
- [ ] Die go-task-Shell laeuft mit gesetztem Fehler-Flag; deshalb `set +e` / `set -e` exakt
      wie oben um beide Aufrufe legen, sonst bricht der Block schon beim roten bats ab und der
      Guard laeuft nie.
- [ ] Verdrahtung pruefen — der RED-Test verlangt mindestens zwei Vorkommen von
      `spec-tracked-file-guard` in `Taskfile.yml` (je Task eines fuer `snapshot`, eines fuer
      `verify`, also vier Treffer insgesamt).

```bash
grep -c 'spec-tracked-file-guard' Taskfile.yml
# erwartet: >= 2 (real 4)

tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-tracked-file-guard.bats
# erwartet: nur noch der Registry-Test ist rot
```

## Task 4 — Die zwei mutierenden Tests in `tests/spec/mcp-tooling.bats` auf Fixtures umstellen

Vorbild ist der Test „renderers pass headers through for any http client" in
`tests/spec/mcp-gateway/authenticated-http-headers.bats` (Zeilen 87–146): Fixture-Registry im
tmpdir, `MCP_REGISTRY` und `MCP_OUT_DIR` gesetzt, `HOME` auf ein Fake-Home gebogen, damit der
agy-Renderer nicht die reale `~/.gemini`-Config ausserhalb des Repos schreibt.

- [ ] Test „T002398: mcp:check erkennt Drift in der llama.cpp-Config" (Zeilen 114–125):
      `scripts/llm/mcp-servers.json` in `$BATS_TEST_TMPDIR/scripts/llm/mcp-servers.json`
      kopieren, dort den `drift-probe`-Eintrag injizieren, und `mcp-sync.sh check` mit
      `MCP_OUT_DIR="$BATS_TEST_TMPDIR"` fahren. **Backup und Restore der getrackten Datei
      entfallen ersatzlos** — es gibt nichts mehr zu restaurieren.
- [ ] Test „T002398: llamacpp-Block an einem http-Server laesst render fehlschlagen"
      (Zeilen 127–140): `docs/agent-guide/registry/mcp.yaml` nach
      `$BATS_TEST_TMPDIR/registry.yaml` kopieren, dort den `llamacpp`-Block am ersten
      http-Client injizieren, und `mcp-sync.sh render` mit `MCP_REGISTRY` auf die Kopie sowie
      `MCP_OUT_DIR` und `HOME` in `$BATS_TEST_TMPDIR` fahren. Der abschliessende
      Re-Render der echten Dateien (Zeile 138) entfaellt ersatzlos.
- [ ] Die Assertion bleibt in beiden Faellen unveraendert scharf: `[ "$status" -ne 0 ]`. Der
      Umbau aendert die Eingabequelle, nicht die Aussage.
- [ ] Positiv-Anker je Test [T002356-M1]: vor der Negativ-Aussage pruefen, dass die Fixture
      ueberhaupt erzeugt wurde und der unmanipulierte Lauf gruen ist. Ohne diesen Anker
      bestaende ein `status -ne 0` auch dann, wenn die Fixture fehlt und das Skript aus einem
      unbeteiligten Grund abbricht.
- [ ] Ergebnis- statt Quellpruefung [T002448-M4]: gemessen wird der Exit-Code von
      `mcp-sync.sh`, nicht ein `grep` auf das Skript.
- [ ] Beide Testformen lokal erfassen [T002696] — Sammeldatei und Verzeichnis:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/mcp-tooling.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/mcp-tooling*
# erwartet: gruen — und die mtimes der getrackten Artefakte sind danach unveraendert

tests/unit/lib/bats-core/bin/bats -r tests/spec/mcp-gateway*
# erwartet: gruen — der urspruenglich umgefallene Nachbar

tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-tracked-file-guard.bats
# erwartet: alle 6 Tests gruen
```

- [ ] Gegenprobe von Hand, dass die Isolation wirklich greift (mtime vor und nach dem Lauf):

```bash
stat -c '%n %Y %s' docs/agent-guide/registry/mcp.yaml scripts/llm/mcp-servers.json \
  .mcp.json .opencode/opencode.jsonc | sort > /tmp/mcp-before.txt
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-tooling.bats
stat -c '%n %Y %s' docs/agent-guide/registry/mcp.yaml scripts/llm/mcp-servers.json \
  .mcp.json .opencode/opencode.jsonc | sort > /tmp/mcp-after.txt
diff /tmp/mcp-before.txt /tmp/mcp-after.txt && echo "isoliert: 4 Pfade unveraendert"
# Positiv-Anker: die Meldung muss erscheinen; ein leerer diff ohne Zeilen waere nicht
# aussagekraeftig, deshalb wird die Zeilenzahl beider Dateien mitgeprueft:
wc -l /tmp/mcp-before.txt /tmp/mcp-after.txt
# erwartet: je 4 Zeilen
```

## Task 5 — Erstlauf des Guards auswerten: Fundstellen erfassen, nicht mitfixen

Diese Aenderung stellt **keine** weiteren Spec-Tests um. Der Guard macht zusaetzliche
Fundstellen sichtbar; das ist sein Zweck, und es ist der Grund, warum ihre Behebung ein
eigener Vorgang ist.

- [ ] Vollen Guard-Durchlauf ueber die gesamte Spec-Suite fahren:

```bash
task test:spec
# erwartet: gruen. Meldet der Guard weitere Pfade, ist das ein Befund, kein Auftrag.
```

- [ ] Jede vom Guard gemeldete zusaetzliche Fundstelle als eigenes Ticket erfassen
      (Bug-Triage-Konvention G-DORA03) und in diesem Vorgang **nicht** beheben:

```bash
bash scripts/ticket.sh create --type bug \
  --title "Spec-Test mutiert getrackte Datei: <pfad aus der Guard-Ausgabe>"
```

- [ ] Die Ticket-Nummern im PR-Text nennen, damit die Abgrenzung nachvollziehbar bleibt.
- [ ] Laufzeitkosten des Guards messen und im PR-Text nennen (zwei
      `git ls-files | xargs stat`-Laeufe ueber das Repo). Liegt der Aufschlag im Verhaeltnis
      zum mehrminuetigen Suite-Lauf nicht mehr im Bereich weniger Sekunden, wird der Snapshot
      auf die Verzeichnisse eingeengt, die Spec-Tests plausibel beruehren — `docs/`,
      `scripts/`, `.opencode/`, `.mcp.json` — und die Einengung als Kommentar im Skript
      begruendet.

```bash
time bash scripts/spec-tracked-file-guard.sh snapshot /tmp/guard-cost.txt
wc -l /tmp/guard-cost.txt
# Positiv-Anker: die Zeilenzahl muss > 0 sein, sonst misst die Zeitmessung einen Leerlauf.
```

## Task 6 — Test-Inventar, Dokumentation und finale Verifikation

- [ ] Test-Inventar regenerieren und mitcommitten — `tests/spec/ci-cd/spec-tracked-file-guard.bats`
      ist eine neue Testdatei, der CI-Inventar-Check schlaegt sonst fehl:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] Pruefen, dass `scripts/spec-tracked-file-guard.sh` kein S4-Orphan ist: es wird von
      `Taskfile.yml` aus zweimal aufgerufen (Task 3), damit ist es erreichbar.

```bash
grep -n 'spec-tracked-file-guard' Taskfile.yml
# erwartet: vier Treffer (je Task ein snapshot- und ein verify-Aufruf)
```

- [ ] OpenSpec-Gate fahren:

```bash
task openspec:validate
```

- [ ] Finale Verifikation mit den drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Abschliessender Vollauf der beiden betroffenen Suiten und des Guard-Tests:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd tests/spec/mcp-tooling.bats tests/spec/mcp-gateway
# erwartet: gruen
```
