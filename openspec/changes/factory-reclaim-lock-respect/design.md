---
ticket_id: T002267
plan_ref: openspec/changes/factory-reclaim-lock-respect/tasks.md
status: active
date: 2026-07-27
---

# Design: factory-reclaim-lock-respect

_Ticket: T002267 — Folge aus dem T002255/T002256-Zyklus._

## Problem

Ein Ticket soll normal in die Factory gestaget werden und in der Queue sichtbar bleiben —
aber solange eine interaktive Session es hält oder kein Worker daran arbeitet, muss es sich
ohne Umwege entnehmen und selbst bearbeiten lassen. Heute geht beides nicht.

**Beobachtet am 2026-07-27 (T002255):** Direkt nach `ticket.sh stage-plan` griff der laufende
Factory-Tick das Ticket (`status=in_progress`, `pipeline_slot=1`), obwohl `dev-flow-plan`
laut Kontrakt bei `plan_staged` stoppt und dem Menschen die Ausführungswahl lässt.
Zurückholen ging nur über den Umweg `status=blocked`, weil `plan_staged` beim nächsten Tick
sofort erneut dispatcht worden wäre. `blocked` ist dabei semantisch falsch: der Plan ist
fertig, es blockiert nichts. Zusätzlich stand T002256 in der Queue, das auf denselben Plan
und Branch zeigte — zwei Agenten wären parallel auf einem Branch gelandet.

### Ursache

- `scripts/factory/queue.sh` selektiert `type='task' AND status='plan_staged'` **ohne jeden
  Claim-Check**.
- `scripts/factory/dispatcher.js:107-120` hat zwar einen Sentinel, aber er taugt nicht:
  er liest `agent-lock.sh list`, prüft per Regex auf das Label `interactive-worker` und
  reduziert dann lediglich `maxParallel` um 1. Das ist **ticket-unabhängig** — es hält
  allgemein einen Slot frei, statt ein bestimmtes Ticket zu überspringen. Und es ist
  **faktisch tot**, weil `dev-flow-plan`/`dev-flow-execute` mit den Labels `dev-flow-plan`
  bzw. `dev-flow-execute` claimen, nie mit `interactive-worker`.
- `scripts/factory/pipeline.js` setzt selbst **keinen** `agent-lock`; der Dispatcher kann
  Mensch- und Factory-Claims ohnehin nicht unterscheiden.

## Vorhandene Bausteine

Bemerkenswert: es fehlt kein einziger Mechanismus, nur ihre Verdrahtung.

| Baustein | Zustand |
|---|---|
| `agent-lock.sh check ticket <id>` | vorhanden, liefert `free`/`mine`/`held` |
| `agent-lock.sh claim ticket` | vorhanden, wird von beiden dev-flow-Skills gesetzt |
| `slots.sh release <ext_id>` / `ticket.sh release-slot` | vorhanden |
| Worker-Liveness | `watchdog.sh` nutzt `updated_at` als Heartbeat (`fn_lifecycle_ts`) |

Entscheidend ist der Kontrakt von `cmd_check` (`scripts/agent-lock.sh:268-273`):

```bash
if [ ! -f "$f" ] || _reapable "$f"; then echo "free"; return 0; fi   # kein ODER toter Lock
if [ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ]; then echo "mine"; ...; return 0; fi
echo "held"; cat "$f"; return 3                                       # fremde LEBENDE Session
```

Zeile 270 beantwortet die heikelste Frage von selbst: ein **toter** Lock meldet `free` und
blockiert die Factory nicht. Deshalb ist an `agent-lock.sh` **keine Zeile** zu ändern —
der Dispatcher muss diese API nur aufrufen.

## Lösung

### 1. Dispatcher respektiert ticket-scoped Locks

`dispatcher.js` ersetzt den `interactive-worker`-Regex-Sentinel durch eine **pro-Ticket**-
Prüfung: vor dem Slot-Claim `agent-lock.sh check ticket <ext_id>`; Exit 3 (`held`) →
Ticket überspringen, Exit 0 (`free`/`mine`) → wie bisher dispatchen.

Das Ticket bleibt dabei **in der Queue sichtbar** — `queue.sh` wird nicht angefasst. Genau
das ist gewollt: die Factory sieht es, fasst es aber nicht an. Der Skip wird geloggt, damit
ein übersprungenes Ticket nicht als stillschweigend verschwunden erscheint.

Der alte pauschale `maxParallel`-Abzug entfällt ersatzlos: er war ein grober Ersatz für
genau diese Prüfung und würde nach dem Fix nur noch grundlos Kapazität kosten.

