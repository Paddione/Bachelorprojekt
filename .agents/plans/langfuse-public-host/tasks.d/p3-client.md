# p3 — Client-Credentials

Target files: `scripts/langfuse/client-env.sh`.

### Task 1: Base-URL

`LANGFUSE_BASE_URL` = `https://${LANGFUSE_PUBLIC_HOST}` statt `https://langfuse.$domain`.
`LANGFUSE_PUBLIC_HOST` kommt aus `source scripts/env-resolve.sh dev`. Fehlt sie, Exit 2 mit
Meldung `LANGFUSE_PUBLIC_HOST is missing from environments/dev.yaml`. Die `DEVMESH_DOMAIN`-Prüfung entfällt,
wenn sie danach unbenutzt ist.
