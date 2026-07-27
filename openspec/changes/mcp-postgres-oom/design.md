---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-27
---

# Design — mcp-postgres OOMKill (T002321)

## Root-Cause — korrigiert gegenüber der Ticket-Hypothese

Das Ticket vermutete unbegrenztes Resultset-Buffering im MCP-Postgres-Handler
("ein `SELECT` ohne LIMIT reicht, den Server abzuschiessen"). Die Live-Diagnose
vom 2026-07-27 **widerlegt** das:

| Beobachtung | Beleg | Folgerung |
|---|---|---|
| Repro-Query lieferte ~20 Zeilen (`information_schema.columns`) | Ticket-Repro | Resultset-Größe erklärt 2Gi nicht |
| 4 gleichzeitig lebende `mcp-server-postgres`-Kindprozesse, je ~54 MB RSS, 15 min nach Start, keiner terminiert | `ps -o pid,ppid,rss,args ax` im Container | Prozess-Akkumulation |
| Alle 4 Children innerhalb derselben Sekunde gespawnt (`/proc/<pid>/stat` Feld 22) | starttime-Ticks | ein Child **pro Request**, nicht pro Session |
| Log pro `tools/call`: `"Non-initialize message detected, sending auto-initialize request first"` | Container-Logs | supergateway `--stateless` erzwingt Auto-Initialize → neuer Child |
| Keine einzige DB-Connection von der Pod-IP `10.42.0.35` | `pg_stat_activity` auf shared-db | Connection-Leak **ausgeschlossen** |
| V8 heap_size_limit = 1048 MB, also **unter** dem 2Gi-cgroup-Limit | `v8.getHeapStatistics()` | kein einzelner Prozess erreicht je seine Heap-Grenze → kein sauberer JS-Heap-Fehler, sondern cgroup-SIGKILL |
| Laufzeit bis OOM ≈ 10 h, 56 Restarts / 19 d | `lastState.terminated` | linear kumulativ, nicht spike-getrieben |

**Ursache:** `supergateway --stateless` startet für **jeden** eingehenden MCP-Request
einen neuen `mcp-server-postgres`-Node-Kindprozess (~54 MB RSS) und beendet ihn nie.
Die Kinder akkumulieren, bis die RSS-Summe des cgroups das 2Gi-Limit erreicht; der
Kernel killt dann den gesamten Container (exitCode 137). Der Kill trifft zufällig
denjenigen Aufrufer, dessen Request gerade läuft — deshalb sah der Befund im Ticket
wie "diese eine Query hat den Server gesprengt" aus. Die Query war Opfer, nicht Täter.

Damit ist Lösungsrichtung 1 aus dem Ticket (Row-/Byte-Limit statt Vollpufferung)
**nicht die Ursache** und würde den Bug nicht beheben. Sie bleibt als sekundäre
Härtung sinnvoll (ein einzelner Child kann sein 1048-MB-Heap-Limit sprengen), ist
aber nicht der Fix.

Der Container läuft `npm install -g supergateway @modelcontextprotocol/server-postgres`
**ungepinnt bei jedem Start**. Das Verhalten ist damit nicht reproduzierbar: ein
Upstream-Release kann den Leak jederzeit verändern, beheben oder verschärfen, ohne
dass sich im Repo etwas ändert. Das ist ein verstärkender Nebenbefund.

## Constraints

- **C1** — Der Fix muss sinnvoll bleiben, egal wie T002311/T002312 entschieden werden
  (Monolith bleibt oder wird aufgelöst). Also: kein Umbau, der beim Monolith-Abbau
  zurückgedreht werden müsste, und keine neue Komponente, die dann verwaist.
- **C2** — Brand-Auflösung (T002278, Welle 2) wird **nicht** angefasst. `DATABASE_URL`
  bleibt unverändert, auch wenn die Datei geändert wird.
