# Partial p1 — Infra: Overlay, Cluster-Config, Taskfile, Runbook

> **Agent:** deepseek | **Files:** k3d/sdlc-stack/kustomization.yaml, k3d/sdlc-stack/k3d-config.yaml, Taskfile.sdlc.yml, Taskfile.yml, docs/sdlc-stack/README.md | **Steps:** 5
> **Verify:** `task sdlc:cluster:create` und `task sdlc:deploy` laufen durch

## Scope

Infrastruktur-Grundlage der Etappe: das self-contained Overlay `k3d/sdlc-stack/` (referenziert
die vorhandenen Base-Manifeste per `../` — KEINE Kopien), die Cluster-Config für den neuen
k3d-Cluster `mentolder-dev`, die Betriebs-Tasks in `Taskfile.sdlc.yml` (inkl. Include in
`Taskfile.yml`) und das Runbook. WSL-Speicher ist bereits angehoben (40 GB konfiguriert,
39 GB effektiv gemessen) — hier nur Verifikation + Dokumentation, kein Änderungs-Task.

Wichtige Vorgaben aus design.md (D1, D2, D5):

- Overlay baut mit `kubectl kustomize --load-restrictor=LoadRestrictionsNone` — ohne das Flag
  schlägt der Build hart fehl (Kustomize-Sicherheitsrestriktion für `../`-Referenzen).
- Kein `$patch: delete`-Flickwerk über das komplette Base — nur die SDLC-relevanten Dateien
  auflisten.
- Cluster-Name `mentolder-dev` → Kubeconfig-Kontext `k3d-mentolder-dev`; toter
  `k3d-korczewski`-Kontext wird beim Create entfernt.
- Lokale Werte (fix): `POCKET_ID_FRONTEND_URL=http://auth.localhost`,
  `POCKET_ID_URL=http://pocket-id:1411`, `POCKET_ID_DOMAIN=auth.localhost`,
  `PROD_DOMAIN=localhost`, `WEBSITE_SITE_URL=http://sdlc.localhost`, SMTP_* leer.
- DB-Passwörter für envsubst kommen aus `k3d/secrets.yaml` selbst (dev-Plaintext:
  `WEBSITE_DB_PASSWORD=devwebsitedb`, `SHARED_DB_PASSWORD=devshareddb`,
  `POCKET_ID_DB_PASSWORD=devpocketiddb`, `NEXTCLOUD_DB_PASSWORD`,
  `VAULTWARDEN_DB_PASSWORD`, `VIDEOVAULT_DB_PASSWORD`).

## Task List

### 1. Overlay `k3d/sdlc-stack/kustomization.yaml` anlegen

- [ ] **1.1** Verzeichnis `k3d/sdlc-stack/` anlegen.
- [ ] **1.2** `kustomization.yaml` mit `apiVersion: kustomize.config.k8s.io/v1beta1`,
      `kind: Kustomization`, `namespace: workspace` und folgender `resources:`-Liste (exakt,
      Reihenfolge wie hier):
      ```
      - ../namespace.yaml
      - ../configmap-domains.yaml
      - ../secrets.yaml
      - ../shared-db.yaml
      - ../website-schema.yaml
      - ../pocket-id.yaml
      - ../pocket-id-db-init-sql.yaml
      - ../pocket-id-client-seed.yaml
      - ../pocket-id-client-seed-rbac.yaml
      - ../pocket-id-client-seed-website-rbac.yaml
      - ../llm-gpu.yaml
      - sdlc-console.yaml
      - sdlc-ingress.yaml
      ```
- [ ] **1.3** Build testen: `kubectl kustomize --load-restrictor=LoadRestrictionsNone
      k3d/sdlc-stack` — muss durchlaufen und alle Resources liefern. (`sdlc-console.yaml` und
      `sdlc-ingress.yaml` existieren erst nach p2 — bis dahin entweder p2 vorziehen oder den
      Build mit temporären Platzhaltern prüfen; alternativ den Build-Check erst nach p2
      ausführen und in 1.5 nur `kubectl kustomize k3d/sdlc-stack/../llm-gpu.yaml`-freie
      Teilprüfung machen.)

### 2. Cluster-Config `k3d/sdlc-stack/k3d-config.yaml` anlegen

