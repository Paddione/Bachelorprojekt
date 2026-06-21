---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-21
---

# Secrets Deploy Automation — Design Spec
**Datum:** 2026-06-21
**Slug:** secrets-deploy-automation
**Ticket:** wird in Schritt 4.5 (dev-flow-plan) erstellt
**Status:** draft

---

## Hintergrund & Problem

Am 2026-06-21 wurden 18 `POCKET_ID_*`-Secrets in die **legacy**-Dateien (`mentolder.yaml`, `korczewski.yaml`) gesealt statt in die aktiven **fleet**-Dateien (`fleet-mentolder.yaml`, `fleet-korczewski.yaml`). Die fleet-Dateien sind die einzigen, die vom Cluster gelesen werden (`secrets_ref` in `environments/fleet-mentolder.yaml` zeigt auf `sealed-secrets/fleet-mentolder.yaml`). Der Fehler wurde manuell entdeckt und korrigiert, wäre aber ohne dieses Feature in einem kaputten Prod-Deployment geendet.

**Drei Lücken:**
1. Kein automatischer Deploy der SealedSecrets nach Merge (manuelles `task workspace:deploy` nötig)
2. Kein Guard der verhindert, dass fleet-Dateien unvollständig sind
3. Kein dokumentiertes Wissen über die Datei-Topologie für den Security-Agenten

---

## Scope

Vier unabhängige Deliverables, ein PR:

| # | Deliverable | Dateien |
|---|---|---|
| 1 | GitHub Action: auto-deploy SealedSecrets nach Merge | `.github/workflows/deploy-sealed-secrets.yml` |
| 2 | Schema-Flag + BATS-Guard für fleet-Vollständigkeit | `environments/schema.yaml`, `tests/spec/fleet-operations.bats` |
| 3 | Secrets-Architektur-Referenzdokument | `docs/superpowers/references/secrets-architecture.md` |
| 4 | Security-Agent: Verweis auf Referenzdokument | `.claude/agents/bachelorprojekt-security.md` |

---

## Design

### 1. GitHub Action `deploy-sealed-secrets.yml`

**Trigger:**
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'environments/sealed-secrets/fleet-mentolder.yaml'
      - 'environments/sealed-secrets/fleet-korczewski.yaml'
```

**Jobs (sequenziell):**

#### Job `validate`
- Setup `FLEET_KUBECONFIG` (identisch zu `build-website.yml`)
- `kubeseal --verify -f environments/sealed-secrets/fleet-mentolder.yaml` gegen live Cluster-Zertifikat
- `kubeseal --verify -f environments/sealed-secrets/fleet-korczewski.yaml`
- Fail-fast: wenn Zertifikat-Drift → kein Apply

#### Job `deploy` (needs: validate)
```bash
kubectl apply -f environments/sealed-secrets/fleet-mentolder.yaml
kubectl apply -f environments/sealed-secrets/fleet-korczewski.yaml
```
- `--server-side` nicht nötig (SealedSecrets sind keine Kustomize-Overlays)
- Beide Brands immer deployen (idempotentes Apply ist sicher)

#### Job `notify` (needs: deploy, if: success)
- Extrahiert SHA des Merge-Commits
- Fragt ticket-mcp nach dem offenen `awaiting_deploy`-Ticket das `branch`/`SHA` enthält
- Postet Kommentar: `"✅ SealedSecrets deployed [SHA] at [timestamp] (mentolder + korczewski)"`
- **Kein `awaiting_deploy`-Ticket gefunden → Warnung im Log, kein Job-Fehler** (stilles fail-open)

**Verwendete GitHub Secrets:** nur `FLEET_KUBECONFIG` (bereits vorhanden). `scripts/ticket.sh` nutzt `kubectl exec` auf den postgres-Pod — kein separates Token nötig, kubeconfig reicht für Deploy + Ticket-Kommentar.

---

### 2. Schema-Annotation `legacy_only: true` + BATS-Guard

#### Schema-Annotation

In `environments/schema.yaml` erhalten alle Keys, die **absichtlich** nur in legacy-Dateien existieren, ein neues optionales Flag:

```yaml
secrets:
  # Decommissioned fleet-Nodes (gekko-hetzner-2/3/4 — seit 2026-05-31 aus mentolder-standalone heraus)
  - name: WG_MESH_GEKKO2_PRIVATE_KEY
    legacy_only: true
  - name: WG_MESH_GEKKO2_PUBLIC_KEY
    legacy_only: true
  # ... alle GEKKO2/3/4 und K3S1/2/3 Keys

  # MCP Keycloak (korczewski-legacy — ersetzt durch Pocket ID, T001068)
  - name: MCP_KEYCLOAK_CLIENT_ID
    legacy_only: true
  - name: MCP_KEYCLOAK_CLIENT_SECRET
    legacy_only: true
  - name: MCP_KEYCLOAK_REALM_URL
    legacy_only: true
