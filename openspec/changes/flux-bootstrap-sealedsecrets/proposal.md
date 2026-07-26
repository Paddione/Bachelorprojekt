# Proposal: flux-bootstrap-sealedsecrets

## Why

Die beiden Flux-Bootstrap-SealedSecrets unter `flux/clusters/fleet/bootstrap/`
tragen in `main` noch die Platzhalter-Ciphertexte aus der T002083-Bootstrap-PR
(`AgD_dummy_encrypted_…`). Der Sealed-Secrets-Controller auf `fleet` scheitert
daran mit `illegal base64 data at input byte 3` — beide Ressourcen stehen live
auf `SYNCED=False`. Zusätzlich fehlt in beiden Dateien der
`spec.template.metadata`-Block, den der Controller zum Erzeugen des
Ziel-Secrets braucht.

Aktuell maskiert: die Plain-Secrets `ghcr-auth` und `flux-webhook-token`
existieren in `flux-system` (manuell beim Bootstrap angelegt), daher laufen
GHCR-Pull und Receiver-Webhook normal. Der Schaden ist latent — ein frisch
aufgesetzter `fleet`-Cluster bekommt beide Secrets nicht, womit der Pull der
OCI-Artefakte und der Flux-Webhook ausfallen. Das widerspricht dem
pull-based-GitOps-Anspruch aus T002083, bei dem git die SSOT für den
Cluster-Zustand ist.

## What

- Beide SealedSecrets aus den existierenden Live-Secrets neu sealen
  (`kubectl … get secret -o yaml | kubeseal --cert environments/certs/fleet-mentolder.pem`).
  Das Cert ist verifiziert aktuell — SHA256-Fingerprint identisch mit dem
  Live-Controller-Key in `kube-system`. Plaintext wird nie ausgegeben.
- `spec.template.metadata.name` + `.namespace` in beiden Dateien ergänzen
  (fällt bei `kubeseal --format yaml` automatisch an) und die Secret-Typen
  erhalten (`kubernetes.io/dockerconfigjson` bzw. `Opaque`).
- Fail-closed BATS-Regressionstest in `tests/spec/workspace-deploy.bats`:
  kein `AgD_dummy`-Platzhalter unter `flux/clusters/fleet/bootstrap/`,
  `template.metadata` vorhanden, Ciphertexte gültig-Base64 und paarweise
  verschieden.

Nicht Teil dieses Changes (Begründung in `design.md`): die SSOT-Integration der
Bootstrap-Secrets über `environments/schema.yaml` + `env:seal` — sie braucht
Secret-Typ-Support in `scripts/lib/seal-extra-namespaces.sh` und läuft als
eigenständig reviewbares Follow-up-Ticket.

_Ticket: T002251_
