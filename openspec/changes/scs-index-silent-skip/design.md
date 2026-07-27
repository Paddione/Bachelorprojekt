---
ticket_id: T002292
plan_ref: openspec/changes/scs-index-silent-skip/tasks.md
status: active
date: 2026-07-27
---

# Design — SCS-Indexer: stille Fehler sichtbar machen

**Ticket:** T002292
**Parent-SSOT-Spec:** `openspec/specs/brett.md` (Requirement SCS-1)
**Betroffene Dateien:** `scripts/index-repo.ts`, `Taskfile.yml` (Task `scs:index`)

## Problem

`task scs:index` lief vom WSL-Host mit Exit 0 durch, schrieb aber nichts. Der
produktive SCS-Index (`code_embeddings`, DB `website` auf fleet/`workspace`) stand am
2026-07-27 bei **66 von 4772** indexierbaren Dateien; der letzte erfolgreiche Lauf
datierte auf 2026-07-19. Semantische Code-Suche (`task scs:search`,
`website/src/lib/codesearch-db.ts`) lieferte dadurch faktisch keine Treffer.

Drei voneinander unabhängige Defekte wirken zusammen. Alle drei haben dieselbe
Signatur: ein globaler Zustand wird als datei-lokales Problem verbucht.

### Defekt 1 — Explizite `LLM_EMBED_URL` hebelt den eigenen Fallback aus

`environments/mentolder.yaml:71` setzt `LLM_EMBED_URL` auf
`http://llm-gateway-embed.workspace.svc.cluster.local:8095`. In-Cluster ist das korrekt
(der Service trägt einen manuell gepflegten Endpoint auf `192.168.100.10:8095`, den
WireGuard-GPU-Host). Auf dem WSL-Host löst der Name nicht auf.

`resolveEmbedConfig()` (`scripts/index-repo.ts:74-90`) besitzt zwar einen DNS-Fallback
auf `localhost:8095`, prüft aber `process.env.LLM_EMBED_URL` **zuerst** und übernimmt
den Wert ungeprüft — der Kommentar nennt das "Explicit env vars always win".
`task scs:index` sourced `scripts/env-resolve.sh` und setzt damit genau diese Variable.

Folge: jeder `embedTexts()`-Aufruf wirft, `main()` fängt pro Datei, schreibt
`[SCS] SKIP <file>` auf stderr und endet mit Exit 0.

### Defekt 2 — Tote DB-Verbindung wird als Datei-Problem verbucht

Der `kubectl port-forward` auf `svc/shared-db` reißt reproduzierbar ab (pod-seitig
`connection reset by peer`). Danach wirft jede Query `ECONNREFUSED`. Der per-Datei-catch
in `main()` (`scripts/index-repo.ts:376-380`) verbucht auch das als SKIP. Ein gemessener
Lauf brannte so durch 2513 Dateien und endete mit Exit 0.

### Defekt 3 — `skippedFiles` zählt zwei verschiedene Dinge

`main()` erhöht `skippedFiles` sowohl für **unveränderte** Dateien (der Hash-Skip in
`indexFile()` gibt `0` zurück) als auch für **fehlgeschlagene**. Die Abschluss-JSON eines
vollständig kaputten Laufs ist dadurch nicht von der eines gesunden No-op-Laufs zu
unterscheiden.

Dieser Defekt ist der Grund, warum die naheliegende Regel "Exit != 0, wenn
`indexed_files == 0`" **nicht** funktioniert: ein gesunder Lauf ohne Repo-Änderungen
erfüllt genau diese Bedingung. Ohne getrennte Zähler baut man an dieser Stelle den
nächsten Fehlalarm ein.

## Lösung

### Einheit 1 — Erreichbarkeits-Probe in `resolveEmbedConfig()`

Neue Hilfsfunktion `endpointReachable(url: string): Promise<boolean>` — HTTP-Probe gegen
`${url}/health` mit 2 s Timeout (`AbortSignal.timeout`). Jede HTTP-Antwort gilt als
erreichbar; nur ein Transportfehler oder Timeout gilt als nicht erreichbar.

