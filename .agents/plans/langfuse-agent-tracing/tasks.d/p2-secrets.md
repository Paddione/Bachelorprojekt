# p2 — Langfuse-Secrets

Target files: `environments/schema.yaml`, `environments/sealed-secrets/dev.yaml`.

### Task 1: Schema-Einträge

In `environments/schema.yaml` einen Block `# Langfuse agent tracing (devmesh only, T900688)` nach
dem `FACTORY_OTLP_TOKEN`-Eintrag. Alle Einträge `required: false` (nur ENV=dev nutzt sie, fleet
bleibt unberührt), landen in `workspace-secrets`:

| Name | Erzeugung |
|---|---|
| `LANGFUSE_DB_PASSWORD` | `generate: true`, `length: 32` |
| `LANGFUSE_NEXTAUTH_SECRET`, `LANGFUSE_SALT` | `generate: true`, `length: 32` |
| `LANGFUSE_ENCRYPTION_KEY` | 64 Hex-Zeichen (`openssl rand -hex 32`); unterstützt der Generator kein Hex, `generate: false` mit Beschreibung des Befehls |
| `LANGFUSE_CLICKHOUSE_PASSWORD`, `LANGFUSE_REDIS_AUTH`, `LANGFUSE_S3_SECRET` | `generate: true`, `length: 32` |
| `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` | `generate: false`, Format `pk-lf-<uuid>` |
| `LANGFUSE_INIT_PROJECT_SECRET_KEY` | `generate: false`, Format `sk-lf-<uuid>` |
| `LANGFUSE_INIT_USER_EMAIL`, `LANGFUSE_INIT_USER_NAME`, `LANGFUSE_INIT_USER_PASSWORD` | `generate: false` bzw. Passwort `generate: true`, `length: 24` |

Vor dem Schreiben prüfen, welche Generator-Optionen `scripts/env-*.sh` tatsächlich kennt
(`grep -rn 'generate' scripts/env-*.sh`), und nur diese verwenden.

### Task 2: Siegeln

```bash
bash scripts/vda.sh oracle 'seal secrets for the dev environment'
```

Den genannten Task ausführen (erwartet `task env:seal ENV=dev`). Fehlende `generate: false`-Werte in
`environments/.secrets/dev.yaml` setzen: Keys per `echo "pk-lf-$(uuidgen)"` / `echo "sk-lf-$(uuidgen)"`,
Admin-Mail aus dem Git-User. Ergebnis: neue Keys in der SealedSecret `workspace-secrets` in
`environments/sealed-secrets/dev.yaml`.

```bash
yq ea -r 'select(.metadata.name == "workspace-secrets") | .spec.encryptedData | keys | .[]' environments/sealed-secrets/dev.yaml | grep -c '^LANGFUSE_'
```

Erwartet: 12 (die Datenbank-URL wird im Pod aus `LANGFUSE_DB_PASSWORD` zusammengesetzt).
