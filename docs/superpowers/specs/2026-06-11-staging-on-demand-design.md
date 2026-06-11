# Staging-Umgebung On-Demand (per Branch) — Design Spec

**Ticket:** T000616  
**Branch:** `feature/T000616-staging-on-demand`  
**Datum:** 2026-06-11  
**Status:** spec_ready

---

## Zusammenfassung

Per `task staging:up BRANCH=feature/xyz` wird ein isolierter k3d-Namespace mit dem aktuellen Stand eines Feature-Branches hochgefahren. `task staging:down BRANCH=feature/xyz` reißt ihn wieder ab. Optionales DB-Seeding mit anonymisierten Testdaten. Kein permanenter Cluster — On-Demand pro Branch.

---

## Problemstellung

Derzeit gibt es zwei Deployment-Ebenen:
- **Local k3d dev** (persistent, eine Instanz pro Brand, auf dem WSL-Host / k3s-1 VM)
- **Fleet prod** (mentolder + korczewski, push-based)

Es fehlt eine isolierte, kurzlebige Staging-Umgebung, die:
- Einen konkreten Feature-Branch gegen echte (anonymisierte) Datenbankzustände testen lässt
- Mehrere Branches gleichzeitig isoliert hochfahren kann (Namespace-Isolation im gleichen k3d-Cluster)
- Ohne permanenten Cluster-Overhead auskommt
- Einfach zu bedienen ist: `task staging:up` / `task staging:down`

---

## Design-Entscheidungen

### A. Cluster-Strategie: geteilter k3d-Cluster mit Namespace-Isolation

**Entscheidung:** Namespace-Isolation im bestehenden k3d-Cluster (kein separater Cluster pro Branch).

**Begründung:**
- Ein separater k3d-Cluster pro Branch wäre zu ressourcenintensiv (je ~500MB RAM für k3s-Overhead) und zu langsam beim Hochfahren (90–120s für Cluster-Create vs. ~30s für Namespace-Deploy)
- Der bestehende k3d-Cluster (`k3d-mentolder-dev`) ist bereits vorhanden; ein neuer Namespace darin ist in Sekunden erstellt
- Die Dev-Stack-Struktur (`k3d/dev-stack/`) ist bereits für Namespace-Parameterisierung ausgelegt (NS_DEV wird als sed-Variable substituiert)
- **Risiko:** Branch A und Branch B teilen Cluster-Ressourcen (Traefik, cert-manager). Akzeptabel für Staging — keine Produktionstrennung erforderlich

**Alternative (verworfen):** Separater k3d-Cluster pro Branch — zu aufwändig, zu langsam, zu ressourcenintensiv.

### B. Overlay-Strategie: neues `k3d/staging-stack/` Overlay

**Entscheidung:** Eigenes `k3d/staging-stack/` Overlay, das `k3d/dev-stack/` als Vorbild nimmt, aber schlanker ist.

**Was Staging braucht (gegenüber dev-stack):**
- `shared-db-staging` (Postgres — seeded, kein Longhorn PVC nötig, ephemeral ist ok)
- `website` Deployment (mit Branch-Build oder `ghcr.io/...:latest` Pull)
- `namespace.yaml` (dynamisch via envsubst)
- `ingress` für `staging-<id>.localhost` (kein TLS-Overhead im lokalen Staging)

**Was Staging NICHT braucht:**
- sish (reverse-SSH-Tunnel — lokal nicht nötig)
- MCP-Monolith / MCP-Auth-Proxy (zu schwer)
- OAuth2-Proxy (kein SSO im Staging nötig)
- cert-manager Wildcard-Cert (kein TLS, nur HTTP für lokales Staging)
- Brett (optional — als Flag hinzufügbar)

### C. Branch-Build-Strategie: Image-Build on the fly

**Entscheidung:** Website-Image wird bei `staging:up` aus dem Branch gebaut und in den lokalen k3d-Registry importiert.

