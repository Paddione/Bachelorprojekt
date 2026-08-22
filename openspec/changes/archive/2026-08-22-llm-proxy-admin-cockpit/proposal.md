# Proposal: llm-proxy-admin-cockpit

## Why

Das Cockpit-Panel meldet `Proxy offline — Start: task llm:proxy:start`, während der Proxy
nachweislich läuft. Die Meldung ist keine Statusanzeige, sondern eine Fehldiagnose mit einer
Handlungsanweisung, die den Zustand garantiert nicht ändert.

**Symptom (beobachtet, reproduzierbar):** `LlmProxyPanel.svelte:105` rendert den Offline-Zweig,
während auf dem Host `ss` einen aktiven Listener auf `127.0.0.1:18235` zeigt und
`/admin/state` wie `/v1/models` mit HTTP 200 antworten.

**Ursache (verifiziert, nicht angenommen):** Zwei unabhängige Blocker, keiner davon ein Ausfall.

1. `components/website/src/pages/sdlc/api/llm-proxy/status.ts:7` fällt auf
   `http://127.0.0.1:18235` zurück, und `LLM_PROXY_URL` ist im Deployment
   `k3d/sdlc-stack/sdlc-console.yaml` nicht gesetzt (Pod-Env geprüft: nur DB-, OIDC- und
   PAT-Variablen). Im Pod zeigt `127.0.0.1` auf den Pod selbst.
2. `scripts/llm-proxy/server.mjs:730` bindet ausschließlich auf `127.0.0.1`. Selbst mit
   korrigierter URL bliebe der Proxy unerreichbar.

Zusätzlich ist `host.k3d.internal` in diesem Cluster **nicht auflösbar** (NXDOMAIN, kein Eintrag
in `kube-system/coredns` `NodeHosts`) — der sonst übliche k3d-Hostname steht als Lösung nicht zur
Verfügung.

Der Aufwand lohnt nur, wenn dabei auch das eigentliche Ziel erreicht wird: **eine** Oberfläche für
die Proxy-Administration. Heute existieren zwei — die vom Proxy selbst ausgelieferte
`/admin`-Seite (`scripts/llm-proxy/ui/index.html`) und das Cockpit-Panel, das rund zwei Drittel
derselben Funktionen abdeckt. Zwei UIs auf denselben Zustand erzeugen Schreibkonflikte
(`FactoryWriteConflictError` in `factory.ts` zeigt, dass das Thema bereits auftrat).

## What

### Entschiedene Richtung

**Synchroner Kanal Pod→Host statt DB-Queue.** Steuerbefehle wirken sofort; 30 s Poll-Latenz wurde
ausdrücklich verworfen.

**D1 — Zweiter Listener auf der k3d-Bridge-IP.** `server.mjs` bindet zusätzlich auf dem
Docker-Bridge-Gateway des k3d-Netzes (aktuell `172.23.0.1`). Der Loopback-Listener bleibt
unverändert. Die Adresse wird beim Start per `docker network inspect` ermittelt, nicht hartkodiert;
schlägt die Ermittlung fehl, startet der Proxy weiterhin auf Loopback und protokolliert eine
Warnung — ein fehlender Cluster darf den Proxy nie am Start hindern. Override über
`LLM_PROXY_HOST_BIND`.

**D2 — Bearer-Token nur auf dem neuen Listener.** Der Loopback-Listener bleibt unauthentifiziert.
Damit laufen `scripts/lib/llm-stack-measure.sh`, `scripts/llm/pk-devices/k3-messung.sh`,
`scripts/llm/routing-check.sh` und die Factory unverändert weiter. Der host-erreichbare Listener
verlangt `Authorization: Bearer $LLM_PROXY_ADMIN_TOKEN`. Der Wert lebt auf Proxy-Seite in
`~/.config/llm-proxy/proxy.env` (bestehende `EnvironmentFile` der Unit) und im Cluster als
SealedSecret-Schlüssel — dasselbe Muster wie `BGE_MCP_TOKEN`.

**D3 — Stabile Adresse über Service + Endpoints.** Ein Service `llm-proxy-host` in `workspace` mit
manuell gesetzten Endpoints auf die Host-IP. Der Pod adressiert einen DNS-Namen; die IP steht an
genau einer Stelle im Manifest statt als Literal im Deployment. Das respektiert den bestehenden
Guard gegen hartkodierte Backend-Adressen in Oberflächen
(`openspec/specs/local-llm-proxy.md:33`).

