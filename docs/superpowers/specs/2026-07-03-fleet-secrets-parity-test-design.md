---
ticket_id: T001584
plan_ref: openspec/changes/fleet-secrets-parity-test/tasks.md
status: active
date: 2026-07-03
---

# fleet-secrets-parity-test — Root-Cause & Fix-Ansatz

## Root-Cause 1: Test liest nur das erste YAML-Dokument

`tests/spec/fleet-operations.bats` (Test "fleet-* sealed secrets contain all
non-legacy keys from their legacy counterparts") verglich Keys via
`yq '.spec.encryptedData | keys | .[]' <file>`. `environments/sealed-secrets/*.yaml`
sind aber Multi-Doc-YAML (19 durch `---` getrennte Dokumente inkl. leerer
`!!null`-Dokumente, produziert von `env-seal.sh`). Single-Eval-`yq` bricht beim
ersten `!!null`-Dokument mit `Error: cannot get keys of !!null` ab und liefert nur
die Keys des allerersten Dokuments — der Test verglich faktisch nur einen winzigen
Ausschnitt und meldete `SEPA_CREDITOR_*`/`SESSIONS_CRON_TOKEN` fälschlich als fehlend
(diese Keys sind längst vorhanden, nur im 5. Dokument).

Fix: `yq eval-all 'select(.spec.encryptedData != null) | .spec.encryptedData | keys | .[]'`
(überspringt Null-Dokumente, sammelt über alle Dokumente).

## Root-Cause 2: owner_brand-Filter vergleicht gegen ENV_NAME statt Brand

Mit dem korrigierten Test kam ein echter Fund zum Vorschein: In
`environments/sealed-secrets/fleet-mentolder.yaml` fehlten die kompletten
SealedSecret-Dokumente für `coturn/coturn-secrets` und `rustdesk/rustdesk-secrets`
(nicht nur einzelne Keys). Beide werden aktiv auf dem `fleet`-Cluster deployt
(`task fleet:office:deploy` → `kustomize build k3d/coturn-stack` /
`k3d/rustdesk-stack` → `kubectl --context fleet apply`), sind also kein totes Gewebe.

`scripts/lib/seal-extra-namespaces.sh` filtert `extra_namespaces`-Einträge per
`owner_brand` (T001404, verhindert dass z.B. ein korczewski-Deploy die
mentolder-eigenen Shared-Namespace-Secrets überschreibt). Der Vergleich lautete
`"${brand,,}" == "${ENV_NAME,,}"` — für `ENV_NAME=fleet-mentolder` gegen
`owner_brand: [mentolder]` schlägt das immer fehl (String-Mismatch), seit der
Fleet-Konsolidierung Env-Namen von `mentolder` auf `fleet-mentolder` umgestellt hat.
Die Werte liegen korrekt in `environments/.secrets/fleet-mentolder.yaml` vor — es
wurde nie erneut versiegelt, weil `env:seal` die Dokumente lautlos übersprang.

Fix: Brand-Auflösung über `env_vars.BRAND_ID` aus `environments/<ENV_NAME>.yaml`
(z.B. `fleet-mentolder.yaml` → `BRAND_ID: mentolder`), Fallback auf `ENV_NAME`
selbst wenn Datei/Key fehlt (legacy/Test-Envs bleiben unverändert). Danach
`task env:seal ENV=fleet-mentolder` neu ausgeführt → `coturn-secrets` +
`rustdesk-secrets` jetzt korrekt enthalten.

## Betroffene Subsysteme

- `tests/spec/fleet-operations.bats` — Test-Fix (yq eval-all)
- `scripts/lib/seal-extra-namespaces.sh` — Brand-Resolution-Fix
- `environments/sealed-secrets/fleet-mentolder.yaml` — regeneriert via `task env:seal`

## Edge Cases geprüft

- `fleet-korczewski`: aktuell keine `owner_brand: [korczewski]`-Einträge in
  `environments/schema.yaml` → kein aktueller Impact, Fix ist aber allgemein
  (greift automatisch, sobald künftig ein korczewski-eigenes Shared-Secret
  hinzukommt).
- Legacy `ENV=mentolder`/`ENV=korczewski` (ohne `fleet-`-Präfix): `BRAND_ID` im
  Env-File ist identisch zum Env-Namen → Verhalten unverändert.
- Regressionstest `tests/spec/workspace-deploy-secrets-scope.bats` (owner_brand-
  Filter-Grundfunktion) bleibt grün.
