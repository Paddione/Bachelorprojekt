---
title: "t002187-pocket-id-seed-fix — Implementation Plan"
ticket_id: T002187
domains: [infra, security]
status: active
file_locks:
  - k3d/pocket-id.yaml
  - k3d/pocket-id-client-seed.yaml
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002187-pocket-id-seed-fix — Implementation Plan

_Ticket: T002187_

## Context

Verifizierte Ursachenkette (Live-Diagnose fleet, 2026-07-26 — Details in `proposal.md`):

| # | Ursache | Beleg |
|---|---------|-------|
| RC-1 | Flux-Apply scheitert an immutablem `Job.spec.template` | `flux-korczewski` Condition: `Job/workspace-korczewski/pocket-id-client-seed dry-run failed (Invalid): … field is immutable` |
| RC-2 | K8s-`$$`→`$`-Escaping zerstört den DO-Block im db-init; Rolle/Passwort werden nie gesetzt | db-init-Log beider Namespaces: `syntax error at or near "$" / LINE 1: DO $ BEGIN`; pocket-id-korczewski: `SQLSTATE 28P01` CrashLoop, 42 Restarts |
| RC-2b | `PASSWORD :'pocket_id_pw'` ist eine nie definierte psql-Variable; kein `ALTER ROLE` → keine Konvergenz | `k3d/pocket-id.yaml`, kein `-v pocket_id_pw=` im Aufruf |
| RC-3 | `ON_ERROR_STOP=0` + unbedingtes `echo "✓ …complete"` → Job meldet `Completed` trotz 4 SQL-Fehlern | `pocket-id-db-init-*`-Pods stehen auf `Completed` |
| RC-4 | Hardcodierte Admin-UUID `a0000000-…` existiert nicht → FK-Verletzung | `INSERT 0 0` + `violates foreign key constraint "api_keys_user_id_fkey"`; reale Admin-IDs `41847e5a-…`, `cb6915ba-…` |
| Drift | `CronJob/pocket-id-client-seed` (`0 3 * * *`) in `workspace` ohne Manifest in `k3d/` | `kubectl.kubernetes.io/last-applied-configuration`-Annotation; 3 fehlgeschlagene Jobs `…-29747580/-29749020/-29750460` |

**Abgrenzung T002207:** Hier wird ausschliesslich dieser Workload repariert. Globale
Flux-`healthChecks`/`wait`-Policy, Drift-Alerting und generische Freeze-Guards gehören nach T002207
und dürfen in diesem Change nicht angefasst werden.

## File Structure

```
k3d/pocket-id.yaml               # M — db-init: SQL auslagern, ALTER ROLE, ON_ERROR_STOP=1, Admin-Lookup
k3d/pocket-id-db-init-sql.yaml   # A — ConfigMap mit dem db-init-SQL (kein $$-Escaping mehr im command)
k3d/pocket-id-client-seed.yaml   # M — kustomize.toolkit.fluxcd.io/force: "enabled" auf dem Job
k3d/kustomization.yaml           # M — neue ConfigMap-Ressource registrieren
tests/spec/auth-sso.bats         # A/M — Regressionstests (Manifest-Invarianten)
```

## Verify (RED → GREEN)

- [ ] **Task 1 — Restursache des mentolder-Jobs nachweisen (Diagnose, read-only, ~1 h).**
      Der Job in `workspace` scheiterte am 2026-07-26 (14:35:53 → 14:41:25), obwohl pocket-id dort
      `1/1 Running` ist; die Pods sind GC'd. Nachweis über
      `kubectl --context fleet -n workspace get job pocket-id-client-seed -o yaml`, Vergleich von
      `sha256(POCKET_ID_API_KEY)` gegen `pocket_id.api_keys.key` (nur Hash-Vergleich, das Secret
      **nie** ausgeben) und einen manuellen
      `curl -H "X-API-KEY: …" http://pocket-id:1411/api/oidc/clients` aus einem Debug-Pod.
      Ergebnis als Kommentar an T002187. Ist es RC-4 (API-Key nicht registriert), deckt Task 5 die
      Reparatur ab; andernfalls Plan hier erweitern.