**D4 — Die `/admin`-UI im Proxy entfällt ersatzlos.** Kein Fallback, eine einzige Oberfläche. Die
Route liefert künftig einen Verweis aufs Cockpit statt HTML.

**D5 — Fehlende Routen im Cockpit ergänzen.** Vorhanden sind `status`, `reload`, `factory`,
`catalog`, `backends`. Es fehlen: `GET|PUT /admin/loadouts`, `GET /admin/loadouts/status`,
`/admin/loadouts/pin`, `GET /admin/models`, sowie
`POST /admin/loadouts/<slug>/start` und `/stop` (`server.mjs:663`/`:680`). Alle bekommen den
bestehenden Session- plus `isAdmin`-Guard der Nachbarrouten.

**D6 — Unerreichbar ist nicht offline.** Der `catch`-Zweig in `status.ts` unterscheidet die Fälle
und das Panel benennt sie getrennt. Das verschärft das bestehende Requirement
„An offline proxy is stated, not disguised" (`openspec/specs/sdlc-cockpit.md:2226`), das den
Unterschied zwischen totem Prozess und fehlendem Netzwerkpfad bisher nicht kennt.

### Verworfene Alternativen

| Alternative | Warum verworfen |
|---|---|
| Command-Queue über den bestehenden 30 s-Registry-Poll (`backends.mjs:18`) | Technisch elegant — der Kanal Host→Cluster existiert bereits und käme ohne eingehenden Port aus. Verworfen: 30 s Latenz für Steuerbefehle ist als Bedienung nicht akzeptabel. |
| Cockpit lokal per `pnpm dev` betreiben | Umgeht das Problem, statt es zu lösen; die Cluster-Variante bliebe kaputt. |
| Nur die Fehlermeldung korrigieren | Behebt die Fehlinformation, nicht die fehlende Bedienbarkeit. Wird als D6 zum Teil der Lösung, nicht zur Lösung. |
| `0.0.0.0` binden | Robust gegen IP-Wechsel, exponiert den GPU-Steuerungsendpunkt aber ins WSL- und potenziell ins LAN-Netz. Das Token wäre die einzige Barriere. |
| CoreDNS `NodeHosts` um `host.k3d.internal` ergänzen | Greift in eine von k3d verwaltete ConfigMap ein und wird beim Cluster-Reset überschrieben. |
| Auth global für alle Listener | Ein Codepfad statt zwei, bricht aber die Factory im laufenden Betrieb, bis jeder lokale Aufrufer nachgezogen ist. |

### Constraints

- **Der Proxy-Prozess bleibt am Host.** Nicht verlagerbar: `runner.mjs:328/332` startet
  `llama-server` über `systemctl --user`, `loadouts.mjs:341` prüft Ports via
  `/dev/tcp/127.0.0.1`, `loadouts.mjs:315` schreibt `loadouts.json` ins Repo-Dateisystem,
  `gpu-lock.mjs:37` hält den GPU-Lock über `process.kill(pid, 0)` im selben PID-Namespace. Die GPU
  hängt am WSL-Host.
- **Kein Health-Watchdog** (T002336): `/health` antwortet weiterhin 503 bei fehlendem
  Prio-1-Backend, `/livez` bleibt immer 200. Der neue Listener ändert daran nichts.
- **Cockpit ist Development-only** — SDLC-Routen fliegen aus dem Prod-Build. Der neue Listener
  darf keine Prod-Angriffsfläche erzeugen; er existiert nur dort, wo ein k3d-Netz existiert.
- Bestehende Cockpit-Endpunkte behalten Session-Guard und `isAdmin`-Check.

### Nebenbefunde, die mitlaufen

- `/admin/state` liefert `lastProbe`, `lock`, `backends`, aber kein `port`, `uptimeSec` oder
  `version`. `LlmProxyPanel.svelte:108` zeigt darum selbst im Online-Fall `Port — · Uptime — · v—`.
- `status.ts` setzt `proxy: 'ok'`, während das Panel-Interface `'online'` typisiert. Folgenlos, da
  nur der Offline-Vergleich ausgewertet wird, aber inkonsistent.
- `openspec/specs/local-llm-proxy.md:67` nennt die Cockpit-Routen unter `/api/admin/llm-proxy/*`;
  real liegen sie unter `/sdlc/api/llm-proxy/*` (so auch in `sdlc-cockpit.md:2207`). Die Drift wird
  im Delta korrigiert.

_Ticket: T013909_
