---
ticket_id: T002625
plan_ref: openspec/changes/e2-sdlc-local-stack/tasks.md
status: active
date: 2026-08-04
---

# Design: E2 SDLC-Isolation — Lokaler k3d-Stack (Console, PostgreSQL, bge, Auth)

## Kontext

ADR-006 Etappe 2 (Epic T002623, ADR-006-Plan plan_staged). E1 (T002624, gemergt) hat den
Build-Target-Split geliefert: `ghcr.io/paddione/website-sdlc` wird mit `BUILD_TARGET=sdlc` gebaut,
ist aber nirgends referenziert (ADR-006 Umsetzungsstand: „Das SDLC-Console-Image hat keine
Laufzeit-Heimat"). Diese Etappe baut die lokale Laufzeit für die SDLC-Fläche auf dem Dev-Host.

**Ausgangslage, gemessen am 2026-08-04:**

| Asset | Ist | Beleg |
|---|---|---|
| k3d-Cluster | **leer** — `k3d cluster list` zeigt nichts; Kontext `k3d-mentolder-dev` fehlt, toter `k3d-korczewski`-Eintrag vorhanden | `k3d cluster list`, `kubectl config get-contexts` |
| WSL-Speicher | **40 GB konfiguriert, 39 GB effektiv** (`.wslconfig` `memory=40GB`, datiert 2026-08-03) — die E1-offene Messung ist erledigt | `free -g`, `~/.wslconfig` |
| Mesh (wg-fleet) | **aktuell down** — kein `wg`-Interface, keine `10.20.*`-Adresse | `wg show` |
| fleet | erreichbar — `tickets`-Schema (26 Tabellen) liegt in der **`website`-DB** auf `shared-db`; `pocket-id`, `mentolder-web`, `shared-db` laufen | `kubectl --context fleet get pods -n workspace`, `psql` |
| Console-Image | `ghcr.io/paddione/website-sdlc:latest` wird gebaut, wird von keinem Manifest referenziert | `build-sdlc-console.yml`, grep über `k3d/`, `prod-fleet/`, `flux/` |
| Kustomize | verbietet `../datei.yaml` in `resources:` („security; file is not in or below") — erlaubt mit `--load-restrictor=LoadRestrictionsNone` (etabliertes Muster: `workspace:validate`) | getestet, Taskfile.yml Z. 2553 |

## Entscheidungen

### D1 — Neuer k3d-Cluster `mentolder-dev` (Kontext `k3d-mentolder-dev`)

Der Cluster wird neu aufgebaut (Bestand: leer) und ist ab jetzt die dauerhaft betriebene lokale
Betriebsumgebung. Name **`mentolder-dev`** → Kubeconfig-Kontext **`k3d-mentolder-dev`** (der Name,
den CLAUDE.md/ADR-006 seit jeher für den Dev-Cluster vorsehen; der tote `k3d-korczewski`-Eintrag
stammt aus der Legacy-`k3d-config.yaml` mit `metadata.name: korczewski`). Der tote Kontext wird
entfernt (`kubectl config delete-context k3d-korczewski || true`).

Cluster-Config `k3d/sdlc-stack/k3d-config.yaml`: 1 Server, 1 Agent, Ports `80:80@loadbalancer` und
`443:443@loadbalancer` (für `*.localhost`-Ingresses, analog `k3d/create-cluster.sh`),
`kubeAPI.hostPort` gepinnt (Muster aus der bestehenden `k3d-config.yaml`, T001853). Die
Legacy-`k3d-config.yaml` (name: korczewski) bleibt unangetastet — sie ist nicht Teil des
SDLC-Stacks und wird nur bei Bedarf später bereinigt.

### D2 — Self-contained Overlay `k3d/sdlc-stack/` über dieselben Manifeste wie Prod

Der ADR-Satz „dieselben Kustomize-Manifeste wie Prod" heißt: **keine Kopien** der Base-Dateien.
Das Overlay referenziert die vorhandenen Base-Manifeste per `../`-Pfad (Ressourcen-Liste unten)
und wird deshalb mit `--load-restrictor=LoadRestrictionsNone` gebaut — exakt das Muster, das
`workspace:validate` seit jeher nutzt. Kein `$patch: delete`-Flickwerk über das 40-Ressourcen-Base:
das Overlay listet nur die SDLC-relevanten Dateien explizit.

```yaml
# k3d/sdlc-stack/kustomization.yaml (Zielbild)
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: workspace
resources:
  - ../namespace.yaml                  # erzeugt ns workspace
  - ../configmap-domains.yaml          # domain-config (POCKET_ID_DOMAIN etc.)
  - ../secrets.yaml                    # Plaintext-Dev-Secrets (workspace-secrets, website-secrets)
  - ../shared-db.yaml                  # lokale PostgreSQL (website-DB mit tickets-Schema)
  - ../website-schema.yaml             # Schema-Init (idempotent, bootstrap-safe)
  - ../pocket-id.yaml                  # lokale Pocket ID (auth.localhost)
  - ../pocket-id-db-init-sql.yaml      # DB/Rollen-Bootstrap ConfigMap
  - ../pocket-id-client-seed.yaml      # OIDC-Client-Seed (16 Clients, inkl. website)
  - ../pocket-id-client-seed-rbac.yaml # RBAC fürs Seed-Job-Patch
  - ../pocket-id-client-seed-website-rbac.yaml  # RBAC fürs Cross-Secret-Patch
  - ../llm-gpu.yaml                    # zweites bge-Paar, CPU-only (T002551-Manifest)
  - sdlc-console.yaml                  # NEU: Console Deployment/Service/ConfigMap
  - sdlc-ingress.yaml                  # NEU: sdlc.localhost + auth.localhost
```

`namespace: workspace` normalisiert alle Namespaces (Base-Dateien tragen teils `namespace:
workspace` bereits hart, teils Platzhalter) — konsistent mit dem Prod-Overlay.

**Deploy-Pipeline** (`task sdlc:deploy`): `kubectl kustomize --load-restrictor=LoadRestrictionsNone
k3d/sdlc-stack | envsubst '$POCKET_ID_FRONTEND_URL $POCKET_ID_URL $POCKET_ID_DOMAIN $PROD_DOMAIN
$WEBSITE_SITE_URL $SMTP_HOST $SMTP_PORT $SMTP_USER $SMTP_FROM $POCKET_ID_SMTP_TLS
$NEXTCLOUD_DB_PASSWORD $VAULTWARDEN_DB_PASSWORD $VIDEOVAULT_DB_PASSWORD $WEBSITE_DB_PASSWORD
$POCKET_ID_DB_PASSWORD' | kubectl apply -f -` — Platzhalter-Menge ergibt sich aus den referenzierten
Manifesten (gemessen: `shared-db.yaml` 5 × `${*_DB_PASSWORD}`, `pocket-id.yaml` 9 ×
`${POCKET_ID_*}/${SMTP_*}/${PROD_DOMAIN}/${TLS_SECRET_NAME}`, `llm-gpu.yaml` nur im Kommentar).
Die Passwörter kommen aus `k3d/secrets.yaml` selbst (dev-Plaintext) — der Stack ist
self-contained, kein externes Secret-Registry nötig. Lokale Werte:
`POCKET_ID_FRONTEND_URL=http://auth.localhost`, `POCKET_ID_URL=http://pocket-id:1411`,
`POCKET_ID_DOMAIN=auth.localhost`, `PROD_DOMAIN=localhost`, `WEBSITE_SITE_URL=http://sdlc.localhost`,
SMTP_* leer (kein Mail in der lokalen Umgebung). `TLS_SECRET_NAME` bleibt ungesetzt — der lokale
Stack läuft plain HTTP (kein Cert-Manager im Scope; TLS ist Sache von E4/dev.mentolder.de).

### D3 — Console-Deployment `sdlc-console.yaml`

Neues Deployment (modelliert auf `k3d/website.yaml`, aber getrimmt auf den SDLC-Bedarf — keine
Nextcloud/Stripe/Sepa-Env):

- **Image:** `ghcr.io/paddione/website-sdlc:latest` (`BUILD_TARGET=sdlc` ist im Image gebacken;
  `/api/health` liefert es aus).
- **DB:** `SESSIONS_DATABASE_URL=postgresql://website:devwebsitedb@shared-db:5432/website` — die
  lokale PostgreSQL; das `tickets`-Schema bootstrappt sich selbst über
  `initTicketsSchema()` (`website/src/lib/tickets-schema.ts`) bei der ersten Anfrage
  (`ensureSchemaOnce`-Cache, idempotent). `WEBSITE_DB_PASSWORD` via `secretKeyRef` aus
  `website-secrets` (in `k3d/secrets.yaml` enthalten).
- **bge:** `LLM_EMBED_URL=http://llm-gateway-embed:8081`, `LLM_RERANKER_URL=http://llm-gateway-rerank:8081`,
  `LLM_ENABLED=true`, `LLM_RERANK_ENABLED=true`, `LLM_EMBED_MODEL=bge-m3`.
- **Auth:** `POCKET_ID_FRONTEND_URL=http://auth.localhost` (Authorize/End-Session),
  `POCKET_ID_URL=http://pocket-id:1411` (Token/Userinfo), `SITE_URL=http://sdlc.localhost`,
  `PORTAL_ADMIN_USERNAME=gekko,paddione,quamain,test-admin,tina-merlin@web.de` (isAdmin-Fallback),
  plus die Fallback-Issuer-Env für D4:
  `POCKET_ID_FALLBACK_FRONTEND_URL=https://auth.mentolder.de`,
  `POCKET_ID_FALLBACK_URL=https://auth.mentolder.de`.
- **Sonst:** `BRAND_ID=mentolder`, `CLUSTER_ENV=sdlc-local`, `PINO_LOG_LEVEL=info`,
  `CRON_SECRET` aus Secrets (Boot-Fail ohne OIDC-Secret bleibt aktiv — T001593-Verhalten).
- **Service:** `sdlc-console` → Port 8080 (Astro-Containerport wie `website`).

`SESSIONS_DATABASE_URL` bedient zugleich die `web_sessions`-Tabelle (Auth-Sessions) und die
`tickets`-Schema-Init — eine Connection, wie in Prod (`db-pool.ts`).

### D4 — Auth fail-closed: lokale Pocket ID primär, fleet-Fallback über Mesh, eigener Test

**Zwei Auth-Pfade in einer Codebase sind die bekannte Lückenquelle (ADR-006).** Die Auswahlschicht
`website/src/lib/auth/provider.ts` macht die Fallback-Logik **eine** Stelle, die ausschließlich
fail-closed sein darf:

- **Primary:** lokale Pocket ID im selben Cluster (`http://auth.localhost` für Frontend-Endpoints,
  `http://pocket-id:1411` für Token/Userinfo) — braucht **kein Mesh**.
- **Fallback:** fleet-Pocket-ID (`https://auth.mentolder.de` — OIDC-API liegt auf demselben
  Origin), erreichbar über das wg-Mesh bzw. öffentliches DNS; **nur** wenn die lokale Instanz
  nicht erreichbar ist (Health-Probe mit Kurzschluss-TTL ~30 s, um Flapping zu dämpfen).
- **Fail-closed-Invariante:** Ist kein Provider erreichbar (oder wirft ein Endpoint einen
  Fehler), wird **nichts** gewährt: `exchangeCode`/`getSession` liefern `null`, der Login zeigt
  einen 503 — es entsteht **nie** eine degradiert-offene Session. Der bestehende harte Boot-Fail
  ohne OIDC-Secret (T001593) bleibt unangetastet.
- **Prod-Verhalten unverändert:** Ohne gesetzte Fallback-Env (Prod-Deployment setzt sie nicht)
  ist `provider.ts` eine triviale Single-Provider-Pass-through — kein Verhaltensunterschied im
  Kunden-Image, kein Blast-Radius-Risiko.
- **Umsetzung:** `auth.ts` ersetzt die vier Modul-Konstanten (`AUTH_ENDPOINT`,
  `TOKEN_ENDPOINT`, `USERINFO_ENDPOINT`, `LOGOUT_ENDPOINT`) durch lazy Getter über den aktiven
  Provider; bei Refresh-Fehler wird einmal neu selektiert, sonst deny.
- **Eigener Test (Pflicht):** `website/src/lib/auth/provider.test.ts` (Vitest, gemocktes
  `fetch`) mit vier Fällen: (1) beide Provider down → deny, keine Session; (2) primary down,
  fallback up → Fallback wird genutzt; (3) primary up → primary wird genutzt; (4) keine
  Fallback-Env → Single-Provider-Pfad unverändert.

### D5 — `.wslconfig`: nur Verifikation + Dokumentation (bereits erledigt)

Die E1-offene Messung ist abgeschlossen: `.wslconfig` steht auf `memory = 40GB` (Kommentar
verweist explizit auf ADR-006/T002625), `free -g` zeigt **39 GB effektiv**. Der Plan enthält
deshalb **keinen Änderungs-Task**, sondern (a) einen Verifikationsschritt (`free -g` ≥ 36 GB) in
p1 und (b) die Dokumentation der Messung in `docs/sdlc-stack/README.md` als Baseline (lokal:
Cluster ~4–5 GB, Factory-Ticks, Unsloth-Training — der 40-GB-Wert trägt die Etappe).

### D6 — `dev.mentolder.de` und `terminal-sidekick` bleiben (bewusste Entscheidung)

Die im ADR als „Entscheidung in E2" offenen Abweichungen werden **nicht** verlagert:

- **`dev.mentolder.de` (dev-stack auf fleet):** bleibt. Er ist die einzige Vorschau-Umgebung mit
  echtem TLS/SSO und wird nicht von einem Kunden-Request synchron benötigt — eine dokumentierte,
  vertretbare Ausnahme vom Trennkriterium. Ein Umzug auf den Dev-Host würde die Vorschau von der
  Workstation abhängig machen; der SDLC-Stack (diese Etappe) und der Preview-Stack (dev-stack)
  koexistieren auf getrennten Clustern.
- **`terminal-sidekick`:** bleibt als dokumentierte Ausnahme (Prod-Ingress → Workstation-ttyd).
  Er ist ein Dev-Werkzeug der Sidekick-Agents; die Überführung in die lokale Console würde den
  Zugang von unterwegs entfernen und gehört in eine eigene Entscheidung (nicht in den
  Infrastruktur-Scope von E2).

Beide Entscheidungen werden im Runbook und im Abschlusskommentar des Tickets festgehalten; die
ADR-Offenen-Punkte bleiben offen, sind aber durch diese Etappe begründet beantwortet.

### D7 — Keine Datenmigration (das ist E3/T002626)

Die lokale `website`-DB bootstrappt das `tickets`-Schema selbst (D3). **Es wird nichts migriert,
gesynct oder geseedet** — der factory-Kern (native Prozesse) schreibt weiterhin gegen die
fleet-DB, bis E3 die Datenhoheit lokal-primär macht. DoD „Console gegen die lokale DB lauffähig"
heißt: der Console-Pod verbindet sich gegen die lokale shared-db, Cockpit/Factory-Floor-Seiten
rendern, das Schema existiert nach der ersten Anfrage (Nachweis via psql-Zählung).

## Zielstruktur

```
k3d/sdlc-stack/
  kustomization.yaml      Overlay (referenziert ../base-Dateien)
  k3d-config.yaml         Cluster-Config name: mentolder-dev
  sdlc-console.yaml       Console Deployment/Service/ConfigMap (website-sdlc-Image)
  sdlc-ingress.yaml       sdlc.localhost + auth.localhost (plain HTTP, :80)
Taskfile.sdlc.yml         cluster:create/delete/status, deploy, status
docs/sdlc-stack/README.md Runbook (Create, Deploy, Auth, WSL-Baseline, DoD-Checks)
website/src/lib/auth/
  provider.ts             fail-closed Provider-Auswahl (primary lokal / fallback fleet)
  provider.test.ts        Vitest: deny / fallback / primary / no-fallback
website/src/lib/auth.ts   Endpoints über provider.ts (lazy Getter)
tests/spec/sdlc-isolation/
  e2-local-stack.bats     Struktur-Anker + DoD-Verifikation (RED → GREEN)
```

## DoD-Zuordnung

| DoD (Ticket) | Nachweis |
|---|---|
| Console erreichbar | `curl -sS -o /dev/null -w '%{http_code}' http://sdlc.localhost` → 200; `/api/health` liefert `BUILD_TARGET=sdlc` |
| Gegen die lokale DB lauffähig | `tickets`-Schema in der lokalen `website`-DB nach erster Anfrage (psql-Zählung > 0); Cockpit-Seite rendert |
| bge antwortet | `kubectl port-forward svc/llm-gateway-embed 8081:8081` + `curl localhost:8081/health` → 200 (analog rerank) |
| Anmeldung mit und ohne Mesh | ohne Mesh: lokale Pocket-ID-Anmeldung (`http://auth.localhost/authorize` → 302); mit Mesh: fleet-Fallback erreichbar (`curl https://auth.mentolder.de` nach `wg-quick up wg-fleet`); beide down → deny (provider.test.ts, Fall 1) |

## Risiken und Trade-offs

- **Auth ist die kritische Stelle.** Zwei Pfade → eine Auswahlschicht, nur fail-closed, eigener
  Test. Der Prod-Pfad bleibt ohne Fallback-Env identisch (kein Blast-Radius).
- **`../`-Referenzen im Overlay** brauchen `--load-restrictor=LoadRestrictionsNone` — etabliert
  (`workspace:validate`), aber der Build schlägt ohne das Flag hart fehl; das Runbook und die
  Task-Datei dokumentieren es.
- **Plain-HTTP-Endpoints lokal** (kein TLS) — bewusst: lokale Umgebung, `.localhost`-Domains,
  kein Cert-Manager im Scope. Pocket ID meldet ggf. nicht-HTTPS-APP_URL-Warnungen; für den
  lokalen Betrieb akzeptiert.
- **bge-PVCs** brauchen eine StorageClass im k3d — `k3d/llm-gpu.yaml` lässt `storageClassName`
  frei → Default-SC (local-path) greift, kein Longhorn nötig (Kommentar im Manifest bestätigt
  das Muster für k3d-dev).
- **RAM:** Cluster + Console + DB + bge-Paar ≈ 4–5 GB — im 40-GB-Limit (39 effektiv) tragfähig;
  Verifikation in p1.
- **Kein Datenbestand in der lokalen DB** — Cockpit zeigt leere Tickets, bis E3 migriert.
  Bewusst (D7); die Factory läuft unverändert gegen fleet.

## Abgrenzung

- **E1 (T002624):** liefert das Image (`website-sdlc`) und den Pfad-Filter — diese Etappe
  referenziert das Image erstmals.
- **E3 (T002626):** Datenmigration, Poller, lokale Primärhoheit — explizit NICHT hier.
- **E4 (T002627):** SDLC-Routen aus dem Prod-Image — build-seitig bereits wirksam (E1),
  Laufzeit-Seite folgt nach E3.
- **ADR-004/T002551:** fleet-bge bleibt unangetastet — das lokale bge-Paar ist das zweite,
  Factory-eigene Paar (G10).
