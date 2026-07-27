---
title: "mcp-postgres-oom — Implementation Plan"
ticket_id: T002321
domains: [infra, mcp]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-postgres-oom — Implementation Plan

_Ticket: T002321 — Root-Cause und verworfene Alternativen: `openspec/changes/mcp-postgres-oom/design.md`_

Der `postgres`-Container des `claude-code-mcp-monolith` wird alle ~10 h OOMKilled, weil
`supergateway --stateless` pro MCP-Request einen `mcp-server-postgres`-Kindprozess (~54 Mi RSS)
startet und nie beendet. Die Ticket-Hypothese "unbegrenztes Resultset-Buffering" ist durch die
Live-Diagnose widerlegt und wird hier **nicht** umgesetzt.

## File Structure

```
k3d/default/claude-code-mcp-monolith-deploy.yaml   (geändert — Startkommando, Limit, Drift-Annotation)
openspec/specs/mcp-gateway.md                      (geändert — SSOT an Realität angleichen)
tests/spec/mcp-gateway.bats                        (geändert — RED-Tests bereits im Stage-Commit)
```

S1-Hinweis: Für `.yaml`, `.md` und `.bats` definiert `docs/code-quality/gates.yaml` kein
Extension-Limit; keine der drei Dateien ist in `docs/code-quality/baseline.json` gebaselined.
Es besteht daher kein S1-Zeilenbudget, das die Umsetzung einschränkt. S3 ist nicht berührt
(keine Brand-Domain-Literale). S4 ist nicht berührt (keine neue Manifest- oder Skriptdatei —
`k3d/default/kustomization.yaml` referenziert das Deployment bereits).

## Task 1 — RED verifizieren