**Mechanismus:**
```
staging:up BRANCH=feature/xyz
  1. git worktree add /tmp/staging-<id> <branch>  (oder reuse, wenn schon da)
  2. docker build -t localhost:5000/website:staging-<id> website/
  3. docker push localhost:5000/website:staging-<id>
  4. kubectl apply namespace + manifests (envsubst STAGING_ID, STAGING_NS, STAGING_IMAGE)
  5. kubectl wait --for=condition=Available deploy/website -n <STAGING_NS>
  6. Ausgabe: URL http://web.staging-<id>.localhost
```

**STAGING_ID:** Sanitized Branch-Name — `feature/T000616-staging-on-demand` → `t000616-staging`  
(Regel: lowercase, nur `[a-z0-9-]`, max 20 Zeichen, vorne immer Buchstabe)

**Alternative (verworfen):** Nur ghcr.io-Images pullen — funktioniert nicht für unveröffentlichte Feature-Branches.

### D. DB-Seeding-Strategie: Anonymisiertes Snapshot-Seeding

**Entscheidung:** Zwei Modi — `--seed=empty` (Default) und `--seed=snapshot`.

**`--seed=empty` (Default):**
- DB-Init-Job legt leere Datenbanken + Rollen an (analog `shared-db-dev-init` Job)
- Für Frontend-Tests, die keine Daten brauchen
- Schnell (~10s)

**`--seed=snapshot`:**
- Reuse von `scripts/dev-db-refresh.sh` gegen den Staging-Postgres-Port
- Decrypted prod-Snapshot wird restored
- **Anonymisierung:** Neues Script `scripts/staging-db-anonymize.sh` läuft nach dem Restore:
  - `website.users`: E-Mail → `user-<hash>@staging.local`, Name → anonymisiert
  - `website.sessions`: gelöscht
  - `bachelorprojekt.tickets`: Kontaktdaten anonymisiert
  - Alle Auth-Tokens / Passwörter: truncated/replaced
- Nur wenn `--seed=snapshot` explizit gesetzt UND `BACKUP_PASSPHRASE` verfügbar

**`--seed=fixtures`** (Phase 2, nicht in diesem Plan):
- YAML-Fixture-Dateien unter `tests/fixtures/` → `psql`-Import
- Deterministisch für E2E-Tests

### E. Ingress-Strategie: Wildcard über Traefik, kein TLS

**Entscheidung:** Jede Staging-Instanz bekommt `http://web.staging-<id>.localhost` via Traefik IngressRoute.

**Hosts-Eintrag im WSL-Host:** Nicht nötig — `*.localhost` wird lokal aufgelöst.

**Warum kein TLS:** cert-manager + ACME ist langsam und für lokales Staging unnötig. HTTP reicht.

### F. Teardown-Strategie: Namespace delete + optionale Worktree-Bereinigung

```
staging:down BRANCH=feature/xyz
  1. STAGING_ID aus Branch berechnen
  2. kubectl delete namespace workspace-staging-<id> --wait=false
  3. Optional: git worktree remove /tmp/staging-<id> --force
  4. Staging-Entry aus ~/.local/share/workspace-staging/active.json entfernen
```

**State-Tracking:** Eine lokale JSON-Datei `~/.local/share/workspace-staging/active.json` hält aktive Staging-Instanzen (BRANCH → STAGING_ID + NS + PID/Timestamp). Ermöglicht `task staging:list` und Cleanup.

### G. Wo läuft das? — Nur lokaler WSL-Host

**Entscheidung:** Staging läuft nur auf dem WSL-Host (wo k3d läuft). Kein Remote-Staging auf fleet.

**Begründung:** k3d ist ein lokaler Entwicklungscluster. Fleet ist Produktion. Staging auf Fleet würde SealedSecrets, DNS, TLS und Namespace-Isolation auf Produktionsinfrastruktur erfordern — zu aufwändig und zu riskant.

---

## Architektur-Überblick

```
BEFORE (task staging:up BRANCH=feature/T000616-staging-on-demand):
  k3d cluster: k3d-mentolder-dev
    namespace: workspace-dev (persistent dev stack)

AFTER:
  k3d cluster: k3d-mentolder-dev
    namespace: workspace-dev (persistent dev stack — unberührt)
    namespace: workspace-staging-t000616-staging (neue Staging-Instanz)
      - shared-db-staging StatefulSet (ephemeral, kein PVC reuse)
      - website Deployment (image: localhost:5000/website:staging-t000616-staging)
      - Traefik IngressRoute → http://web.staging-t000616-staging.localhost
```

