---
title: fleet-Ticketsequenz in getrennten Nummernraum, reproduzierbar verankert
ticket_id: T002731
domains: [bachelorprojekt-db, bachelorprojekt-infra]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fleet-sequence-split — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/sdlc/migrate-tickets.sh` | 482 | 318 |
| `tests/spec/sdlc-isolation/fleet-sequence-split.bats` | 113 | kein S1-Limit für `.bats` |
| `docs/sdlc-stack/e3-cutover.md` | Dokumentation | nicht metrikpflichtig |
| `website/src/data/test-inventory.json` | generiert | nicht metrikpflichtig |

`scripts/sdlc/migrate-tickets.sh` ist nicht gebaselinet; wirksame Schwelle ist das
`.sh`-Extension-Limit (800). Der Zuwachs liegt bei etwa 60 Zeilen und damit deutlich unter
80 % der Schwelle — kein Split nötig.

## Partials

| # | Rolle | Zieldateien |
|---|---|---|
| p1 | Skript + Doku | `scripts/sdlc/migrate-tickets.sh`, `docs/sdlc-stack/e3-cutover.md` |
| p2 | Tests | `tests/spec/sdlc-isolation/fleet-sequence-split.bats`, `website/src/data/test-inventory.json` |

## Task 1 — RED bestätigen

Der Failing-Test liegt im Branch. Vor der Implementierung seinen roten Zustand bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/fleet-sequence-split.bats
# expected: FAIL — 4 rot, 1 grün
```

Erwartet ist genau eine grüne Zeile: „an unknown subcommand is still rejected" ist die
Gegenprobe und belegt, dass das Skript nicht wahllos alles annimmt. Wäre auch sie rot, stimmte
etwas an der Aufrufmechanik und nicht am fehlenden Kommando.

Die übrigen vier scheitern erst **nach** ihrem Positiv-Anker — Test 1 liest die Kommandoliste
erfolgreich und stolpert dann über die fehlende `split-sequence`-Zeile, Test 5 findet den
`fleet`-Abschnitt und vermisst nur die Sequenzangabe. Scheitert einer bereits am Anker, ist der
Befund ein anderer als angenommen.

## Task 2 — `split-sequence` implementieren

Neues Subkommando `cmd_split_sequence()` in `scripts/sdlc/migrate-tickets.sh`, registriert im
`case`-Block bei den übrigen Kommandos und in der Usage-Ausgabe gelistet.

Verhalten:

- Liest fleets `tickets.external_id_seq`.
- Liegt der Wert unter 900000: `setval('tickets.external_id_seq', 900000, true)`, danach den
  alten und den neuen Wert ausgeben.
- Liegt er bereits bei 900000 oder darüber: nichts ändern und das ausdrücklich melden (der Test
  prüft auf `unveraendert` / `bereits` / `no change`).
- **Nie senken.** Der Vergleich ist eine untere Schranke, kein Setzen auf einen Festwert — eine
  Sequenz rückwärts zu stellen gäbe bereits vergebene Nummern erneut aus.
- `--dry-run` respektieren wie die bestehenden Kommandos: SQL zeigen, nicht ausführen.

Die Grenze 900000 als benannte Konstante nahe den übrigen Skript-Konstanten ablegen, nicht als
Literal an drei Stellen. Begründung im Kommentar: `LPAD(n,6,'0')` bleibt bis 999999
sechsstellig, ein höherer Startwert bräche das Format `^T[0-9]{6}$`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/fleet-sequence-split.bats
# Tests 1, 3 und 4 werden grün; Test 5 bleibt rot bis Task 4
```

## Task 3 — `restore` zieht die Trennung nach

`cmd_restore()` ruft nach erfolgreichem Rückspielen `cmd_split_sequence` auf und gibt aus, dass
es das getan hat.

Grund: `cmd_dump()` sichert mit `pg_dump --schema=tickets` und erfasst dabei Sequenzen. Ohne
diesen Schritt kommt die Kopie ohne Trennung zurück — im Wiederanlauf nach einem Zwischenfall,
also genau dann, wenn niemand daran denkt.

Der Aufruf gehört **hinter** den Erfolgsfall des Restores. Ein fehlgeschlagener Restore darf
nicht zusätzlich an der Sequenz drehen.

## Task 4 — `status` benennt den Zustand

`cmd_status()` ergänzt um beide `external_id_seq`-Werte und eine ausdrückliche Aussage, ob die
Trennung gilt.

Nicht nur die Zahl ausgeben: Eine reverted Trennung sieht in einer nackten Zahlenkolonne genauso
aus wie eine intakte. Der Text soll den Zustand benennen und im Verlustfall auf
`split-sequence` verweisen.

Ist fleet nicht erreichbar, gilt die bestehende Behandlung (`(nicht erreichbar)`) — kein
Fehlschlag des ganzen Kommandos.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/fleet-sequence-split.bats
# alle 5 grün
```

## Task 5 — Dokumentation

`docs/sdlc-stack/e3-cutover.md` ergänzen, im Abschnitt „fleet einfrieren — NICHT in dieser
Etappe" (§7) und in „Was auf fleet zurückbleibt":

- Die Trennung des Nummernraums als Überbrückung benennen, mit dem Startwert und dem Grund für
  genau diesen Wert.
- Festhalten, dass sie den Freeze **nicht** ersetzt und T002722 unberührt lässt.
- Den Rückweg nennen: `SELECT setval('tickets.external_id_seq', <alter Wert>, true);`.
- Den Restore-Fall erwähnen, damit die Kopplung an `restore` auffindbar ist.

Die bereits von Hand ausgeführte Sofortmaßnahme (2026-08-08, fleet von 2729 auf 900000) mit
Datum festhalten — sonst wirkt der Sprung in der Nummerierung später unerklärlich.

## Task 6 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich:

```bash
# Test-Inventar (neue Testdatei — CI vergleicht gegen den committeten Stand)
task test:inventory
git diff --exit-code website/src/data/test-inventory.json

# Guard: Pod-Selektion im neuen Test führt den status.phase-Filter
bash scripts/check-pod-phase-filter.sh

# Beide BATS-Formen der Spec erfassen (Sammeldatei UND Verzeichnis, T002696)
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation*

# Wirkungsnachweis gegen fleet: nächste Vergabe liegt im getrennten Raum.
# Die Probe wird zurückgerollt, es bleibt keine Zeile zurück.
FPOD=$(kubectl get pod -n workspace --context fleet \
  -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$FPOD" -n workspace --context fleet -c postgres -- \
  psql -U website -d website -qtA -c \
  "BEGIN; INSERT INTO tickets.tickets (type, brand, title) \
   VALUES ('project','mentolder','T002731 verify probe') RETURNING external_id; ROLLBACK;"
# erwartet: T9xxxxx
```

Der Rollback ist wesentlich: `nextval` ist nicht transaktional, die Sequenz rückt also vor —
die Zeile aber verschwindet. Genau das ist gewollt, es entsteht nur eine Lücke.