- **C3** — `k3d/default/` ist von keiner Overlay- oder Flux-Kustomization referenziert.
  Der Pod wird manuell appliziert. Ein Manifest-Fix wird also **nicht** automatisch live —
  der Apply-Weg muss Teil der Lieferung sein.
- **C4** — `k3d/default/claude-code-mcp-monolith-deploy.yaml` ist ein roher
  `kubectl get -o json`-Live-Dump inklusive `last-applied-configuration`-Annotation.
  Diese Annotation enthält noch die alte `--stateful`-Variante und ist damit bereits
  irreführende Drift.

## Optionen und Trade-offs

### O1 — `--stateless` → `--stateful` zurückdrehen
Ein Child pro Session statt pro Request. Der Diff ist minimal.
**Gegen:** Die Umstellung auf `--stateless` war offenkundig absichtlich (die
`last-applied-configuration` zeigt `--stateful` als Vorgänger). Das Log-Muster
"Non-initialize message detected" zeigt Clients, die ohne sauberen Initialize-Handshake
sprechen — genau der Fall, für den `--stateless` als Workaround gewählt wurde. Ein
blindes Zurückdrehen riskiert, den ursprünglich behobenen Fehler zu reaktivieren.
Ausserdem lösen Sessions das Problem nur, wenn sie auch ablaufen; sonst akkumulieren
Session-Children genauso, nur langsamer.
**Verdikt:** nur mit Beleg, dass die Clients konform sind. Nicht als Blind-Fix.

### O2 — supergateway-Version pinnen + Upstream-Fix prüfen
Der Leak ist ein Upstream-Verhalten. Eine gepinnte Version macht das System
reproduzierbar und erlaubt, gezielt auf eine Version zu gehen, die Children reaped.
**Für:** klein, notwendig unabhängig vom restlichen Fix, behebt den Nicht-Determinismus.
**Gegen:** allein kein Fix, wenn keine Upstream-Version das Reaping macht.
**Verdikt:** Pflichtbestandteil, aber nicht hinreichend.

### O3 — Prozess-Reaper im Container
Ein Wächter beendet `mcp-server-postgres`-Children, die älter als N Sekunden sind
bzw. deren Anzahl eine Obergrenze überschreitet.
**Für:** wirkt unabhängig vom Upstream-Verhalten, deterministisch, klein, und ist beim
Monolith-Abbau ersatzlos entfernbar (C1 erfüllt).
**Gegen:** behandelt das Symptom auf Prozessebene; ein Child, der gerade eine lange
Query fährt, darf nicht getötet werden → Altersschwelle muss über dem
`statement_timeout` liegen.
**Verdikt:** tragende Säule des Fixes.

### O4 — Eigener schlanker MCP-Postgres-Server im Repo
Ein einzelner Prozess mit persistentem pg-Pool, Cursor-Streaming, Row-/Byte-Limit und
sauberen MCP-Fehlern; ersetzt supergateway + das (upstream archivierte)
`@modelcontextprotocol/server-postgres`.
**Für:** löst Prozess-Leak, Ticket-Richtung 1 und Ticket-Richtung 3 strukturell auf einmal.
**Gegen:** verstößt gegen C1 — erheblicher Neubau, der beim Monolith-Abbau (T002312)
weitgehend verwaist, und der die Datei so umkrempelt, dass T002278 in Welle 2 garantiert
konfligiert. Zu groß für ein Bug-Ticket, dessen Trägerkomponente noch zur Disposition steht.
**Verdikt:** **zurückgestellt**, als Folge-Option dokumentiert — nicht Teil dieses Fixes.

### O5 — Memory-Limit anheben
Vom Ticket bereits als Symptombekämpfung markiert. Bei linearem Leak verschiebt 4Gi den
OOM nur von 10 h auf 20 h.
**Verdikt:** verworfen. **Umgekehrt** ist es sogar wertvoll: das Limit nach dem Fix zu
*senken* macht einen künftigen Regress in Stunden statt Tagen sichtbar, statt ihn hinter
einem 40-fachen Headroom zu verstecken.

