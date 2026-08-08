---
title: "cockpit-daemon-test-no-leak — Implementation Plan"
ticket_id: T002724
domains: [sdlc-cockpit, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cockpit-daemon-test-no-leak — Implementation Plan

_Ticket: T002724 · Design: `openspec/changes/cockpit-daemon-test-no-leak/design.md`_

## File Structure

```
tests/spec/sdlc-cockpit/daemon-runtime-contract.bats   (geändert — Start, Beenden, State-Dir)
tests/spec/sdlc-cockpit/daemon-test-no-leak.bats       (neu — Leak-Guard, liegt bereits vor)
openspec/changes/cockpit-daemon-test-no-leak/specs/sdlc-cockpit.md (neu — Delta-Spec, liegt bereits vor)
```

## Partials

| # | Rolle | Ziel-Dateien | Abhängigkeit |
|---|-------|--------------|--------------|
| p1 | Tests | `tests/spec/sdlc-cockpit/daemon-runtime-contract.bats`, `tests/spec/sdlc-cockpit/daemon-test-no-leak.bats` | — |

Beide Dateien sind `.bats` und damit ungated (kein S1-Budget). Die Änderung ist ein Austausch
weniger Zeilen in einem Testblock; kein Split nötig. Nur ein Partial, weil Guard und geänderter
Test dieselbe Aussage tragen — sie zu trennen würde einen Zwischenstand erzeugen, in dem der
Guard rot ist, ohne dass jemand daran arbeitet.

---

## p1 — Testlauf ohne Rückstand

- [x] **Failing-Test-Step (RED).** Der Guard liegt bereits als
      `tests/spec/sdlc-cockpit/daemon-test-no-leak.bats` auf dem Branch. Vor der Änderung
      ausführen und den roten Stand bestätigen — er muss an `[ "$leaked" -eq 0 ]` scheitern und
      den verbliebenen Lauscher ausgeben.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-test-no-leak.bats
# expected: FAIL (rot — der Contract-Test hinterlässt einen Daemon auf 39199)
```

- [x] **Start auf `./node_modules/.bin/tsx` umstellen** (`daemon-runtime-contract.bats`, Zeile 77).
      `npx tsx` erzeugt vier Prozessebenen, von denen `$!` nur die oberste benennt. Gleichzeitig
      `COCKPIT_DAEMON_STATE_DIR` auf `BATS_TEST_TMPDIR` setzen, damit der Test nicht mehr in
      `/tmp/cockpit-daemon.*` eines echten Daemons schreibt.

```bash
COCKPIT_DAEMON_PORT="${PORT}" COCKPIT_DAEMON_STATE_DIR="${BATS_TEST_TMPDIR}" \
  ./node_modules/.bin/tsx .lavish/kit/daemon/server.ts \
  > "${BATS_TEST_TMPDIR}/daemon.log" 2>&1 &
local WRAPPER_PID=$!
```

- [x] **Beenden über die selbstgeschriebene PID.** Die bisherige `daemon.pid` im Testverzeichnis
      enthielt die Wrapper-PID — der Name legte eine Bedeutung nahe, die der Inhalt nicht hatte.
      Stattdessen die Datei lesen, die der Daemon selbst schreibt, und beide Enden beenden.

```bash
# Beide Enden: der Server (dessen PID er selbst schreibt) und der Wrapper. Letzterer
# faengt den Fall ab, dass der Start vor dem Schreiben der PID-Datei abbricht.
if [ -f "${BATS_TEST_TMPDIR}/cockpit-daemon.pid" ]; then
  kill "$(cat "${BATS_TEST_TMPDIR}/cockpit-daemon.pid")" 2>/dev/null || true
fi
kill "${WRAPPER_PID}" 2>/dev/null || true
```

- [x] **Kommentar im Testblock richtigstellen.** Der Block ab Zeile 77 begründet den großzügigen
      Timeout und zählt ausgeschlossene Ursachen auf. Ergänzen, dass eine weitere Ursache
      identifiziert wurde — der Prozess-Leak — und dass die `daemon.pid`-Datei bis hierher die
      Wrapper-PID trug. Ohne diesen Hinweis liest die nächste Person die alte Aufzählung als
      abgeschlossen.

- [x] **Guard grün fahren.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-test-no-leak.bats
# expected: PASS
```

- [x] **Zweifachlauf gegen Rückstände.** Zweimal hintereinander ausführen — beim zweiten Mal darf
      der Positiv-Anker „Port vorher frei" ohne das Zutun von `kill_listeners` halten. Das belegt,
      dass wirklich nichts zurückbleibt, statt dass der Guard sein eigenes Leck aufräumt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-test-no-leak.bats
ss -ltnp 2>/dev/null | grep 39199 || echo "kein Rueckstand"
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-test-no-leak.bats
```

- [x] **Gesamte Cockpit-Suite grün fahren**, beide Dateiformen (T002696), und danach auf
      Rückstände prüfen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
ss -ltnp 2>/dev/null | grep -E '391[0-9][0-9]' || echo "keine verwaisten Daemons"
```

## Verify

- [x] **Abschluss-Verifikation.** Die drei Pflicht-Gates laufen lassen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