- [ ] **2.1** K3d-Config (apiVersion `k3d.io/v1alpha5`, kind `Simple`) mit
      `metadata.name: mentolder-dev`, `servers: 1`, `agents: 1`, gepinntem
      `kubeAPI.hostPort` (Muster aus `k3d-config.yaml` im Repo-Root, T001853), Port-Mappings
      `80:80@loadbalancer` und `443:443@loadbalancer` (analog `k3d/create-cluster.sh`).
- [ ] **2.2** Die Legacy-`k3d-config.yaml` (name: korczewski) NICHT anfassen — sie ist nicht
      Teil dieser Etappe.

### 3. `Taskfile.sdlc.yml` anlegen + Include in `Taskfile.yml`

- [ ] **3.1** `Taskfile.sdlc.yml` (version "3") mit Tasks:
      - `sdlc:cluster:create` — Precondition `docker info`; wenn Cluster existiert → Hinweis
        und Abbruch; sonst `k3d cluster create --config k3d/sdlc-stack/k3d-config.yaml` +
        `kubectl wait --for=condition=Ready nodes --all --timeout=120s` + toten Kontext
        entfernen: `kubectl config delete-context k3d-korczewski || true` + Kontext-Check
        `kubectl config use-context k3d-mentolder-dev`.
      - `sdlc:cluster:delete` — `k3d cluster delete mentolder-dev`.
      - `sdlc:cluster:status` — `k3d cluster list`, `kubectl get nodes`, Pods in `workspace`.
      - `sdlc:deploy` — Passwörter aus `k3d/secrets.yaml` extrahieren (yq), dann:
        `kubectl kustomize --load-restrictor=LoadRestrictionsNone k3d/sdlc-stack | envsubst
        '$POCKET_ID_FRONTEND_URL $POCKET_ID_URL $POCKET_ID_DOMAIN $PROD_DOMAIN
        $WEBSITE_SITE_URL $SMTP_HOST $SMTP_PORT $SMTP_USER $SMTP_FROM $POCKET_ID_SMTP_TLS
        $NEXTCLOUD_DB_PASSWORD $VAULTWARDEN_DB_PASSWORD $VIDEOVAULT_DB_PASSWORD
        $WEBSITE_DB_PASSWORD $POCKET_ID_DB_PASSWORD' | kubectl apply -f -`; danach
        `kubectl rollout status` für shared-db, pocket-id, sdlc-console, bge-embed,
        bge-rerank (Timeout je 300 s).
      - `sdlc:status` — kurzgefasste Health-Übersicht (Pod-Status + Endpoint-Checks).
- [ ] **3.2** In `Taskfile.yml` unter `includes:` den Block `sdlc:` → `./Taskfile.sdlc.yml`
      ergänzen (Muster: der bestehende `dev:`-Block).

### 4. Runbook `docs/sdlc-stack/README.md` anlegen

- [ ] **4.1** Abschnitte: Überblick (Scope, Cluster, Domains), Voraussetzungen (Docker, k3d,
      kubectl, `*.localhost`-DNS-Auflösung — Hinweis auf `/etc/hosts`-Einträge
      `127.0.0.1 sdlc.localhost auth.localhost`), Cluster anlegen, Deployen, Pocket-ID
      Admin-Bootstrap (Login-Code: `kubectl logs -n workspace deploy/pocket-id`), DoD-Checks
      (curl-Kommandos aus design.md), Mesh-Fallback (wg-fleet), WSL-Speicher-Baseline
      (40 GB konfiguriert / 39 GB effektiv gemessen am 2026-08-04, Messbefehl `free -g`).
- [ ] **4.2** Hinweis auf die `../`-Referenzen und `--load-restrictor=LoadRestrictionsNone`
      (warum, und dass `task sdlc:deploy` es bereits richtig macht).

### 5. Verifikation

- [ ] **5.1** WSL-Messung: `free -g` zeigt ≥ 36 GB total (erwartet: 39).
- [ ] **5.2** `task sdlc:cluster:create` läuft durch, Kontext `k3d-mentolder-dev` aktiv, toter
      `k3d-korczewski`-Eintrag entfernt.
- [ ] **5.3** `kubectl kustomize --load-restrictor=LoadRestrictionsNone k3d/sdlc-stack` baut
      fehlerfrei (sobald p2-Dateien existieren; vorher nur Teilprüfung der referenzierten
      Base-Dateien).

## Verify

```bash
task sdlc:cluster:create        # Cluster mentolder-dev steht, Kontext aktiv
kubectl config get-contexts     # k3d-mentolder-dev vorhanden, k3d-korczewski weg
free -g                         # total >= 36
```
