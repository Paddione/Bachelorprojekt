---
title: "reaper-child-selection — Implementation Plan"
ticket_id: T002350
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# reaper-child-selection — Implementation Plan

_Ticket: T002350 — Root-Cause, Live-Messung, alpine-Vorabmessung und verworfene
Alternativen: `openspec/changes/reaper-child-selection/design.md`_

Der in T002321 gelieferte Reaper wählt Kandidaten per Substring-Grep über die volle
`cmdline` und trifft damit PID 1 (supergateway führt den Namen in seinem
`--stdio`-Argument) und die eigene Background-Subshell (erbt die cmdline des
Start-Skripts). Nach 300 s hätte er sich selbst beendet und `SIGTERM` an den Parent
geschickt. Der Stand wurde live zurückgerollt, steckt aber in `main`.

## File Structure

```
k3d/default/claude-code-mcp-monolith-deploy.yaml   (geändert — args[0] des postgres-Containers)
tests/spec/mcp-gateway.bats                        (geändert — RED-Tests bereits im Stage-Commit)
```

S1-Hinweis: Für `.yaml` und `.bats` definiert `docs/code-quality/gates.yaml` kein
Extension-Limit; keine der beiden Dateien ist in `docs/code-quality/baseline.json`
gebaselined. Es besteht daher kein S1-Zeilenbudget, das die Umsetzung einschränkt.
S3 ist nicht berührt (keine Brand-Domain-Literale). S4 ist nicht berührt (keine neue
Manifest- oder Skriptdatei).

## Task 1 — RED verifizieren

Die Failing-Tests liegen bereits im Stage-Commit (`tests/spec/mcp-gateway.bats`,
Abschnitt "Reaper-Kandidatenauswahl (T002350)"). Vor jeder Änderung bestätigen, dass
sie aus dem richtigen Grund rot sind.

```bash
tests/unit/lib/bats-core/bin/bats -f 'T002350' tests/spec/mcp-gateway.bats
# expected: FAIL — 9 der 10 Tests rot (list_reap_candidates fehlt, PROC_ROOT fehlt,
# MCP_PG_CHILD_MAX_COUNT fehlt, Fixture- und Container-Auswahl nicht ausführbar).
# Grün ist bereits: "age threshold stays above the statement_timeout" (300s > 120s
# steht seit T002321 im Manifest) — dieser Test darf nicht kippen.
```

Akzeptanz: 9 rote Tests aus dem richtigen Grund, der Timeout-Test bleibt grün, und die
29 vorbestehenden Tests der Datei bleiben grün.

## Task 2 — Auswahl als eigene Funktion `list_reap_candidates`

Datei: `k3d/default/claude-code-mcp-monolith-deploy.yaml`, Container `postgres`,
`args[0]`. Das Manifest ist ein `kubectl get -o json`-Dump; die Änderung betrifft den
JSON-String in `.spec.template.spec.containers[] | select(.name=="postgres") | .args[0]`.

Der bisherige `grep -qs 'mcp-server-postgres' "$d/cmdline"`-Filter wird ersetzt. Die
Auswahl wandert in eine eigene Funktion, die **ausschließlich PIDs ausgibt und niemals
tötet** — die Trennung von Selektion und Wirkung ist die Voraussetzung dafür, dass die
Auswahl überhaupt prüfbar wird:

```sh
PROC_ROOT="${PROC_ROOT:-/proc}"
MCP_PG_CHILD_MAX_AGE_SECONDS="${MCP_PG_CHILD_MAX_AGE_SECONDS:-300}"
MCP_PG_CHILD_MAX_COUNT="${MCP_PG_CHILD_MAX_COUNT:-12}"

# Gibt "starttime pid" je echtem Child aus, aeltester zuerst. Toetet nichts.
# Drei Guards, siehe design.md:
#   1. argv[1] endet auf /mcp-server-postgres  -> trennt Child vom Parent
#      (Parent: argv[1]=/usr/local/bin/supergateway, Name erst in argv[2];
#       Reaper-Subshell: argv[1]=-c, Name erst in argv[2])
#   2. ppid == 1                               -> Children haengen direkt an supergateway
#   3. pid != 1 und pid != SELF_PID            -> harte Absicherung
list_reap_candidates() {
  _root="${PROC_ROOT:-/proc}"
  # SELF_PID respektiert eine vorgesetzte Variable (Testbarkeit) und ermittelt sich
  # sonst selbst. Die Redirection wird von DIESER Shell ausgefuehrt, /proc/self loest
  # daher auf ihre eigene PID auf. `$$` waere falsch: es liefert in POSIX-sh auch in
  # einer Subshell die PID der Hauptshell (im Container: 1).
  if [ -z "${SELF_PID:-}" ]; then
    read -r SELF_PID _ < "$_root/self/stat" 2>/dev/null || SELF_PID=0
  fi
  for _d in "$_root"/[0-9]*; do
    [ -d "$_d" ] || continue
    _pid=${_d##*/}
    [ "$_pid" = 1 ] && continue
    [ "$_pid" = "$SELF_PID" ] && continue
    # KEIN groessenbasierter Guard ([ -s ... ]) auf cmdline: procfs meldet dort
    # st_size=0 trotz Inhalt, ein solcher Guard ueberspringt live ALLE Prozesse
    # und liefe im Fixture trotzdem gruen (Edge-Case E5).
    _a1=$(tr '\0' '\n' < "$_d/cmdline" 2>/dev/null | sed -n 2p)
    [ -n "$_a1" ] || continue
    case "$_a1" in
      */mcp-server-postgres) ;;
      *) continue ;;
    esac
    _ppid=$(awk '{print $4}' "$_d/stat" 2>/dev/null) || continue
    [ "$_ppid" = 1 ] || continue
    _start=$(awk '{print $22}' "$_d/stat" 2>/dev/null) || continue
    printf '%s %s\n' "$_start" "$_pid"
  done | sort -n
}
```

Die Funktion **muss** im Startkommando bei Spaltenposition 0 beginnen
(`list_reap_candidates() {`) und mit einer `}` bei Spaltenposition 0 enden — der Test
extrahiert sie per `sed -n '/^list_reap_candidates() {/,/^}/p'`.

Akzeptanz: die Fixture-Tests aus Task 1 werden grün
(`returns only genuine children`, `never returns PID 1`,
`never returns the reaper's own subshell`, `ordered oldest first`,
`honours an explicit self-PID exclusion`), `PROC_ROOT` und `list_reap_candidates` sind
im Startkommando nachweisbar.

## Task 3 — Auswahl gegen echtes procfs belegen

Der Fixture-Test allein kann eine ganze Fehlerklasse nicht sehen: ein Fixture aus
regulären Dateien hat `size > 0`, echtes procfs meldet für `cmdline` dagegen
`st_size = 0`. Ein größenbasierter Guard liefe im Fixture grün und selektierte im
Container stumm nichts — genau die Tarnung, an der T002321 gescheitert ist.

Der Test `candidate selection works against real procfs, not just the fixture` startet
dafür `node:20-alpine` mit echten Prozessen und lässt die aus dem Manifest extrahierte
Funktion dagegen laufen.

```bash
tests/unit/lib/bats-core/bin/bats -f 'real procfs' tests/spec/mcp-gateway.bats
```

Akzeptanz: der Smoke-Test wird grün — das echte Child ist in der Kandidatenliste, PID 1
nicht. Läuft der Test lokal ohne Docker, skippt er mit sichtbarer Meldung; in CI
(ubuntu-latest) muss er echt laufen.

## Task 4 — Zwei Kill-Stufen im Reaper-Loop

Gleiche Datei, gleicher String. Die bisherige Schleife wird durch eine ersetzt, die
`list_reap_candidates` nutzt und zwei Stufen fährt:

```sh
reap_stale_children() {
  hz=$(getconf CLK_TCK)
  while true; do
    sleep 60
    up=$(cut -d' ' -f1 "${PROC_ROOT:-/proc}/uptime" | cut -d. -f1)
    kids=$(list_reap_candidates)
    count=$(printf '%s' "$kids" | grep -c . || true)
    rss_sum=0
    for p in $(printf '%s\n' "$kids" | awk '{print $2}'); do
      r=$(awk '/VmRSS/{print $2}' "${PROC_ROOT:-/proc}/$p/status" 2>/dev/null)
      rss_sum=$((rss_sum + ${r:-0}))
    done
    # Stufe 1 — Alter. Schwelle liegt ueber dem statement_timeout (120s).
    survivors=""
    for line in $(printf '%s\n' "$kids" | tr ' ' ':'); do
      start=${line%%:*}; pid=${line##*:}
      [ -n "$pid" ] || continue
      age=$(( up - start / hz ))
      if [ "$age" -gt "$MCP_PG_CHILD_MAX_AGE_SECONDS" ]; then
        echo "reap: age pid=$pid age=${age}s"
        kill -TERM "$pid" 2>/dev/null
      else
        survivors="$survivors $pid"
      fi
    done
    # Stufe 2 — Menge. Faengt einen Request-Burst ab, der die Altersschwelle noch
    # nicht erreicht hat. list_reap_candidates liefert aelteste zuerst.
    n=$(printf '%s' "$survivors" | wc -w)
    if [ "$n" -gt "$MCP_PG_CHILD_MAX_COUNT" ]; then
      excess=$(( n - MCP_PG_CHILD_MAX_COUNT ))
      for pid in $survivors; do
        [ "$excess" -gt 0 ] || break
        echo "reap: count pid=$pid (over cap $MCP_PG_CHILD_MAX_COUNT)"
        kill -TERM "$pid" 2>/dev/null
        excess=$(( excess - 1 ))
      done
    fi
    echo "mcp-server-postgres children: count=$count rss_kb_sum=$rss_sum cap=$MCP_PG_CHILD_MAX_COUNT"
  done
}
```

