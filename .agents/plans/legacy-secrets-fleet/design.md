# legacy-secrets-fleet — Design (T900789)

## Symptom (Fakt)

`environments/.secrets/{mentolder,korczewski}.yaml` und ihre SealedSecrets gelten laut
`docs/superpowers/references/secrets-architecture.md` als Legacy. Sie werden aber noch gelesen und
angewendet, sobald ein Task mit `ENV=mentolder`/`ENV=korczewski` laeuft:

- `taskfiles/Taskfile.workspace.yml` `workspace:deploy` wendet `sealed-secrets/{{.ENV}}.yaml` an
  (Break-glass und `post-merge.yml` Job `deploy-legacy`).
- `taskfiles/Taskfile.platform.yml` `secrets:sync` wendet `sealed-secrets/${ENV}.yaml` an.
- `env-seal.sh`, `secret-rotate.sh`, GHCR-Token in `Taskfile.workspace.yml`/`Taskfile.web.yml`
  lesen `.secrets/{{.ENV}}.yaml`; `claude-key-picker.sh` liest `.secrets/mentolder.yaml` fest.

## Ursache (belegt)

- `environments/mentolder.yaml` hat `context: fleet`: das Ziel ist der Prod-Cluster.
- `environments/certs/{mentolder,korczewski}.pem` sind byte-gleich mit `fleet-*.pem`: der
  fleet-Controller entschluesselt die Legacy-SealedSecrets vollstaendig.
- `FILEN_EMAIL`/`FILEN_PASSWORD` in `.secrets/mentolder.yaml` weichen vom Live-Secret ab,
  `fleet-mentolder.yaml` stimmt (Hash-Abgleich, Befehle im Ticket).

Ein Break-glass-Deploy oder `secrets:sync` ueberschreibt damit `workspace-secrets` auf fleet mit
veralteten Werten.

## Entscheidung

Ein Env-File darf mit `secrets_env: <name>` angeben, aus welcher Secret-Datei es gespeist wird.
`environments/mentolder.yaml` → `fleet-mentolder`, `korczewski.yaml` → `fleet-korczewski`.
Ein Helper `scripts/lib/secrets-env.sh` (`secrets_env_for <env> [env_dir]`) loest das auf und
faellt ohne Feld auf `<env>` zurueck (dev, staging, fleet-* unveraendert). Alle Stellen, die
`.secrets/<env>.yaml` oder `sealed-secrets/<env>.yaml` bilden, gehen ueber den Helper. Danach
werden die vier Legacy-Dateien geloescht.

Verworfen:
- **Symlinks** legacy → fleet: `git-crypt-guard.sh check-tracked` wertet den Link-Blob als
  Klartext, und Windows-Checkouts mit `core.symlinks=false` erzeugen Textdateien.
- **`ENV=mentolder` abschaffen**: Dutzende Tasks/Runbooks nutzen den Namen fuer Nicht-Secret-Werte.

## Edge-Cases

- `env:seal ENV=mentolder` schreibt nach dem Fix `sealed-secrets/fleet-mentolder.yaml`, aus
  `fleet-mentolder`-Klartext mit gleichem Cert. Das ist gewollt.
- `secrets:sync` iteriert `mentolder korczewski`; aufgeloest auf `fleet-*` (korczewski ist
  eingefroren, das Verhalten bleibt ansonsten gleich).
- `fleet-operations.bats` prueft „fleet ⊇ legacy"; ohne Legacy-Datei entfaellt der Vergleich,
  der Test wird entfernt. `secrets-sync.bats` prueft Pflichtschluessel gegen die Legacy-Sealed;
  er wird auf `fleet-*` umgestellt. `secrets-deploy-automation.bats` prueft die Existenz der
  Legacy-Sealed; umgestellt auf `fleet-*`. `health-goals.bats` liest `.secrets/korczewski.yaml`;
  umgestellt auf `fleet-korczewski.yaml`.
