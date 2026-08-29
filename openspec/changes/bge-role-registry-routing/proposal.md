# Proposal: bge-role-registry-routing

## Why

Die bge-Rollen (`embed`, `rerank`) sind der einzige Teil des llm-proxy, der seine
Upstreams noch aus einer handgepflegten Liste liest. Chat-Backends werden seit
`2026-07-22-llm-proxy-backends.sql` aus `tickets.llm_proxy_backends` aufgeloest —
mit `enabled`, `priority` und `max_inflight`, gepollt von `startRegistryPoll()`.
Die bge-Ketten stehen dagegen als festes Array in `scripts/llm/loadouts.json`
unter `roles.*.chain`. Beide Systeme laufen im selben Prozess und wissen nichts
voneinander.

Daraus folgen drei Befunde am laufenden System:

1. **Die Reihenfolge ist invertiert.** `roles.embed.chain[0]` ist PK-L-1
   (LM Studio, `127.0.0.1:1234`), `roles.rerank.chain[0]` ist das PK-Tablet
   (`192.168.100.12:8080` ueber WireGuard). Der Desktop taucht in der
   embed-Kette gar nicht mehr auf. Jede Embedding- und Rerank-Anfrage laeuft
   damit zuerst ueber ein Geraet, das zugeklappt werden kann.

2. **Ein schlafendes Geraet kostet die volle Zeitschranke.** Das Failover ist
   bewusst anfragegetrieben (T002838) und `ROLE_TIMEOUT_MS` betraegt 30 000 ms.
   Ein Laptop im Standby antwortet auf WireGuard nicht mit RST, sondern gar
   nicht — die Anfrage zahlt 30 s, bevor Glied 2 ueberhaupt drankommt.

3. **Die Topologie-Praemisse ist entfallen.** Die Reihenfolge stammt aus dem
   Design-Doc zu T006143 (E2/E3: Laptop/Tablet zuerst, weil GPU; Desktop-CPU
   zuletzt, weil on-demand). Sie wurde entschieden, als die Desktop-CPU von
   llama.cpp-Chat-Loadouts belegt war. Seit dem FreeToken-Cutover (T014028)
   rechnet der Chat-Pfad mit `--moe-cpu-layers 0` null auf der CPU: acht
   Zen-3-Kerne und rund 30 GB RAM stehen ungenutzt bereit, waehrend
   Encoder-Last — dichte GEMMs, nicht bandbreitengebunden — genau dorthin
   gehoert.

## What

- Die Rollenzugehoerigkeit wandert in die Backend-Registry: eine neue Spalte
  `roles` auf `tickets.llm_proxy_backends`. Ein Backend deklariert damit, welche
  Rollen es bedient; `priority` bestimmt die Kettenreihenfolge.
- `bge-routes.mjs` liest die Kette aus der Registry statt aus `loadouts.json`.
  Faellt die Registry aus, greift `loadouts.json` weiterhin als Rueckfall — die
  bge-Routen duerfen nicht an einer nicht erreichbaren Datenbank sterben.
- Die Kettenreihenfolge wird umgekehrt: Desktop zuerst, Cluster zweit,
  Laptop/Tablet zuletzt. Die Entscheidung E2/E3 aus T006143 wird damit ersetzt,
  nicht uebergangen.
- TEI (`text-embeddings-inference`) kommt als Desktop-Glied fuer beide Rollen
  hinzu.
- Das Aequivalenz-Gate (`scripts/llm/measure-embedding-equivalence.mjs`,
  Kosinus-Mittelwert >= 0,99) wird normative Aufnahmebedingung: ein Backend
  darf die Rolle `embed` nur fuehren, wenn es das Gate gegen das Referenzglied
  besteht.

**Ausdruecklich nicht Teil dieses Changes:** die Auswahl innerhalb einer
Anfrage. Sie bleibt anfragegetrieben, wie in `local-llm-proxy.md` gefordert.
Die Registry liefert ausschliesslich **Mitgliedschaft und Reihenfolge**; der
Health-State aus `discovery.mjs` wird fuer die bge-Rollen **nicht** ausgewertet.
Ein Probe beantwortet "lebt der Prozess", nicht "kann er meine Anfrage
bedienen" — der Incident vom 2026-08-09 (T002838) bleibt gueltig.

_Ticket: T-PENDING_
