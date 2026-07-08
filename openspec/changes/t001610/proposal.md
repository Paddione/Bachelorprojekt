# Proposal: t001610

## Why

Der Pocket-ID Pod im Namespace `workspace` (mentolder) ist in **CrashLoopBackOff** mit der Root Cause:
```
FATAL: password authentication failed for user "pocket_id" (SQLSTATE 28P01)
```

Dies ist ein **DB-Credential-Problem**, NICHT ein OIDC-Client-Secret-Drift-Vorfall (wie T001327/T001328/T001435). Das pocket_id Benutzer-Passwort im Database Secret ist falsch oder fehlt.

## What

**Blast Radius:** Gesamtes SSO auf mentolder down → alle nachgelagerten OIDC-Clients betroffen:
- Nextcloud, Vaultwarden, DocuSeal, Tracking, Website, Claude Code

**Metadaten:**
- ticket_id: T001610
- component: auth
- severity: critical

---

### Ticket-Metadaten Update
**Diagnose-Notiz (zum Deployment manifest hinzufügen):**
```yaml
annotations:
  diagnostic-note: "password authentication failed for user pocket_id - DB credential issue, not OIDC secret drift. See kubectl logs for details."
```

---

### Nächste Schritte

1. **Secret inspect:** `kubectl get secret shared-db-credentials -n workspace -o yaml`
2. **Credential rotate:** Neues Secret erstellen mit korrektem pocket_id Passwort
3. **Pod restart:** Deployment neu deployen

**⚠️ ACHTUNG:** Fix wurde absichtlich NICHT angefasst – laut Auftrag nur Scope-Verifikation + Owner-Zuweisung.
