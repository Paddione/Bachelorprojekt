---
ticket_id: T002251
plan_ref: openspec/changes/flux-bootstrap-sealedsecrets/tasks.md
status: active
date: 2026-07-27
---

# Design: flux-bootstrap-sealedsecrets

_Ticket: T002251 · Branch: `fix/flux-bootstrap-sealedsecrets-T002251`_

## Zweck

Die beiden Flux-Bootstrap-SealedSecrets auf `fleet` tragen in `main` noch
Dummy-Platzhalter statt echter Ciphertexte. Der Cluster kann sie nicht
entschlüsseln (`Synced=False`), wodurch der Bootstrap nicht mehr aus git
reproduzierbar ist. Dieser Fix ersetzt beide Werte durch echte, aus den
Live-Secrets neu gesealte Ciphertexte.

## Root-Cause (empirisch belegt, nicht vermutet)

| Beobachtung | Beweis |
|---|---|
| Beide Dateien tragen Platzhalter | `.dockerconfigjson: AgD_dummy_encrypted_dockerconfigjson_placeholder_for_ghcr_auth`, `token: AgD_dummy_encrypted_token_placeholder_for_flux_webhook` |
| Controller kann nicht dekodieren | `kubectl --context fleet -n flux-system get sealedsecrets` → `illegal base64 data at input byte 3`, `SYNCED=False` für beide |
| Ursache des Decode-Fehlers | Der Unterstrich in `AgD_dummy…` ist kein gültiges Base64-Zeichen — Byte 3 ist genau das `_` |
| `spec.template.metadata` fehlt | Beide Dateien haben nur `template.type`, keinen `name`/`namespace`-Block |
| Bug aktuell maskiert | Die Plain-Secrets `ghcr-auth` + `flux-webhook-token` existieren in `flux-system` (3d21h), manuell beim Bootstrap angelegt → GHCR-Pull und Webhook laufen |
| Einspielpfad der Platzhalter | `Taskfile.yml:4727-4728` (`flux:bootstrap`) wendet beide Dateien imperativ per `kubectl apply` an |

Herkunft: Die Platzhalter stammen aus der T002083-Bootstrap-PR und wurden nie
durch echte `kubeseal`-Ausgaben ersetzt.

## Auswirkung

Kein akuter Ausfall — die Plain-Secrets tragen den Betrieb. Der Schaden ist
latent: ein frisch aufgesetzter `fleet`-Cluster erhält beide Secrets nicht,
womit der GHCR-Pull der OCI-Artefakte und der Flux-Receiver-Webhook ausfallen.
Das verletzt den pull-based-GitOps-Anspruch aus T002083, bei dem git die SSOT
für den Cluster-Zustand ist.

## Fix-Ansatz

Beide SealedSecrets aus den existierenden Live-Secrets neu sealen:

```bash
kubectl --context fleet -n flux-system get secret ghcr-auth -o yaml \
  | kubeseal --cert environments/certs/fleet-mentolder.pem --format yaml \
  > flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml
```

Randbedingungen:

- **Cert ist verifiziert aktuell.** SHA256-Fingerprint von
  `environments/certs/fleet-mentolder.pem` ist
  `06:F7:A7:23:1B:DB:1B:D0:40:B2:2A:59:FB:49:7B:C2:3B:57:38:60:8B:A8:8F:C4:EC:19:D2:B5:2C:2B:CF:97`
  — identisch mit dem Live-Controller-Key in `kube-system`.
  `fleet-korczewski.pem` ist byte-identisch (ein Cluster, ein Controller).
- **Plaintext nie ausgeben.** `kubectl`-Ausgabe direkt in `kubeseal` pipen,
  keine Zwischendatei, kein `echo`.
- **Strict scope beibehalten** (Default). Der Ciphertext bleibt an
  `flux-system/<name>` gebunden — genau die Eigenschaft, die den geretteten
  Stash-Blob disqualifiziert (siehe unten).
- **`spec.template.metadata` muss mit raus.** `kubeseal --format yaml` schreibt
  ihn aus dem Eingabe-Secret; der Controller braucht ihn zum Erzeugen des
  Ziel-Secrets.
