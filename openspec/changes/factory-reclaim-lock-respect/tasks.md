---
title: "factory-reclaim-lock-respect — Implementation Plan"
ticket_id: T002267
domains: [factory, scripts, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-reclaim-lock-respect — Implementation Plan

_Ticket: T002267 — Folge aus dem T002255/T002256-Zyklus._
_Design: `openspec/changes/factory-reclaim-lock-respect/design.md`_

## File Structure

```
scripts/agent-lock.sh                            (mod)  — lebender pid schuetzt; branch-Feld fuellen
scripts/ticket-reclaim.sh                        (neu)  — reclaim-Logik
scripts/ticket.sh                                (mod)  — dispatcht `reclaim`
tests/spec/factory-reclaim-lock-respect.bats     (neu)  — 18 Verhaltenstests
```

### S1-Budgets

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/agent-lock.sh` | 448 | 52 |
| `scripts/ticket-reclaim.sh` | 101 | 399 |

`scripts/ticket.sh` steht namentlich auf der `s1.ignore`-Liste in
`docs/code-quality/gates.yaml`; das S1-Gate greift dort nicht. Die `reclaim`-Logik wird
trotzdem in ein eigenes Skript **extrahiert** statt die Datei weiter wachsen zu lassen — der
Split haelt sie bis auf den Dispatch-Zweig zeilenneutral.

> **Divergenz-Befund:** der Plan-Linter kennt `s1.ignore` nicht und rechnet fuer `ticket.sh`
> ein Restbudget von −362 (862 − 500). Das echte Gate liefert fuer dieselbe Datei `null`.
> Die beiden Werkzeuge widersprechen sich; hier folgenlos, weil ohnehin ausgelagert wird.
> Eigenes Ticket wert.

`scripts/agent-lock.sh` liegt mit 448 von 500 Zeilen bei ~90 % — die Aenderung umfasst nur
zwei Zeilen Logik plus Kommentar. Waechst die Datei kuenftig weiter, ist ein echter Split
faellig (Kandidat: die `cmd_*`-Ebene von den `_`-Helfern trennen).

<!-- vitest: kein neuer Test noetig — der Change fasst keine Datei unter
     website/src/lib/** oder website/src/pages/api/** an. -->

---

## Task 1 — RED-Nachweis (Failing-Test-Step)

`tests/spec/factory-reclaim-lock-respect.bats` beschreibt den Zielzustand als
**Verhaltenstest**: `agent-lock.sh` ist ueber `AGENT_LOCK_DIR` und `AGENT_LOCK_FAKE_ALIVE`
isoliert testbar, Lock-Dateien werden mit kontrollierten Feldern erzeugt.

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect.bats
# expected: FAIL — 12 von 18 Tests rot
```

Sechs Tests sind bereits gruen und muessen es bleiben — darunter die Gegenprobe
"toter owner_pid bleibt reapable" und die Waechter, dass der T000510-Guard in beiden aktiven
prep-Skripten erhalten bleibt.

> **Falle aus der RED-Phase:** ein frueherer Usage-Test matchte unqualifiziert gegen
> `$output`. `ticket.sh` gibt in seiner Usage-Zeile `$0` aus, und der Worktree-Pfad
> `.worktrees/factory-reclaim-lock-respect/…` enthaelt den Suchbegriff `reclaim` bereits —
> der Test war gruen, ohne etwas zu pruefen. Assertions gegen Kommando-Ausgaben deshalb
> immer auf die relevante Zeile einschraenken.

---

## Task 2 — `agent-lock.sh`: lebender Prozess schuetzt den Claim

In `_reapable`, unmittelbar nach dem worktree+branch-Fallback (T002204) und **vor** den
Reap-Pfaden:

```bash
pid="$(_lock_field "$f" owner_pid)"
if [ -n "$pid" ] && _pid_alive "$pid"; then return 1; fi
```

Der bestehende pid-Zweig darunter (Reap bei totem PID) bleibt unveraendert — er liest `pid`
jetzt nur nicht mehr selbst ein.

Begruendung fuer den Kommentar im Code: `_sid_alive` loest numerische SIDs per `pgrep -s`
auf und findet die Claude-Session-SID nicht, obwohl die Session laeuft (verifiziert:
`pgrep -s 771140` schlaegt fehl). Ein lebender `owner_pid` war bisher nirgends Lebensbeweis,
also fiel der Claim auf `sid-dead` durch und `check` antwortete `free` — woraufhin der
Factory-Dispatcher ein Ticket griff, das ein Mensch hielt.

Die Umkehrung gilt **nicht**: ein toter `owner_pid` bleibt reapable. Test 2 ist die
Gegenprobe und muss gruen bleiben.

---

## Task 3 — `agent-lock.sh`: branch-scoped Claims tragen ihren Branch

In `cmd_claim`, nach dem Argument-Parsing:

```bash
[ "$SCOPE" = "branch" ] && [ -z "$BRANCH" ] && BRANCH="$ID"
```

Fuer einen branch-scoped Claim ist der Branch-Name die `id`; Aufrufer uebergeben deshalb nie
`--branch`, und das leere Feld deaktivierte den worktree+branch-Fallback, der ein
nicht-leeres `branch` verlangt. Ein explizit uebergebenes `--branch` behaelt Vorrang.

---

## Task 4 — `scripts/ticket-reclaim.sh` anlegen

Neues Skript (~100 Zeilen):

1. Ticket-Zustand lesen (`status`, `pipeline_slot`, `updated_at`).
2. Worker-Liveness: `in_progress` **und** Slot gesetzt **und** `updated_at` juenger als
   `FACTORY_STALE_MIN` (Default 30) — dieselbe Schwelle wie `scripts/factory/watchdog.sh`,
   damit sich beide Urteile ueber "Worker lebt" nicht widersprechen.
3. Lebt ein Worker und fehlt `--force`: Exit ungleich 0, nichts veraendern, Slot/Status/Alter
   nennen und auf `--force` hinweisen.
4. Sonst: Slot freigeben, Status auf **`plan_staged`**, `agent-lock claim ticket`.

`plan_staged` statt `blocked` ist der Kern — der Plan ist fertig, die Zustaendigkeit drueckt
der Lock aus. `chmod +x` nicht vergessen (Test prueft das Executable-Bit).

---

## Task 5 — `ticket.sh`: `reclaim` dispatchen

Zwei Stellen: ein `reclaim)`-Zweig im `case`-Block, der per `exec` an
`scripts/ticket-reclaim.sh` weiterreicht, und `reclaim` in der `Commands:`-Zeile der Usage.
Bewusst kein Logik-Import.

---

## Task 6 — Verifikation

```bash
# 1. Alle Tests dieses Changes gruen
./tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect.bats

# 2. Regression: die bestehenden agent-lock-Suiten bleiben gruen
./tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-claim-persist.bats \
                                    tests/spec/agent-lock-session-identity.bats

# 3. Syntax
bash -n scripts/agent-lock.sh && bash -n scripts/ticket-reclaim.sh && bash -n scripts/ticket.sh

# 4. Live-Probe: der eigene Claim dieser Session muss `live` sein
bash scripts/agent-lock.sh list

# 5. Test-Inventar nach der neuen BATS-Datei regenerieren
task test:inventory

# 6. OpenSpec-Delta validieren
task openspec:validate

# 7. Mandatory CI-Gates
task test:changed
task freshness:regenerate
task freshness:check
```

Schritt 4 ist die Probe aufs Exempel: vor dem Fix zeigte `list` fuer branch-scoped Claims
`stale`, obwohl die Session lief.
