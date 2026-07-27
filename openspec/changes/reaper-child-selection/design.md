---
ticket_id: T002350
plan_ref: null
status: active
date: 2026-07-27
---

# Design — Reaper-Kandidatenauswahl (T002350)

## Root-Cause

Der in T002321 (PR #3397) gelieferte Reaper wählt seine Kandidaten so:

```sh
grep -qs 'mcp-server-postgres' "$d/cmdline" || continue
```

Ein Substring-Grep über die vollständige `cmdline` trifft drei Prozesse, von denen
**keiner** ein Child ist:

| PID | cmdline | warum sie matcht |
|---|---|---|
| 1 | `node /usr/local/bin/supergateway --stdio mcp-server-postgres "…"` | der Suchstring steht im `--stdio`-Argument des Parents |
| 19 | `/bin/sh -c <das gesamte Start-Skript>` | eine Background-Subshell erbt die cmdline des Parents, also das ganze Skript inklusive Suchstring |
| ad hoc | jeder Debug-Aufruf mit demselben String in der Kommandozeile | dito |

Live-Beleg aus dem neuen Pod, ohne einen einzigen MCP-Request:

```
mcp-server-postgres children: count=2 rss_kb_sum=72892
```

`count=2` sind Parent und Reaper-Subshell. Nach 300 s hätte der Reaper sich selbst
per `kill -TERM 19` beendet (Reaping stillschweigend eingestellt, der Leak bestünde
weiter, getarnt durch grüne Tests) und `kill -TERM 1` an supergateway gesendet — bei
vorhandenem SIGTERM-Handler eine Restart-Schleife alle 5 Minuten statt alle 10 Stunden.

Der Stand wurde nach ~4 Minuten per `kubectl rollout undo` zurückgerollt, bevor die
Schwelle griff. Live läuft wieder der Vorgängerstand.

## Live-Messung (alter Pod, 2026-07-27)

Die Prozessstruktur ist eindeutig und trennt sauber auf `argv[1]`:

```
pid=1     ppid=0  argv0=[node]  argv1=[/usr/local/bin/supergateway]
pid=1010  ppid=1  argv0=[node]  argv1=[/usr/local/bin/mcp-server-postgres]
pid=1021  ppid=1  argv0=[node]  argv1=[/usr/local/bin/mcp-server-postgres]
…
```

| Messgröße | Wert |
|---|---|
| lebende Children | 156 |
| RSS-Summe | 8601 MB |
| cgroup `memory.current` | 2032 MB von 2048 MB |
| effektiv pro Child im cgroup | ~13 MB |
| Alter der Children | ~7658 s, nahezu identisch |

Zwei Korrekturen am Design von T002321:

- **Die 54-MB-pro-Child-Annahme war um Faktor 4 zu hoch.** RSS-Summe und cgroup-Verbrauch
  klaffen auseinander, weil die node-Prozesse Binary- und Runtime-Pages teilen. Maßgeblich
  für das Limit ist `memory.current`, nicht die RSS-Summe.
- **Children entstehen in Schüben, nicht gleichmäßig.** Alle 156 sind nahezu gleich alt.
  Eine reine Altersschwelle hat deshalb ein Burst-Loch (siehe C2).

## Constraints

- **C1** — Der Fix bleibt auf das Startkommando des `postgres`-Containers begrenzt. Kein
  Umbau, der beim Monolith-Abbau (T002311/T002312) zurückgedreht werden müsste.
- **C2** — Eine reine Altersschwelle genügt nicht: kommen mehr Requests innerhalb der
  Schwelle, als das Limit an Children trägt, kippt der Container, bevor der Reaper greifen
  darf. Bei 512 Mi und ~13 MB/Child liegt die Grenze bei ~29 gleichzeitigen Children.
- **C3** — `k3d/default/` hängt an keiner Flux-Kustomization. Der Fix wird erst live, wenn
  er appliziert wird. `kubectl apply -k k3d/default` ist zusätzlich defekt (T002349); bis
  dahin ist `kubectl apply -f k3d/default/claude-code-mcp-monolith-deploy.yaml` der Weg.
- **C4** — `DATABASE_URL` bleibt unverändert (T002278, Welle 2).

## Gewählter Ansatz

### 1. Kandidatenauswahl — drei Guards

Ein Prozess gilt als Child genau dann, wenn alle drei zutreffen:

| Guard | Zweck |
|---|---|
| `argv[1]` endet auf `/mcp-server-postgres` | trennt Child von Parent (`/usr/local/bin/supergateway`); der Shell-Wrapper trägt den String erst in `argv[2]` und fällt damit strukturell heraus |
| `ppid == 1` | echte Children hängen direkt an supergateway |
| `pid != 1` und `pid != $SELF_PID` | schließt Parent und Reaper-Subshell hart aus, auch falls die cmdline-Heuristik je bricht |

> **`$$` taugt hier nicht als Self-PID.** In POSIX-sh (ash/dash) expandiert `$$` auch
> innerhalb einer Subshell zur PID der *ursprünglichen* Shell — im Container also `1`, weil
> `/bin/sh -c` der Entrypoint ist. `pid != $$` wäre damit nur eine Dublette des
> PID-1-Guards, und die Reaper-Subshell bliebe ungeschützt. Verlässlich ist
> `read -r SELF_PID _ < /proc/self/stat`: die Redirection führt die Subshell selbst aus,
> `/proc/self` löst also auf ihre eigene PID auf.

Der dritte Guard ist bewusst redundant zu den ersten beiden. Er ist die Versicherung
gegen genau die Fehlerklasse, die diesen Bug erzeugt hat: eine Auswahlheuristik, die
sich unbemerkt auf den eigenen Prozess ausdehnt.

### 2. Zwei Kill-Stufen

```
Stufe 1 (Alter):  age > MCP_PG_CHILD_MAX_AGE_SECONDS (300)  -> kill -TERM
Stufe 2 (Menge):  danach, solange count > MCP_PG_CHILD_MAX_COUNT (12):
                  kill die ältesten, bis count == 12
```

Stufe 2 schließt das Burst-Loch aus C2. Sortierung über `starttime` (`/proc/<pid>/stat`
Feld 22) per `sort -n`; der kleinste Wert ist der älteste Prozess. Der älteste Kandidat
ist zugleich der wahrscheinlichste Leichnam — Stufe 2 trifft damit unter Last die
plausibelste Auswahl, auch wenn sie theoretisch einen laufenden Request treffen kann.

Die Altersschwelle (300 s) bleibt über dem `statement_timeout` (120 s), damit Stufe 1
keinen legitimen Langläufer trifft (Edge-Case E1 aus T002321).

### 3. Testbarkeit — `PROC_ROOT`

Die Reaper-Schleife liest `${PROC_ROOT:-/proc}` statt hart `/proc`. Im Container bleibt
der Default; im Test kann ein Fixture-Verzeichnis untergeschoben werden.

Das ist der eigentliche Hebel des Changes. Die bestehenden Tests prüfen, **dass** die
Zeichenkette `reap` bzw. `child` im Startkommando vorkommt — ein falscher Reaper ist für
sie von einem korrekten nicht unterscheidbar. Genau deshalb ging T002321 grün durch die
CI. Mit `PROC_ROOT` wird die Auswahl-Logik zu normal testbarem Shell-Code: der Test
extrahiert die Funktion per `jq` aus dem Manifest, lädt sie in eine Shell und lässt sie
gegen ein gebautes `/proc` laufen.

Eine Ein-Variablen-Indirektion mit unverändertem Produktions-Default ist der Preis; er
ist niedriger als der einer weiteren untestbaren YAML-Zeichenkette.

Die Auswahl wird dafür als eigene Funktion `list_reap_candidates` geschrieben, die
ausschließlich PIDs **ausgibt** und niemals tötet. Die Trennung von Selektion und Wirkung
ist die Voraussetzung dafür, dass die Auswahl überhaupt prüfbar wird — sie erlaubt dem Test
eine Assertion auf die exakte PID-Menge statt auf die Anwesenheit von Codezeilen.

### 3b. Zweite Teststufe — Container-Smoke-Test

Ein Fixture allein kann eine ganze Fehlerklasse nicht sehen (E4, E5). Deshalb kommt über
den Fixture-Test ein Lauf in `node:20-alpine` mit **echten** Prozessen gegen **echtes**
procfs: ein Fake-`mcp-server-postgres` mit node-Shebang wird gestartet, dazu ein Parent,
der den Suchstring im Argument führt; geprüft wird, dass genau das Child stirbt und
Parent wie Reaper-Subshell überleben.

Vorab gemessen (2026-07-27, `node:20-alpine`), womit die argv-Annahme nicht länger aus dem
Ticket übernommen, sondern belegt ist:

```
pid=1  ppid=0  argv0=[sh]    argv1=[/probe/argv-probe.sh]
pid=9  ppid=1  argv0=[node]  argv1=[/usr/local/bin/mcp-server-postgres]
pid=10 ppid=1  argv0=[node]  argv1=[/usr/local/bin/mcp-server-postgres]
```

Zwei Befunde daraus:

- **Der Shell-Wrapper überlebt nicht.** alpines ash exec-optimiert ein Einzelkommando weg;
  beide Varianten (`sh -c 'mcp-server-postgres …'` und direkter Aufruf) hinterlassen nur
  den node-Prozess mit `ppid=1`. Der Selektor ist damit unabhängig davon, ob supergateway
  mit `shell:true` spawnt — die in E3 befürchtete Pfadabhängigkeit ist die einzige
  verbleibende Unsicherheit.
- **Die `ppid == 1`-Plausibilisierung trifft zu**, auch wenn über einen Shell-Wrapper
  gestartet wird.

### 4. Memory-Limit

Bleibt bei 512 Mi, jetzt mit cgroup-basiertem Rechenweg:

```
Parent            ~72 MB
Reserve           ~60 MB
verbleibend      ~380 MB  ->  ~29 Children Kopf bei ~13 MB/Child
Mengengrenze       12     ->  Faktor ~2,4 Sicherheit gegen Stufe-2-Ziel
```

## Optionen und Trade-offs

### O1 — Nur Alter, kürzerer Tick (15 s statt 60 s)
Verkleinert das Fenster zwischen Überschreiten und Reaping, ohne neue Kill-Logik.
**Gegen:** löst das Burst-Loch nicht — die Schwelle bleibt 300 s, ein Schub von 30
Requests ist danach immer noch jünger als die Schwelle. **Verdikt:** verworfen.

### O2 — Nur Alter, Schwelle auf 120 s senken
Children sterben schneller, das Burst-Fenster schrumpft.
**Gegen:** die Schwelle läge dann gleichauf mit dem `statement_timeout`, ohne
Sicherheitsabstand. Edge-Case E1 (Langläufer wird getroffen) wird wahrscheinlich.
**Verdikt:** verworfen.

### O3 — Alter + Mengengrenze *(gewählt)*
Siehe oben. **Gegen:** unter extremer Last kann Stufe 2 einen noch laufenden Request
treffen. Gemildert durch „ältester zuerst" und eine Grenze (12) deutlich unter dem
Limit-Kopf (~29). **Verdikt:** gewählt.

### O4 — `--stateless` → `--stateful`
Ein Child pro Session statt pro Request.
**Gegen:** unverändert gegen T002321 — die Umstellung auf `--stateless` war absichtlich,
und das Log-Muster „Non-initialize message detected" zeigt Clients, für die sie gewählt
wurde. **Verdikt:** weiterhin zurückgestellt.

## Bewusst nicht in diesem Change

- Row-/Byte-Limit bzw. Cursor-Streaming — nicht die Ursache (siehe T002321-Design).
- Eigener MCP-Postgres-Server — siehe C1.
- Reparatur von `kubectl apply -k k3d/default` — eigenes Ticket T002349.
- `DATABASE_URL`-Brand-Auflösung — T002278, Welle 2.

## Edge-Cases

- **E1** — Stufe 1 trifft einen legitimen Langläufer. Gegenmaßnahme: Schwelle (300 s)
  über `statement_timeout` (120 s).
- **E2** — Stufe 2 trifft unter Burst einen laufenden Request. Gegenmaßnahme: ältester
  zuerst; Grenze (12) mit Faktor ~2,4 Abstand zum Limit-Kopf. Der Container überlebt,
  ein einzelner Call schlägt fehl — deutlich besser als ein cgroup-SIGKILL, der alle
  laufenden Calls trifft.
- **E3** — `argv[1]` ändert sich durch ein Upstream-Update (anderer Installationspfad).
  Gegenmaßnahme: Match auf das Suffix `/mcp-server-postgres`, nicht auf den vollen Pfad;
  die Paketversionen sind seit T002321 gepinnt.
- **E4** — Der Fixture-Test bildet die Realität falsch ab und geht grün, obwohl der
  Reaper im Container falsch wählt. Gegenmaßnahme: das Fixture wird aus der real
  gemessenen Struktur gebaut (PID 1 = supergateway, Subshell mit Skript-cmdline,
  Children mit `ppid=1`), der Test enthält eine Negativ-Probe — PID 1 und die
  Subshell dürfen **nicht** in der Kill-Liste stehen — und über dem Fixture steht der
  Container-Smoke-Test aus Abschnitt 3b, der gegen echtes procfs läuft.
- **E5 — procfs-Semantik, die ein Fixture per Konstruktion nicht abbilden kann.**
  `/proc/<pid>/cmdline` meldet `st_size = 0`, obwohl die Datei Inhalt hat; jeder
  größenbasierte Guard (`[ -s … ]`, `test -s`) überspringt deshalb live **alle**
  Prozesse. Ein Fixture aus regulären Dateien hat dagegen `size > 0` — ein solcher Fehler
  liefe im Fixture-Test grün und selektierte im Container stumm nichts, also exakt die
  Tarnung, an der T002321 gescheitert ist. Gegenmaßnahme: keine größenbasierten Guards
  (Leerprüfung nur über den gelesenen Inhalt), plus der Container-Smoke-Test als Instanz,
  in der procfs-Semantik überhaupt auftritt. Der Fehler ist bei der Vorab-Messung zu
  diesem Change real aufgetreten und dort gefangen worden.