Der Loop läuft weiterhin im Hintergrund neben `exec supergateway`.

Akzeptanz: der Test `reaper caps the number of live children, not just their age` wird
grün; die Log-Zeile trägt zusätzlich `cap=`.

## Task 5 — Rechenweg des Memory-Limits korrigieren

Gleiche Datei, Container `postgres`. Das Limit bleibt bei `512Mi` — die Begründung wird
auf die gemessene cgroup-Basis umgestellt:

```
gemessen (alter Pod, 156 Children): cgroup memory.current 2032 MB
  => ~13 MB je Child effektiv (nicht 54 MB — RSS-Summe zaehlt shared pages mehrfach)
512Mi:  Parent ~72 MB + Reserve ~60 MB  ->  ~380 MB frei  ->  ~29 Children Kopf
Mengengrenze 12  ->  Faktor ~2,4 Sicherheit
```

Die 54-MB-Annahme aus dem T002321-Design war um Faktor 4 zu hoch; sie darf nicht als
Begründung stehenbleiben.

Akzeptanz: `postgres memory limit is below 2Gi` bleibt grün, der Rechenweg ist im
Manifest-Kommentar oder in der PR-Beschreibung nachvollziehbar.

## Task 6 — Live applizieren und Wirkung verifizieren

Ohne diesen Schritt bleibt der Fix wirkungslos: `k3d/default/` hängt an keiner Flux-
Kustomization. **`kubectl apply -k k3d/default` ist defekt** (T002349 — `includeSelectors:
true` schreibt `managed-by` in den immutablen Deployment-Selector). Bis T002349 behoben
ist, gilt der direkte Weg:

```bash
kubectl apply -f k3d/default/claude-code-mcp-monolith-deploy.yaml --context fleet
kubectl --context fleet rollout status deploy/claude-code-mcp-monolith -n default --timeout=300s
```

Wirkungsnachweis — direkt nach dem Rollout, **vor** Ablauf der 300-s-Schwelle:

```bash
POD=$(kubectl --context fleet get pod -n default -l app=claude-code-mcp-monolith \
  --field-selector status.phase=Running -o jsonpath='{.items[0].metadata.name}')
kubectl --context fleet logs -n default "$POD" -c postgres --tail=5
```

Akzeptanz, in dieser Reihenfolge zu prüfen:

1. Die Log-Zeile meldet ohne einen einzigen MCP-Request `count=0` — **nicht** `count=2`.
   `count=2` bedeutet, dass Parent und Reaper-Subshell weiterhin mitgezählt werden, und
   ist das Abbruchkriterium: dann sofort `kubectl rollout undo` und zurück zu Task 2.
2. Nach mehr als 300 s laufender Pod: `restartCount` des `postgres`-Containers steht
   weiterhin auf 0. Steigt er, killt der Reaper den Parent — ebenfalls sofort
   zurückrollen.
3. Nach mehreren `mcp-postgres`-Tool-Calls steigt `count` und fällt nach Ablauf der
   Schwelle wieder auf den Ruhewert zurück, statt monoton zu wachsen.

Der Restart-Zähler wird als Ausgangswert notiert; die eigentliche Bestätigung ist, dass
er über mehr als 24 h nicht steigt.

## Task 7 — Finale Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:inventory` wird über `task freshness:regenerate` mitgezogen; das regenerierte
`website/src/data/test-inventory.json` gehört in denselben Commit, sonst failt der
Inventory-Check in CI.

Commit-Scope beachten: seit T002328 (PR #3396) ist `mcp` **kein** gültiger Scope mehr.
Dieser Change committet unter `fix(infra)`.

<!-- vitest: kein neuer Test nötig, weil dieser Change ausschließlich das
     Kubernetes-Manifest und BATS-Tests berührt — kein Code unter website/src/. -->
