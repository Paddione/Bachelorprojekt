---
title: "dev-brett-auth — Implementation Plan"
ticket_id: T901678
domains: [infra, security, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-brett-auth — Implementation Plan

Schließt die nachgewiesene Fleet-Dev-Konfigurationslücke. Proposal trennt Symptom und Ursache; Design beschreibt genehmigungspflichtige Neuanlage, Secret-Sicherheit und Recovery. Implementierung erfolgt erst nach staging durch den Orchestrator. Zwei Phasen: reviewbarer Draft ohne Live-Mutation, danach Freigabe und vollständige versiegelte Artefakte vor Merge.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `k3d/dev-stack/brett-dev.yaml` | 101 | n/a (YAML ohne S1-Limit) |
| `k3d/dev-stack/oauth2-proxy-dev.yaml` | 170 | n/a (YAML ohne S1-Limit) |
| `scripts/dev-brett-oidc-provision.py` | neu | Python Limit 800, Ziel unter 450 |
| `tests/py/spec/dev-brett-auth/test_oidc_provision.py` | 20 | Budget 780 |
| `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts` | 65 | Budget 835 |
| `docs/runbooks/dev-brett-auth.md` | neu | n/a (Markdown) |
| `k3d/dev-stack/dev-oidc-secrets.yaml` | erst nach Freigabe | n/a (encryptedData; nie Platzhalter) |
| `k3d/dev-stack/kustomization.yaml` | 37 | n/a (Resource erst nach Ciphertext) |
| `components/website/src/data/test-inventory.json` | generiert | n/a (Inventar) |

## Task 1: Rot-Grün-Anker und Sicherheitsvertrag

- [ ] Rotbeleg reproduzieren (expected: FAIL wegen fehlendem BRETT_CLIENT_ID):
```bash
bash scripts/pytest-run.sh tests/py/spec/dev-brett-auth/test_oidc_provision.py -q
```
- [ ] pytest behavioral Tests erweitern: --check mutiert nie, only allowed clients, bestehende Clients niemals secret POST/PUT, Drift fail-closed, Pagination, Timeouts, Secretredaktion, unsichere Receipt-Symlinks, Partial-Failure und ambiguer POST ohne retry. Fake Provider und subprocess Boundary statt Live-Tests.

## Task 2: Operator-Helper und Runbook als Draft

- [ ] `scripts/dev-brett-oidc-provision.py` gemäß design.md implementieren; --check ist default, --apply einzige Schreiboption. Keine Pipeline in Auto-Merge, keine Provider- oder Cluster-Mutation beim Implementieren/Testen.
- [ ] Alle Client-/Secret-Preflights vor erstem CREATE; atomare 0600 Receipt außerhalb Repo vor und nach jedem Übergang. Existing Client ohne bekannten gültigen Secret blockiert, secret POST nur im unmittelbar erfolgreichen CREATE-Zweig.
- [ ] Vorhandenes Sessionsecret wiederverwenden; Ciphertext strict mit live Fleet Cert erstellen, nur nach genehmigtem apply. Keine plaintext Ausgabe/Fehlerdetails, keine API-Key-Weitergabe an child argv. Fehler liefern feste nicht-sensitive Codes.
- [ ] Runbook mit Befehlen, Freigabeeffekt (zwei neue zentrale Dev-Clients), Secret-SSOT/Persistenz, fehlender/ambiguer Antwort Recovery und Rollback ohne automatische Deletes.
- [ ] Draft bleibt ungemerged bis Provisionierung ausdrücklich genehmigt und vollständige SealedSecret geliefert wurde. Genehmigung ist kein Timeout-Default.

## Task 3: Auth-Setup und GitOps-Konfiguration

- [ ] `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts` um optionalen BRETT_AUTH_STATE_PATH erweitern; Default erhalten, Dev-Datei separat, Board/Session vor Save prüfen. Kein E2E bypass-State erfinden.
- [ ] Brett Env/SecretRefs und Dev-Gate SecretRef wie Design setzen; fehlender Ciphertext darf nicht auf main gelangen.
- [ ] Nach ausdrücklicher Operator-Freigabe Helper anwenden; Receipt behalten, Secret-SSOT sichern, Ciphertext validieren, vollständige dev-oidc-secrets Resource erst dann in kustomization.yaml aufnehmen.
- [ ] Kein cluster apply oder Provider-PUT auf bestehenden Clients. Flux deploy/reconciliation wird vor Freigabe nicht ausgelöst. Post-Deploy Auth und /healthz belegen; Bench erst nach T901677 und gesondertem GPU-Kostenentscheid.

## Task 4: Finale Verifikation

- [ ] Rot-Anker grün und Sicherheits-/Recovery-Tests bestehen.
- [ ] Inventar aktualisieren, nur erwartete Artefakte stagen.
```bash
bash scripts/pytest-run.sh tests/py/spec/dev-brett-auth/test_oidc_provision.py -q
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```
- [ ] Relevanten Manifest-Test-ID über Task Oracle oder vorhandenes Testinventar bestimmen und `./tests/runner.sh local <TEST-ID>` ausführen, sofern er ohne genehmigte Live-Mutation arbeitet.
- [ ] CI-Draft klar als blocked-on-provisioning markieren; kein Ticket done bis vollständige grüne Implementierung gemergt ist.

<!-- vitest: kein neuer Test nötig, weil kein Website-Code geändert wird; Python-CLI-Sicherheit erhält pytest und Playwright-Setup wird gezielt validiert. -->