```

#### BATS-Test `tests/spec/fleet-operations.bats`

Neuer Test `"fleet-* secret files contain all non-legacy keys from their legacy counterparts"`:

```bash
# Pseudocode
legacy_only_keys=$(python3 -c "
import yaml
schema = yaml.safe_load(open('environments/schema.yaml'))
print('\n'.join(
  s['name'] for s in schema.get('secrets', [])
  if s.get('legacy_only', False)
))
")

for pair in "mentolder:fleet-mentolder" "korczewski:fleet-korczewski"; do
  legacy="${pair%%:*}"
  fleet="${pair##*:}"
  missing=$(python3 scripts/check-fleet-completeness.py \
    "environments/.secrets/${legacy}.yaml" \
    "environments/.secrets/${fleet}.yaml" \
    "${legacy_only_keys}")
  [[ -z "$missing" ]] || fail "Keys fehlen in ${fleet}.yaml: $missing"
done
```

**Helper-Skript** `scripts/check-fleet-completeness.py`:
- Liest beide YAML-Dateien
- Gibt Keys zurück die in legacy sind, nicht `legacy_only`, und nicht in fleet
- Exit 0 = vollständig, stdout = fehlende Keys

**Test läuft in `task test:all`** (offline, keine Cluster-Verbindung nötig).

---

### 3. `docs/superpowers/references/secrets-architecture.md`

Inhalt dieser neuen Referenzdatei:

#### Datei-Topologie

| Datei | Status | Produziert | Referenziert von |
|---|---|---|---|
| `environments/.secrets/fleet-mentolder.yaml` | **Aktiv (Prod)** | `sealed-secrets/fleet-mentolder.yaml` | `environments/fleet-mentolder.yaml` |
| `environments/.secrets/fleet-korczewski.yaml` | **Aktiv (Prod)** | `sealed-secrets/fleet-korczewski.yaml` | `environments/fleet-korczewski.yaml` |
| `environments/.secrets/mentolder.yaml` | Legacy (decommissioned standalone cluster) | `sealed-secrets/mentolder.yaml` | `environments/mentolder.yaml` (nicht mehr deployed) |
| `environments/.secrets/korczewski.yaml` | Legacy (decommissioned standalone cluster) | `sealed-secrets/korczewski.yaml` | `environments/korczewski.yaml` (nicht mehr deployed) |

#### Fleet-Sync-Regel

> Wenn ein neuer Secret-Block in `mentolder.yaml` oder `korczewski.yaml` hinzukommt → **muss identisch** in `fleet-mentolder.yaml` / `fleet-korczewski.yaml` landen, **außer** der Key hat `legacy_only: true` in `environments/schema.yaml`.

Der CI-Guard (`tests/spec/fleet-operations.bats`) erzwingt diese Regel automatisch.

#### Kanonische Sektionsstruktur (14 Abschnitte)

Alle vier `.secrets/`-Dateien folgen dieser Reihenfolge:
1. Externe API-Keys
2. Backup & Speicher
3. E-Mail (SMTP)
4. Datenbankpasswörter
5. Admin-Zugangsdaten
6. Session- & Signing-Secrets
7. Pocket ID OIDC-Secrets (T001068)
8. Keycloak OIDC-Secrets (legacy — abgelöst durch Pocket ID)
9. LiveKit
10. Brett
11. Arena (korczewski only)
12. DB Connection Strings
13. SSH-Schlüssel
14. WireGuard-Mesh
15. Dev-only Overrides

#### Sealed-Secrets-Lifecycle

```
.secrets/fleet-*.yaml  →  task env:seal ENV=fleet-*  →  sealed-secrets/fleet-*.yaml
       ↓                                                          ↓
  (gitignored)                                            git commit + push
                                                                  ↓
                                                        PR merge → GitHub Action
                                                                  ↓
                                                    kubectl apply auf fleet-Cluster
```

---

### 4. Security-Agent Update

In `.claude/agents/bachelorprojekt-security.md` wird ein neuer Abschnitt `## Secrets-Dateiarchitektur` eingefügt:

```markdown
## Secrets-Dateiarchitektur

Die vollständige Dokumentation der `.secrets/`-Datei-Topologie, der Fleet-Sync-Regel und
der kanonischen Sektionsstruktur steht in:
→ `docs/superpowers/references/secrets-architecture.md`

**Wichtigste Regel:** `fleet-mentolder.yaml` und `fleet-korczewski.yaml` sind die
einzigen aktiven Prod-Dateien. Legacy-Dateien (`mentolder.yaml`, `korczewski.yaml`)
existieren nur als Referenz für den decommissionten Standalone-Cluster.
Jeder neue Secret-Block muss in die fleet-Dateien.
```

---

## Nicht im Scope

- Automatisches Sealen (env:seal) — bleibt manueller Schritt mit Bedacht
- Rotation von bestehenden Secrets — separater Workflow (secret-rotation.md)
- Staging-Umgebung — `staging.yaml` hat kein fleet-Pendant, bleibt manuell

---

## Akzeptanzkriterien

1. `task test:all` schlägt fehl wenn `fleet-mentolder.yaml` einen Key aus `mentolder.yaml` vermisst (der nicht `legacy_only: true` ist)
2. Nach Merge eines PRs der `fleet-*.yaml` ändert: Action deployt automatisch beide Brands
3. Das `awaiting_deploy`-Ticket bekommt einen Deploy-Kommentar mit SHA und Timestamp
4. `bachelorprojekt-security`-Agent referenziert `secrets-architecture.md` und kennt die Fleet-Sync-Regel
5. `environments/schema.yaml` hat `legacy_only: true` auf allen decommissionten WG-Keys und MCP_KEYCLOAK_*
