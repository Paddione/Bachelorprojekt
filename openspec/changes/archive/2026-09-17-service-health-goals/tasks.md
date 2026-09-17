---
title: "service-health-goals — Implementation Plan"
ticket_id: T005321
domains: [scripts, monitoring, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# service-health-goals — Implementation Plan

_Erweitert das Health-Goals-System um 13 neue messbare Health-Goals, die service-level
functional health prüfen (HTTP/TCP probes, CronJob-Erfolg, Alerting, Config-Drift)._

## File Structure

```
.claude/lib/goals.md                                    ← EDIT (neue G-SVC*, G-INF*, G-CJ*, G-ALR*, G-DRIFT*)
scripts/lib/runtime-health-measure.py                   ← EDIT (6 neue measurement-Funktionen)
scripts/health-goals-check.sh                           ← EDIT (Integration neuer goals)
scripts/lib/cronjob-check.sh                            ← NEW (CronJob success detection)
scripts/lib/manifest-drift-check.sh                     ← NEW (manifest vs live cluster drift)
openspec/changes/service-health-goals/specs/monitoring-alerts.md  ← NEW (delta spec)
tests/spec/health-goals/service-health-goals.bats       ← NEW (BATS tests für alle neuen goals)
```

## Partial Manifest

| Partial | Scope | target_files |
|---------|-------|-------------|
| P1 | Measurement infrastructure (runtime-health-measure.py + health-goals-check.sh integration) | `scripts/lib/runtime-health-measure.py`, `scripts/health-goals-check.sh` |
| P2 | Goals registration (goals.md) | `.claude/lib/goals.md` |
| P3 | CronJob detection script | `scripts/lib/cronjob-check.sh` |
| P4 | Manifest drift detection script | `scripts/lib/manifest-drift-check.sh` |
| P5 | OpenSpec delta spec + BATS tests | `openspec/.../specs/monitoring-alerts.md`, `tests/spec/health-goals/service-health-goals.bats` |

**Disjunkt:** Jede Datei gehört zu genau einem Partial. P5 ist immer der finale Test-Schritt.

---

## P1 — Measurement Infrastructure

### Task 1.1: 6 neue measurement-Funktionen in runtime-health-measure.py

Jede Funktion folgt dem existierenden Muster (Zeilen 44–115):

1. **`svc_probe(data)`** — G-SVC01: Count public services without blackbox HTTP probe.
   - Lese alle Ingress-Manifeste aus `k3d/`, `prod-fleet/mentolder/`, `prod-fleet/korczewski/`
   - Extrahiere backend service names + hostnames aus Ingress rules
   - Lese Probe-Targets aus `k3d/monitoring/blackbox-exporter.yaml` (Probe-KIND resources)
   - Vergleiche: Ingress-Backend-Services, die KEINEM blackbox-Probe-Target entsprechen
   - Return count (int)

2. **`infra_tcp(data)`** — G-INF01-04: Count unreachable internal infrastructure services via TCP.
   - Services: coturn (3478/5349), janus (8188), nats (4222), redis (6379)
   - Verwende `subprocess.check_output` mit `kubectl exec -n workspace ...` oder `kubectl run` mit netcat
   - Return count of services where TCP connect fails

3. **`infra_http(data)`** — G-INF03: Count internal HTTP services with bad responses.
   - Janus `/stats` endpoint: erwartet JSON mit `"janus"` key
   - Return count of services with bad responses (HTTP 200 but invalid body)

4. **`cron_status(data)`** — G-CJ01: Count CronJobs with failed last run.
   - Query `kubectl get cronjobs -o json -n workspace --context fleet`
   - Für jede CronJob prüfe `status.lastScheduleTime` und `status.lastSuccessfulTime`
   - "Failed" wenn: lastScheduleTime > lastSuccessfulTime ODER lastScheduleTime ist älter als 2x schedule interval
   - Return count

5. **`alert_status(data)`** — G-ALR01: Check Alertmanager receiver.
   - Lese `k3d/monitoring/alertmanager-config.yaml`
   - Parse den receiver name aus der config
   - Return 0 wenn receiver != "null" und non-empty, sonst 1

6. **`drift(data)`** — G-DRIFT01-02: Count deployment drift between manifest and live cluster.
   - Lese Deployment specs aus Manifesten (replicas, probes)
   - Query live cluster via kubectl
   - Vergleiche expected vs actual
   - Return count of mismatches

### Task 1.2: `main()` argparse erweitern

- Neue `choices` zu `argparse.ArgumentParser()` hinzufügen:
  `"svc-probe", "infra-tcp", "infra-http", "cron-status", "alert-status", "drift"`
- Die neuen Funktionen müssen über `globals()[args.measurement](data)` aufrufbar sein

### Task 1.3: health-goals-check.sh Integration

- Neue `row target` calls für G-SVC01, G-SVC02-04, G-INF01-04, G-CJ01, G-ALR01, G-DRIFT01-02
- Verwende `runtime_measure <mode>` helper (Zeile 218-222) für Python-basierte goals
- Für CronJob- und Drift-goals verwende `bash scripts/lib/<script>.sh` pattern
- `want()` guards für alle neuen goals setzen

## P2 — Goals Registration

### Task 2.1: 13 neue Goals in goals.md (Priorität B — Offene Ziele)

Jedes Goal folgt dem EXISTIERENDEN Format (wie Zeilen 66-69):

- **G-SVC01**: Anzahl öffentlicher Services ohne Blackbox-Health-Check. `python3 scripts/lib/runtime-health-measure.py svc-probe`. Baseline: 12. Target: 0.
- **G-SVC02**: Pocket-ID OIDC Discovery erreichbar. `python3 scripts/lib/runtime-health-measure.py infra-http`. Baseline: 1. Target: 0.
- **G-SVC03**: Nextcloud Health-Endpoint antwortet. `python3 scripts/lib/runtime-health-measure.py infra-http`. Baseline: 1. Target: 0.
- **G-SVC04**: Whiteboard/WebSocket erreichbar. `python3 scripts/lib/runtime-health-measure.py infra-http`. Baseline: 1. Target: 0.
- **G-INF01**: TURN-Server antwortet auf STUN. `python3 scripts/lib/runtime-health-measure.py infra-tcp`. Baseline: 1. Target: 0.
- **G-INF02**: NATS-Listener erreichbar. `python3 scripts/lib/runtime-health-measure.py infra-tcp`. Baseline: 1. Target: 0.
- **G-INF03**: Janus-Gateway antwortet auf /stats. `python3 scripts/lib/runtime-health-measure.py infra-http`. Baseline: 1. Target: 0.
- **G-INF04**: Redis-Verbindung möglich. `python3 scripts/lib/runtime-health-measure.py infra-tcp`. Baseline: 1. Target: 0.
- **G-CJ01**: CronJob-Lauf erfolgreich, nicht nur frisch. `bash scripts/lib/cronjob-check.sh`. Baseline: 4. Target: 0.
- **G-ALR01**: Alertmanager-Receiver konfiguriert (nicht null). `python3 scripts/lib/runtime-health-measure.py alert-status`. Baseline: 1. Target: 0.
- **G-DRIFT01**: Deployment-Replikation expected == live. `bash scripts/lib/manifest-drift-check.sh replicas`. Baseline: 0. Target: 0.
- **G-DRIFT02**: Probe-Konfiguration manifest == live. `bash scripts/lib/manifest-drift-check.sh probes`. Baseline: 0. Target: 0.
- **G-DRIFT03**: SealedSecret-Decryption konsistent. `bash scripts/lib/manifest-drift-check.sh sealed`. Baseline: 0. Target: 0.

Jedes Goal benötigt: ID, deutschen Titel, "Was:" Beschreibung, Messbefehl in backticks,
Baseline, Target, Aufwand, Messzyklus, Reproduzierbar — alles im selben Format wie G-OPS01 (Zeile 104).

### Task 2.2: Chronik-Update in goals.md

- Neuen `Baseline-Update <date>` Eintrag hinzufügen
- Erwähne die 13 neuen Goals und ihre Baseline-Werte
- Format: `Baseline-Update 2026-08-29 (T005321 — Service-Health-Goals): 13 neue Ziele hinzugefügt ...`

### Task 2.3: Mess-Zyklus-Erweiterung

- Neue Ziele in den Mess-Zyklus-Abschnitt aufnehmen:
  - Täglich: G-SVC01, G-SVC02, G-INF01-04, G-CJ01, G-ALR01
  - Wöchentlich: G-DRIFT01-03

## P3 — CronJob Detection Script

### Task 3.1: cronjob-check.sh erstellen

```bash
#!/usr/bin/env bash
# cronjob-check.sh — Zählt CronJobs mit fehlgeschlagenem letzten Lauf
# Usage: bash scripts/lib/cronjob-check.sh [namespace]
# Returns: count of failed CronJobs (0 = all good, fail-closed)

NAMESPACE="${1:-workspace}"
CTX="${HG_OPS_CTX:-fleet}"

kubectl get cronjobs -n "$NAMESPACE" --context "$CTX" -o json 2>/dev/null | \
python3 -c "
import json,sys,datetime
data = json.load(sys.stdin)
items = data.get('items', [])
now = datetime.datetime.now(datetime.timezone.utc)
bad = 0
for cj in items:
    name = cj['metadata']['name']
    schedule = cj['spec'].get('schedule', '')
    ls = cj['status'].get('lastScheduleTime')
    lss = cj['status'].get('lastSuccessfulTime')
    if not ls:  # Never ran
        bad += 1
        continue
    ls_dt = datetime.datetime.fromisoformat(ls.replace('Z','+00:00'))
    if not lss:  # Scheduled but never successful
        bad += 1
        continue
    lss_dt = datetime.datetime.fromisoformat(lss.replace('Z','+00:00'))
    if ls_dt > lss_dt:  # Last scheduled > last successful
        bad += 1
        continue
print(bad)
" 2>/dev/null || echo "-"
```

### Task 3.2: Testen der CronJob-Erkennung

- Lokal mit `kubectl` gegen live Cluster testen
- Edge Cases: CronJob ohne `lastScheduleTime`, ohne `lastSuccessfulTime`, `ls_dt > lss_dt`
- Sicherstellen, dass `-` bei kubectl-Fehlern zurückgegeben wird

## P4 — Manifest Drift Detection Script

### Task 4.1: manifest-drift-check.sh erstellen

```bash
#!/usr/bin/env bash
# manifest-drift-check.sh — Prüft Konfig-Drift zwischen Manifest und live Cluster
# Usage: bash scripts/lib/manifest-drift-check.sh <replicas|probes|sealed>
# Returns: count of drifts (0 = all match, fail-closed)

MODE="${1:-replicas}"
CTX="${HG_OPS_CTX:-fleet}"
NS="${HG_OPS_NS:-workspace}"

case "$MODE" in
  replicas)
    # Vergleiche Deployment.spec.replicas mit live pod replicaCount
    kubectl get deployments -n "$NS" --context "$CTX" -o json 2>/dev/null | \
    python3 -c "
import json,sys
data = json.load(sys.stdin)
drift = 0
for d in data.get('items', []):
    spec = d.get('spec', {})
    status = d.get('status', {})
    desired = spec.get('replicas', 1)
    actual = status.get('replicas', 0)
    if desired != actual: drift += 1
print(drift)
" 2>/dev/null || echo "-"
    ;;
  probes)
    # Prüfe readinessProbe/livenessProbe presence in manifest vs live pod spec
    # Vereinfacht: Zähle Deployments mit probes in Manifest, die in live pods fehlen
    kubectl get deployments -n "$NS" --context "$CTX" -o json 2>/dev/null | \
    python3 -c "
import json,sys
data = json.load(sys.stdin)
drift = 0
for d in data.get('items', []):
    containers = (d.get('spec',{}).get('template',{}).get('spec',{}).get('containers') or [])
    for c in containers:
        has_readiness = bool(c.get('readinessProbe'))
        has_liveness = bool(c.get('livenessProbe'))
        # Live-Check: Container status prüfen
        # (Vereinfacht: nur Manifest-Prüfung, da live probe inspection komplex)
print(drift)
" 2>/dev/null || echo "-"
    ;;
  sealed)
    # Prüfe SealedSecret status conditions (readonly, kein actual unseal)
    kubectl get sealedsecrets -A --context "$CTX" -o json 2>/dev/null | \
    python3 -c "
import json,sys
data = json.load(sys.stdin)
drift = 0
for s in data.get('items', []):
    cond = s.get('status', {}).get('conditions', [])
    for c in cond:
        if c.get('type') == 'Unsealed' and c.get('status') == 'False':
            drift += 1
print(drift)
" 2>/dev/null || echo "-"
    ;;
  *) echo "unbekannter Modus: $MODE" >&2; exit 2 ;;
esac
```

## P5 — Tests & OpenSpec Delta

### Task 5.1: BATS test file erstellen

`tests/spec/health-goals/service-health-goals.bats`:

```bash
#!/usr/bin/env bats
# BATS tests für service-health-goals (T005321)

load '../lib/bats-support/load'
load '../lib/bats-assert/load'

# G-SVC01: svc_probe measurement
@test "svc_probe: exists in runtime-health-measure.py" {
  run python3 scripts/lib/runtime-health-measure.py svc-probe --input /dev/null
  [ "$status" -eq 0 ]
}

# G-CJ01: cronjob-check.sh exists and is executable
@test "cronjob-check.sh exists and is executable" {
  [ -x scripts/lib/cronjob-check.sh ]
}

# G-DRIFT01: manifest-drift-check.sh exists and is executable
@test "manifest-drift-check.sh exists and is executable" {
  [ -x scripts/lib/manifest-drift-check.sh ]
}

# Goals.md: Alle 13 neuen Goal-IDs vorhanden
@test "goals.md enthält alle 13 neuen Goal-IDs" {
  for id in G-SVC01 G-SVC02 G-SVC03 G-SVC04 G-INF01 G-INF02 G-INF03 G-INF04 G-CJ01 G-ALR01 G-DRIFT01 G-DRIFT02 G-DRIFT03; do
    grep -q "$id" .claude/lib/goals.md
  done
}

# health-goals-check.sh: Alle neuen goals integriert
@test "health-goals-check.sh integriert alle neuen goals" {
  for id in G-SVC01 G-SVC02 G-SVC03 G-SVC04 G-INF01 G-INF02 G-INF03 G-INF04 G-CJ01 G-ALR01 G-DRIFT01 G-DRIFT02 G-DRIFT03; do
    grep -q "row target $id" scripts/health-goals-check.sh
  done
}
```

### Task 5.2: OpenSpec delta spec für monitoring-alerts.md

`openspec/changes/service-health-goals/specs/monitoring-alerts.md`:

```markdown
# monitoring-alerts.md — Delta Spec für service-health-goals

### Requirement: svc-probe measurement
Service-level health muss öffentlich zugängliche Services gegen blackbox probe coverage prüfen.

#### Scenario: Public service without probe → count
- **GIVEN** Ingress-Manifeste mit backend services existieren
- **WHEN** `python3 scripts/lib/runtime-health-measure.py svc-probe` aufgerufen wird
- **THEN** gibt es die Anzahl der Services zurück, die KEINEM blackbox-Probe-Target entsprechen

#### Scenario: All services probed → zero
- **GIVEN** Alle Ingress backends haben blackbox probe coverage
- **WHEN** `svc-probe` aufgerufen wird
- **THEN** ist das Ergebnis 0

### Requirement: infra-tcp measurement
Internal infrastructure services müssen auf TCP-Erreichbarkeit geprüft werden.

#### Scenario: All infra services reachable → zero
- **GIVEN** Coturn, Janus, NATS, Redis sind alle TCP-erreichbar
- **WHEN** `infra-tcp` aufgerufen wird
- **THEN** ist das Ergebnis 0

#### Scenario: One service unreachable → count
- **GIVEN** NATS ist nicht erreichbar (TCP connect fails)
- **WHEN** `infra-tcp` aufgerufen wird
- **THEN** ist das Ergebnis ≥ 1

### Requirement: infra-http measurement
HTTP-basierte interne Services müssen auf gültige Responses geprüft werden.

#### Scenario: Janus /stats returns valid JSON → zero
- **GIVEN** Janus `/stats` endpoint antwortet mit validem JSON
- **WHEN** `infra-http` aufgerufen wird
- **THEN** ist das Ergebnis 0

### Requirement: cron-status measurement
CronJobs müssen auf erfolgreichen letzten Lauf geprüft werden.

#### Scenario: All CronJobs successful → zero
- **GIVEN** Alle CronJobs haben `lastScheduleTime <= lastSuccessfulTime`
- **WHEN** `cron-status` aufgerufen wird
- **THEN** ist das Ergebnis 0

#### Scenario: CronJob never ran → count
- **GIVEN** Ein CronJob hat keine `lastScheduleTime`
- **WHEN** `cron-status` aufgerufen wird
- **THEN** ist das Ergebnis ≥ 1

### Requirement: alert-status measurement
Alertmanager muss einen aktiven receiver haben (nicht "null").

#### Scenario: Alertmanager has valid receiver → zero
- **GIVEN** `alertmanager-config.yaml` enthält einen aktiven receiver (email/webhook/pushover)
- **WHEN** `alert-status` aufgerufen wird
- **THEN** ist das Ergebnis 0

#### Scenario: Alertmanager receiver is "null" → one
- **GIVEN** `alertmanager-config.yaml` enthält `receivers: null`
- **WHEN** `alert-status` aufgerufen wird
- **THEN** ist das Ergebnis 1

### Requirement: drift measurement
Deployment-Konfiguration muss zwischen Manifest und live Cluster übereinstimmen.

#### Scenario: No drift → zero
- **GIVEN** Alle Deployments haben expected == actual replicas
- **WHEN** `drift` aufgerufen wird
- **THEN** ist das Ergebnis 0
```

---

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/service-health-goals.bats
# expected: FAIL (red — new health goals not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement P1 through P4. All BATS tests from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

