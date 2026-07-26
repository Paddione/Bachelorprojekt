---
title: "flux-bootstrap-sealedsecrets — Implementation Plan"
ticket_id: T002251
domains: [infra, security]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# flux-bootstrap-sealedsecrets — Implementation Plan

_Ticket: T002251_

## File Structure

| Datei | Ist | S1-Budget |
|---|---|---|
| `flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml` | 12 | kein S1-Gate (`.yaml` fehlt in `gates.yaml` → `s1.limits`) |
| `flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml` | 10 | kein S1-Gate (`.yaml` fehlt in `gates.yaml` → `s1.limits`) |
| `tests/spec/workspace-deploy.bats` | 724 | kein S1-Gate (`.bats` fehlt in `gates.yaml` → `s1.limits`) |

Keine neuen Dateien. Kein `website/src/**`-Bezug, daher kein CQ02-Task.
<!-- vitest: kein neuer Test nötig, weil ausschliesslich k8s-Manifeste und BATS geändert werden -->

## Task 1 — RED-Nachweis: Platzhalter und fehlende template.metadata

Zwei fail-closed BATS-Tests in `tests/spec/workspace-deploy.bats` belegen den Bug,
bevor ein Manifest angefasst wird (in der Plan-Phase geschrieben und committed):

- `T002251: no Flux bootstrap SealedSecret carries a placeholder ciphertext`
- `T002251: every Flux bootstrap SealedSecret declares spec.template.metadata`

Der zweite Test parst mit PyYAML statt `grep`, weil ein SealedSecret zwei
`metadata`-Blöcke hat (`metadata` und `spec.template.metadata`) und ein flaches
`grep` beide zählt.

```bash
bats tests/spec/workspace-deploy.bats --filter "T002251"
```

expected: FAIL — beide Tests rot, mit den `AgD_dummy`-Fundstellen in beiden
Dateien und `missing: spec.template.metadata.name, spec.template.metadata.namespace`.

## Task 2 — `ghcr-auth` neu sealen

Ziel: `flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml` trägt einen
echten, an `flux-system/ghcr-auth` gebundenen Ciphertext.

```bash
kubectl --context fleet -n flux-system get secret ghcr-auth -o yaml \
  | kubeseal --cert environments/certs/fleet-mentolder.pem --format yaml \
  > flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml
```

Randbedingungen:

- Plaintext nie ausgeben. `kubectl`-Ausgabe direkt in `kubeseal` pipen, keine
  Zwischendatei, kein `echo` des Secret-Inhalts.
- Strict scope beibehalten (Default) — der Ciphertext bleibt an
  `flux-system/ghcr-auth` gebunden.
- Secret-Typ bleibt `kubernetes.io/dockerconfigjson`, Key `.dockerconfigjson`.
- `spec.template.metadata.name: ghcr-auth` und `.namespace: flux-system` müssen
  in der Ausgabe stehen.

Formale Prüfung der erzeugten Datei:

```bash
python3 -c "
import yaml, base64
d = yaml.safe_load(open('flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml'))
assert d['metadata']['name'] == 'ghcr-auth'
assert d['metadata']['namespace'] == 'flux-system'
assert d['spec']['template']['metadata']['name'] == 'ghcr-auth'
assert d['spec']['template']['type'] == 'kubernetes.io/dockerconfigjson'
ct = d['spec']['encryptedData']['.dockerconfigjson']
assert not ct.startswith('AgD_dummy'), 'placeholder survived'
base64.b64decode(ct[3:], validate=True)
print('ok', len(ct))
"
```

## Task 3 — `flux-webhook-token` neu sealen

Gleiches Vorgehen für die zweite Datei:

```bash
kubectl --context fleet -n flux-system get secret flux-webhook-token -o yaml \
  | kubeseal --cert environments/certs/fleet-mentolder.pem --format yaml \
  > flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml
```

Abweichung zu Task 2: Typ ist `Opaque`, Key ist `token`. Formale Prüfung analog,
mit `d['spec']['template']['type'] == 'Opaque'` und
`d['spec']['encryptedData']['token']`.

Zusätzliche Pflichtprüfung — die beiden Ciphertexte müssen **verschieden** sein.
Genau das war im geretteten Stash verletzt (derselbe Blob in beiden Dateien, per
strict scope höchstens für eines der Secrets gültig):

```bash
a=$(python3 -c "import yaml;print(yaml.safe_load(open('flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml'))['spec']['encryptedData']['.dockerconfigjson'])")
b=$(python3 -c "import yaml;print(yaml.safe_load(open('flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml'))['spec']['encryptedData']['token'])")
[ "$a" != "$b" ] && echo "ok: Ciphertexte verschieden" || { echo "FAIL: identische Ciphertexte"; exit 1; }
```

## Task 4 — Copy-Paste-Guard fertigstellen

`tests/spec/workspace-deploy.bats` enthält den Test
`T002251: no two Flux bootstrap SealedSecrets share a ciphertext` als
`skip`-Stub. Die drei offenen Entscheidungspunkte (Reichweite,
Vergleichsschlüssel, Granularität) sind im Kommentar über dem Test
dokumentiert; die Policy-Entscheidung liegt beim Platform-Owner. Die
Implementierung ersetzt den `skip` durch die Assertion.

Randbedingung, die der Guard nicht verletzen darf: die 6 brand-übergreifenden
Secrets in `environments/sealed-secrets/fleet-mentolder.yaml` und
`fleet-korczewski.yaml` (`monitoring/grafana-oidc`, `alertmanager-smtp`,
`alertmanager-pushover`, `otel-collector-auth`, `cert-manager/ipv64-api-key`,
`workspace-office/collabora-secrets`) sind legitim byte-identisch — gleicher
`namespace/name`, gleicher Sealing-Key. Ein Duplikat ist nur dann ein Fehler,
wenn sich `metadata.name` oder `metadata.namespace` unterscheiden.

```bash
bats tests/spec/workspace-deploy.bats --filter "share a ciphertext"
```

## Task 5 — Live-Verifikation und Abschluss-Gates

Cluster-seitige Wirkung prüfen — die Formtests in CI können das nicht leisten:

```bash
kubectl --context fleet apply -f flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml
kubectl --context fleet apply -f flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml
kubectl --context fleet -n flux-system get sealedsecrets
```

Erwartung: `ghcr-auth` und `flux-webhook-token` melden beide `SYNCED=True` ohne
`illegal base64 data`-Meldung. Die vorhandenen Plain-Secrets werden übernommen,
nicht gelöscht.

Alle T002251-BATS-Tests grün:

```bash
bats tests/spec/workspace-deploy.bats --filter "T002251"
```

Verbindliche Abschluss-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
