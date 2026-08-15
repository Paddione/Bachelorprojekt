# p2 — LISTEN-Umstellung + API-Katalog-UI (Rolle: website)

_Voraussetzung: E3 (T007957) ist gemerged — DeckWissen existiert; cockpit-listen-hub (E1/E3-Basis) liegt unter `lib/sdlc/cockpit-listen-hub.ts`._

## Tasks

- [ ] **`api/factory-floor/stream.ts` auf LISTEN/NOTIFY umstellen.** Statt
      `pollTimer = setInterval(poll, STREAM_POLL_MS)` den `cockpit-listen-hub`
      (`subscribe()/unsubscribe()`, Vorbild: `pages/sdlc/api/cockpit/stream.ts`) abonnieren:
      NOTIFY-Event → frisches Floor-Payload pushen; Hub-`reconnect`-Event → vollständigen
      Snapshot pushen. Heartbeat-Timer bleibt. Fallback: wenn der Hub keine PG-Verbindung
      aufbauen kann, Interval-Poll wie bisher (Funktionsfähigkeit vor Eleganz).
      `unsubscribe` im `cancel`/Close-Pfad — kein Leak pro SSE-Client.
- [ ] **`api/mcp-health.ts` anlegen (server-seitiger Health-Proxy).** Admin-gated Route
      (`getSession` + `isAdmin`, Muster der übrigen `/sdlc/api/`-Routen): probt die
      HTTP-MCP-Server aus `api-inventory.json` (mcp-kubernetes :18080, mcp-postgres :13001,
      factory-mcp :13003, sowie den vierten HTTP-Eintrag laut Inventory) über deren
      Health-Endpunkte mit kurzem Timeout; Antwort
      `{ fetchedAt, servers: [{ name, ok, error }] }`. Keine Ports/Hosts hardcoden, die nicht
      aus dem Inventory bzw. der bestehenden Endpoint-Host-Auflösung stammen.
- [ ] **`ApiKatalog.svelte` anlegen.** Statischer Import von
      `components/website/src/data/api-inventory.json` (Build-Time-Import, kein fetch der
      JSON); UI: Textsuche, Gruppierung nach Pfadpräfix, Methoden-Badges (GET/POST/…),
      Backend-Kennzeichnung (Postgres/K8s-REST/kubectl/GitHub/Prometheus/FS), kuratierte
      Overlay-Felder (Beschreibung/Tier) anzeigen, wenn vorhanden. Health-Punkte der
      MCP-Sektion über `/sdlc/api/mcp-health` (Poll mit `refreshMs`, pausiert bei
      `document.hidden` — Nicht-PG-Quelle, Konvention aus dem SSOT-Spec).
- [ ] **`DeckWissen.svelte` umbauen.** Die E3-„API-Katalog-Kachel" durch das vollwertige
      `ApiKatalog`-Modul ersetzen; OpenSpec-Suche-Modul bleibt unverändert.

## Verifikation (Partial-lokal)

```bash
grep -n 'cockpit-listen-hub' components/website/src/pages/sdlc/api/factory-floor/stream.ts
grep -rn 'api-inventory.json' components/website/src/components/leitstand/ApiKatalog.svelte
```