Die Failing-Tests liegen bereits im Stage-Commit (`tests/spec/mcp-gateway.bats`, Abschnitte
"MCP Postgres Bridge Child-Process Containment" und "MCP Monolith Deployment Reality In SSOT").
Vor jeder Änderung bestätigen, dass sie aus dem richtigen Grund rot sind.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
# expected: FAIL — 7 neue Tests rot (Reaper fehlt, Pins fehlen, Child-Logging fehlt,
# Limit ist 2Gi, Spec behauptet Dekommissionierung, Apply-Weg undokumentiert).
# Die 14 vorbestehenden Tests dieser Datei müssen dabei GRÜN bleiben.
```

Akzeptanz: genau die 7 neuen Tests failen, kein vorbestehender Test kippt.

## Task 2 — Startkommando des `postgres`-Containers härten

Datei: `k3d/default/claude-code-mcp-monolith-deploy.yaml`, Container `postgres`, `args[0]`.
Das Manifest ist ein `kubectl get -o json`-Dump; die Änderung betrifft den JSON-String in
`.spec.template.spec.containers[] | select(.name=="postgres") | .args[0]`.

Drei Änderungen am Startskript:

1. **Version-Pinning.** `npm install -g supergateway @modelcontextprotocol/server-postgres`
   wird zu explizit versionierten Paketen (`supergateway@<x.y.z>`,
   `@modelcontextprotocol/server-postgres@<x.y.z>`). Die zu pinnenden Versionen sind die
   aktuell installierten — vor dem Edit im laufenden Container ermitteln, damit das Pinning
   den verifizierten Ist-Zustand einfriert und nicht blind auf `latest` von heute setzt:

   ```bash
   POD=$(kubectl --context fleet get pod -n default -l app=claude-code-mcp-monolith \
     --field-selector status.phase=Running -o jsonpath='{.items[0].metadata.name}')
   kubectl --context fleet exec -n default "$POD" -c postgres -- \
     npm ls -g --depth=0 supergateway @modelcontextprotocol/server-postgres
   ```

2. **Child-Reaper.** Ein Hintergrund-Loop beendet `mcp-server-postgres`-Prozesse, deren Alter
   `MCP_PG_CHILD_MAX_AGE_SECONDS` überschreitet. Busybox-`ps` in `node:20-alpine` kennt kein
   `etimes`; das Alter wird deshalb über `/proc/<pid>/stat` Feld 22 (starttime in Ticks) gegen
   `/proc/uptime` berechnet — derselbe Weg, mit dem die Diagnose die gleichzeitig gespawnten
   Children nachgewiesen hat. Vorlage, die die Implementierung im Container verifizieren muss:

   ```sh
   MCP_PG_CHILD_MAX_AGE_SECONDS=${MCP_PG_CHILD_MAX_AGE_SECONDS:-300}
   reap_stale_children() {
     hz=$(getconf CLK_TCK)
     up=$(cut -d' ' -f1 /proc/uptime | cut -d. -f1)
     for d in /proc/[0-9]*; do
       pid=${d#/proc/}
       grep -qs 'mcp-server-postgres' "$d/cmdline" || continue
       start=$(awk '{print $22}' "$d/stat" 2>/dev/null) || continue
       age=$(( up - start / hz ))
       [ "$age" -gt "$MCP_PG_CHILD_MAX_AGE_SECONDS" ] && kill -TERM "$pid" 2>/dev/null
     done
   }
   ```

   Der Loop läuft im Hintergrund neben `exec supergateway`. Die Schwelle muss **über** dem
   Query-Timeout aus dem Zusatz unten liegen, damit kein legitimer Langläufer getroffen wird
   (Edge-Case E1 im Design).

3. **Child-Count-Logging.** Derselbe Loop gibt pro Durchlauf eine Zeile mit Anzahl lebender
   `mcp-server-postgres`-Children und deren RSS-Summe auf stdout aus, damit der Anstieg in
   `kubectl logs` **vor** dem Kill sichtbar ist. Das ist die erreichbare Form von
   Ticket-Richtung 3 — eine saubere MCP-Fehlerantwort aus einem SIGKILL-ten Prozess ist
   prinzipiell unmöglich.

Zusätzlich ein Query-Timeout, damit der Reaper eine belastbare Altersschwelle hat: eine
`PGOPTIONS`-Env-Var mit `-c statement_timeout=<n>ms` im `env`-Array des Containers.
**`DATABASE_URL` bleibt unverändert** — die Brand-Auflösung gehört zu T002278 (Welle 2).
`PGOPTIONS` ist eine zusätzliche Zeile im selben `env`-Array; das ist der einzige erwartbare
Merge-Berührungspunkt mit T002278 und trivial auflösbar.

Akzeptanz: die vier Containment-Tests aus Task 1 werden grün.

## Task 3 — Memory-Limit senken und Drift-Annotation bereinigen

Gleiche Datei, Container `postgres`.

- `resources.limits.memory` von `2Gi` auf einen Wert deutlich unter 2048 Mi senken. Bemessung
  nach gemessenem Bedarf, nicht nach runder Zahl (Edge-Case E3): im Normalbetrieb wurden
  ~104 Mi (top) bzw. ~174 Mi cgroup-`memory.current` gemessen, der Parent-Prozess allein liegt
  bei ~72 Mi. Der gewählte Wert muss Raum für mehrere gleichzeitige Children plus Reserve
  lassen und trotzdem einen Regress binnen Stunden auslösen. Den Rechenweg als Kommentar oder
  in der PR-Beschreibung festhalten.
- Die `kubectl.kubernetes.io/last-applied-configuration`-Annotation im Manifest enthält noch die
  alte `--stateful`-Variante und widerspricht dem tatsächlichen `--stateless`-Startkommando
  (Constraint C4). Diese Drift auflösen, damit die Datei nicht zwei widersprüchliche Wahrheiten
  trägt.

Akzeptanz: der Limit-Test aus Task 1 wird grün; `task workspace:validate` bleibt grün.

## Task 4 — SSOT-Spec an die Realität angleichen

Datei: `openspec/specs/mcp-gateway.md`.

Der Spec trägt seit 2026-06-22 die Notiz, der `claude-code-mcp-monolith` sei dekommissioniert
und MCP-Server liefen ausschließlich als CLI-Prozesse auf dem WSL-Host. Der Pod läuft
nachweislich (56 Restarts, `restartCount` live abgefragt) und sein Manifest liegt im Repo.
Zwei Korrekturen:

- Die Aussage über den Betriebszustand des Monolithen mit dem Ist-Zustand in Einklang bringen.
  Der Spec darf den Monolithen nicht als dekommissioniert führen, solange
  `k3d/default/claude-code-mcp-monolith-deploy.yaml` ausgeliefert wird und der Pod läuft.
  Dass die Ablösung noch zur Entscheidung steht (T002311/T002312), gehört als offener Punkt
  benannt — nicht als vollzogene Tatsache.
- Den Apply-Weg dokumentieren: `k3d/default/` wird von keiner Overlay- oder Flux-Kustomization
  referenziert (verifiziert per Grep über `k3d/`, `prod*/`, `flux/`). Die Ressourcen gehen nur
  über einen expliziten `kubectl apply -k k3d/default` mit Context `fleet` live, nicht über die
  Flux-Pipeline.

Akzeptanz: die beiden SSOT-Tests aus Task 1 werden grün.

## Task 5 — Live applizieren und Wirkung verifizieren

Ohne diesen Schritt bleibt der Fix wirkungslos: `k3d/default/` hängt an keiner Pipeline
(Constraint C3). Nach dem Merge auf `main` applizieren und die Wirkung belegen.

```bash
kubectl apply -k k3d/default --context fleet
kubectl --context fleet rollout status deploy/claude-code-mcp-monolith -n default
```

Wirkungsnachweis — nach dem Rollout mehrere `mcp-postgres`-Tool-Calls absetzen, dann über der
Reaper-Schwelle erneut messen:

```bash
POD=$(kubectl --context fleet get pod -n default -l app=claude-code-mcp-monolith \
  --field-selector status.phase=Running -o jsonpath='{.items[0].metadata.name}')
kubectl --context fleet exec -n default "$POD" -c postgres -- ps -o pid,ppid,rss,args ax
kubectl --context fleet logs -n default "$POD" -c postgres --tail=20
```

Akzeptanz: die Zahl lebender `mcp-server-postgres`-Children fällt nach Ablauf der Schwelle
wieder auf den Ruhewert zurück statt monoton zu wachsen, und die Child-Count-Zeile erscheint
in den Logs. Der Restart-Zähler wird als Ausgangswert für die Nachbeobachtung notiert — die
eigentliche Bestätigung ist, dass er über mehr als 24 h (deutlich über dem bisherigen
~10-h-Zyklus) nicht weiter steigt.

## Task 6 — Finale Verifikation

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

<!-- vitest: kein neuer Test nötig, weil dieser Change ausschließlich Kubernetes-Manifest,
     SSOT-Spec und BATS-Tests berührt — kein Code unter website/src/. -->
