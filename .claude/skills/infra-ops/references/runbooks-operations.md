# infra-ops Runbooks — §4 Pocket ID · §5 LLM Ops · §6 Secret Rotation · §7 Database Ops

Ausformulierte Phasen zu den Sektionen 4–7 von [`../SKILL.md`](../SKILL.md). Die verbindlichen
Invarianten (Reihenfolge, „nie im UI ändern", Zwei-Instanzen-Regel, 2FA) stehen dort im Body,
nicht hier — diese Datei enthält die Befehlsfolgen.

---

## §4 — Pocket ID OIDC Client Seeding

### Wo der Client-State lebt

| Ebene | Ort |
|-------|-----|
| Provider | `k3d/pocket-id.yaml` (`ghcr.io/pocket-id/pocket-id`), eigene Postgres-Instanz |
| Client-State | **DB** `pocket_id.oidc_clients` — keine Datei, kein Git-Artefakt |
| Provisionierung | Job `pocket-id-client-seed` (`k3d/pocket-id-client-seed.yaml`) via Pocket-ID Admin REST API, läuft bei **jedem** `task workspace:deploy` |
| Secret-Rückschreibung | `workspace-secrets`; der **website**-Client zusätzlich in `website-secrets` (andere Namespace, T001435 — RBAC: `k3d/pocket-id-client-seed-website-rbac.yaml`) |

### Phases

> **Status-Reads MCP-first:** Pod-Status/Logs bevorzugt über
> `mcp__mcp-kubernetes__pods_list_in_namespace({ namespace: "workspace" })` /
> `mcp__mcp-kubernetes__pods_log({ namespace: "workspace", name: "<pocket-id-pod>" })` (read-only);
> die `task workspace:status`/`logs`-Aufrufe unten sind der Fallback. Mutations
> (`task secrets:sync`, deploys) bleiben unverändert.

```bash
# Phase 1: Pre-check (Fallback — siehe MCP-first oben)
task workspace:status ENV=<env>  # pocket-id pod: 1/1 Running?
task workspace:logs ENV=<env> -- pocket-id

# Phase 2: Seed-Job-Definition anpassen (falls Client-Config sich ändert)
#   k3d/pocket-id-client-seed.yaml — Clients, Redirect-URIs, Secret-Keys

# Phase 3: Seed neu ausführen
# Der Job hat einen stabilen Namen und wird beim Deploy angelegt; zum Erzwingen löschen:
kubectl --context fleet -n workspace delete job pocket-id-client-seed --ignore-not-found=true
kubectl --context fleet -n workspace-korczewski delete job pocket-id-client-seed --ignore-not-found=true
# danach: task workspace:deploy ENV=<brand>

# Phase 4: Clients verifizieren (Pocket-ID Admin UI):
# auth.<domain>/admin → Applications → Redirect-URIs prüfen

# Phase 5: SSO-Flow testen (Browser, Inkognito)
```

### Troubleshooting

| Error | Fix |
|-------|-----|
| `401 Unauthorized` | `POCKET_ID_API_KEY` in `workspace-secrets` prüfen; pocket-id-Pod ready? |
| `409 Conflict` | Client existiert bereits — Seed-Skript muss auf update gehen, nicht create |
| Website login loop | Redirect-URIs des `website`-Clients prüfen |
| Nextcloud OIDC error | Client-Secret re-seal + redeploy; `security-specialist` Skill |
| "Invalid client secret" | Klassiker (T001327): Seed generierte ein neues Secret, die App liest den alten Wert aus dem k8s-Secret → `security-specialist` Skill, Secrets neu alignen |

---

## §5 — LLM Ops

| Kontext | GPU Host IP | Services | Task-Prefix |
|---------|-------------|----------|-------------|
| WSL local dev | `10.10.0.3` | Ollama, LM Studio | `task openclaw:*` |
| Dev k3d | `172.17.0.1` | TEI embed, LM Studio | `task llm:* ENV=dev` |
| Prod fleet | `192.168.100.10` | TEI embed, LM Studio, ComfyUI, Rigger | `task llm:* ENV=mentolder\|korczewski` |

### Phase 1 — GPU Host Bootstrap

```bash
bash scripts/llm-host-setup.sh
task llm:pull-models HOST=<wg-mesh-ip>
```

### Phase 2 — Deploy

```bash
task llm:deploy ENV=<env>
```

Benötigt in `environments/<env>.yaml`: `LLM_HOST_IP`, `LLM_ENABLED=true`, `LLM_RERANK_ENABLED=false`.

### Phase 3 — Status

```bash
task llm:status ENV=<env>
kubectl --context fleet -n <ns> get endpoints llm-gateway-embed llm-gateway-lmstudio
```

### Phase 4 — Test

```bash
task llm:test ENV=<env>
```

### Phase 5 — Logs

```bash
ssh <GPU_HOST> "docker logs tei-embed --tail 200"
kubectl --context fleet -n <ns> get events --field-selector involvedObject.name=llm-gateway-embed
```

### Phase 6 — Model Management

```bash
task llm:pull-models HOST=<wg-mesh-ip>
ssh <GPU_HOST> "ollama list && ollama pull qwen2.5:14b-instruct-q4_K_M"
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Gateway Endpoints leer | `LLM_HOST_IP` in `environments/<env>.yaml` prüfen |
| `/v1/embeddings` 503 | `ssh <GPU_HOST> docker ps` — tei-embed running? `nvidia-smi` |
| `/v1/chat` 401/timeout | LM Studio UI prüfen; `LLM_ROUTER_API_KEY` in website-secrets |
| ComfyUI unreachable | `COMFY_PORT` darf NICHT 8188 sein (Janus-Konflikt) |
| GPU OOM | `nvidia-smi`; Modell verkleinern oder TEI neu starten |

---

## §6 — Secret Rotation

### Scope — Typ wählen

| Typ | Wann |
|-----|------|
| **A. DB-Password-Drift** | Service kann nach Re-seal nicht mehr auf shared-db connecten |
| **B. Neu generieren + versiegeln** | Erste Einrichtung, periodische Rotation, veraltete `.secrets/` |
| **C. SealedSecrets-Keypair** | Nach Cluster-Reset — alte sealed files nicht mehr entschlüsselbar |
| **D. Claude Code Token** | Auth-Proxy oder Agent-Token cycling |
| **E. Einzelner Service** | Individual credential geändert |

### Typ A — DB-Password-Drift

```bash
# Was ist im SealedSecret?
kubectl get secret workspace-secrets -n <NS> --context <CTX> \
  -o jsonpath='{.data.<KEY>}' | base64 -d
# DB-Rolle auf SealedSecret-Passwort bringen:
task workspace:sync-db-passwords ENV=mentolder
task workspace:sync-db-passwords ENV=korczewski
```

### Typ B — Neu generieren + versiegeln

```bash
task env:generate ENV=<env>
task env:seal ENV=<env>
task secrets:sync
task workspace:restart ENV=<env> -- <service>
git add environments/sealed-secrets/<env>.yaml
git commit -m "chore(secrets): rotate <env> secrets"
```

### Typ C — Keypair Refresh (nach Cluster-Reset)

```bash
task sealed-secrets:install ENV=<env>
task env:fetch-cert ENV=<env>
task env:seal ENV=<env>
git add environments/sealed-secrets/<env>.yaml environments/certs/<env>.pem
git commit -m "chore(secrets): re-seal <env> after keypair reset"
task workspace:deploy ENV=<env>
```

### Typ D — Claude Code Token

```bash
task claude-code:rotate-tokens
task mcp:status
```

### Cross-Brand Checklist

```bash
task env:fetch-cert ENV=mentolder && task env:fetch-cert ENV=korczewski
task env:seal ENV=mentolder && task env:seal ENV=korczewski
task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski
```

### Verification

Status-Reads — **MCP-first** (`mcp-kubernetes`, read-only):

> `mcp__mcp-kubernetes__pods_list_in_namespace({ namespace: "workspace" })` — alle Pods 1/1 Running?
> `mcp__mcp-kubernetes__pods_log({ namespace: "workspace", name: "<pocket-id|nextcloud|website>-pod" })`

Fallback (mcp-kubernetes nicht erreichbar):

```bash
task workspace:status ENV=<env>
task workspace:logs ENV=<env> -- pocket-id
task workspace:logs ENV=<env> -- nextcloud
task workspace:logs ENV=<env> -- website
```

### Troubleshooting (`task secrets:sync`)

| Symptom | Fix |
|---------|-----|
| `secrets/xxx not found` | Controller-Logs prüfen; `kubectl get sealedsecret -n <ns>` |
| `adoption refused` | `kubectl delete secret <name> -n <ns>` |
| Decryption fails | `task env:fetch-cert ENV=<env>` → `task env:seal` → `secrets:sync` |

---

## §7 — Database Ops

### Phase 1 — Schema Migration

```bash
# Step 1.1: SQL in scripts/datamodel/ erstellen
# BEGIN; CREATE TABLE IF NOT EXISTS ...; COMMIT;

# Step 1.2: Dev-Test
task workspace:psql ENV=dev -- website < scripts/datamodel/<migration>.sql

# Step 1.3: Production (als postgres-Superuser bei DDL-Ownership-Konflikten)
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db --field-selector status.phase=Running -o name | head -1)
kubectl exec -i "$PGPOD" -n workspace --context fleet -- psql -U postgres -d website < migration.sql
# Dann beide Brands:
task workspace:psql ENV=mentolder -- website < scripts/datamodel/<migration>.sql
task workspace:psql ENV=korczewski -- website < scripts/datamodel/<migration>.sql

