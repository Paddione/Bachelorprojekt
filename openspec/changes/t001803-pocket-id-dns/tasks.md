---
title: "t001803-pocket-id-dns — Implementation Plan"
ticket_id: T001803
domains: [infra, auth]
status: archived
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001803-pocket-id-dns — Implementation Plan

_Ticket: T001803_

Korrigiert `POCKET_ID_URL` in den Fleet-Overlay-Konfigurationen
(`fleet-mentolder.yaml`, `fleet-korczewski.yaml`) vom kurzen
Service-Namen auf den FQDN, damit die Website im `website` Namespace
Pocket-ID im `workspace` Namespace per DNS erreichen kann. Korrigiert
den irreführenden Kommentar in `k3d/pocket-id.yaml`.

## File Structure

```
openspec/changes/t001803-pocket-id-dns/proposal.md   (neu, bereits authored)
openspec/changes/t001803-pocket-id-dns/tasks.md      (neu, dieses File)
openspec/changes/t001803-pocket-id-dns/.ticket        (neu, Inhalt: T001803)
environments/fleet-mentolder.yaml                     (geändert) — POCKET_ID_URL FQDN + Duplikat-Key fix
environments/fleet-korczewski.yaml                    (geändert) — POCKET_ID_URL FQDN
k3d/pocket-id.yaml                                    (geändert) — Kommentar-Korrektur
```

**Nicht angefasst:**
- `environments/dev.yaml` (kurzer Name korrekt im selben Namespace)
- `environments/mentolder.yaml` (hat bereits FQDN)
- `environments/korczewski.yaml` (hat bereits FQDN)
- `website/src/lib/auth.ts` (liest POCKET_ID_URL, kein Code-Fix nötig)
- `website/src/lib/identity.ts` (liest POCKET_ID_URL, kein Code-Fix nötig)
- `k3d/network-policies.yaml` (korrekt konfiguriert)
- `k3d/website.yaml` (korrekte NetworkPolicies)

---

## Task 1 — fleet-mentolder.yaml: POCKET_ID_URL FQDN + Duplikat-Key fix

**Failing-Symptom (RED):**

In `environments/fleet-mentolder.yaml` steht:
- Zeile 62: `POCKET_ID_FRONTEND_URL: "https://auth.mentolder.de"` (korrekt)
- Zeile 63: `POCKET_ID_FRONTEND_URL: "https://auth.mentolder.de"` (Duplikat — YAML-Parser
  überschreibt stillschweigend, aber unklar ob der letzte Wert gewinnt)
- Zeile 65: `POCKET_ID_URL: "http://pocket-id:1411"` (Fehler — kurzer Name)

Die Website im `website` Namespace kann `pocket-id:1411` nicht auflösen,
weil der Service im `workspace` Namespace lebt. DNS gibt `NXDOMAIN` zurück.

**Fix (GREEN):**

In `environments/fleet-mentolder.yaml`:
1. Duplikaten `POCKET_ID_FRONTEND_URL` in Zeile 63 entfernen
2. `POCKET_ID_URL` in Zeile 65 auf FQDN ändern:
   `http://pocket-id.workspace.svc.cluster.local:1411`

```yaml
# Vorher (Zeilen 62-65):
  POCKET_ID_FRONTEND_URL: "https://auth.mentolder.de"
  POCKET_ID_FRONTEND_URL: "https://auth.mentolder.de"
  POCKET_ID_DOMAIN: "auth.mentolder.de"
  POCKET_ID_URL: "http://pocket-id:1411"

# Nachher:
  POCKET_ID_FRONTEND_URL: "https://auth.mentolder.de"
  POCKET_ID_DOMAIN: "auth.mentolder.de"
  POCKET_ID_URL: "http://pocket-id.workspace.svc.cluster.local:1411"
```

Verify: `POCKET_ID_URL` enthält den FQDN und kein Duplikat-Key mehr existiert:

```bash
grep -n "POCKET_ID_URL\|POCKET_ID_FRONTEND_URL" environments/fleet-mentolder.yaml
# Erwartet: 1× POCKET_ID_FRONTEND_URL (Zeile ~62), 1× POCKET_ID_URL mit FQDN (Zeile ~64)
```

## Task 2 — fleet-korczewski.yaml: POCKET_ID_URL FQDN

In `environments/fleet-korczewski.yaml` Zeile 64:
`POCKET_ID_URL: "http://pocket-id:1411"` →
`http://pocket-id.workspace-korczewski.svc.cluster.local:1411`

```yaml
# Vorher:
  POCKET_ID_URL: "http://pocket-id:1411"

# Nachher:
  POCKET_ID_URL: "http://pocket-id.workspace-korczewski.svc.cluster.local:1411"
```

Verify:

```bash
grep -n "POCKET_ID_URL" environments/fleet-korczewski.yaml
# Erwartet: POCKET_ID_URL mit workspace-korczewski FQDN
```

## Task 3 — k3d/pocket-id.yaml: Kommentar korrigieren

In `k3d/pocket-id.yaml` Zeilen 105–108 den Kommentar aktualisieren:

```yaml
# Vorher:
#   - literal envsubst (POCKET_ID_FRONTEND_URL, POCKET_ID_URL — envsubst'd at
#     deploy time by Taskfile workspace:deploy; POCKET_ID_URL stays
#     http://pocket-id:1411 in both dev and prod because both namespaces
#     resolve the Service via cluster DNS).

# Nachher:
#   - literal envsubst (POCKET_ID_FRONTEND_URL, POCKET_ID_URL — envsubst'd at
#     deploy time by Taskfile workspace:deploy; POCKET_ID_URL uses the short
#     name http://pocket-id:1411 in dev (same namespace) and the FQDN
#     http://pocket-id.<workspace-ns>.svc.cluster.local:1411 in prod
#     (cross-namespace resolution).
```

Verify:

```bash
grep -A3 "POCKET_ID_URL" k3d/pocket-id.yaml | head -6
# Erwartet: korrigierter Kommentar mit dev/prod-Unterscheidung
```

## Task 4 — Verification (CI-Gates)

```bash
task test:changed
# Erwartet: alle relevanten Tests grün (kein Code-Geänter, nur Env-Vars)

task freshness:regenerate
task freshness:check
# Erwartet: keine Drift
```

Vor dem PR-Open:

```bash
git status
# Erwartet: environments/fleet-mentolder.yaml, environments/fleet-korczewski.yaml,
#           k3d/pocket-id.yaml, openspec/changes/t001803-pocket-id-dns/*

git diff --stat
# Erwartet: 3 Dateien geändert, 3 Dateien neu
```

PR-Titel: `fix(infra): [T001803] use FQDN for pocket-id in fleet overlays`
