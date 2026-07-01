# Proposal: t001404-workspace-deploy-secrets-scope

## Why

`task workspace:deploy ENV=<brand>` applyt die komplette `environments/sealed-secrets/<ENV>.yaml` per `kubectl apply -f` (Taskfile.yml:2565) — brand-agnostisch. Wenn die SealedSecret-Datei Dokumente für geteilte Namespaces (`rustdesk`, `coturn`) enthält, überschreibt der zweite Brand-Deploy die Werte des ersten. Im konkreten Vorfall (T001401-Discovery) hat `workspace:deploy ENV=korczewski` mentolders frisch generiertes `RUSTDESK_ID_ED25519(_PUB)`-Schlüsselpaar im shared `rustdesk`-Namespace überschrieben — bei künftigem Pod-Neustart liest hbbs das falsche Schlüsselpaar, Auth-Bruch für mentolder-Clients. Gleiche Risiko-Klasse für `TURN_SECRET`/`SIGNALING_SECRET` im shared `coturn`-Namespace (verifiziert: coturn/janus werden per `task fleet:shared-services` Z. 2394-2404 einmal für beide Brands deployed).

## What Changes

- **`environments/schema.yaml`** — neue optionales Feld `owner_brand: [<brand>, ...]` auf `secrets[*].extra_namespaces[*]`. Shared-Entries (`rustdesk` und `coturn`) bekommen `owner_brand: [mentolder]`. Default (Feld fehlt) bleibt rückwärtskompatibel zu allen Brands.
- **`scripts/lib/seal-extra-namespaces.sh`** — `parse_extra_namespace_entries` emittiert `owner_brand` pro Entry; `seal_extra_namespace_secrets` überspringt Paare, deren `owner_brand` den aktuellen `ENV_NAME` nicht enthält, mit einer INFO-Meldung (Env-Name, Namespace, erlaubte Brands). Außerdem wird `metadata.annotations["secrets.bachelorprojekt/owner-brand"]` auf das resultierende SealedSecret-Dokument geschrieben.
- **`scripts/env-seal.sh`** — minimale Anpassung: `OWNER_BRAND_DEFAULT` Konstante + Weitergabe an das Lib-Modul via Env (`OWNER_BRAND_DEFAULT="mentolder korczewski"`).
- **`Taskfile.yml:2565` Prod-Zweig** — defense-in-depth: nach `env:seal` wird `sealed-secrets/<ENV>.yaml` durch `yq` gefiltert, sodass SealedSecret-Dokumente, deren `metadata.namespace` zu einem shared Namespace gehört UND deren Annotation `owner-brand` nicht den aktuellen ENV enthält, vor dem `kubectl apply` entfernt werden. (Verhindert Folgeschäden falls jemand die SealedSecret-Datei manuell editiert.)
- **`tests/spec/workspace-deploy-secrets-scope.bats`** — neuer BATS-Test mit drei Szenarien: (1) Schema-Static-Check: shared-Entries haben `owner_brand`; (2) env-seal-Filter: korczewski-Lauf erzeugt keine rustdesk/coturn-Dokumente; (3) Annotation auf dem mentolder-Dokument korrekt gesetzt. Stub-kubeseal-Pattern analog zu `tests/spec/env-seal-empty-value-keys.bats`.

## Capabilities

### New Capabilities

- (keine)

### Modified Capabilities

- `workspace-deploy` — Requirement: "SealedSecret-Anwendung respektiert `owner_brand` pro extra_namespaces-Eintrag"; Requirement: "Defense-in-Depth-Filter im Prod-Deploy-Zweig per yq". Delta-Spec unter `openspec/changes/t001404-workspace-deploy-secrets-scope/specs/workspace-deploy.md`.

## Impact

- **Code-Pfade:**
  - `scripts/lib/seal-extra-namespaces.sh` (PyYAML-Block + bash-Filter-Logik)
  - `scripts/env-seal.sh` (OWNER_BRAND_DEFAULT + env-Export)
  - `Taskfile.yml` Prod-Zweig (yq-Filter, ~20 LOC)
- **Daten:**
  - `environments/schema.yaml` (+4 LOC, ein `owner_brand` pro shared-Entry)
  - `environments/sealed-secrets/mentolder.yaml` + `korczewski.yaml` (KORRIGIERTE Output nach `task env:seal ENV=…` — korczewski-Datei verliert die rustdesk/coturn-Dokumente, mentolder-Datei bleibt inhaltlich gleich aber bekommt neue Annotationen)
- **Tests:** neuer BATS-Test, regression für `tests/spec/sealed-secret-cluster-drift.bats` und `tests/spec/env-seal-empty-value-keys.bats`.
- **Operations (post-merge):** einmaliger `task env:seal ENV=mentolder && task workspace:deploy ENV=mentolder` resetet den cluster-State auf die korrekten (mentolder-owned) Schlüsselwerte. Danach sind beide Brand-Deploys idempotent.
- **Breaking change?** Nein — Default (Feld fehlt) verhält sich wie bisher. Nur Operatoren, die `owner_brand` setzen, erhalten das neue Filter-Verhalten.

_Ticket: T001404_