# Step 1.4: Permissions re-granieren
task workspace:fix-tickets-grants ENV=mentolder
task workspace:fix-tickets-grants ENV=korczewski

# Step 1.5: ER-Diagram + Commit
task db:diagram
git add scripts/datamodel/<migration>.sql docs/db-schema-diagram.md
git commit -m "chore(db): apply migration for <description>"
```

> **`--field-selector status.phase=Running` ist Pflicht** beim Ermitteln des `PGPOD`. Nach einem
> shared-db-Rollout liegen abgeschlossene Pods im selben Label-Selector; ohne den Filter greift
> `head -1` einen `Completed`-Pod und jeder Schreibzugriff schlägt fehl.

### Phase 2 — Backup/Restore Audit

```bash
# Backup-Config prüfen
kubectl get cronjob -n <ns> --context <ctx>
kubectl get pvc backup-pvc -n <ns> --context <ctx>
kubectl get secret workspace-secrets -n <ns> --context <ctx> \
  -o jsonpath='{.data.BACKUP_PASSPHRASE}' | base64 -d | wc -c

# Live-Backup triggern
bash scripts/backup-restore.sh trigger --context fleet -n workspace
bash scripts/backup-restore.sh trigger --context fleet --namespace workspace-korczewski

# Backup-Liste
bash scripts/backup-restore.sh list --context fleet -n workspace
```

Fehlgeschlagene Backup-Jobs prüfen: `kubectl get jobs -n <ns> --context <ctx> -l app=db-backup`

### Phase 3 — Browsable Recovery (Stage → Browse → Selective Restore)

```bash
# PVC vorbereiten (einmalig)
task recovery:prepare ENV=mentolder
task recovery:prepare ENV=korczewski

# Dump verifizieren (non-destructive)
task recovery:verify ENV=mentolder -- 20260530-020001 website

# DB oder Service-PVC stagen
task recovery:stage ENV=mentolder -- 20260530-020001 website

# Staged Daten browsen
task recovery:browse ENV=mentolder   # gibt URL aus

# Selektives Restore (mit expliziter Bestätigung -y)
task recovery:restore-file ENV=mentolder -- <ts> nextcloud-files admin/files/Doc.pdf -y
task recovery:restore-table ENV=mentolder -- <ts> website site_settings -y

# Staging cleanup
task recovery:unstage ENV=mentolder -- <ts> -y
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Migration fails: "must be owner" | Via `psql -U postgres` im shared-db-Pod direkt |
| Backup CronJob not found | `k3d/backup-cronjob.yaml` anwenden, altes `backup-postgres` CronJob löschen |
| `db-backup` Job Failed, lokale Dumps OK | Filen-Upload-Fehler — 2FA aus? Credentials korrekt? Logs: `filen-upload` Container |