---

## Neue Dateien / Änderungen

### Neue Dateien

| Pfad | Beschreibung |
|------|-------------|
| `Taskfile.staging.yml` | `staging:up`, `staging:down`, `staging:list`, `staging:status`, `staging:clean` tasks |
| `k3d/staging-stack/kustomization.yaml` | Lean Overlay — namespace, shared-db-staging, website, ingress |
| `k3d/staging-stack/namespace.yaml` | Template: `namespace: workspace-staging-${STAGING_NS}` |
| `k3d/staging-stack/shared-db-staging.yaml` | Ephemeral Postgres ohne PVC (emptyDir) + Init-Job |
| `k3d/staging-stack/website-staging.yaml` | Website Deployment + Service (envsubst für Image-Tag) |
| `k3d/staging-stack/ingress-staging.yaml` | Traefik IngressRoute für `web.staging-<id>.localhost` |
| `scripts/staging-db-anonymize.sh` | Anonymisierungs-Script nach prod-Snapshot-Restore |
| `scripts/staging-id.sh` | Helper: Branch → STAGING_ID sanitization (reuseable) |

### Geänderte Dateien

| Pfad | Änderung |
|------|---------|
| `Taskfile.yml` | Include für `staging: ./Taskfile.staging.yml` hinzufügen |
| `environments/schema.yaml` | Keine neuen env_vars nötig (STAGING_* werden nur lokal in Taskfile gesetzt) |

### Explizit NICHT geändert

| Pfad | Warum |
|------|-------|
| `k3d/dev-stack/*` | Bestehender Dev-Stack bleibt unberührt |
| `prod-fleet/*` | Staging ist nur lokal |
| `environments/*.yaml` | Keine neuen env-Dateien — Staging-Config ist Taskfile-intern |

---

## task staging:up — Detailablauf

```bash
task staging:up BRANCH=feature/xyz [SEED=empty|snapshot] [WITH_BRETT=false]
```

1. **Branch-Validierung:** `git ls-remote origin <BRANCH>` — schlägt fehl wenn Branch nicht existiert  
2. **STAGING_ID berechnen:** `bash scripts/staging-id.sh "<BRANCH>"` → z.B. `t000616-staging`  
3. **STAGING_NS:** `workspace-staging-<STAGING_ID>`  
4. **Worktree:** `git worktree add /tmp/staging-<STAGING_ID> <BRANCH>` (falls noch nicht vorhanden)  
5. **Image-Build:** `docker build -t localhost:5000/website:staging-<STAGING_ID> /tmp/staging-<STAGING_ID>/website/`  
6. **Image-Push:** `docker push localhost:5000/website:staging-<STAGING_ID>`  
7. **Manifests anwenden:**  
   ```bash
   STAGING_ID=<id> STAGING_NS=<ns> STAGING_IMAGE=localhost:5000/website:staging-<id> \
   kubectl kustomize k3d/staging-stack/ \
     | envsubst '$STAGING_ID $STAGING_NS $STAGING_IMAGE' \
     | kubectl --context k3d-mentolder-dev apply -f -
   ```
8. **DB warten:** `kubectl --context k3d-mentolder-dev -n <NS> wait --for=condition=Complete job/shared-db-staging-init --timeout=60s`  
9. **DB-Seed (falls `SEED=snapshot`):** `scripts/dev-db-refresh.sh` gegen Staging-Postgres-Port → `scripts/staging-db-anonymize.sh`  
10. **Website warten:** `kubectl --context k3d-mentolder-dev -n <NS> rollout status deploy/website --timeout=120s`  
11. **State speichern:** Eintrag in `~/.local/share/workspace-staging/active.json`  
12. **Ausgabe:**  
    ```
    ✓ Staging bereit: http://web.staging-t000616-staging.localhost
    Namespace: workspace-staging-t000616-staging
    Branch: feature/T000616-staging-on-demand
    ```

---

## task staging:down — Detailablauf

```bash
task staging:down BRANCH=feature/xyz [--purge-worktree]
```

