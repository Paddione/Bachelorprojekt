---
title: "mishap-t002261 — Implementation Plan"
ticket_id: T002261
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002261 — Implementation Plan

_Ticket: T002261 — Mishap-Bundle aus der Session vom 2026-07-27 (drei Befunde)._

Alle drei Befunde teilen ein Muster: **eine Operation meldet Erfolg oder schweigt,
obwohl sie nichts bewirkt hat.** Der Fix besteht jeweils darin, den stillen Pfad
sichtbar zu machen — nicht darin, das Verhalten zu ändern.

## File Structure

| Datei | Rolle in diesem Plan |
|---|---|
| `scripts/agent-lock.sh` | Mishap 1: `cmd_release` gibt bei SID-Mismatch eine Diagnosezeile aus |
| `scripts/index-repo-incremental.sh` | Mishap 2: Fehler nicht mehr mit `2>/dev/null` und `|| true` verschlucken |
| `.claude/skills/references/mcp-tool-guide.md` | Mishap 3: Hinweis am `psql()`-Helper zu Timeout und Ergebnis-Verifikation |
| `tests/spec/agent-lock-session-identity.bats` | Guard für Mishap 1 (bestehende Suite, ebenfalls aus einem Mishap-Bundle entstanden) |
| `tests/unit/scs-index.bats` | Guard für Mishap 2 (bestehende Suite, offline-safe) |

## Task 1 — RED: Guards schreiben, die auf dem aktuellen Stand fehlschlagen

Zwei neue `@test`-Blöcke in bestehende Suiten aufnehmen (keine neuen
ticketnummerierten Dateien, siehe BATS-Konvention in `CLAUDE.md`):

1. In `tests/spec/agent-lock-session-identity.bats`: `cmd_release` muss bei
   SID-Mismatch etwas auf stderr ausgeben. Prüfbar ohne echten Lock, indem die
   Funktion mit einem fremden `owner_sid` in einer temporären Lock-Datei
   aufgerufen wird und stderr nicht leer sein muss.
2. In `tests/unit/scs-index.bats`: `scripts/index-repo-incremental.sh` darf
   `npx tsx` nicht mit `2>/dev/null` aufrufen und den Exit-Code nicht mit
   `|| true` verwerfen. Statischer Grep, offline-safe wie der Rest der Datei.

Beide Guards laufen lassen — sie müssen rot sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
tests/unit/lib/bats-core/bin/bats tests/unit/scs-index.bats
# expected: FAIL — die beiden neuen Guards sind rot, die Fixes fehlen noch
```

## Task 2 — Mishap 1: `agent-lock.sh release` schweigt bei SID-Mismatch

`cmd_release()` (`scripts/agent-lock.sh`) löscht die Lock-Datei nur, wenn
`owner_sid == _my_sid`, und liefert sonst `return 1` **ohne jede Ausgabe**. Da
jeder Bash-Aufruf eines Agents eine neue Shell mit neuer SID ist, gehört ein in
Aufruf A geclaimter Lock praktisch nie der Shell von Aufruf B — `release`
braucht im Agent-Betrieb also fast immer `--force`, was nirgends dokumentiert
ist. Beobachtet am 2026-07-27: der Lock blieb unbemerkt als `stale` liegen, bis
`agent-lock.sh list` es aufdeckte.

Fix: bei SID-Mismatch eine Zeile auf stderr ausgeben, die beide SIDs und den
Ausweg nennt, zum Beispiel
`release: lock owned by SID <x>, current SID <y> — use --force`.
Rückgabewert bleibt `1`, damit sich aufrufende Skripte nicht anders verhalten.

## Task 3 — Mishap 2: `index-repo-incremental.sh` verschluckt jeden Fehler

Das Skript ruft `npx tsx scripts/index-repo.ts --file "$f" 2>/dev/null` auf und
hängt `|| true` an. Damit ist ein Fehlschlag strukturell unsichtbar: keine
Meldung, kein Exit-Code. Der Schwester-Hook `.githooks/post-commit-index` macht
es richtig (er fängt den Fehler und gibt `[SCS] WARN: reindex failed for $f`
plus die letzten Zeilen der Ausgabe aus) — dieses Muster hierher übernehmen.

Zweiter, wichtigerer Teil desselben Befunds: der SCS-Index gilt als „nach jedem
Commit aktuell", ist es aber nicht. `makePool()` in `scripts/index-repo.ts`
fällt ohne `PGHOST` auf `localhost:5432` zurück, wo lokal nichts lauscht — jeder
lokale Commit-Reindex scheitert deshalb mit `ECONNREFUSED`. Diese Erwartung im
Skriptkopf klarstellen: ohne aktiven Port-Forward auf die Cluster-DB ist der
inkrementelle Reindex ein No-op, und der Index wird erst beim nächsten
vollständigen `task scs:index` aktuell.

## Task 4 — Mishap 3: `kubectl exec … psql` liefert irreführende Exit-Codes

Ein `timeout 60 kubectl exec <pgpod> … psql -c "UPDATE …"` gegen `fleet` endete
mit Exit 143 und `Terminated`, obwohl das `UPDATE` vollständig committet war —
der Timeout traf erst den Session-Abbau von `kubectl exec`, nicht das Statement.
Ein Agent, der dem Exit-Code glaubt, ordnet die Änderung als fehlgeschlagen ein
und wiederholt sie womöglich. Bei einem idempotenten
`UPDATE … SET x = <konstante>` ist das harmlos, bei `INSERT`,
`UPDATE … SET n = n + 1` oder DDL nicht.

Fix in `.claude/skills/references/mcp-tool-guide.md`, direkt am `psql()`-Helper:
zwei Sätze, dass schreibende Aufrufe gegen `fleet` großzügiger getimeoutet
werden müssen (der Verbindungsabbau über WireGuard braucht messbar länger als
60 Sekunden) und dass das Ergebnis grundsätzlich per separatem `SELECT` zu
verifizieren ist, nicht am Exit-Code.

## Task 5 — GREEN: Guards müssen jetzt bestehen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
tests/unit/lib/bats-core/bin/bats tests/unit/scs-index.bats
```

Zusätzlich gegenprüfen, dass die Guards nicht trivial grün sind: die jeweilige
Änderung kurz zurückdrehen, den Test rot sehen, wieder herstellen.

## Task 6 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
