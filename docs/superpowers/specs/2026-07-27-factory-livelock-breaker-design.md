# Design: Factory-Livelock-Breaker (T002361)

## Problem

Ein Ticket kann den Dry-Run-First-Zustand der Software Factory nie verlassen, wenn der
Dry-Run abbricht, bevor er seinen Marker setzt. Der Watchdog wirft es alle 30 Minuten
zurück in die Queue, die Queue dispatcht es binnen ~60 Sekunden erneut, die Pipeline
stirbt wieder. Jede Runde startet eine headless `claude -p`-Session. Es gibt weder einen
Zähler, noch ein Limit, noch eine Eskalation.

Beobachtet am 2026-07-27 an T002282 (~7 Zyklen ab 13:29 UTC), T002307 und T002338. Live
reproduziert: T002338 manuell auf `plan_staged` gesetzt (17:05:22), 60 Sekunden später
wieder `in_progress` (17:06:22) — ohne Phase-Event, ohne Kommentar, ohne Fortschritt.

### Mechanik

1. `scripts/factory/factory-prep-runner.sh:58-64` ruft `guard_dryrun_ok`. Schlägt der
   fehl, wird `dry_run=true` erzwungen.
2. `scripts/factory/guards.sh:56-62` gibt nur 0 zurück, wenn `ticket.sh dryrun-check`
   erfolgreich ist. Fail-closed: auch ein Leseefehler bedeutet „nicht ok".
3. `scripts/ticket.sh:495-509` prüft, ob `tickets.factory_control` den Key
   `dryrun:<ext_id>` enthält. Gesetzt wird er ausschließlich von `cmd_dryrun_mark`
   (Zeile 479) — also nach einem erfolgreich durchgelaufenen Dry-Run.

Bricht der Dry-Run vor dem Marker ab, fehlt der Marker weiterhin. Der nächste Dispatch
erzwingt erneut `dry_run=true`. Der Watchdog (`scripts/factory/watchdog.sh:35-42`) setzt
das stale `in_progress` mit Plan-Ref korrekt auf `plan_staged` zurück — und schließt damit
den Kreis.

### Warum das ein eigenständiger Defekt ist

Nicht der Backend-Ausfall ist der Befund. In der Nacht zum 2026-07-27 zeigte
`journalctl --user -u factory.service` wiederholt `API Error: Unable to connect to API
(ConnectionRefused)` gegen `ANTHROPIC_BASE_URL=http://localhost:18235`. Zum Prüfzeitpunkt
war der Proxy wieder gesund und der Livelock nicht aktiv — die Konstruktion, die ihn
erzeugt, besteht unverändert fort. Der Defekt ist, dass ein beliebiger, auch kurzer
Ausfall ein Ticket in eine Schleife ohne Selbstheilung und ohne Sichtbarkeit überführt.

### Prior Art: T001816 hat nur den Happy Path geschlossen

Der archivierte Change `openspec/changes/archive/2026-07-14-factory-dryrun-mark-loop/`
behandelte dieselbe Bugklasse: damals rief der `DRY_RUN`-Zweig `dryrun-mark` überhaupt
nicht auf, T001800 und T001813 hingen stundenlang. Der Fix ergänzte den Aufruf — für den
Fall, dass der Dry-Run *durchläuft*.

T002361 ist kein Rückfall, sondern der unabgedeckte Zweig derselben Konstruktion: Abbruch
*vor* dem Marker. Zweiter Produktivvorfall, gleiche Wurzel. Das ist das Argument dafür,
diesmal die Schleife selbst zu begrenzen statt einen weiteren Marker-Pfad zu ergänzen.

## Scope

Bewusst klein gehalten, damit der Fix nicht auf T002359 oder ein Epic warten muss.

**Im Scope:** Attempt-Zähler mit Fortschritts-Reset, `unfactory`-Terminalzustand,
deterministischer `dryrun-mark`.

**Herausgelöst:**

| Ticket | Inhalt | Grund |
|---|---|---|
| T002369 | Modell-Eskalationsleiter gemma → deepseek-flash → deepseek-pro | `blocked_by` T002359: DeepSeek ist strukturell unerreichbar |
| T002370 | Epic: slot-gebundener Kontextraum je Factory-Slot | Definiert das Ausführungsmodell neu, gehört nicht an einen Bugfix |

**Ausdrücklich nicht im Scope:** `guard_dryrun_ok` bleibt fail-closed — für einen
Kill-Switch ist das richtig. Die Preflight-Prüfung auf `ANTHROPIC_BASE_URL` bleibt bei
T002359, sonst entsteht Doppelarbeit im selben Codebereich.

## Architektur

### Komponente 1 — Attempt-Zähler mit Fortschritts-Reset

Ein Zähler in `tickets.factory_control` unter dem Key `factory_attempt:<ext_id>`.

