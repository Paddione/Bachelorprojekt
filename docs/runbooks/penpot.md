# Runbook: Penpot-Betrieb

## Überblick

Penpot ist ein Open-Source-Alternative zu Figma für kollaboratives Design. Im Fleet-Cluster
laufend auf mentolder (`design.mentolder.de`), mit Pocket-ID-OIDC als Auth-Provider.

**Aktueller Status:** mentolder live, korczewski hat Ingress und Domain-Variablen, aber
keine Secrets — Penpot startet dort nicht (beabsichtigt).

## Architektur

### Komponenten (alle im selben Pod, initContainers + sidecars)

| Container | Image | Port | Zweck |
|-----------|-------|------|-------|
| `penpot-backend` | `penpotapp/backend:2.17.2` | 6060 | Java/Tomcat — Core-Logik, API, Events |
| `penpot-frontend` | `penpotapp/frontend:2.17.2` | 8080 | ClojureScript — Web-Oberfläche |
| `penpot-gateway` | `penpotapp/gateway:latest` | 80 | Nginx — Reverse-Proxy, TLS-termination |
| `minio` (penminio) | `minio/minio:RELEASE.2024-11-22T13-35-48Z` | 9000/9001 | S3-kompatibler Speicher für Assets |

### Infrastruktur

- **Datenbank:** Geteilte `shared-db` (PostgreSQL) — Penpot-Role mit eigenem Schema
- **Storage:** MinIO-PVC (`penpot-minio-pvc`, 5Gi, `local-path` StorageClass)
- **Ingress:** `workspace-ingress-penpot` → `design.<PROD_DOMAIN>` → `penpot-gateway:80`
- **OIDC:** Pocket-ID (`http://pocket-id:1411`) — Client-Redirect `https://design.<PROD_DOMAIN>/api/external-auth`

## Konfigurations-Übersicht

### Environment-Variablen (Backend)

| Variable | Quelle | Wert |
|----------|--------|------|
| `DATABASE_URL` | env | `postgresql://penpot:$(PENPOT_DB_PASSWORD)@shared-db:5432/penpot?sslmode=disable` |
| `PENPOT_DB_PASSWORD` | Secret | `workspace-secrets.PENPOT_DB_PASSWORD` |
| `PENPOT_SECRET_KEY` | Secret | `workspace-secrets.PENPOT_SECRET_KEY` |
| `PENPOT_MINIO_HOST` | Literal | `penminio` |
| `PENPOT_MINIO_PORT` | Literal | `9000` |
| `PENPOT_MINIO_SECRET_KEY` | Secret | `workspace-secrets.PENPOT_MINIO_SECRET_KEY` |
| `PENPOT_MINIO_ACCESS_KEY` | Literal | `penpot` |
| `PENPOT_STORAGE_SERVICE_IMPL` | Literal | `minio` |
| `PENPOT_STORAGE_MINIO_BUCKET` | Literal | `penpot-assets` |
| `PENPOT_OIDC_ENABLED` | Literal | `true` |
| `PENPOT_OIDC_AUTH_SERVER_URL` | Literal | `http://pocket-id:1411` |
| `PENPOT_OIDC_CLIENT_ID` | Literal | `penpot` |
| `PENPOT_OIDC_CLIENT_SECRET` | Secret | `workspace-secrets.POCKET_ID_PENPOT_SECRET` |
| `PENPOT_PUBLIC_URI` | env | `${PENPOT_PUBLIC_URI}` (envsubst-resolved) |

### Port-Zuordnung (penminio Service)

| Port | Name | Zweck |
|------|------|-------|
| 9000 | `api` | S3-kompatible API |
| 9001 | `console` | Web-Konsole (Admin) |

## OIDC-Flow

1. Nutzer ruft `https://design.mentolder.de/` auf
2. Penpot erkennt nicht-authentifizierte Session → Redirect zu Pocket-ID
3. Pocket-ID (`auth.mentolder.de`) zeigt Login-UI
4. Nach成功em Login: Redirect zurück zu `https://design.mentolder.de/api/external-auth?code=...`
5. Penpot tauscht Code gegen Token, erstellt/aktualisiert User-Sitzung
6. Nutzer ist eingeloggt

### Client-Provisionierung

Der `pocket-id-client-seed`-Job (CronJob) provisioniert den Penpot-OIDC-Client:
- `client_id`: `penpot`
- `redirect_uri`: `https://design.mentolder.de/api/external-auth`
- `secret` wird in `workspace-secrets.POCKET_ID_PENPOT_SECRET` gespeichert