- [ ] **Task 2 — Failing-Test-Step (RED, ~1 h).** BATS-Regressionstests in
      `tests/spec/auth-sso.bats` ergänzen (Datei anlegen, falls nicht vorhanden):
      (a) kein nacktes `$$` in einem `command:`-Block von `k3d/pocket-id.yaml`;
      (b) das db-init nutzt `ON_ERROR_STOP=1` für den DB/Rollen-Block;
      (c) `k3d/pocket-id-client-seed.yaml` trägt `kustomize.toolkit.fluxcd.io/force: "enabled"`;
      (d) der Admin-Bootstrap enthält keine hardcodierte UUID `a0000000-0000-4000-8000-…`.
      Die Tests müssen auf dem aktuellen Branch fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats
# expected: FAIL (red — der Fix ist noch nicht implementiert)
```

- [ ] **Task 3 — db-init-SQL aus dem command-Escaping herauslösen (~2 h).**
      Neue `k3d/pocket-id-db-init-sql.yaml` (ConfigMap, Key `init.sql`) mit dem DB-/Rollen-SQL; in
      `k3d/pocket-id.yaml` als Volume mounten und mit
      `psql -v ON_ERROR_STOP=1 -v pw="$POCKET_ID_DB_PASSWORD" -f /sql/init.sql` ausführen. Damit
      entfällt jedes `$$`-Escaping im Container-`command`. In `k3d/kustomization.yaml`
      registrieren.

- [ ] **Task 4 — Rollenpasswort konvergent machen (~1 h).**
      Im `init.sql`: `CREATE ROLE`-Block idempotent (`DO … EXCEPTION WHEN duplicate_object`) plus
      ein nachgelagertes `ALTER ROLE pocket_id WITH LOGIN PASSWORD :'pw';`, damit ein rotiertes
      `workspace-secrets`-Passwort tatsächlich in der DB ankommt. Das Passwort kommt aus einem
      `secretKeyRef`-Env, **nicht** aus einer undefinierten psql-Variablen, und darf nie geloggt
      werden.

- [ ] **Task 5 — Admin-/API-Key-Bootstrap gegen den realen User auflösen (~1,5 h).**
      Hardcodierte UUID `a0000000-…` ersetzen durch
      `SELECT id FROM users WHERE username = :'admin_user' AND is_admin LIMIT 1`; den
      `api_keys`-INSERT nur ausführen, wenn ein Admin gefunden wurde, sonst mit `SKIP:`-Meldung
      überspringen. `ON CONFLICT (key) DO NOTHING` beibehalten (Idempotenz).

- [ ] **Task 6 — Erfolgsmeldung an echten Erfolg koppeln (~0,5 h).**
      `echo "✓ Pocket-ID admin bootstrap complete"` nur noch bei tatsächlich erfolgreichem
      Bootstrap ausgeben; der mandatorische DB/Rollen-Block bestimmt via `ON_ERROR_STOP=1` den
      Exit-Code des Containers.

- [ ] **Task 7 — Seed-Job Flux-tauglich machen (~0,5 h).**
      `kustomize.toolkit.fluxcd.io/force: "enabled"` als Annotation auf
      `Job/pocket-id-client-seed` in `k3d/pocket-id-client-seed.yaml` — Flux ersetzt das immutable
      Objekt dann, statt am Dry-Run zu scheitern. Im Header-Kommentar mit T002187 begründen.

- [ ] **Task 8 — Untracked CronJob bereinigen (~0,5 h, Cluster-Änderung → Freigabe einholen).**
      Entscheidung dokumentieren: entweder Manifest in `k3d/` aufnehmen (und in
      `kustomization.yaml` registrieren) oder
      `kubectl --context fleet -n workspace delete cronjob pocket-id-client-seed`. Ohne explizite
      Freigabe von Patrick **keine** Cluster-Mutation.

- [ ] **Task 9 — Fix-Step (GREEN, ~0,5 h).** Die BATS-Tests aus Task 2 müssen jetzt bestehen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats
task workspace:validate
```

- [ ] **Task 10 — Prod-Verifikation nach Merge (~1 h).**
      Nach dem Flux-Reconcile prüfen:
      `kubectl --context fleet -n flux-system get kustomization flux-korczewski` → `Ready=True`;
      `kubectl --context fleet -n workspace-korczewski get pods -l app=pocket-id` → `1/1 Running`
      ohne weitere Restarts; `logs job/pocket-id-client-seed` in beiden Namespaces ohne
      `BackoffLimitExceeded`; db-init-Log frei von `syntax error` und FK-Verletzung.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
