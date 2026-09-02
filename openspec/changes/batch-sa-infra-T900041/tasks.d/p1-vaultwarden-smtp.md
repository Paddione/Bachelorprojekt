---
title: "p1-vaultwarden-smtp — Vaultwarden SMTP_FROM fix (T900028)"
ticket_id: T900028
domains: [fleet-operations]
status: active
target_files: ["prod/patch-vaultwarden.yaml"]
---

# p1-vaultwarden-smtp — Vaultwarden SMTP_FROM fix (T900028)

## Goal

Behebt den PROD-Ausfall von Vaultwarden (`workspace`-Namespace): Vaultwarden startet nicht, weil
`prod/patch-vaultwarden.yaml` `SMTP_FROM` nie setzt. Vaultwarden verweigert den Start mit
"Both SMTP_HOST and SMTP_FROM need to be set for email support without USE_SENDMAIL".

## Root-Cause (verifiziert)

- `prod/patch-vaultwarden.yaml` setzt `SMTP_HOST` (Z.15), `SMTP_PORT`, `SMTP_SECURITY`,
  `SMTP_USERNAME` (secretKeyRef workspace-secrets/SMTP_USER), `SMTP_PASSWORD` und `SMTP_FROM_NAME`
  (Z.31) — aber **nie** `SMTP_FROM`.
- `environments/mentolder.yaml:32` haelt `SMTP_FROM: mentolder@mailbox.org` vor; es fehlt nur die
  Env-Referenz im Deployment-Patch.

## File Structure

```
prod/patch-vaultwarden.yaml      # MODIFIED: + SMTP_FROM-Env, envsubst ${SMTP_FROM}
tests/spec/fleet-operations/vaultwarden-smtp-from.bats   # NEW (in p7): Guard
```

## Tasks

1. **Investigate:** Mit `kubectl --context fleet -n workspace logs deploy/vaultwarden --tail=3`
   die aktuelle Config-Error-Meldung bestaetigen (> 600 Neustarts, HTTP 503).
2. **Fix:** In `prod/patch-vaultwarden.yaml` nach dem `SMTP_FROM_NAME`-Block den Env-Eintrag
   `SMTP_FROM` mit `value: "${SMTP_FROM}"` ergaenzen (envsubst-Konvention analog `SMTP_HOST`).
   `SMTP_HOST`-Eintrag unverändert lassen.
3. **Verify:** Sicherstellen, dass envsubst `${SMTP_FROM}` in der deploy-ENVSUBST-Vars-Liste der
   PROD-Konfiguration eingetragen ist (analog `SMTP_HOST`). Pruefen, dass der Kustomize-Build ohne
   Fehler rendert: `task workspace:validate`.
4. **Deploy-check:** Hinweis an dev-flow-execute: nach Merge koennen die env:seal/Deploy-Teile ueber
   `task workspace:deploy` ausgeloest werden; Vaultwarden muss neu starten und `vault.mentolder.de`
   muss HTTP 200 liefern.

## Verify

Der BATS-Guard `vaultwarden-smtp-from.bats` prueft, dass der Patch-Container den `SMTP_FROM`-Env-Key
enthaelt:

```bash
# Requirement: Vaultwarden PROD startet mit vollständiger SMTP-Konfiguration
# expected: FAIL (vor dem Fix fehlt SMTP_FROM im Patch)
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/vaultwarden-smtp-from.bats
```