1. **STAGING_ID berechnen** (deterministisch aus BRANCH)  
2. **Namespace löschen:** `kubectl delete namespace workspace-staging-<STAGING_ID> --wait=false`  
3. **Optional:** `git worktree remove /tmp/staging-<STAGING_ID> --force`  
4. **Image entfernen:** `docker rmi localhost:5000/website:staging-<STAGING_ID>` (optional, `--purge-images`)  
5. **State entfernen** aus `~/.local/share/workspace-staging/active.json`  
6. **Ausgabe:** `✓ Staging workspace-staging-<id> wird abgerissen.`

---

## task staging:list

```bash
task staging:list
```

Liest `~/.local/share/workspace-staging/active.json` + `kubectl --context k3d-mentolder-dev get ns -l staging=true`.  
Gibt tabellarisch aus: STAGING_ID | BRANCH | NAMESPACE | STATUS | URL | AGE

---

## task staging:clean

```bash
task staging:clean
```

Bereinigt alle Staging-Namespaces (Label `staging=true`) + Worktrees + Images. Safety-Prompt zuerst.

---

## DB-Anonymisierung — Scope

`scripts/staging-db-anonymize.sh` anonymisiert nach pg_restore:

```sql
-- website DB
UPDATE users SET email = 'user-' || id || '@staging.local', 
                name = 'Staging User ' || id
WHERE email NOT LIKE '%@staging.local';

DELETE FROM sessions;
DELETE FROM email_verifications;
DELETE FROM password_reset_tokens;
UPDATE users SET password_hash = '$FAKE_HASH';  -- bcrypt-placeholder

-- bachelorprojekt DB  
UPDATE tickets SET description = regexp_replace(description, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '[email]', 'g')
WHERE description ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+';
```

---

## BATS-Tests

Neue Testdatei: `tests/unit/staging.bats`

Tests:
- `staging-id.sh` sanitization (Branch → STAGING_ID, Länge, Zeichen, Präfixregel)
- `staging:up` manifest-dry-run (kustomize build schlägt nicht fehl)
- `staging:down` Namespace-Cleanup (mock `kubectl`)
- Idempotenz: `staging:up` zweimal auf dem gleichen Branch

CI-Integration: `test:all` ruft `tests/unit/staging.bats` auf (offline-safe, kein echtes k3d nötig).

---

## Nicht in Scope (explizit ausgeschlossen)

- **Remote Staging auf Fleet** — Produktion bleibt unberührt
- **CI-Auto-Trigger** (GitHub Actions — PR open → staging:up, PR close → staging:down) — Phase 2
- **TLS / öffentliche URLs** — nur lokal erreichbar
- **Multi-Service Staging** (Nextcloud, Keycloak, Collabora) — zu ressourcenintensiv; nur Website + DB
- **Fixture-basiertes Seeding** (`tests/fixtures/`) — Phase 2
- **Brett im Staging** — optional via `WITH_BRETT=true`, nicht Default

---

## Risiken & Mitigationen

| Risiko | Mitigation |
|--------|-----------|
| Namespaces häufen sich an | `staging:list` zeigt aktive Instanzen; `staging:clean` bereinigt alles |
| Branch-Image-Build schlägt fehl | Build-Fehler bricht `staging:up` ab (set -e), Namespace wird aufgeräumt (trap) |
| k3d-Cluster nicht vorhanden | Precondition-Check vor Deploy: `k3d cluster list \| grep k3d-mentolder-dev` |
| STAGING_ID-Kollision | `staging-id.sh` ist deterministisch; idempotenter apply überschreibt bestehende Instanz |
| Anonymisierung unvollständig | `staging-db-anonymize.sh` schlägt fehl auf EXIT 1 → Staging-NS wird gelöscht |

---

## Nicht-funktionale Anforderungen

- `staging:up` muss < 5 Minuten dauern (Image-Build ist dominante Zeit)
- Keine Produktion wird berührt (keine fleet-Ressourcen)
- `staging:down` ist idempotent (schlägt nicht fehl, wenn Namespace nicht existiert)
- STAGING_ID ist URL-sicher (nur `[a-z0-9-]`, max 20 Zeichen)
