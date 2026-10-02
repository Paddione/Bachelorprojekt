# p2 — Legacy-Dateien entfernen

Target files: `environments/.secrets/{mentolder,korczewski}.yaml`,
`environments/sealed-secrets/{mentolder,korczewski}.yaml`,
`docs/superpowers/references/secrets-architecture.md`.

### Task 1: Loeschen und Doku

`git rm` der vier Dateien. In `secrets-architecture.md` die Legacy-Zeilen und die Fleet-Sync-Regel
durch den Hinweis auf `secrets_env` ersetzen.