Auflösungsreihenfolge:

1. `process.env.LLM_EMBED_URL` gesetzt und erreichbar → nutzen.
2. Gesetzt, aber nicht erreichbar → **Warnung auf stderr**, weiter mit 3.
3. `http://localhost:8095` erreichbar → nutzen.
4. Sonst bestehende Cluster-DNS-Kette (unverändert).

In-Cluster ändert sich nichts: dort ist die konfigurierte URL erreichbar und gewinnt in
Schritt 1. Die effektive URL wird weiterhin über die bestehende
`[SCS] embed=… model=… pghost=…`-Zeile protokolliert.

### Einheit 2 — Fehlerklassifikation statt Pauschal-SKIP

Neue exportierte, pure Funktion `isInfrastructureError(err: unknown): boolean`. Sie
erkennt Fehler, die **niemals** datei-spezifisch sein können:

- Node-Socket-Codes: `ECONNREFUSED`, `ECONNRESET`, `ENOTFOUND`, `EHOSTUNREACH`, `ETIMEDOUT`
- undici-Wrapper: Meldung `fetch failed`
- `pg`: `Connection terminated`, `timeout exceeded when trying to connect`

In `main()`: Trifft die Klassifikation zu, wird der Fehler **rethrown** — der Prozess
endet mit Exit != 0 und einer Meldung, die den Endpunkt nennt. Datei-spezifische Fehler
(etwa HTTP 500 wegen eines zu langen Chunks, siehe T002266) bleiben SKIP.

Die Funktion wird exportiert, damit sie ohne Netzwerk und ohne DB unit-testbar ist.

### Einheit 3 — Zähler trennen

`skippedFiles` wird aufgeteilt in `unchangedFiles` (Hash-Treffer) und `failedFiles`
(datei-spezifischer Fehler). Beide erscheinen getrennt in der Abschluss-JSON:

```json
{"indexed_files":N,"unchanged_files":N,"failed_files":N,"new_chunks":N,"total_rows":N}
```

Damit ist ein kaputter Lauf am Output erkennbar, ohne einen Schwellwert zu raten.

### Einheit 4 — Retry-Schleife im Task `scs:index`

Der Task fährt Pässe, bis der Indexer mit Exit 0 zurückkommt oder kein Fortschritt mehr
entsteht. Zwei Randbedingungen:

- **Kein `fuser -k <port>/tcp`.** `fuser -k` signalisiert die eigene Prozessgruppe mit
  und beendet damit die aufrufende Shell. Stattdessen bekommt jeder Pass einen eigenen
  Port (`15434 + pass`), dann muss nichts abgeräumt werden.
- Die Schleife trägt nur, weil der Hash-Skip Läufe resumierbar macht: ein abgebrochener
  Pass hinterlässt einen konsistenten Teil-Index, den der nächste Pass fortsetzt.

## Nicht im Scope

Die **pod-seitige Ursache** der `shared-db`-Verbindungsabbrüche (`max_connections`,
Idle-Timeout, CNI) wird hier nicht untersucht. Einheit 4 macht den Indexer robust
dagegen; die Ursachenanalyse gehört in ein eigenes Ticket.

Ebenfalls nicht im Scope: `environments/mentolder.yaml:71` bleibt unverändert. Der Wert
ist für den in-cluster-Aufruf korrekt; ihn host-freundlich zu machen würde den
Cluster-Pfad brechen.

## Verifikation

| Prüfung | Erwartung |
|---|---|
| `isInfrastructureError` mit `ECONNREFUSED`-Fehler | `true` |
| `isInfrastructureError` mit HTTP-500-Chunk-Fehler | `false` |
| Abschluss-JSON | enthält `unchanged_files` und `failed_files` getrennt |
| `Taskfile.yml` Task `scs:index` | enthält kein `fuser -k`, enthält Retry-Schleife |
| `task scs:index` vom Host, Embed-Server läuft | indexiert; Exit 0 |
| `task scs:index` vom Host, Embed-Server gestoppt | Exit != 0 mit Endpunkt-Meldung |
