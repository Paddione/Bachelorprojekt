---
title: "fleet-secrets-parity-test — Implementation Plan"
ticket_id: T001584
domains: [infra, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fleet-secrets-parity-test — Implementation Plan

_Ticket: T001584_

## File Structure

```
tests/spec/fleet-operations.bats            (changed, 166 lines, S1: nicht-baselined)
scripts/lib/seal-extra-namespaces.sh         (changed, 208 lines, S1: nicht-baselined)
environments/sealed-secrets/fleet-mentolder.yaml  (regenerated via task env:seal, not hand-edited)
docs/superpowers/specs/2026-07-03-fleet-secrets-parity-test-design.md  (new, root-cause spec)
```

## Task 1: Test-Fix — Multi-Doc-YAML korrekt lesen (RED → GREEN)

`tests/spec/fleet-operations.bats` Zeile ~42-43 nutzte Single-Eval
`yq '.spec.encryptedData | keys | .[]' <file>`, das bei den 19 durch `---`
getrennten Dokumenten in `environments/sealed-secrets/fleet-mentolder.yaml`
(einige davon leer/`!!null`) beim ersten Null-Dokument mit
`Error: cannot get keys of !!null` abbricht und nur die Keys des ersten
Dokuments zurückgibt.

- [ ] **Failing-Test-Step (RED).** Auf dem unveränderten Branch (vor diesem
      Fix) schlägt der Test mit einem falschen Befund fehl:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
# expected: FAIL — "Keys missing in sealed-secrets/fleet-mentolder.yaml:
#   SEPA_CREDITOR_BIC SEPA_CREDITOR_IBAN SEPA_CREDITOR_ID SESSIONS_CRON_TOKEN"
# (falsch: diese Keys existieren bereits, nur im 5. YAML-Dokument, das
# Single-Eval-yq wegen des vorherigen !!null-Dokuments nie erreicht)
```

- [ ] **Fix-Step (GREEN).** Ersetze in `tests/spec/fleet-operations.bats` die
      beiden `yq '.spec.encryptedData | keys | .[]' ...`-Zeilen durch
      `yq eval-all 'select(.spec.encryptedData != null) | .spec.encryptedData | keys | .[]' ...`
      (überspringt Null-Dokumente, sammelt Keys über alle Dokumente).

## Task 2: Root-Cause-Fix — Brand-Auflösung statt Env-Name-Vergleich

Mit dem Test-Fix aus Task 1 bleibt ein echter Fund übrig: In
`environments/sealed-secrets/fleet-mentolder.yaml` fehlen komplett die
SealedSecret-Dokumente für `coturn/coturn-secrets` und
`rustdesk/rustdesk-secrets` (beide aktiv über `task fleet:office:deploy` auf
den `fleet`-Cluster deployt).

Ursache: `scripts/lib/seal-extra-namespaces.sh` (Funktion
`seal_extra_namespace_secrets`) vergleicht `owner_brand` aus
`environments/schema.yaml` (z.B. `mentolder`) direkt gegen den globalen
`ENV_NAME` (z.B. `fleet-mentolder`) — seit der Fleet-Konsolidierung stimmen
Env-Name und Brand-Name nicht mehr überein, wodurch der Vergleich immer
fehlschlägt und die Dokumente lautlos übersprungen werden (`env:seal` wirft
keinen Fehler).

- [ ] **Fix-Step.** In `seal_extra_namespace_secrets()`: vor der
      `ns_map`-Schleife die Brand über `env_vars.BRAND_ID` aus dem bereits
      global gesetzten `ENV_FILE` (`environments/<ENV_NAME>.yaml`) auflösen
      (`yq '.env_vars.BRAND_ID // ""' "$ENV_FILE"`), mit Fallback auf
      `ENV_NAME` selbst wenn Datei/Key fehlt. Den bisherigen
      `"${brand,,}" == "${ENV_NAME,,}"`-Vergleich durch
      `"${brand,,}" == "$brand_lc"` ersetzen (aufgelöste Brand statt
      Env-Name).
- [ ] **Reseal.** `task env:seal ENV=fleet-mentolder` ausführen — Diff in
      `environments/sealed-secrets/fleet-mentolder.yaml` committen (jetzt mit
      `coturn-secrets` + `rustdesk-secrets`).

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Siehe Task 1 — Test schlägt vor dem Fix
      fehl (`expected: FAIL`, siehe Begründung oben).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
# expected: FAIL (red — vor Anwendung der Task-1/Task-2-Fixes)
```

- [ ] **Fix-Step (GREEN).** Nach beiden Fixes ist der Test grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations.bats
# alle 8 Tests ok, inkl. "fleet-* sealed secrets contain all non-legacy keys..."
```

- [ ] **Regressions-Check.** Owner-brand-Filter-Grundfunktion bleibt intakt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy-secrets-scope.bats
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
