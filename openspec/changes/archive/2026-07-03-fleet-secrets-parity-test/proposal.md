# Proposal: fleet-secrets-parity-test

## Why

`tests/spec/fleet-operations.bats` prüft, dass `environments/sealed-secrets/fleet-*.yaml`
alle Keys der Legacy-`environments/sealed-secrets/<brand>.yaml`-Gegenstücke enthält. Der
Test selbst hatte einen Bug (Single-Eval-`yq` bricht bei Multi-Doc-YAML mit leeren
`!!null`-Dokumenten ab und liest nur das erste Dokument) und meldete dadurch
`SEPA_CREDITOR_*`/`SESSIONS_CRON_TOKEN` fälschlich als fehlend. Mit dem korrigierten
Test (`yq eval-all`) kam ein echter Fund zum Vorschein: `environments/sealed-secrets/
fleet-mentolder.yaml` fehlten komplett die SealedSecret-Dokumente für
`coturn/coturn-secrets` und `rustdesk/rustdesk-secrets` — beide aktiv auf dem
`fleet`-Cluster deployt (`task fleet:office:deploy`).

Root Cause: `scripts/lib/seal-extra-namespaces.sh` vergleicht den `owner_brand`-Wert aus
`environments/schema.yaml` (z.B. `mentolder`) direkt gegen `ENV_NAME` (z.B.
`fleet-mentolder`). Seit der Fleet-Konsolidierung stimmen Env-Name und Brand-Name nicht
mehr überein, wodurch der Vergleich immer fehlschlägt und die Shared-Namespace-Secrets
lautlos übersprungen werden — ohne dass `task env:seal` einen Fehler wirft.

Blockiert aktuell PR #2558 (CI-Job `test:factory`/`test:changed` schlägt fehl, weil dieser
vorbestehende Bug durch `RUN_FACTORY=true` erstmals sichtbar wird).

## What

- Test-Fix: `tests/spec/fleet-operations.bats` nutzt `yq eval-all` statt Single-Eval `yq`.
- Root-Cause-Fix: `scripts/lib/seal-extra-namespaces.sh` löst die Brand-Zugehörigkeit über
  `env_vars.BRAND_ID` aus `environments/<ENV_NAME>.yaml` auf (Fallback: `ENV_NAME`), statt
  `ENV_NAME` direkt mit `owner_brand` zu vergleichen.
- Reseal: `environments/sealed-secrets/fleet-mentolder.yaml` neu generiert via
  `task env:seal ENV=fleet-mentolder` — enthält jetzt `coturn-secrets` und
  `rustdesk-secrets` korrekt.

_Ticket: T001584_
