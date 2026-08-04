# SDLC-Stack — Lokale Entwicklungsumgebung

k3d-Cluster `mentolder-dev` (Kontext `k3d-mentolder-dev`) mit SDLC-Console,
lokaler PostgreSQL, bge-Embedding/Reranking und Pocket ID Auth.

## Voraussetzungen

- Docker (läuft)
- k3d (`k3d cluster list`)
- kubectl (mind. 1.30)
- `/etc/hosts`-Einträge für lokale Domains:
  ```
  127.0.0.1 sdlc.localhost auth.localhost
  ```

## WSL-Speicher-Baseline

`.wslconfig`: `memory=40GB` (39 GB effektiv, gemessen 2026-08-04).
Cluster + Console + DB + bge-Paar ≈ 4–5 GB — im Limit tragfähig.

```bash
free -g   # total >= 36 GB = OK
```

## Cluster anlegen

```bash
task sdlc:cluster:create
```

Der Task:
- erstellt den Cluster aus `k3d/sdlc-stack/k3d-config.yaml` (name: mentolder-dev)
- wartet auf Ready-Nodes (120 s Timeout)
- entfernt den toten `k3d-korczewski`-Kontext
- setzt `k3d-mentolder-dev` als aktiven Kontext

## Deployen

```bash
task sdlc:deploy
```

Baut das Overlay `k3d/sdlc-stack/` mit `--load-restrictor=LoadRestrictionsNone`
(erforderlich wegen `../`-Referenzen auf die Base-Manifeste — Kustomize blockt
diese Pfade aus Sicherheitsgründen, das Flag ist das etablierte Muster aus
`workspace:validate`) und wendet alle Ressourcen an. Envsubst ersetzt die
Platzhalter mit lokalen Werten:

| Platzhalter | lokaler Wert |
|---|---|
| `POCKET_ID_FRONTEND_URL` | `http://auth.localhost` |
| `POCKET_ID_URL` | `http://pocket-id:1411` |
| `POCKET_ID_DOMAIN` | `auth.localhost` |
| `PROD_DOMAIN` | `localhost` |
| `WEBSITE_SITE_URL` | `http://sdlc.localhost` |
| `SMTP_*` | leer (kein Mail lokal) |

DB-Passwörter stammen aus `k3d/secrets.yaml` (dev-Plaintext).

## Pocket ID Admin-Bootstrap

Der Stack seeded die 16 OIDC-Clients automatisch (`pocket-id-client-seed`).
Falls manueller Login nötig: `kubectl logs -n workspace deploy/pocket-id`
zeigt den Setup-Code.

## DoD-Checks

```bash
# Console erreichbar
curl -sS -o /dev/null -w '%{http_code}' http://sdlc.localhost
# → 200

# Health-Check zeigt BUILD_TARGET=sdlc
curl -s http://sdlc.localhost/api/health | jq .buildTarget
# → "sdlc"

# bge antwortet
kubectl --context k3d-mentolder-dev port-forward -n workspace svc/llm-gateway-embed 8081:8081 &
curl http://127.0.0.1:8081/health
# → 200 (analog llm-gateway-rerank)

# lokales tickets-Schema nach erster Anfrage
kubectl --context k3d-mentolder-dev exec -n workspace deploy/shared-db -- \
  psql -U website -d website -c "SELECT count(*) FROM tickets.tickets;"
# → 0 (Schema existiert, leer — Migration erst in E3)

# Auth ohne Mesh (lokale Pocket ID)
curl -s -o /dev/null -w '%{http_code}' http://auth.localhost/authorize
# → 302 (Redirect zu Pocket-ID-Login)
```

## Mesh-Fallback

Nach `wg-quick up wg-fleet` (Mesh aktuell down) ist die fleet-Pocket-ID
unter `https://auth.mentolder.de` erreichbar — die fail-closed-Provider-Schicht
nutzt sie als Fallback, wenn die lokale Instanz nicht antwortet.

## Status

```bash
task sdlc:status
task sdlc:cluster:status
```

## Löschen

```bash
task sdlc:cluster:delete
```

## Architektur

- **k3d/sdlc-stack/kustomization.yaml** — Overlay, referenziert Base-Manifeste per `../`
- **k3d/sdlc-stack/k3d-config.yaml** — Cluster-Config (1 server, 1 agent, Ports 80/443)
- **k3d/sdlc-stack/sdlc-console.yaml** — Console-Deployment (website-sdlc-Image)
- **k3d/sdlc-stack/sdlc-ingress.yaml** — Ingress (sdlc.localhost, auth.localhost)
- **website/src/lib/auth/provider.ts** — fail-closed Provider-Auswahl
- **tests/spec/sdlc-isolation/e2-local-stack.bats** — Struktur- + DoD-Guard

## ADR-006 Bezug

- **dev.mentolder.de (dev-stack auf fleet)** bleibt — dokumentierte Ausnahme
- **terminal-sidekick** bleibt — dokumentierte Ausnahme
- **Keine Datenmigration** hier — das lokale `tickets`-Schema bootstrappt sich selbst
  (leer); Migration folgt in E3 (T002626)
