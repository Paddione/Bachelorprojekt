---
title: "agent-lock-release-guard — Implementation Plan"
ticket_id: T002447
domains: [agents, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-release-guard — Implementation Plan

_Ticket: T002447_

## File Structure

```
NEW:
  scripts/agent-lock-identity.sh                                 — drittes Fragment: Session- und
                                                                   Tool-Identitaet (_my_sid, _sid_alive,
                                                                   _pid_alive, _detect_tool)
  tests/spec/active-sessions-hub/release-foreign-lock-guard.bats — RED-Test, bereits im Branch (5/7 rot)
CHANGED:
  scripts/agent-lock.sh                                          — Identitaets-Sektion raus, Fragment-Loader
                                                                   erweitert, same-tool-Fallback aus
                                                                   cmd_release + cmd_refresh entfernt
  tests/spec/agent-lock-session-identity.bats                    — Tests #10/#18 auf AGENT_LOCK_TOOL
                                                                   statt GEMINI_CLI umstellen
  tests/spec/t002374-mishap-bundle.bats                          — Tests #3/#4 auf die neue Semantik
                                                                   (Tool-Klasse berechtigt nicht)
  openspec/changes/agent-lock-release-guard/specs/active-sessions-hub.md — Delta, bereits im Branch
```

**S1-Budgets** (nur `.sh` unterliegt S1; `.bats` steht nicht in `gates.yaml → s1.limits`):

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `scripts/agent-lock.sh` | 499 | 500 (Limit `.sh`, nicht gebaselined) | **1** — 99,8 % der Schwelle |
| `scripts/agent-lock-identity.sh` | neu | 500 (Limit `.sh`) | ~410 bei Zielgroesse rund 90 Zeilen |

`agent-lock.sh` liegt weit ueber 80 % seiner wirksamen Schwelle. Der Plan enthaelt deshalb einen
**echten Extraktionsschritt** (T2), kein Zeilen-Zusammenziehen: die Identitaets-Sektion wandert in
ein eigenes Fragment. Das folgt dem Muster, das T002375-p1 aus demselben Grund fuer die
Git-Hook-Guards etabliert hat (`agent-lock-guards.sh`, `agent-lock-merged.sh`) — der Loader samt
Fail-loud-Guard existiert bereits in Z. 469-480 und wird nur um einen Eintrag erweitert.
Erwartete Groesse nach T2: `agent-lock.sh` rund 425 Zeilen, Budget wieder rund 75.

---

## T1 — RED-Zustand verifizieren

Der Test liegt bereits im Branch. Vor jeder Produktivaenderung den roten Ausgangszustand
festhalten — **und zwar in beiden Umgebungen**, weil genau die Umgebungsabhaengigkeit der Kern
dieses Bugs ist.

- [ ] **Failing-Test-Step (RED)** — beide Laeufe ausfuehren und vergleichen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/release-foreign-lock-guard.bats
env -u CLAUDECODE -u CLAUDE_CODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_SESSION_ID \
  tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/release-foreign-lock-guard.bats
# expected: FAIL — 5 von 7 rot (#1, #2, #5, #6, #7), in beiden Laeufen identisch
```

Gruen bleiben muessen #3 (`--force` raeumt ab) und #4 (toter Owner ohne `--force` freigebbar);
sie sichern ab, dass der Fix die legitimen Freigabewege nicht miterschlaegt. Weichen die beiden
Laeufe voneinander ab, ist der Test selbst umgebungsabhaengig und muss korrigiert werden, bevor
T2 beginnt.

## T2 — Identitaets-Sektion nach `scripts/agent-lock-identity.sh` extrahieren

Schafft den S1-Platz fuer T3/T4 und gruppiert die Funktionen, die dieser Change ohnehin anfasst.

- [ ] `scripts/agent-lock-identity.sh` anlegen mit Kommentarkopf (das Fragment wird ge-`source`-t,
      nicht ausgefuehrt) und dem Inhalt der Zeilen 22-92 von `scripts/agent-lock.sh`:
      `_AGENT_LOCK_SID_ENVS`, `_my_sid`, `_sid_alive`, `_pid_alive`, `_detect_tool`.
- [ ] Diese Zeilen in `scripts/agent-lock.sh` entfernen.
- [ ] Den Fragment-Loader in Z. 469-480 um `agent-lock-identity.sh` erweitern — die Liste in der
      `for`-Schleife und eine `# shellcheck source=`-Zeile darueber.
- [ ] **Ladereihenfolge pruefen, nicht annehmen.** Der Loader laeuft nach allen
      Funktionsdefinitionen, aber vor `main()`. Verifizieren, dass keine der extrahierten
      Funktionen auf Top-Level-Ebene *vor* dem Loader aufgerufen wird:

```bash
awk '/^[a-zA-Z_]+\(\)/{f=1} /^}/{f=0} !f && /_my_sid|_detect_tool|_sid_alive|_pid_alive/' \
  scripts/agent-lock.sh
# Ausgabe muss leer sein (Kommentarzeilen ausgenommen); sonst Loader nach oben ziehen
```

- [ ] `AGENT_LOCK_TTL` und `AGENT_LOCK_GRACE` bleiben in `agent-lock.sh` — sie gehoeren zur
      Reap-Logik, nicht zur Identitaet.
- [ ] Verifizieren, dass die Extraktion rein strukturell war:

```bash
wc -l scripts/agent-lock.sh scripts/agent-lock-identity.sh   # agent-lock.sh unter 500
bash -n scripts/agent-lock.sh && bash -n scripts/agent-lock-identity.sh
bash scripts/agent-lock.sh list
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
```

Der Testlauf muss nach T2 **dasselbe** Ergebnis liefern wie vorher (16 gruen, #10/#18 rot).

## T3 — `AGENT_LOCK_TOOL` als Test-Override in `_detect_tool`

- [ ] In `scripts/agent-lock-identity.sh` als **erste** Pruefung von `_detect_tool`, vor den
      ambient Harness-Markern:

```bash
_detect_tool() {
  # AGENT_LOCK_TOOL zuerst — analog AGENT_LOCK_SID in _my_sid. Die Harness exportiert
  # CLAUDECODE/CLAUDE_CODE_SESSION_ID ambient in jede Session; stuende der Override
  # dahinter, koennte ambient State ihn ueberstimmen. Ein Override, den ambient State
  # ueberstimmen kann, ist keiner. [T002447]
  if [ -n "${AGENT_LOCK_TOOL:-}" ]; then printf '%s\n' "$AGENT_LOCK_TOOL"; return; fi
  ...
}
```

- [ ] Den Dateikopf-Kommentar von `agent-lock.sh` (`Test overrides: AGENT_LOCK_DIR,
      AGENT_LOCK_SID, AGENT_LOCK_FAKE_ALIVE.`, Z. 16) um `AGENT_LOCK_TOOL` ergaenzen.
- [ ] Verifizieren:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/release-foreign-lock-guard.bats
```

Test #6 (`AGENT_LOCK_TOOL ueberstimmt die ambient Harness-Marker`) muss gruen werden;
#1/#2/#5/#7 bleiben rot, solange T4 aussteht.

## T4 — Same-tool-Fallback aus `cmd_release` und `cmd_refresh` entfernen

- [ ] In `cmd_refresh` (`scripts/agent-lock.sh`) den Fallback-Term streichen:

```bash
[ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] || return 1
```

- [ ] In `cmd_release` denselben Term streichen und die Begruendung im Kommentar festhalten:

```bash
# [T002373-M2] Auto-release nur bei eigenem Lock oder totem Owner. Gleiche Tool-Klasse
# berechtigt NICHT: im Betrieb melden alle beteiligten Sessions dieselbe Klasse, der
# Ownership-Check waere damit wirkungslos. Der Fallback aus T002374 war ein Workaround
# gegen SID-Drift pro Bash-Call — diese Ursache ist seit T002375-p1 behoben. [T002447]
if [ -n "$force" ] || [ "$owner_sid" = "$(_my_sid)" ] \
   || { [ -n "$owner_sid" ] && ! _sid_alive "$owner_sid"; }; then
```

Die stderr-Diagnosezeile in `cmd_release` bleibt unveraendert — sie nennt bereits beide SIDs und
`--force`, was Test #2 prueft.

- [ ] **Fix-Step (GREEN)** — verifizieren:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/release-foreign-lock-guard.bats
env -u CLAUDECODE -u CLAUDE_CODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_SESSION_ID \
  tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/release-foreign-lock-guard.bats
```

Alle 7 Tests gruen, in **beiden** Laeufen.

## T5 — Die vier Bestandstests auf explizite Vorbedingungen umstellen

Alle vier erben ihre Tool-Klasse bislang aus ambient Env und urteilen deshalb in CI anders als in
einer Agent-Session. Vor der Aenderung die `@test`-Titel lesen — sie tragen die Vorbedingung, die
im Code nicht steht.

- [ ] `tests/spec/agent-lock-session-identity.bats` **#10**
      (`T002261-M1: cmd_release emits stderr diagnostic on SID mismatch`): `export GEMINI_CLI=1`
      durch `AGENT_LOCK_TOOL=gemini` ersetzen und beim Claim `AGENT_LOCK_TOOL=claude` setzen.
- [ ] `tests/spec/agent-lock-session-identity.bats` **#18**
      (`T002373-M2: cmd_release verweigert Release ohne --force wenn owner SID lebt`): dito;
      zusaetzlich den Kommentar `different tool class to bypass the same-tool fallback (T002374)`
      streichen — der Fallback existiert nicht mehr. Tool-Klasse auf beiden Seiten auf `claude`
      setzen, damit der Test die *neue* Zusage prueft.
- [ ] `tests/spec/t002374-mishap-bundle.bats` **#3** erwartet Exit 0 und kodiert damit exakt die
      entfernte Semantik. Erwartung auf Exit 1 drehen, Titel zu
      `agent-lock release ohne --force scheitert bei SID-Mismatch trotz gleicher tool-Klasse`
      aendern und den Erklaerkopf der Datei (Z. 28-31) korrigieren: er beschreibt den Fallback als
      Fix, er ist seit T002447 zurueckgenommen. Lock-Fixture `"tool": "unknown"` auf `"claude"`,
      Aufrufer per `AGENT_LOCK_TOOL=claude`, `AGENT_LOCK_SID` explizit setzen.
- [ ] `tests/spec/t002374-mishap-bundle.bats` **#4** behaelt seine Aussage, bekommt aber explizite
      Overrides statt ambient Env (`AGENT_LOCK_TOOL=gemini`, `AGENT_LOCK_SID=session-B`, Fixture
      `tool: claude`).
- [ ] Beide Dateien in beiden Umgebungen pruefen — die Ergebnisse muessen uebereinstimmen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
tests/unit/lib/bats-core/bin/bats tests/spec/t002374-mishap-bundle.bats
env -u CLAUDECODE -u CLAUDE_CODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_SESSION_ID \
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats \
  tests/spec/t002374-mishap-bundle.bats
```

## T6 — Final Verification

- [ ] **Rauchtest am echten Kommando** — prueft den Pfad **ohne** `AGENT_LOCK_SID`/
      `AGENT_LOCK_TOOL`, also mit den echten Harness-Variablen. Genau dort liegt das Restrisiko
      dieses Change: wuerde das Delegationsmuster abweichende Session-IDs erzeugen, kehrte
      `release verlangt --force` zurueck, und dieser Aufruf faengt es ab.

```bash
bash scripts/agent-lock.sh claim ticket T002447-smoke --label smoke
bash scripts/agent-lock.sh release ticket T002447-smoke   # muss Exit 0 liefern
```

- [ ] **Repo-Gates** — die neue `.bats`-Datei muss im Test-Inventar landen:

```bash
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```