**Der Zähler MUSS mit non-NULL `brand` geschrieben werden.** `factory_control` hat
`UNIQUE (key, brand)`, und Postgres behandelt NULL-Werte in Unique-Constraints als
distinct. Genau deshalb nutzt `cmd_factory_control set` bewusst DELETE-then-INSERT statt
`ON CONFLICT` — der Kommentar dort verweist auf T000474 („ON CONFLICT never fires for the
global row → duplicates → kill-switch fail-open"). `cmd_dryrun_mark` (`ticket.sh:479`)
verletzt das: es nutzt `ON CONFLICT (key, brand) DO UPDATE` mit `brand = NULL`, was nie
feuert; wiederholte Aufrufe legen Duplikat-Zeilen an. Für `dryrun-check` bleibt das
harmlos (`LIMIT 1`), für einen Zähler wäre ein Increment auf Duplikaten bedeutungslos.
Mit non-NULL `brand` greift der Constraint wirklich und `ON CONFLICT` ist atomar. In
`watchdog.sh` ist `$BRAND` bekannt.

**Reset bei echtem Fortschritt.** Ein Zähler, der nie zurückgeht, sperrt irgendwann jedes
langlebige Ticket aus. Deshalb pro stale erkanntem Ticket ein Compare-and-Set in einem
Statement:

- Ist `MAX(tickets.factory_phase_events.at)` für das Ticket **neuer** als
  `tickets.factory_control.updated_at` des Zählers, gab es seit dem letzten Increment
  echten Fortschritt → Zähler auf `1`.
- Sonst → Zähler `+1`.

Der Vergleich unterscheidet damit „hängt seit N Runden" von „arbeitet, ist nur langsam".
Er stützt sich bewusst auf `factory_phase_events` und nicht auf `updated_at` des Tickets:
`fn_lifecycle_ts` bumpt `updated_at` bei jedem Zeilen-Write, ein Phase-Event dagegen
bedeutet einen tatsächlich erreichten Phasenübergang.

**Keine Migration nötig.** `factory_control.updated_at` und `factory_phase_events.at`
existieren beide, inklusive Index `factory_phase_events_ticket_at_idx (ticket_id, at DESC)`.
Der Vergleich braucht nur diese zwei vorhandenen Zeitstempel — keine neue Spalte, keine
neue Tabelle.

**Warum nicht `tickets.retry_count`.** Das Feld ist belegt: `scripts/factory/pipeline.mjs`
liest es in Zeile 532 und inkrementiert es in Zeile 541 als CI-Selbstheilungs-Zähler mit
Limit 2 im Deploy-Loop. Eine Doppelnutzung würde in beide Richtungen kollidieren — ein
Ticket mit zwei CI-Retries wäre sofort watchdog-erschöpft, und der Deploy-Loop sähe einen
von Watchdog-Resets aufgeblähten Wert und ginge verfrüht auf `blocked`.

### Komponente 2 — `unfactory` als Terminalzustand

Erreicht der Zähler `FACTORY_MAX_ATTEMPTS` (Default `3`, also ~90 Minuten bei
`FACTORY_STALE_MIN=30`), setzt der Watchdog nicht auf `backlog`/`plan_staged` zurück,
sondern ruft `ticket.sh unfactory`.

Ein neues `ticket.sh unfactory --id <ext_id>` bündelt drei Effekte, damit kein
Zwischenzustand entstehen kann:

1. `status = blocked`
2. `attention_mode = needs_human`
3. `readiness.factory_excluded = true`
4. Abschlusskommentar mit Zählerstand und letztem Phase-Event

**Der Ausschluss greift fail-closed in `queue.sh`.** Beide Dispatch-Zweige (Zeilen 19 und
25) erhalten `AND COALESCE((readiness->>'factory_excluded')::boolean, false) = false`. Der
Default `false` ist korrekt — die Abwesenheit des Flags darf nicht jedes bestehende Ticket
ausschließen; das entspricht der Konvention von `lastenheft_locked` (Default false) und
`execution_released` (Default true).

Der `status = blocked` allein würde die Schleife schon brechen, weil `queue.sh`
ausschließlich `feature/backlog` und `task/plan_staged` dispatcht. Das Flag ist die
*dauerhafte* Absicherung: es hält das Ticket auch dann draußen, wenn der Status später von
Hand oder durch ein anderes Skript auf `plan_staged` zurückgedreht wird. Der Rückweg ist
ausschließlich menschlich (`ticket.sh plan-meta set --readiness factory_excluded=false`)
— das ist die Bedeutung von „not getting queued again".

Slot-Freigabe und Zombie-Worktree-Cleanup laufen im Eskalationsfall **unverändert weiter**.
Die Eskalation ersetzt nur das Status-Ziel, nicht die Aufräumarbeit.

### Komponente 3 — `dryrun-mark` deterministisch

Der `dryrun-mark`-Aufruf steht heute in `pipeline.mjs:486` **innerhalb eines
Agent-Prompts** — als Textanweisung an eine headless `claude -p`-Session. Damit hängt ein
zwingender Zustandsübergang an zwei Bedingungen, die beide kippen können: die Session muss
leben, und das Modell muss die Anweisung befolgen.

Die Marker-Zeile wandert aus dem Prompt in deterministischen Code nach dem
`agent()`-Return im `DRY_RUN`-Zweig. Damit gilt: Dry-Run vollständig durchgelaufen ⇒
Marker gesetzt. Stirbt die Session, wirft `agent()`, der Marker bleibt korrekt ungesetzt —
und Komponente 1 begrenzt die Folge.

Die `release-slot`- und `update-status`-Schritte bleiben im Prompt. Nur die Marker-Zeile
wandert heraus, weil sie die einzige ist, deren Ausfall eine Endlosschleife erzeugt.

## Datenfluss

```
Watchdog-Tick (alle ~30 min)
  │
  ├─ stale in_progress erkannt
  │
  ├─ Compare-and-Set factory_attempt:<id> (brand non-NULL)
  │    MAX(phase_events.at) > factory_control.updated_at ?
  │      ja  → 1   (echter Fortschritt seit letztem Increment)
  │      nein → +1
  │
  ├─ Slot freigeben + Zombie-Worktree entfernen   (unverändert)
  │
  └─ Zähler < FACTORY_MAX_ATTEMPTS ?
       ja   → status = backlog | plan_staged      (unverändert)
       nein → ticket.sh unfactory
                status=blocked
                attention_mode=needs_human
                readiness.factory_excluded=true
                → queue.sh dispatcht nie wieder (fail-closed)
```

## Fehlerbehandlung

Der Watchdog ist heute fail-open gebaut: Zombie-Cleanup-Fehler brechen die Schleife nicht
(`|| true`). Das bleibt so. Für die neuen Teile gilt:

- Ist der Zähler nicht lesbar oder nicht schreibbar, verhält sich der Watchdog wie heute
  (Reset auf `backlog`/`plan_staged`) und protokolliert den Fehler. Ein
  DB-Kommunikationsproblem darf nicht dazu führen, dass Tickets auf `blocked` landen —
  das wäre ein neuer, schlimmerer Fehlermodus als der behobene.
- `unfactory` ist dagegen fail-closed in dem Sinn, dass alle vier Effekte in einem
  Statement-Block laufen. Ein halb angewandter Terminalzustand (Status `blocked`, aber
  kein Flag) wäre stillschweigend rückholbar.

## Tests

Failing Test zuerst, nach `tests/spec/software-factory.bats` — die Spec-Datei zum SSOT
`openspec/specs/software-factory.md`. Die Datei existiert (4298 Zeilen) und ist nicht
S1-gated.

Abzudeckende Fälle:

1. Zähler inkrementiert bei stale ohne Phase-Event.
2. Zähler wird auf 1 zurückgesetzt, wenn ein Phase-Event neuer ist als der Zähler-Write.
3. Bei Erreichen des Limits: `status=blocked`, `attention_mode=needs_human`,
   `readiness.factory_excluded=true`.
4. `queue.sh` liefert ein Ticket mit `factory_excluded=true` nicht aus — auch nicht mit
   `status=plan_staged`.
5. Der `DRY_RUN`-Zweig ruft `dryrun-mark` außerhalb des Agent-Prompts auf (Regression zu
   T001816, das die Prompt-Variante etablierte).

Kollisionshinweis: T002327 fasst `tests/spec/software-factory.bats` ebenfalls an, arbeitet
aber in anderen Requirements und append-only. Konfliktrisiko gering, aber vorhanden.

## SSOT-Delta

Zwei **MODIFIED**-Requirements in `openspec/specs/software-factory.md`:

- „Watchdog-Eskalation und Zombie-Cleanup" (Zeile 182) — der Watchdog wird von zustandslos
  auf zählend erweitert. Das ist eine echte Erweiterung des Kontrakts, nicht eine
  Präzisierung: das Requirement beschreibt heute ausdrücklich nur „stale ja/nein".
- „Dry-run-first tickets graduate to a real run" (Zeile 900) — die Marker-Setzung wandert
  vom Agent-Prompt in deterministischen Code.

Beide Requirements existieren bereits, also `MODIFIED`, nicht `ADDED`. Die Delta-Datei
heißt nach dem Parent-SSOT-Slug (`software-factory.md`), nicht nach dem Change-Slug. Die
SSOT selbst wird in diesem Change **nicht** direkt editiert — das Mergen ist Aufgabe des
`archive`-Schritts.

## Abhängigkeiten

Keine. T002361 ist bewusst unabhängig von T002359 und T002370 gehalten.

T002369 (Modell-Leiter) ist `blocked_by` T002361, weil sie diesen Zähler liest und auf
einen Tier mappt.
