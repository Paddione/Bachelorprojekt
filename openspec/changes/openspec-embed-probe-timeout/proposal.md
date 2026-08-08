# Proposal: openspec-embed-probe-timeout

## Why

**Symptom (Fakt, reproduziert am 2026-08-04):** Jeder Commit auf einen OpenSpec-Change-Ordner
meldet im post-commit-Hook `[openspec-embed-local] FEHLER: kein Embedding-Backend erreichbar
(:8081)` und `[openspec-embed] WARN: embed failed`. Es wird kein Change in `knowledge.chunks`
indiziert.

**Ursache (verifiziert, nicht vermutet):** `scripts/openspec-embed-local.sh:39` probt das
Embedding-Backend mit `curl -s --max-time 3`. Gemessen gegen
`http://127.0.0.1:8081/v1/embeddings` mit einem 13-Token-Input:

- kalt: 10,72 s, HTTP 200, gültiger Embedding-Vektor
- warm, zwei Wiederholungen: 10,87 s und 10,75 s

Die Latenz ist stabil (kein Kaltstart-Effekt), aber knapp 4x über dem Probe-Timeout. Der Probe
schlägt deshalb systematisch fehl und der Wrapper bricht mit `exit 1` ab, obwohl das Backend
funktioniert. Die Pod-Logs von `bge-embed` zeigen die Probe-Anfragen als angenommen und danach
clientseitig abgebrochen (`launch_slot_ ... processing task` gefolgt von `srv stop: cancel
task`) — der Verursacher ist der Client-Timeout, nicht der Server.

**Folge:** Der Embedding-Read-Pfad aus `openspec/specs/openspec-pgvector.md` ist praktisch tot.
`factory-mcp openspec_find_similar` findet keine neueren Changes. Der Fehler ist fail-visible
(Exit 1 im Skript), aber im post-commit-Hook non-fatal — er fällt im Alltag nur als Warnzeile
auf, nicht als Blocker.

**Nebenbefund, NICHT Teil dieser Änderung:** Der ~10s-Sockel ist für 13 Tokens unplausibel
hoch — ein Rerank über 5 Dokumente (119 Tokens, teurerer Cross-Encoder) dauert nur 3,38 s.
Verdacht auf Wartezeit auf Batch-Füllung im llama.cpp-Server (`-b 8192 -ub 8192 -np 4`,
dieselben Parameter wie in T002580). Dieser Latenzsockel selbst gehört zu T002580 (bge-embed
OOM, offen) und wird hier nicht angefasst — diese Änderung passt ausschließlich den
Client-Probe-Timeout an eine bereits real gemessene, stabile Backend-Latenz an. Ein Timeout
unterhalb der gemessenen Latenz macht aus einem langsamen Dienst einen scheinbar toten
Dienst — derselbe Fehlermodus, gegen den T002658 (S1 Retrieval-Schicht, blockiert durch dieses
Ticket) seine Fallback-Kette absichert.

## What

- `scripts/openspec-embed-local.sh`: `probe_embed()` verwendet statt des hartcodierten
  `--max-time 3` einen konfigurierbaren Timeout mit großzügiger Reserve über der gemessenen
  Latenz (`${OPENSPEC_EMBED_PROBE_TIMEOUT:-20}` — Default 20s, ca. 2x der höchsten gemessenen
  10,87s, override für abweichende Umgebungen/CI möglich).
- Kein Eingriff in den Latenzsockel selbst (kein llama.cpp-Tuning, kein `bge-embed`-Manifest —
  das bleibt T002580).
- Kein Eingriff in den zweiten Timeout-Pfad des Wrappers (DB-Port-Forward-Wartezeit,
  Zeile ~68-75) — der ist nicht Teil des gemeldeten Symptoms.

## Non-Goals

- Die reale Backend-Latenz (~10,7-10,9s) senken oder erklären — eigener Befund, gehört zu
  T002580.
- Den `--count-skipped`-Zählmodus oder die Context-Limit-Behandlung aus T002546 ändern.

_Ticket: T002659_
