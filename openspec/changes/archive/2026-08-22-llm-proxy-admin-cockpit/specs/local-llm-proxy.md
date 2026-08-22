## ADDED Requirements

### Requirement: Second listener for cluster-internal admin access

Der Proxy lauschte ausschließlich auf `127.0.0.1:18235`. Das ist für lokale Aufrufer richtig, macht
ihn aber für den Cockpit-Pod strukturell unerreichbar: im Pod zeigt `127.0.0.1` auf den Pod selbst,
und `host.k3d.internal` ist in diesem Cluster nicht auflösbar (NXDOMAIN, kein Eintrag in
`kube-system/coredns` `NodeHosts`). Ohne einen zweiten Listener bleibt jede Cockpit-Route ein
Fehlschlag, egal wie sie konfiguriert ist.

The proxy SHALL bind a second listener on the k3d Docker bridge gateway address in addition to the
loopback listener. The address SHALL be discovered at startup from the Docker network rather than
hard-coded, and SHALL be overridable through `LLM_PROXY_HOST_BIND`. The loopback listener SHALL
remain unchanged in address, port and behaviour.

Discovery failure SHALL NOT prevent startup: if no bridge address can be determined, the proxy
SHALL continue serving on loopback alone and SHALL log the reason. A proxy that refuses to start
because a cluster is absent would couple the GPU control plane to the cluster lifecycle, which is
the opposite of the intent.

#### Scenario: The cluster-facing listener answers admin requests

- **GIVEN** a k3d network exists and the proxy has started
- **WHEN** a request reaches `GET /admin/state` on the bridge gateway address with a valid token
- **THEN** it is answered with the same payload the loopback listener returns

#### Scenario: A missing k3d network leaves the proxy serving on loopback

- **GIVEN** no k3d network exists
- **WHEN** the proxy starts
- **THEN** it serves on `127.0.0.1:18235`, logs that no bridge address was found, and exits with no error

#### Scenario: An explicit override wins over discovery

- **GIVEN** `LLM_PROXY_HOST_BIND` names an address
- **WHEN** the proxy starts
- **THEN** it binds that address and performs no discovery

### Requirement: Bearer token guards the cluster-facing listener only

Das Loopback-Binding war eine bewusste Sicherheitsentscheidung — die Admin-Routen starten und
stoppen GPU-Prozesse. Ein erreichbarer Listener ohne Authentifizierung würde diese Entscheidung
stillschweigend zurücknehmen. Eine globale Token-Pflicht wiederum bräche jeden bestehenden lokalen
Aufrufer, allen voran die Factory, im laufenden Betrieb.

Requests arriving on the cluster-facing listener SHALL carry
`Authorization: Bearer $LLM_PROXY_ADMIN_TOKEN` and SHALL be rejected with HTTP 401 otherwise.
Requests on the loopback listener SHALL NOT require any token. The token SHALL be read from the
unit's existing `EnvironmentFile` (`~/.config/llm-proxy/proxy.env`) and SHALL NOT appear in any
tracked file, following the same rule already established for `BGE_MCP_TOKEN`.

If the cluster-facing listener is configured but no token is present, the proxy SHALL NOT open that
listener, and SHALL log the omission. Opening an unauthenticated GPU control endpoint is a worse
outcome than the cockpit staying unreachable.

#### Scenario: A request without a token is refused on the cluster-facing listener

- **GIVEN** the cluster-facing listener is open
- **WHEN** a request reaches `/admin/loadouts` on it without an `Authorization` header
- **THEN** it is answered with HTTP 401 and no loadout state is read or changed

#### Scenario: Local callers keep working without a token

- **GIVEN** the cluster-facing listener is open
- **WHEN** a local script calls `/admin/state` on `127.0.0.1:18235` with no `Authorization` header
- **THEN** it is answered normally

#### Scenario: A missing token closes the cluster-facing listener

- **GIVEN** a bridge address was discovered but `LLM_PROXY_ADMIN_TOKEN` is unset
- **WHEN** the proxy starts
- **THEN** only the loopback listener is opened and the missing token is logged

### Requirement: The proxy serves no admin UI of its own

Zwei Oberflächen auf denselben Zustand erzeugen Schreibkonflikte — `FactoryWriteConflictError` in
`components/website/src/pages/sdlc/api/llm-proxy/factory.ts` ist der bereits eingetretene Fall.
Solange der Proxy eine eigene Seite ausliefert, ist unklar, welche der beiden Oberflächen gilt.

`GET /admin` SHALL NOT return an administration page. It SHALL instead return a short response
naming the cockpit as the administration surface. The HTML asset backing the former page SHALL be
removed from the repository rather than left unreferenced.

#### Scenario: The former admin page points at the cockpit

- **GIVEN** the proxy is running
- **WHEN** `GET /admin` is requested
- **THEN** the response names the cockpit as the place to administer the proxy and contains no controls

### Requirement: Proxy state reports its own identity

`/admin/state` liefert `lastProbe`, `lock` und `backends`, aber weder Port noch Laufzeit noch
Version. Das Cockpit zeigt deshalb auch bei laufendem Proxy `Port — · Uptime — · v—` an — eine
Anzeige, die aussieht wie ein Defekt und keiner ist.

`GET /admin/state` SHALL include the port it is served on, the process uptime in seconds, and the
proxy version.

#### Scenario: The state payload carries port, uptime and version

- **GIVEN** the proxy has been running for some time
- **WHEN** `GET /admin/state` is requested
- **THEN** the response contains a numeric port, a numeric uptime in seconds, and a version string

## MODIFIED Requirements

### Requirement: Backend registry and admin API

Die bestehende Fassung nennt die Cockpit-Routen unter `/api/admin/llm-proxy/*`. Tatsächlich liegen
sie seit der Cockpit-Isolierung unter `/sdlc/api/llm-proxy/*`, wie `sdlc-cockpit.md` an anderer
Stelle bereits richtig festhält. Die Abweichung wird korrigiert, damit die Spec nicht auf Routen
verweist, die es nicht gibt. Zusätzlich unterscheidet der Statusendpunkt jetzt zwischen einem
Proxy, der nicht antwortet, und einem, der nicht adressierbar ist.

Backends SHALL be stored in `tickets.llm_proxy_backends` (name, kind, base_url, api_key_env,
enabled, priority, fixups, model_aliases); API keys SHALL be resolved from environment variables
only. The website SHALL expose admin CRUD endpoints under `/sdlc/api/llm-proxy/*` following the
established guard/validation pattern, and a status endpoint that degrades to the database-backed
backend list when the proxy cannot be reached, stating which unreachable condition applies.

#### Scenario: Status endpoint tolerates an unreachable proxy

- **GIVEN** the proxy does not answer at its configured address
- **WHEN** an admin requests `GET /sdlc/api/llm-proxy/status`
- **THEN** the endpoint responds 200 with the backend list from the database and a stated unreachable condition