## Troubleshooting

### Penpot-Pods starten nicht

```bash
# Status prüfen
kubectl -n workspace get pods -l app=penpot
kubectl -n workspace logs -l app=penpot --tail=50

# Häufige Ursachen:
# 1. Shared-DB nicht erreichbar → initContainer "wait-for-db" timeout
kubectl -n workspace exec -it <backend-pod> -- nc -z shared-db 5432

# 2. MinIO nicht erreichbar → initContainer "wait-for-minio" timeout
kubectl -n workspace exec -it <backend-pod> -- nc -z penminio 9000

# 3. Secrets fehlen → workspace-secrets prüfen
kubectl -n workspace get secret workspace-secrets -o jsonpath='{.data.PENPOT_DB_PASSWORD}' | base64 -d
```

### Ingress-Errors (flux-mentolder blockiert)

Symptom: `flux-mentolder` READY=False mit `may not add resource with an already registered id: Ingress.v1...workspace-ingress-penpot`

Ursache: Doppelte Ingress-Definition (Base `k3d/penpot-ingress.yaml` + Overlay `prod-fleet/mentolder/penpot-ingress-route.yaml`).

Fix: `$patch: delete` für `workspace-ingress-penpot` in `prod/kustomization.yaml` (T900009).

### MinIO-Ports ohne Namen

Symptom: `flux-staging` READY=False mit `spec.ports[0].name: Required value`

Fix: Ports 9000/9001 im penminio-Service benennen (`api`/`console`) — k3d/penpot.yaml (T900009).

### Double patches:-Key

Symptom: `bge-hosts-patch.yaml` wird ignoriert (BGE-Embed/Rerank-IngressRoutes fehlen)

Fix: Zwei `patches:`-Blöcke zu einem zusammenführen — prod-fleet/mentolder/kustomization.yaml (T900009).

## Brand-Scope

### mentolder ✅ LIVE

- Domain: `design.mentolder.de`
- Ingress: `prod-fleet/mentolder/penpot-ingress-route.yaml`
- Secrets: `environments/sealed-secrets/mentolder.yaml` (PENPOT_DB_PASSWORD, PENPOT_SECRET_KEY, PENPOT_MINIO_SECRET_KEY)
- OIDC: Pocket-ID-Client provisioniert

### korczewski ⏸️ DEAKTIVIERT

- Domain-Variable existiert: `PENPOT_DOMAIN` in `environments/korczewski.yaml`
- Ingress-Route existiert: `prod-fleet/korczewski/penpot-ingress-route.yaml`
- **ABER:** Keine Secrets in `environments/sealed-secrets/korczewski.yaml` → Penpot startet nicht
- **Bewusste Entscheidung:** Operator muss Secrets separat provisionieren und Ingress aktivieren

## Wartung

### Image-Updates

```bash
# Aktuelle Images in penpot.yaml prüfen
kubectl -n workspace get deployment penpot -o jsonpath='{.spec.template.spec.containers[*].image}'

# Update: Images in k3d/penpot.yaml anpassen, dann deploy:
task workspace:deploy ENV=mentolder
```

### Secrets-Rotation

```bash
# Neue Secrets generieren
python3 -c "import secrets; print(secrets.token_urlsafe(48))"  # dreimal für DB_PASSWORD, SECRET_KEY, MINIO_SECRET_KEY

# In environments/.secrets/mentolder.yaml einfügen (git-crypt-verschlüsselt)
task env:seal ENV=mentolder
kubectl apply -f environments/sealed-secrets/mentolder.yaml

# Pods neu starten damit Secrets geladen werden
kubectl -n workspace rollout restart deployment penpot
```

### Datenbackup (MinIO)

```bash
# MinIO-PVC Snapshots (falls snapshotter installiert)
kubectl get pv penpot-minio-pvc -o yaml | grep snapshot

# Manuelles Backup via minio client (mc)
mc alias set penpot https://penminio:9000 penpot <MINIO_SECRET>
mc cp --recursive penpot/penpot-assets ./backup/
```

## E2E-Verifikation (nach Deploy)

```bash
# 1. DNS + TLS
dig +short design.mentolder.de
curl -sSI https://design.mentolder.de/ | head -3  # kein Traefik-404

# 2. OIDC-Client prüfen
kubectl -n workspace logs job/pocket-id-client-seed | grep -i penpot

# 3. Pods alive
kubectl -n workspace get pods -l app=penpot

# 4. Manueller Login: design.mentolder.de → Pocket-ID-Login → Penpot-Session
```
