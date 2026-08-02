---
title: "p1 — Harness-stabile Session-Identität und Branch-Feld in agent-lock.sh"
ticket_id: T002375
domains: [agent-config, devtooling]
status: active
partial_id: p1
role: impl
target_files: ["scripts/agent-lock.sh", "scripts/agent-lock-guards.sh", "tests/spec/active-sessions-hub.bats", "tests/spec/agent-lock-session-identity.bats"]
depends_on: []
---

# p1 — Session-Identität

_Ticket: T002375 · Partial p1 · Mishaps: T002325-M3, T002338-M3, T002372-M1, T002341-M3, absorbiert T002363_

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/agent-lock.sh` | `_my_sid` akzeptiert `CLAUDE_CODE_SESSION_ID`; `cmd_claim` füllt ein leeres `branch` aus dem HEAD; die zwei Guard-Kommandos wandern heraus |
| `scripts/agent-lock-guards.sh` | **neu** — `cmd_guard_precommit` und `cmd_guard_postcheckout`, extrahiert |
| `tests/spec/active-sessions-hub.bats` | Tests aus dem T002363-Commit plus Branch-Auto-Fill, Release über Tool-Call-Grenze, Guard-Delegation |
| `tests/spec/agent-lock-session-identity.bats` | der bestehende Scheintest wird ersetzt |

## Kontext

Drei Mishaps beschreiben dasselbe Symptom aus drei Sessions: `release` verweigert die Freigabe
eines Locks, den dieselbe Session gesetzt hat, mit
`release: lock owned by SID <a>, current SID <b> — use --force`.

Die Ursache ist eine Zeile:

```
scripts/agent-lock.sh:30   if [ -n "${CLAUDE_SESSION_ID:-}" ]; then printf '%s\n' "$CLAUDE_SESSION_ID"; return; fi
```

Die Claude-Code-Harness exportiert `CLAUDE_CODE_SESSION_ID`, nicht `CLAUDE_SESSION_ID`. Verifiziert:
`env | grep -c '^CLAUDE_SESSION_ID='` liefert `0`. Der Code fällt deshalb immer auf Zeile 32 durch
(`ps -o sess= -p $$`), und die Unix-Session-ID ist pro Bash-Tool-Call verschieden.

**Warum das mehr als Kosmetik ist** (aus T002325-M3, wörtlich sinngemäß): `--force` ist genau das
Instrument, mit dem man fremde, noch lebende Locks abräumt. Wenn der Normalfall bereits `--force`
erzwingt, gewöhnt sich jeder Aufrufer daran — und dann räumt irgendwann jemand den Lock einer
wirklich fremden, lebenden Session ab. Der Schutzmechanismus entwertet sich selbst.

Zweiter, unabhängiger Defekt (T002372-M1): `cmd_claim` füllt `BRANCH` nur für branch-scoped Claims
automatisch (`agent-lock.sh:253`). Ein ticket-scoped Claim schreibt `"branch": ""`. Der
Pre-Commit-Guard aus `dev-flow-plan` Schritt 5 vergleicht dieses Feld mit dem HEAD-Branch und
schlägt damit **immer** fehl, wenn man den Claim so absetzt, wie die Skill ihn dokumentiert.
Verschärfend: `claim` ist idempotent und überschreibt einen bestehenden Lock nicht — ein einmal
leer angelegter Lock lässt sich nicht durch erneutes Claimen reparieren.

## Absorbierter Branch T002363

`origin/chore/agent-lock-claim-strict-args-T002363`, Commit `1c26c3d66`: `cmd_claim` lehnt
unbekannte Argumente ab, statt sie stumm zu verwerfen (+19 Zeilen in `agent-lock.sh`, +72 in
`tests/spec/active-sessions-hub.bats`). Der zugehörige Worktree existiert nicht mehr, der Lock
steht trotzdem auf `live` — der Vorgang ist selbst eine Instanz von T002341-M3.

## S1-Budget

`scripts/agent-lock.sh` steht bei **464** Zeilen, das `.sh`-Limit ist **500**, es gibt keinen
Baseline-Eintrag. Budget: **36 Zeilen**. Der T002363-Commit verbraucht davon 19. Das reicht für die
restlichen Änderungen nicht — deshalb Schritt 1 unten, ein echter Extraktionsschritt und keine
kosmetische Zusammenziehung.

## Schritte

- [x] **RED zuerst.** Die neuen Tests schreiben und gegen den unveränderten Stand laufen lassen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
# expected: FAIL (rot — _my_sid kennt CLAUDE_CODE_SESSION_ID nicht, ein ticket-Claim schreibt branch="")
```

- [x] **Schritt 1 — Extraktion (S1-Budget schaffen).** `cmd_guard_precommit` (Zeilen 404–423) und
      `cmd_guard_postcheckout` (Zeilen 425–446) nach `scripts/agent-lock-guards.sh` verschieben.
      `agent-lock.sh` sourct die neue Datei und behält die Dispatch-Einträge im `case`, damit die
      Aufrufschnittstelle unverändert bleibt. Die beiden externen Aufrufer sind
      `.githooks/pre-commit:13` und `.githooks/post-checkout:13`; **beide rufen weiterhin
      `agent-lock.sh guard-*` auf** und werden nicht angefasst — sie gehören keinem Partial dieses
      Changes und dürfen sich nicht ändern.

      Nachweis, dass die Extraktion wirkt: `wc -l < scripts/agent-lock.sh` liegt danach unter 430.