### 2. `ticket.sh reclaim <id>`

Ein Kommando statt der heutigen Handarbeit:

1. Worker-Liveness prüfen — `pipeline_slot IS NOT NULL AND status='in_progress'` **und**
   `updated_at` jünger als die Stale-Schwelle (dieselbe Semantik wie `watchdog.sh`).
2. Lebt ein Worker → **abbrechen** mit Hinweis auf Slot, Status und Alter des letzten
   Fortschritts. Übernahme nur mit explizitem `--force`.
3. Sonst: Slot freigeben (`slots.sh release`), Status zurück auf **`plan_staged`** (nicht
   `blocked` — der Plan ist fertig), `agent-lock claim ticket` für die aufrufende Session.

Nach Schritt 3 lässt der Dispatcher das Ticket wegen (1) in Ruhe, ohne dass der Status
verbogen werden muss. Das ist der eigentliche Punkt: `plan_staged` bleibt der ehrliche
Zustand, und die Zuständigkeit wird über den Lock ausgedrückt, nicht über den Status.

### 3. Label-Konvention

Kein Umbau nötig: der neue Check ist label-agnostisch, weil er ticket-scoped fragt. Die
Regex auf `interactive-worker` verschwindet mit dem alten Sentinel; die vorhandenen Labels
`dev-flow-plan`/`dev-flow-execute` bleiben unverändert gültig.

## Abgrenzung

- **Zurückgestellt:** der T002256-Fall (zwei Tickets zeigen auf denselben Plan/Branch).
  Eigener Change — der Lock-Respekt entschärft ihn bereits teilweise, löst ihn aber nicht.
- `queue.sh` bleibt unverändert (Sichtbarkeit ist gewollt).
- `agent-lock.sh` bleibt unverändert (der Kontrakt genügt).
- `pipeline.js` setzt weiterhin keinen eigenen Lock — nicht nötig, da der Slot die
  Factory-seitige Belegung bereits abbildet.

## Test-Strategie

Alle Tests zuerst RED, in `tests/spec/factory-reclaim-lock-respect.bats`:

| Test | Prüft |
|------|-------|
| Dispatcher fragt pro Ticket | `dispatcher.js` ruft `agent-lock.sh check ticket` auf |
| Alter Sentinel ist weg | keine `interactive-worker`-Regex, kein `maxParallel`-Abzug mehr |
| Skip wird geloggt | übersprungenes Ticket erzeugt eine Log-Zeile |
| `reclaim` existiert | `ticket.sh` kennt das Kommando und listet es im Usage |
| `reclaim` setzt `plan_staged` | nicht `blocked` |
| `reclaim` gibt den Slot frei | `slots.sh release` bzw. `release-slot` wird aufgerufen |
| `reclaim` verweigert bei lebendem Worker | Abbruch mit Hinweis, Exit ≠ 0 |
| `--force` überschreibt | mit Flag auch bei lebendem Worker erfolgreich |
| toter Lock blockiert nicht | `check` liefert `free` bei reapable Lock (Regressionswächter) |

`queue.sh` muss weiterhin `plan_staged` selektieren — ein Regressionswächter stellt sicher,
dass die Sichtbarkeit nicht versehentlich mit weggefiltert wird.

## Gate-Notizen

`scripts/factory/dispatcher.js` — 210 Zeilen, `.js`-Limit 600, nicht gebaselined und nicht
ignoriert: echtes Budget **390**. Der Fix ersetzt den alten Sentinel-Block, wächst also kaum.

`scripts/ticket.sh` — 862 Zeilen, steht **namentlich auf der `s1.ignore`-Liste** in
`gates.yaml` (zusammen mit `scripts/factory/pipeline.js` und sechs weiteren). Das Gate
greift dort also nicht. Genau deshalb bekommt `reclaim` trotzdem ein **eigenes Skript**
(`scripts/ticket-reclaim.sh`), das `ticket.sh` nur noch dispatcht: die Ignore-Liste ist ein
Eingeständnis, kein Freibrief, und 862 Zeilen sind bereits jenseits dessen, was sich gut
lesen lässt. Das ist eine Qualitäts-, keine Gate-Entscheidung — sie wird hier festgehalten,
damit sie nicht später als überflüssig zurückgebaut wird.

Das neue `scripts/ticket-reclaim.sh` unterliegt dem regulären `.sh`-Limit 500 und wird mit
großem Abstand darunter geschnitten. S4 (Orphan-Gate) ist erfüllt: es wird von `ticket.sh`
referenziert.
