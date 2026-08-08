---
title: "p3-poller — GitHub-Poller und Entkernung der CI-Schreibpfade"
ticket_id: T002626
domains: [scripts, factory, infra]
status: active
---

# p3-poller — GitHub-Poller und Entkernung der CI-Schreibpfade

Stellt den CI-Rueckkanal her. GitHub kann den Dev-Host nicht erreichen, also holt ein lokaler
Poller aktiv. Erst wenn er nachweislich arbeitet, verlieren die CI-Schritte ihre
Ticket-Aufgaben. Setzt p2 voraus.

## File Structure

| Datei | Rolle | S1-Budget |
|---|---|---|
| `scripts/factory/github-poller.sh` | neu — Merges, PR-Zustand, Checks | `.sh` / 800, Budget 800 |
| `systemd/sdlc-github-poller.service` | neu — Poller-Unit | n/a |
| `systemd/sdlc-github-poller.timer` | neu — Poll-Intervall | n/a |
| `.github/workflows/post-merge.yml` | geaendert — Ticket-Schritte entfernen | n/a (338 Zeilen, `.yml` ohne S1-Limit) |

## Aufgaben

### 1. Cursor-Ablage anlegen

Der Cursor liegt in der lokalen Datenbank, nicht in einer Datei: eine Datei auf der
Workstation ginge mit ihr verloren, und der Cursor gehoert zum Zustand, den das Backup aus p1
ohnehin sichert. Je Aufgabe (Merges, PR-Zustand, Checks) ein eigener Eintrag, damit ein
Fehler in einer Aufgabe die anderen nicht zurueckwirft.

### 2. `scripts/factory/github-poller.sh` schreiben

Drei Aufgaben in einem Lauf, jede fuer sich abbrechbar:

- **Merges** — gemergte PRs seit Cursor holen, Ticket-Referenz aus Branch bzw. PR-Titel
  aufloesen, Ticket lokal auf `done` / `shipped` setzen. Uebernimmt die Logik aus
  `scripts/factory/auto-close-merged.sh`, die bereits pull-basiert arbeitet — einschliesslich
  ihrer Sonderfaelle (plan-only-PRs werden nicht als Abschluss gewertet, T002603).
- **PR-Zustand** — offene PRs und ihr Zustand nach `tickets.pr_events`.
- **Check-Laeufe** — Ergebnisse der Checks nach `tickets.pr_events`.

`tickets.pr_events` existiert bereits und ist leer; die Tabelle war vorgesehen, wurde aber nie
befuellt. Sie wird hier erstmals benutzt.

**Cursor-Reihenfolge (D3):** Der Cursor rueckt **nach** dem erfolgreichen lokalen Schreiben
vor, niemals davor. Daraus folgt at-least-once-Zustellung, und daraus folgt die Pflicht zu
idempotenten Schreibvorgaengen — `ON CONFLICT` auf der PR-Nummer, Statuswechsel nur vorwaerts.
Die umgekehrte Reihenfolge waere einfacher zu schreiben und verloere genau die Ereignisse, die
die DoD schuetzen soll.

**Fehlerverhalten:** Ein API-Fehler oder ein Rate-Limit bricht den Lauf ab und laesst den
Cursor stehen. Der naechste Timer holt nach. Kein Teil-Vorruecken, keine stille Auslassung.

### 3. Als Timer einrichten

User-Units, wie die Factory. Das Intervall orientiert sich am Factory-Tick (5 min) — haeufiger
bringt nichts, weil die Ereignisse ohnehin nur bei laufender Workstation verarbeitet werden.

### 4. Poller nachweisen, BEVOR die CI-Schritte fallen

Reihenfolge ist bindend (R1). Nachweis vor dem naechsten Schritt: Poller anhalten, einen PR
mergen, Poller starten, pruefen dass das Ticket geschlossen wird. Erst wenn das reproduzierbar
funktioniert, geht es weiter.

Der Fehler, gegen den diese Reihenfolge schuetzt, ist besonders unangenehm, weil er nicht
knallt: entfernt man die CI-Schritte zu frueh, bleiben Tickets nach dem Merge einfach offen
liegen, und das faellt erst Tage spaeter bei einer Durchsicht auf.

### 5. `post-merge.yml` entkernen

Die fuenf `TICKET_CTX=fleet`-Bloecke und die daran haengenden Ticket-Aufrufe
(`update-status --status awaiting_deploy`, `update-status --status done`,
`devflow-post-merge-ticket-closure.sh`) entfallen ersatzlos. Was der Workflow sonst tut —
Deploy-Ausloesung, Artefakt-Erzeugung — bleibt unangetastet.

## Verifikation dieses Partials

```bash
bash scripts/factory/github-poller.sh --once --dry-run
grep -c 'TICKET_CTX=fleet' .github/workflows/post-merge.yml
```

Erwartet: der Dry-Run listet die zu verarbeitenden Ereignisse ohne zu schreiben; die
`grep`-Zaehlung ergibt 0.