- [x] **Schritt 2 — T002363 absorbieren.** _(entfaellt: bereits als PR #3410 / Commit b9685c683 in main; `_reject_arg` liegt vor.)_ `git cherry-pick 1c26c3d66`. **Vor** Schritt 3
      ausführen, sonst kollidiert der Pick mit dem neu geschriebenen `cmd_claim`. Konflikte in
      `agent-lock.sh` zugunsten beider Seiten auflösen (die Argument-Validierung und die
      Extraktion aus Schritt 1 sind unabhängig). Der Commit-Autor bleibt erhalten.

- [x] **Schritt 3 — Harness-Variable.** `_my_sid` so umbauen, dass es die erste nicht-leere unter
      `CLAUDE_CODE_SESSION_ID` und `CLAUDE_SESSION_ID` nimmt, danach `AGENT_LOCK_SID`, danach den
      Unix-Fallback. Die Reihenfolge ist normativ in der Delta-Spec festgehalten.

      `CLAUDE_SESSION_ID` bleibt akzeptiert — opencode und agy können es setzen, und die
      bestehenden Tests hängen daran. Die Namensliste gehört in **eine** Variable am Dateikopf,
      damit `_detect_tool` (Zeile 61, prüft dieselbe Variable) nicht auseinanderläuft.

- [x] **Schritt 4 — Branch-Auto-Fill.** In `cmd_claim` nach der Argument-Auswertung: Ist `BRANCH`
      leer, aus dem HEAD des Claim-Worktrees füllen (`git -C "${WT:-$PWD}" rev-parse
      --abbrev-ref HEAD`), nicht nur für branch-scoped Claims. Die bestehende Zeile 253
      (`[ "$SCOPE" = "branch" ] && [ -z "$BRANCH" ] && BRANCH="$ID"`) bleibt als Spezialfall
      davor stehen — für einen branch-Claim ist der Name die ID und nicht notwendig der HEAD.

      Schlägt `rev-parse` fehl (detached HEAD, kein Repo), bleibt das Feld leer und der Claim
      läuft trotzdem durch. Ein Claim darf an dieser Stelle nicht scheitern; das Feld ist
      Diagnose-Information, keine Vorbedingung.

- [x] **Schritt 5 — Reap-Härtung für tote Kurzläufer-Locks (T002341-M3, T002372 dritter Effekt).**
      Ein Claim, der in einem sofort endenden `bash -c` gesetzt wurde, trägt dessen PID als
      `owner_pid`; der nächste `reap` einer Parallelsession räumt ihn ab. Mit Schritt 3 ist
      `owner_sid` nicht mehr numerisch, und `_sid_alive` behandelt nicht-numerische SIDs bereits
      als lebendig (Zeilen 45–48) — die Härtung fällt damit als Nebeneffekt an.

      **Das ist zu belegen, nicht anzunehmen:** ein Test, der einen Lock mit toter `owner_pid` und
      nicht-numerischer `owner_sid` anlegt und prüft, dass `reap` ihn stehen lässt, bis die
      Heartbeat-TTL abläuft.

- [x] **Schritt 6 — Den Scheintest ersetzen.** `tests/spec/agent-lock-session-identity.bats:32`
      setzt `CLAUDE_SESSION_ID` selbst und prüft dann, dass es verwendet wird. Der Test war grün,
      während der Mechanismus in der realen Umgebung nie griff — dieselbe Fehlerklasse, die `p7`
      behandelt, mitten im Locking-Cluster.

      Der Ersatztest setzt **`CLAUDE_CODE_SESSION_ID`** (die real exportierte Variable) und lässt
      `CLAUDE_SESSION_ID` bewusst ungesetzt. Der bestehende Test bleibt zusätzlich erhalten, damit
      die Rückwärtskompatibilität geprüft ist.

- [x] **Schritt 7 — Test: Release über die Tool-Call-Grenze.** Der Test, der den ursprünglichen
      Befund reproduziert: `claim` und `release` in **getrennten** Subshells mit derselben
      Harness-Variable, unterschiedlicher Unix-SID. `release` muss ohne `--force` durchlaufen.
      Die Unix-SID-Differenz wird im Test durch zwei separate `bash -c`-Aufrufe erzeugt.

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats tests/spec/active-sessions-hub.bats
wc -l < scripts/agent-lock.sh   # muss unter 500 liegen
bash -n scripts/agent-lock.sh scripts/agent-lock-guards.sh
```

Manueller Gegenbeweis am lebenden System (die drei Mishaps sind so entstanden):

```bash
bash -c 'bash scripts/agent-lock.sh claim ticket T099999 --label probe'
bash -c 'bash scripts/agent-lock.sh release ticket T099999'   # muss ohne --force durchlaufen
```

## Abgrenzung

- `.githooks/pre-commit` gehört `p6` und wird hier **nicht** angefasst. Die Guard-Extraktion ist
  bewusst so gebaut, dass die Aufrufschnittstelle gleich bleibt.
- Der `PreToolUse`-Hook gehört `p2`.