### O6 — Diagnostizierbarkeit (Ticket-Richtung 3)
Der Aufrufer sah "transport dropped mid-call" — als Transportfehler getarnter OOM.
Eine echte MCP-Fehlerantwort aus einem SIGKILL-ten Prozess ist unmöglich; der Prozess
ist tot, bevor er antworten kann. Erreichbar ist stattdessen:
(a) periodische Log-Zeile mit Child-Count und RSS-Summe, sodass der Anstieg *vor* dem
Kill sichtbar ist, und (b) eine dokumentierte Zuordnung "transport dropped mid-call →
zuerst `restartCount` des postgres-Containers prüfen", damit der nächste Treffer
Minuten statt Stunden kostet.
**Verdikt:** aufgenommen, in der erreichbaren Form — nicht als unerfüllbares Versprechen
einer sauberen Fehlerantwort.

## Gewählter Ansatz

**O2 + O3 + O5-invers + O6**, plus Korrektur des veralteten SSOT-Spec.

1. **Version-Pinning** von `supergateway` und `@modelcontextprotocol/server-postgres`
   im Container-Start-Skript — Reproduzierbarkeit als Vorbedingung jeder Aussage über
   das Verhalten.
2. **Child-Reaper** im postgres-Container: beendet `mcp-server-postgres`-Prozesse
   oberhalb einer Altersschwelle, die sicher über dem `statement_timeout` liegt.
   Deterministisch, upstream-unabhängig, ersatzlos entfernbar.
3. **Memory-Limit senken** statt anheben, sodass ein Regress schnell und laut auffällt.
4. **Beobachtbarkeit**: Child-Count/RSS periodisch loggen; Diagnose-Zuordnung
   dokumentieren.
5. **SSOT-Korrektur**: `openspec/specs/mcp-gateway.md` behauptet seit 2026-06-22, der
   Monolith sei dekommissioniert — er läuft nachweislich. Der Delta-Spec bildet die
   Realität ab, sonst plant der nächste Durchlauf wieder gegen eine Fiktion.
6. **Apply-Weg** (C3): `k3d/default/` ist keine Flux-Insel-Lösung; der Fix wird erst
   live, wenn er appliziert wird. Der Weg gehört dokumentiert und verifiziert.

## Bewusst nicht in diesem Change

- Row-/Byte-Limit bzw. Cursor-Streaming (Ticket-Richtung 1) — nicht die Ursache;
  als Folge-Härtung notieren.
- Eigener MCP-Postgres-Server (O4) — siehe C1.
- Brand-Auflösung `DATABASE_URL` (T002278, Welle 2) — siehe C2.
- Entscheidung Monolith bleibt/geht (T002311/T002312) — bleibt offen; dieser Fix
  ist zu beiden Ausgängen verträglich.

## Edge-Cases

- **E1** — Reaper tötet einen Child mitten in einer legitimen Langläufer-Query.
  Gegenmaßnahme: Altersschwelle > `statement_timeout`; Reaper tötet nur Prozesse,
  die die Schwelle überschreiten, nicht die jüngsten.
- **E2** — Nach dem Fix bleibt der Speicher konstant, aber ein *echtes* großes
  Resultset sprengt das 1048-MB-Heap-Limit eines einzelnen Childs. Dann stirbt nur
  dieser Child mit sauberem JS-Heap-Fehler statt des ganzen Containers — akzeptabel
  und deutlich besser diagnostizierbar. Das ist genau der Fall, für den die
  zurückgestellte Ticket-Richtung 1 später greifen würde.
- **E3** — Gesenktes Memory-Limit ist zu knapp für den legitimen Parallelbetrieb
  mehrerer Agenten. Gegenmaßnahme: Limit an gemessener Obergrenze plus Reserve
  bemessen, nicht an einer runden Zahl.
- **E4** — Pinning auf eine Version, die den Leak *stärker* zeigt. Gegenmaßnahme:
  die gepinnte Version gegen den Live-Befund verifizieren, nicht nur setzen.
