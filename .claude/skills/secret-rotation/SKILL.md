---
name: secret-rotation
description: Use when rotating secrets across clusters — DB passwords, API keys, sealed-secrets keypair refresh after a cluster reset, claude-code tokens, or generating/sealing a new env. Covers the mandatory ordering that prevents silent overwrite of production secrets.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# secret-rotation

Safe, ordered secret rotation across both brands on the fleet cluster.

---

## Scope — pick the rotation type

| Type | When |
|---|---|
| **A. DB password drift** | A service can't connect to shared-db after a re-seal/redeploy |
| **B. Generate + seal new secrets** | First-time env setup, periodic rotation, or stale `.secrets/` file |
| **C. SealedSecrets keypair refresh** | After cluster reset — old sealed files can't decrypt |
| **D. Claude Code token rotation** | Auth-proxy or agent tokens need cycling |
| **E. Nextcloud/service token** | Individual service credential changed |

Ask the user which type(s) apply before proceeding.

---

## ⚠️ Critical ordering constraint

**Never run `task workspace:deploy` before `task env:seal ENV=<env>`.** The deploy applies sealed secrets first — if sealed files are stale, the deploy silently overwrites production credentials with dev placeholder values.

The safe order is always:
```
sealed-secrets:install (if controller reset) →
env:fetch-cert (if keypair changed) →
env:generate (if new secrets needed) →
env:seal →
workspace:deploy
```

---

## Type A — DB password drift

Symptoms: pod logs show `password authentication failed for user "<role>"` after a re-seal.

```bash
# 1. Check what password the SealedSecret decrypts to
kubectl get secret workspace-secrets -n <WORKSPACE_NS> --context <CTX> \
  -o jsonpath='{.data.<KEY>}' | base64 -d

# 2. Compare to what Postgres has
task workspace:psql ENV=<env> -- <db>
# In psql: \du  (list roles — can't see password, but can reset it)

# 3. Sync DB role passwords to match current SealedSecret
task workspace:sync-db-passwords ENV=<env>
```

`sync-db-passwords` runs `ALTER ROLE <role> PASSWORD '<password>'` for every role whose SealedSecret value has drifted from the DB. Run for each affected env:

```bash
task workspace:sync-db-passwords ENV=mentolder
task workspace:sync-db-passwords ENV=korczewski   # korczewski brand on fleet cluster
```

Verify by restarting the affected pod and tailing logs:
```bash
task workspace:restart ENV=<env> -- <service>
task workspace:logs ENV=<env> -- <service>
```

---

## Type B — Generate + seal new secrets

```bash
# 1. Generate fresh secrets for the env
task env:generate ENV=<env>
# Output written to environments/.secrets/<env>.yaml (gitignored)

# 2. Seal them with the cluster's public cert
task env:seal ENV=<env>
# Output: environments/sealed-secrets/<env>.yaml (committed)

# 3. Apply sealed secrets to cluster — workloads are NOT restarted
task secrets:sync
# (equivalent to: kubectl apply -f environments/sealed-secrets/<env>.yaml --context <ctx>)

# 4. Restart workloads that read the changed secrets
task workspace:restart ENV=<env> -- <service>
```

Commit the new sealed file:
```bash
git add environments/sealed-secrets/<env>.yaml
git commit -m "chore(secrets): rotate <env> secrets"
```

---

## Type C — SealedSecrets keypair refresh (after cluster reset)

After any cluster reset the controller generates a new keypair. Old sealed files cannot be decrypted. Mandatory order:

```bash
# 1. Install (or verify) the Sealed Secrets controller
task sealed-secrets:install ENV=<env>
task sealed-secrets:status  ENV=<env>

# 2. Fetch the new cluster sealing certificate
task env:fetch-cert ENV=<env>
# Writes: environments/certs/<env>.pem

# 3. Re-seal plaintext secrets with the new cert
#    (plaintext must already exist in environments/.secrets/<env>.yaml)
task env:seal ENV=<env>

# 4. Commit the re-sealed file
git add environments/sealed-secrets/<env>.yaml environments/certs/<env>.pem
git commit -m "chore(secrets): re-seal <env> after keypair reset"

# 5. Deploy (sealed secrets are applied first inside workspace:deploy)
task workspace:deploy ENV=<env>
```

**If `.secrets/<env>.yaml` is missing:** run `task env:generate ENV=<env>` before step 3.

---

## Type D — Claude Code token rotation

```bash
task claude-code:rotate-tokens
```

This updates:
- The `auth-proxy` bearer token in `claude-code-secrets`
- The per-agent tokens

After rotation, users must re-run `task claude-code:setup -- <role>` to get fresh `settings.json` files.

Verify the proxy is healthy:
```bash
task mcp:status
task mcp:logs -- keycloak
```

---

## Type E — Individual service credential

1. Update the value in `environments/.secrets/<env>.yaml`
2. Re-seal: `task env:seal ENV=<env>`
3. Apply: `task secrets:sync`
4. Restart the affected service: `task workspace:restart ENV=<env> -- <service>`
5. Commit the updated sealed file

---

## Cross-brand checklist (both on fleet)

Each brand namespace has its own SealedSecrets (on the same fleet cluster), sealing cert, and shared-db. Any secret rotation that touches both environments must be applied independently:

```bash
task env:fetch-cert ENV=mentolder
task env:seal ENV=mentolder
task workspace:deploy ENV=mentolder

# korczewski brand — on the same fleet cluster, namespace workspace-korczewski
task env:fetch-cert ENV=korczewski
task env:seal ENV=korczewski
task workspace:deploy ENV=korczewski
```

Do not assume a mentolder-sealed file works on the fleet cluster's korczewski brand namespace — the certs are different.

---

## Verification

After any rotation, confirm:

```bash
# All pods running
task workspace:status ENV=<env>

# No auth errors in logs
task workspace:logs ENV=<env> -- keycloak
task workspace:logs ENV=<env> -- nextcloud
task workspace:logs ENV=<env> -- website

# SSO login works
# (open https://web.<domain> in browser, attempt login)
```

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `cluster-deployment` | Voraussetzung — Cluster muss laufen |
| `fleet-ops` | Folge — nach Rotation beide Brands deployen |
| `database-ops` | Querschnitt — DB-Passwort-Rotation |
| `keycloak-realm-sync` | Querschnitt — OIDC-Client-Secrets |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
