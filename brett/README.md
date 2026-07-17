# Systemisches Brett

3D systemic-constellation board served from a single Node.js pod. Static HTML + WebSocket sync + REST snapshots, all on port 3000.

For the full design rationale and API contract see [`docs/superpowers/specs/2026-04-25-systemisches-brett-design.md`](../docs/superpowers/specs/2026-04-25-systemisches-brett-design.md).

## Local dev

Build and run the container locally against your dev database:

```bash
docker build -t workspace-brett .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@host.docker.internal:5432/workspace" \
  workspace-brett
```

## Feature Flags

Brett verwendet `window.__brettFeatures['flag-name']` für Dark-Launch-Features.
Die Flags werden über die Kubernetes ConfigMap `brett-features` gesetzt:

| Flag | Beschreibung | Status |
|------|-------------|--------|
| `replay` | Timeline/Replay-UI für Board-Sessions (T000472) | dark-launch |
| `t000468-ground-anchors` | Boden-Anker & Zonen/Flächen (E1) | **default-on** (T001931) |
| `sf-t000465` | Free-Fly-Kamera | **default-on** (T001931) |
| `sf-t000467` | Beziehungslinien | **default-on** (T001931) |
| `sf-t000469` | Boden-Notizen | **default-on** (T001931) |

Die vier default-on-Flags werden in `public/index.html` per `Object.assign` geseedet;
ein vorab gesetzter Wert (ConfigMap/URL) gewinnt weiterhin (Kill-Switch bleibt erhalten).

### Replay aktivieren (dev)

Setze das Flag (z. B. via `brett-features` ConfigMap oder im Browser):

```json
{
  "replay": true
}
```

Dann `?replay=1&room=<room-token>` im Browser aufrufen (als Admin — die
`/api/sessions/*`-Endpunkte sind admin-gated). Der Server zeichnet alle
Board-Mutations in der Tabelle `session_events` auf; der Client lädt sie per
HTTP und rekonstruiert den Zustand lokal über `replay-engine.ts`.
