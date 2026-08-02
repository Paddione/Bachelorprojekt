---
title: "bge-k8s-cpu-tuning — Implementation Plan"
ticket_id: T002572
domains: [infra, llm]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bge-k8s-cpu-tuning — Implementation Plan

_Ticket: T002572_

## File Structure

```
tests/spec/llm-pipeline/bge-cpu-tuning.bats   (neu)  Guard fuer -t und limits.cpu
scripts/llm/bench-bge-embed.sh                (neu)  Durchsatz-Benchmark
Taskfile.llm.yml                              (edit) Task llm:bench-embed
k3d/llm-gpu.yaml                              (edit) -t <threads> + limits.cpu 4000m
```

S1-Zeilenlimits: `scripts/llm/bench-bge-embed.sh` ist neu und wird auf rund 120
Zeilen geschnitten, das Extension-Limit fuer `.sh` liegt bei 800. `k3d/llm-gpu.yaml`
(249 Zeilen) und `Taskfile.llm.yml` (277 Zeilen) sind `.yaml`/`.yml` und damit von
S1 nicht erfasst; beide Aenderungen sind ohnehin additiv im einstelligen
Zeilenbereich. Kein Split noetig.

S4: die neue `.sh`-Datei wird durch den neuen Task `llm:bench-embed` erreichbar,
damit sie kein Orphan-Skript ist.

S3: im Benchmark-Skript und im Task duerfen keine Brand-Domain-Literale stehen. Das
Ziel wird ueber `scripts/env-resolve.sh` (`ENV_CONTEXT`, `WORKSPACE_NAMESPACE`) und
den Cluster-DNS-Namen `llm-gateway-embed` aufgeloest, wie in den bestehenden Tasks
`llm:status` und `llm:test`.

## Ausgangsmessung (bereits erhoben)

Am 2026-08-02 gegen `fleet`/`workspace` gemessen, 100 Dokumente a ~62 Tokens,
Batch 64, drei Laeufe: 0.67 / 0.66 / 0.68 chunks/s (148.4 s / 151.5 s / 146.1 s),
also rund 42 Prompt-Tokens pro Sekunde bei `limits.cpu: 2000m` ohne `-t`. Diese
Zahlen sind der Vergleichsmassstab; Task 3 reproduziert sie mit dem neuen Skript,
damit Vorher und Nachher mit demselben Werkzeug gemessen sind.

## Task 1: RED-Guard fuer Manifest-Argumente und CPU-Limit

Neue Datei `tests/spec/llm-pipeline/bge-cpu-tuning.bats`. Bewusst eine eigene Datei
im Verzeichnis `tests/spec/llm-pipeline/` statt eines Anhangs an die Sammeldatei
`tests/spec/llm-pipeline.bats` (Konvention T002416). Das Verzeichnis existiert
bereits mit `gemma-thinking-budget.bats` und `index-repo-embed-port.bats`. Der
Grund ist hier konkret: Ticket T002482 (KV-Offload) liegt dispatchbereit in der
Factory-Queue und nennt dieselbe Sammeldatei als Testort. Zwei Anhaenge am
Dateiende derselben Datei kollidieren strukturell.

Header-Kommentar der Datei dokumentiert den Pruefmodus: Source-Grep auf das
Manifest, zulaessige Ausnahme nach T002448-M4, weil sich die Aussage
ausschliesslich im deklarativen YAML manifestiert und ein Laufzeit-Check einen
erreichbaren Cluster voraussetzen wuerde, den CI nicht hat.

Inhalt, drei `@test`-Bloecke, jeder mit Positiv-Anker im selben Block (T002356-M1):

1. Beide Deployments tragen ein `-t`-Flag mit positiver Ganzzahl. Positiv-Anker:
   `yq` liest die Args beider Container und findet `-t`; erst danach die
   Negativ-Aussage, dass der Wert nicht leer und nicht `0` ist.
2. `limits.cpu` ist `4000m` in beiden Containern, `requests.cpu` bleibt `1000m`.
   Positiv-Anker: beide Requests-Werte werden gelesen und muessen `1000m` sein,
   bevor die Limits-Aussage geprueft wird. Damit wird ein versehentliches
   Mitziehen der Requests rot.
3. Der `-t`-Wert ueberschreitet nicht die kleinste Node-Kerngroesse, die der Plan
   in Task 4 festlegt. Die Schranke steht als Konstante im Test mit Verweis auf
   diesen Plan, weil CI keinen Cluster befragen kann.

