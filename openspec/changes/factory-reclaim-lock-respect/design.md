---
ticket_id: T002267
plan_ref: openspec/changes/factory-reclaim-lock-respect/tasks.md
status: active
date: 2026-07-27
---

# Design: factory-reclaim-lock-respect

_Ticket: T002267 — Folge aus dem T002255/T002256-Zyklus._

## Problem

Ein Ticket soll normal in die Factory gestaget werden und in der Queue sichtbar bleiben,
aber jederzeit interaktiv übernehmbar sein. Am 2026-07-27 (T002255) griff der Factory-Tick
ein Ticket unmittelbar nach `ticket.sh stage-plan` (`status=in_progress`, `pipeline_slot=1`).
Zurückholen ging nur über `status=blocked` — semantisch falsch, weil der Plan fertig ist.

## Korrigierter Befund

Der erste Entwurf dieses Designs nahm an, dem Dispatcher fehle ein ticket-scoped Lock-Check.
**Das war falsch.** Der Check existiert dreifach und ist korrekt:

| Datei | Zeile | Status |
|---|---|---|
| `scripts/factory/factory-prep-runner.sh` | 67–75 | aktiv |
| `scripts/factory/factory-prep-bridge.sh` | 100–107 | aktiv |
| `scripts/factory/dispatcher-prep.sh` | 82–90 | verwaist (kein Aufrufer) |

Alle drei fragen `agent-lock.sh check ticket <id>` ab und geben bei Exit 3 (`held`) den Slot
frei. Der `interactive-worker`-Sentinel in `dispatcher.js` ist davon unabhängig — nur ein
grober Kapazitätspuffer, nicht der Guard.

**Der Guard griff nicht, weil die Antwort falsch war.** `agent-lock.sh` stufte den Lock einer
lebenden Session als reapable ein, also meldete `check` `free`. Drei Ursachen in `_reapable`:

1. **`_sid_alive` erkennt Claude-Sessions nicht** (Zeile 48–49): numerische SIDs werden per
   `pgrep -s` geprüft; die Claude-Session-SID ist numerisch, wird aber nicht gefunden.
   Verifiziert: `pgrep -s 771140` schlägt fehl, während die Session läuft.
2. **Ein lebender `owner_pid` galt nicht als Lebensbeweis.** Der pid-Zweig (Zeile 144–151)
   reapt nur bei *totem* Prozess; ein lebender fiel durch zu `sid-dead` (Zeile 153–161).
3. **Branch-scoped Claims tragen `branch: ""`** — der Name steht in `id`, `--branch` wird nie
   übergeben. Der worktree+branch-Fallback (T002204, Zeile 137–141) verlangt aber ein
   nicht-leeres `branch`-Feld. Verifiziert an zwei Locks derselben SID: der Ticket-Lock
   (mit `branch`) war `live`, der Branch-Lock (ohne) `stale`.

Damit hing der gesamte Schutz an einem einzigen Pfad — dem worktree+branch-Match — und fiel
weg, sobald dessen Bedingungen nicht exakt erfüllt waren.

## Lösung

### 1. Lebender Prozess schützt den Claim

In `_reapable`, unmittelbar nach dem worktree+branch-Fallback:

```bash
pid="$(_lock_field "$f" owner_pid)"
if [ -n "$pid" ] && _pid_alive "$pid"; then return 1; fi
```

Ein laufender Halter-Prozess ist der direkteste verfügbare Lebensbeweis und muss die
nachfolgenden Reap-Pfade (`worktree-missing`, `sid-dead`, `heartbeat-ttl`) überstimmen. Die
Umkehrung gilt ausdrücklich **nicht**: ein toter `owner_pid` bleibt nach den bestehenden
Regeln reapable — ein lebender pid ist Beweis für Leben, seine Abwesenheit kein Beweis für
Schutz. Eine Gegenprobe sichert das ab.

### 2. Branch-Claims tragen ihren Branch

In `cmd_claim`, nach dem Argument-Parsing:

```bash
[ "$SCOPE" = "branch" ] && [ -z "$BRANCH" ] && BRANCH="$ID"
```

Damit greift der T002204-Fallback auch für branch-scoped Claims. Ein explizit übergebenes
`--branch` hat Vorrang.

### 3. `ticket.sh reclaim <id>`

Neues Skript `scripts/ticket-reclaim.sh`, dispatcht aus `ticket.sh`:

1. Worker-Liveness aus `updated_at` bestimmen — dieselbe Schwelle wie `watchdog.sh`
   (`FACTORY_STALE_MIN`, Default 30), damit sich beide Urteile nicht widersprechen.
2. Lebt ein Worker und fehlt `--force`: abbrechen, nichts verändern, Slot/Status/Alter nennen.
3. Sonst: Slot freigeben, Status auf **`plan_staged`**, Ticket claimen.

`plan_staged` statt `blocked` ist der Kern: der Plan ist fertig, die Zuständigkeit drückt der
Lock aus, nicht der Status. Nach dem Claim überspringt der vorhandene T000510-Guard das
Ticket — jetzt, wo `check` die Wahrheit sagt.

## Abgrenzung

- `queue.sh`, `dispatcher.js` und der T000510-Guard bleiben unverändert.
- Der verwaiste `dispatcher-prep.sh` wird **nicht** entfernt — eigener Chore, nicht Teil
  dieses Fixes.
- Zurückgestellt: zwei Tickets auf demselben Plan/Branch (der T002256-Fall).
- `_sid_alive` selbst wird nicht umgebaut. Der pid-Pfad deckt den Fall ab; ein Eingriff in
  die SID-Auflösung hätte deutlich größere Reichweite.

## Test-Strategie

Verhaltenstests statt Content-Assertions: `agent-lock.sh` ist über `AGENT_LOCK_DIR` und
`AGENT_LOCK_FAKE_ALIVE` isoliert testbar. Lock-Dateien werden mit kontrollierten Feldern
(SID, PID, Worktree, Branch, Alter) erzeugt und `check` gegen den Exit-Code geprüft.

Zusätzlich Regressionswächter, dass der T000510-Guard in beiden aktiven prep-Skripten
erhalten bleibt — er ist korrekt und darf bei diesem Fix nicht verloren gehen.