- **Secret-Typ erhalten.** `ghcr-auth` ist
  `kubernetes.io/dockerconfigjson`, `flux-webhook-token` ist `Opaque`.

## Verworfene Alternativen

**Werte aus `rescue/flux-bootstrap-secrets-stash11` übernehmen.** Dort steht in
BEIDEN Dateien derselbe Ciphertext (SHA256 identisch, je 936 Zeichen). Wegen
strict scope (Bindung an `namespace/name`) kann ein Blob höchstens für *eines*
der beiden Secrets entschlüsseln — nachweislich ein Copy-Paste-Artefakt und als
Quelle untauglich.

**Sofort in den Secret-SSOT integrieren** (`environments/schema.yaml` →
`env:seal`). Technisch attraktiv, weil `GHCR_PAT` dort schon existiert
(`schema.yaml:954`) und der generische `extra_namespaces`-Mechanismus beliebige
Namespaces bedient. Blockiert aber daran, dass
`scripts/lib/seal-extra-namespaces.sh:87` hart `type: Opaque` schreibt —
`kubernetes.io/dockerconfigjson` braucht erst eine typbewusste Erweiterung.
Diese Änderung am Secret-Pfad **aller** Envs gehört in ein eigenes,
eigenständig reviewbares Ticket (Follow-up), nicht in diesen Fix.
Entscheidung des Platform-Owners, 2026-07-27.

## Nicht Teil dieses Fixes (verifizierte Nicht-Bugs)

Beide stammen aus derselben Stash-Analyse und lösen sich bei Prüfung auf:

- **`RIGGER_HOST_IP` fehlt in `environments/fleet-*.yaml`** — kein Drift.
  `schema.yaml:400` deklariert `required: false` mit dokumentiertem Default,
  `scripts/flux-render-artifact.sh:63` (`apply_schema_defaults`) setzt ihn auf
  `COMFY_HOST_IP`.
- **Sealed-Secret-Kollision der 6 brand-übergreifenden Secrets**
  (`monitoring/grafana-oidc`, `alertmanager-smtp`, `alertmanager-pushover`,
  `otel-collector-auth`, `cert-manager/ipv64-api-key`,
  `workspace-office/collabora-secrets`) — bereits gelöst. `main` rendert in
  getrennte Unterordner `sealed-secrets/mentolder|korczewski`
  (`flux-render-artifact.sh:269-271`), zwei Kustomizations
  (`ks-sealed-secrets.yaml`) greifen darauf zu; beide live `Ready=True`, kein
  Ownership-Konflikt.

## Regressionstest (RED zuerst)

In `tests/spec/workspace-deploy.bats` (SSOT: `openspec/specs/workspace-deploy.md`),
fail-closed und rein statisch — kein Cluster nötig, damit der Test in CI greift:

1. Keine Datei unter `flux/clusters/fleet/bootstrap/` enthält einen
   `AgD_dummy`-Platzhalter.
2. Jedes Bootstrap-SealedSecret hat `spec.template.metadata.name` und
   `.namespace`.
3. Der Ciphertext ist gültiges Base64 nach dem `AgB`-Präfix und in beiden
   Dateien **verschieden** (Guard gegen genau das Copy-Paste-Artefakt aus dem
   Stash).

## Edge-Cases

- **Cert-Rotation** entwertet die Ciphertexte. Der Test prüft deshalb Form, nicht
  Entschlüsselbarkeit; die Live-Verifikation (`Synced=True`) läuft im
  Verify-Task gegen den Cluster.
- **Zwei Brands, ein Controller.** Kein brand-spezifisches Sealing nötig, weil
  beide Certs byte-identisch sind — würde `fleet` je zwei Controller bekommen,
  bräuchte der Bootstrap-Pfad eine Cert-Auswahl.
- **`flux:bootstrap` ist idempotent.** Erneutes `kubectl apply` der korrigierten
  Dateien überschreibt die SealedSecret-Ressource; der Controller erzeugt das
  Ziel-Secret neu. Das existierende Plain-Secret wird dabei übernommen, nicht
  gelöscht.