Extraktion ueber `yq` auf das Multi-Dokument-YAML, adressiert ueber
`select(.kind == "Deployment" and .metadata.name == "bge-embed")`. Nicht ueber
`grep` auf `"4000m"`, weil das im selben File auch von einem anderen Deployment
stammen koennte.

Ausfuehren:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/bge-cpu-tuning.bats
# expected: FAIL — k3d/llm-gpu.yaml traegt weder -t noch limits.cpu 4000m
```

## Task 2: Benchmark-Skript

Neue Datei `scripts/llm/bench-bge-embed.sh`, `set -euo pipefail`, Usage-Block.

Verhalten:

- Argumente: `ENV` (Default `mentolder`), `--runs N` (Default 3), `--docs N`
  (Default 100), `--batch N` (Default 64), `--words N` (Default 60 Woerter je
  Dokument).
- `source scripts/env-resolve.sh "$ENV"` (sourcen, nie ausfuehren), daraus
  `ENV_CONTEXT` und `WORKSPACE_NAMESPACE`.
- Deterministische Dokumente: fester Seed, damit zwei Laeufe dieselbe Last
  erzeugen. Ohne festen Seed ist ein Vorher/Nachher-Vergleich wertlos.
- Port-Forward auf `svc/llm-gateway-embed` mit frei waehlbarem lokalen Port,
  `trap` zum Aufraeumen, Warteschleife auf Erreichbarkeit statt festem `sleep`.
- Vor und nach jedem Lauf den `restartCount` des `bge-embed`-Containers lesen.
  Steigt er waehrend eines Laufs, wird der Lauf als `INVALID (container restarted)`
  ausgegeben und geht nicht in den Median ein. Das ist die Absicherung gegen
  T002580 (OOMKill), siehe Proposal.
- Ausgabe je Lauf plus Median, immer zusammen mit der Messbasis: Dokumentanzahl,
  Woerter je Dokument, Batch-Groesse, Node des Pods. Eine `chunks/s`-Zahl ohne
  Chunk-Groesse ist nicht vergleichbar.
- Exit-Code ungleich 0, wenn kein einziger Lauf gueltig war.

Kein `jq --args` fuer die Payload-Erzeugung; die JSON-Batches werden in eine
Tempdatei geschrieben und per `--data-binary @datei` gesendet.

## Task 3: Task `llm:bench-embed` und Reproduktion der Baseline

In `Taskfile.llm.yml` neben `llm:status` und `llm:test` einen Task
`bench-embed` ergaenzen, `desc` mit Nennung von `ENV=<env>`, der
`scripts/llm/bench-bge-embed.sh` aufruft und zusaetzliche Argumente durchreicht.
Muster von `llm:status` uebernehmen, inklusive `ENV: '{{.ENV | default "mentolder"}}'`.

Danach die Baseline mit dem neuen Skript reproduzieren:

```bash
task llm:bench-embed ENV=mentolder -- --runs 3
```

Das Ergebnis wird als VORHER-Wert notiert. Weicht es um mehr als 25 Prozent von den
0.67 chunks/s der Handmessung ab, ist zuerst die Ursache zu klaeren (anderer Node,
Restart waehrend des Laufs, andere Dokumentgroesse) und nicht einfach der neue Wert
zu uebernehmen.

## Task 4: Kapazitaets-Gate, Thread-Entscheidung, Manifest-Aenderung

Erst messen und entscheiden, dann editieren. Die Reihenfolge ist bindend, weil der
`-t`-Wert vom Messergebnis abhaengt.

**Schritt 4.1, Ist-Stand erheben.**

```bash
kubectl --context fleet top nodes
kubectl --context fleet get nodes \
  -o custom-columns='NAME:.metadata.name,CPU:.status.allocatable.cpu'
