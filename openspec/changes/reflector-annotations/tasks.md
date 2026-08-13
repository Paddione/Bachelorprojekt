---
title: "reflector-annotations — Implementation Plan"
ticket_id: T002880
domains: [infra, deployment]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# reflector-annotations — Implementation Plan

_Ticket: T002880_

## File Structure

```
prod/wildcard-certificate.yaml                       # secretTemplate entfernen (19 → ~13 Zeilen)
prod-fleet/staging/wildcard-certificate.yaml         # secretTemplate entfernen (19 → ~13 Zeilen)
k3d/coturn-stack/coturn-cert.yaml                    # Stale Reflector-Kommentar korrigieren (3 Zeilen)
tests/spec/fleet-operations/reflector-annotations.bats  # NEU — Guard-Test (bereits im Stage-Commit enthalten)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Guard-Test
      `tests/spec/fleet-operations/reflector-annotations.bats` ist bereits im
      Stage-Commit dieses Branch enthalten und muss auf dem aktuellen Stand
      fehlschlagen (die Manifeste tragen noch die toten Annotationen).
      `expected: FAIL`

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/reflector-annotations.bats
# expected: FAIL (Test 3: reflector.v1.emberstack.eu noch in beiden Wildcard-Manifesten)
```

- [ ] **Fix-Step (GREEN).** Aufgaben 1–4 umsetzen; der Test muss danach
      vollständig grün sein.

- [ ] **Final Verification.** Die drei Pflicht-CI-Gates plus Manifest-Validierung:

```bash
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```

## Tasks

### 1. RED-Lauf dokumentieren (Rotphase, kein Code)

- [ ] 1.1 Guard-Test laufen lassen und das erwartete Fehlschlagen von Test 3
      festhalten (beide Wildcard-Manifeste enthalten noch
      `reflector.v1.emberstack.eu`):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/reflector-annotations.bats
```

### 2. `prod/wildcard-certificate.yaml` bereinigen

- [ ] 2.1 Den kompletten `secretTemplate`-Block (Zeilen 9–13: die vier
      `reflector.v1.emberstack.eu`-Annotationen unter `spec.secretTemplate.annotations`)
      entfernen. Der Block existiert ausschließlich für die Annotationen.
- [ ] 2.2 Kommentarzeile oberhalb von `spec:` ergänzen, die die reale Mechanik
      dokumentiert (Kopien werden vom `tls-sync` CronJob in `prod/reflector.yaml`
      gepflegt — kein Reflector-Controller im Cluster). Datei ist 19 Zeilen,
      nicht gebaselined; der Diff verkleinert sie.

### 3. `prod-fleet/staging/wildcard-certificate.yaml` bereinigen

- [ ] 3.1 Denselben `secretTemplate`-Block (Zeilen 8–13, mit
      `${WEBSITE_NAMESPACE}`-Werten) entfernen.
- [ ] 3.2 Gleichen Dokumentations-Kommentar wie in Aufgabe 2 ergänzen.

### 4. Stale Kommentar in `k3d/coturn-stack/coturn-cert.yaml` korrigieren

- [ ] 4.1 Zeilen 1–2: „reflected via reflector (emberstack)" durch den Verweis
      auf den `tls-sync` CronJob ersetzen (Datei enthält nur Kommentar, wird von
      `k3d/coturn-stack/kustomization.yaml` referenziert).

### 5. GREEN-Lauf (Grünphase)

- [ ] 5.1 Guard-Test erneut ausführen — alle drei Tests müssen grün sein
      (Positiv-Anker auf `tls-sync` CronJob + `kind: Certificate`, Negativ-Aussage
      ohne `reflector.v1.emberstack.eu`-Treffer):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/reflector-annotations.bats
```

### 6. Finale Verifikation

- [ ] 6.1 Die drei Pflicht-Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] 6.2 Manifest-Validierung (Entwicklungsregel 5):

```bash
task workspace:validate
```

- [ ] 6.3 PR eröffnen und mergen (squash) — Ticket wird bei Merge automatisch
      `done · resolution=shipped` (Merge = Abschluss, T001092).
