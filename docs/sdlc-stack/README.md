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

## Datenhoheit seit E3 (T002626)

Das `tickets`-Schema liegt **lokal**. Der Default-Kontext aller Ticket-Befehle ist
`k3d-mentolder-dev`; die fleet-Kopie ist eingefroren (`SELECT` ja, Schreibzugriffe nein).
Ablauf und Rückweg: [e3-cutover.md](e3-cutover.md).

### Verfügbarkeitserwartung

**Ticket-Operationen setzen ab jetzt einen laufenden lokalen Cluster voraus.** Ohne ihn
scheitert jeder Befehl mit `no shared-db pod found` — das ist die beabsichtigte Konsequenz von
ADR-006, kein Defekt. Ein stiller Rückfall auf fleet wäre die schlechtere Alternative: er
ließe Schreibvorgänge in einer toten Kopie landen, ohne dass es auffällt.

Die eingefrorene Historie lesen:

```bash
TICKET_CTX=fleet bash scripts/ticket.sh get --id T000123
```

Korczewski-Tickets liegen weiterhin auf fleet und brauchen dieses explizite `TICKET_CTX`.

### Zwei `provider_config`-Instanzen

`tickets.provider_config` ist als einzige Tabelle **nicht** migriert: `coaching.sessions`
referenziert sie mit 13 Zeilen, und Coaching bleibt laut ADR-006 auf fleet.

| Instanz | Zuständig für |
|---|---|
| lokal (`k3d-mentolder-dev`) | LLM-Provider-Wahl der Factory |
| fleet | ausschließlich Coaching |

Sie sind bewusst unabhängig. **Wer eine ändert, ändert nicht die andere** — das ist der
getragene Preis dafür, dass Coaching seine referentielle Integrität behält.

### Sicherung

Täglich um 03:00 nach fleet, verschlüsselt (`task sdlc:sdlc:backup:install` richtet den Timer
ein). Der Nachweis, dass eine Sicherung zurückspielbar ist, läuft über
`task sdlc:sdlc:restore-check` — nicht über die bloße Existenz der Datei.

## ADR-006 Bezug

- **dev.mentolder.de (dev-stack auf fleet)** bleibt — dokumentierte Ausnahme
- **terminal-sidekick** bleibt — dokumentierte Ausnahme
- **`knowledge`/`wissen`** bleibt produktiv — `scripts/openspec-embed-local.sh` schreibt
  deshalb weiterhin gegen fleet, obwohl alles andere lokal liegt
