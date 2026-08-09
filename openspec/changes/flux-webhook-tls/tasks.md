---
title: "flux-webhook-tls — Implementation Plan"
ticket_id: T002869
domains: [infra, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# flux-webhook-tls — Implementation Plan

_Ticket: T002869_

Design und verifizierte Ursachenanalyse: `openspec/changes/flux-webhook-tls/design.md`.

Kurzfassung: Der Webhook-Sofortreconcile ist an drei Stellen unvollständig — unaufgelöste
Platzhalter in der Cluster-IngressRoute, fehlendes TLS-Secret in `flux-system`, fehlende
GitHub-Secrets. Folge: jeder Merge wartet bis zu zehn Minuten auf das Poll-Intervall. Der Change
gibt dem Webhook ein eigenes, selbst erneuerndes Zertifikat und sichert die Platzhalter-Deckung ab.

## Partials

| # | Rolle | Zieldateien |
|---|-------|-------------|
| 1 | tests + fix | `flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml`, `flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml`, `Taskfile.yml`, `tests/spec/flux-render-security/bootstrap-envsubst.bats` |

Ein einzelnes Partial: die drei Manifest-/Task-Änderungen greifen ineinander — das Certificate
erzeugt das Secret, auf das die IngressRoute verweist, und der Task appliziert beide. Getrennt
geplant wären sie zwischenzeitlich inkonsistent.

## File Structure

```
flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml   (neu — Certificate, secretName flux-webhook-tls)
flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml  (geändert — secretName fest statt Platzhalter)
Taskfile.yml                                                  (geändert — flux:bootstrap appliziert das Certificate)
tests/spec/flux-render-security/bootstrap-envsubst.bats       (neu — Guard, liegt im Stage-Commit vor)
openspec/changes/flux-webhook-tls/design.md                   (neu)
openspec/changes/flux-webhook-tls/specs/flux-render-security.md (neu — Delta-Spec)
```

Keine Budget-Angaben: die Änderung umfasst ein kleines neues Manifest, eine geänderte Zeile in der
IngressRoute und wenige Zeilen im `flux:bootstrap`-Task. Die S1-Größenschwellen sind hier ohne
Aussagekraft.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Guard `tests/spec/flux-render-security/bootstrap-envsubst.bats`
      liegt bereits im Stage-Commit dieses Branches. Vor der Implementierung ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/flux-render-security/bootstrap-envsubst.bats
# expected: FAIL — Test 2 ("IngressRoute referenziert ein eigenes TLS-Secret") und Test 3
# ("Certificate fuer den Webhook-Host ist deklariert") sind rot.
# Test 1 ("jeder Platzhalter wird an envsubst uebergeben") ist bereits gruen: der Task deckt
# heute beide Variablen ab — der eingetretene Fehler entstand durch ein Apply an ihm vorbei.
```

      Test 1 wirkt als Kopplung: wird `TLS_SECRET_NAME` aus der `envsubst`-Liste entfernt, muss
      der Platzhalter auch aus der IngressRoute verschwinden, sonst wird Test 1 rot.

- [ ] **Certificate anlegen.** Neue Datei
      `flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml`, an
      `prod/wildcard-certificate.yaml` orientiert, aber ohne Reflector-Annotationen (der Reflector
      läuft auf dem Cluster nicht):

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: flux-webhook
  namespace: flux-system
spec:
  secretName: flux-webhook-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - "flux-webhook.${PROD_DOMAIN}"
```

- [ ] **IngressRoute entkoppeln.** In
      `flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml` das TLS-Feld fest auf das
      neue Secret setzen:

```yaml
  tls:
    secretName: flux-webhook-tls
```

      `${FLUX_WEBHOOK_HOST}` bleibt bestehen — der Host ist brandabhängig und muss substituiert
      werden.

- [ ] **Bootstrap-Task erweitern.** In `Taskfile.yml`, Task `flux:bootstrap`, das Certificate vor
      der IngressRoute applizieren und die `envsubst`-Liste der IngressRoute auf die verbliebene
      Variable reduzieren:

```bash
envsubst "\$PROD_DOMAIN" \
  < flux/clusters/fleet/bootstrap/certificate-flux-webhook.yaml \
  | kubectl --context "$ENV_CONTEXT" apply -f -
envsubst "\$FLUX_WEBHOOK_HOST" \
  < flux/clusters/fleet/bootstrap/ingressroute-flux-webhook.yaml \
  | kubectl --context "$ENV_CONTEXT" apply -f -
```

      Danach muss der Guard vollständig grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/flux-render-security/bootstrap-envsubst.bats
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Nach dem Merge — operative Schritte

Diese Schritte gehören nicht in den PR, sind aber zur Wirksamkeit erforderlich und im Ticket zu
belegen:

1. `task flux:bootstrap ENV=fleet-mentolder` ausführen, oder gezielt nur die beiden Dateien mit
   `envsubst` applizieren, falls der volle Task (er enthält ein `helm upgrade` des
   flux-operators) zu weit greift.
2. Warten, bis `kubectl --context fleet -n flux-system get certificate flux-webhook` `READY=True`
   meldet, und prüfen, dass die IngressRoute jetzt den aufgelösten Host trägt:

```bash
kubectl --context fleet -n flux-system get ingressroute flux-webhook \
  -o jsonpath='{.spec.routes[0].match}{"\n"}'
# erwartet: Host(`flux-webhook.mentolder.de`) — kein literales ${FLUX_WEBHOOK_HOST}
```

3. Repo-Secrets setzen: `FLUX_WEBHOOK_URL` aus Host und `status.webhookPath` des Receivers,
   `FLUX_WEBHOOK_TOKEN` aus dem Cluster-Secret `flux-webhook-token`.
4. Wirkungskontrolle: einen Renderer-Lauf auslösen und prüfen, dass die OCIRepository-Revision
   binnen Sekunden folgt statt erst nach bis zu zehn Minuten.