kubectl --context fleet -n workspace get pods -l 'app in (bge-embed,bge-rerank)' -o wide
```

Stand 2026-08-02: fuenf Ready-Nodes, pk-hetzner-4/6/8 mit 8 Kernen,
gekko-hetzner-3/4 mit 4 Kernen, `gekko-hetzner-2` nicht mehr im Cluster.
`bge-embed` lief auf pk-hetzner-8 (1048m von 8000m belegt), `bge-rerank` auf
pk-hetzner-6 (590m von 8000m).

**Schritt 4.2, Gate G1 Burst-Headroom (hart).** Fuer jeden Node, auf dem ein
bge-Pod laeuft: `Ist-Last + 2000m` darf 80 Prozent der Allocatable-CPU nicht
ueberschreiten. Die 2000m sind der Zuwachs des Limits, nicht der neue Absolutwert,
weil `requests.cpu` unveraendert bleibt und der Rest opportunistischer Burst ist.
Gate verletzt, siehe Reduktionspfad R2.

**Schritt 4.3, Gate G2 Thread-Zahl gegen kleinste Node (hart).** Die
bge-Deployments tragen weder `nodeSelector` noch `affinity` und koennen bei jedem
Restart auf einem 4-Kern-Node landen. Ein fest verdrahtetes `-t 8` waere dort
zweifach ueberzeichnet. Deshalb gilt: `-t` darf die Allocatable-Kernzahl der
kleinsten Ready-Node nicht ueberschreiten. Beim erhobenen Stand ist das 4.

**Schritt 4.4, Messung entscheidet zwischen den Kandidaten.** Beide Kandidaten
werden gegen dieselbe Baseline gemessen, jeweils nach `kubectl rollout status`:

- Kandidat A: `-t 4`, `limits.cpu: 4000m`. Erfuellt G2 auf allen Nodes.
- Kandidat B: `-t 8`, `limits.cpu: 4000m`. Der Wert aus dem Ticket, gueltig nur
  solange der Pod auf einem 8-Kern-Node liegt.

Liegt Kandidat B nicht mehr als 15 Prozent ueber Kandidat A, wird A genommen: der
kleine Rest an Durchsatz wiegt die Fragilitaet gegenueber einem Reschedule nicht
auf. Liegt B deutlich vorn, wird B genommen und die Node-Abhaengigkeit als
Kommentar im Manifest und als Folge-Ticket-Hinweis im PR festgehalten, weil ohne
`affinity` kein Guard existiert.

**Schritt 4.5, Manifest aendern.** In `k3d/llm-gpu.yaml` fuer beide Deployments:
`-t <entschiedener Wert>` in die Args-Liste hinter `-ngl 0` einfuegen, `limits.cpu`
von `2000m` auf `4000m` setzen, `requests.cpu` bei `1000m` belassen. Kommentarzeile
ueber der Args-Liste, die den gemessenen Grund und die Node-Kernzahl nennt, damit
der naechste Leser die Zahl nicht fuer willkuerlich haelt.

Kein Overlay-Patch noetig: `prod-fleet/` patcht an den bge-Deployments nur die
StorageClass der Modell-PVCs, die Ressourcen kommen unveraendert aus der Basis.

**Reduktionspfad R1 (G2 verletzt).** Wenn der entschiedene `-t`-Wert die kleinste
Node ueberschreitet, wird er auf die Kernzahl der kleinsten Ready-Node gesenkt.
Das ist eine Aenderung im selben PR, keine Ausnahme.

**Reduktionspfad R2 (G1 verletzt).** Wenn ein Node den Zuwachs nicht traegt, wird
`limits.cpu` stufenweise auf `3000m` reduziert und G1 erneut geprueft. Traegt der
Node auch `+1000m` nicht, wird die Limit-Aenderung aus dem PR entfernt und nur
Benchmark-Skript, Task und `-t`-Flag ausgeliefert; der Guard-Test aus Task 1 wird
auf den dann tatsaechlich gesetzten Wert angepasst.

**Abbruchpfad A1.** Liefert `kubectl top nodes` keine Werte, etwa weil der
metrics-server nicht laeuft, wird nicht gemergt. Kein Gate darf auf Annahme
bestanden werden. Der PR geht auf Draft, der Befund als Kommentar an das Ticket,
und die Session eskaliert ueber `scripts/agent-escalate.sh`.

**Abbruchpfad A2.** Steigt der Restart-Zaehler von `bge-embed` waehrend der
Nachher-Messung, ist die Messung ungueltig (T002580). Bis zu drei Wiederholungen;
danach wird nicht gemergt, sondern T002580 vorgezogen.

## Task 5: Guard gruen und Ergebnis dokumentieren

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/bge-cpu-tuning.bats
task workspace:validate
```

Im PR-Body eine Tabelle mit Vorher- und Nachher-Werten, gemessen mit demselben
Skript und derselben Messbasis, dazu die Node-Zuordnung der Pods, das Ergebnis von
G1 und G2 mit den konkreten Zahlen und der begruendete `-t`-Wert. Ein Nachher-Wert
ohne die Messbasis ist keine Dokumentation des Ergebnisses.

## Task 6: Finale Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline/
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:inventory` laeuft in `freshness:regenerate` mit; die daraus geaenderte
`website/src/data/test-inventory.json` gehoert mit in den Commit, sonst wird der
CI-Inventarcheck rot.

<!-- vitest: kein neuer Test noetig, weil keine Datei unter website/src/ beruehrt wird -->
