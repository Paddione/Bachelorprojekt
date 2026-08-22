## ADDED Requirements

### Requirement: The cockpit is the only administration surface for the llm-proxy

Die Proxy-Administration lag auf zwei Oberflächen: der vom Proxy selbst ausgelieferten
`/admin`-Seite und dem Cockpit-Panel, das rund zwei Drittel derselben Funktionen abdeckte. Wer
etwas ändern wollte, musste wissen, welche der beiden die vollständige ist.

The cockpit SHALL expose every administrative capability of the llm-proxy, so that no task requires
the proxy's own page. Concretely, `/sdlc/api/llm-proxy/` SHALL cover the loadout surface that is
currently absent: reading and writing the loadout document, reading loadout status, the loadout
pin, the model catalogue, and starting and stopping an individual loadout. Each route SHALL carry
the same session and admin guard the neighbouring proxy routes already use.

#### Scenario: An admin manages loadouts from the cockpit

- **GIVEN** an admin opens the llm-proxy panel while the proxy is reachable
- **WHEN** they start a configured loadout
- **THEN** the loadout is started through the proxy and the panel reflects the new state without a page reload

#### Scenario: Loadout routes reject a non-admin session

- **GIVEN** a session without admin rights
- **WHEN** it requests any of the loadout routes
- **THEN** the request is refused before the proxy is contacted

### Requirement: The cockpit reaches the proxy through a named service

Eine Host-IP im Deployment ist ein Literal an genau der Stelle, an der der Bestand solche Literale
verbietet, und sie ist bei einem k3d-Neuaufbau falsch, ohne dass etwas darauf hinweist.

The cockpit SHALL address the proxy through a cluster service name rather than a host address. The
host address SHALL exist in exactly one manifest — the service's endpoints — and SHALL NOT appear
in the deployment, in application code, or in any UI surface.

#### Scenario: The deployment carries no host address

- **GIVEN** the sdlc-console deployment
- **WHEN** its environment is read
- **THEN** `LLM_PROXY_URL` names a cluster service and contains no IP address

### Requirement: Unreachable is stated as unreachable, not as offline

Der Grundsatz, einen nicht antwortenden Proxy zu benennen statt ihn zu verschleiern, ist im KI-Deck
bereits verankert. Er kennt aber nur einen Fall: der Proxy antwortet nicht, also läuft er nicht.
Der zweite Fall — der Proxy läuft, aber es führt kein Netzwerkpfad zu ihm — wurde in denselben
Zweig geleitet und dort mit der Handlungsanweisung `task llm:proxy:start` versehen. Diese Anweisung
ändert am Zustand garantiert nichts, weil nichts gestartet werden muss. Eine falsche Anweisung ist
schlechter als gar keine: sie lenkt die Fehlersuche von der Ursache weg.

A cockpit surface that cannot obtain proxy state SHALL distinguish a proxy that does not answer
from a proxy that cannot be addressed, and SHALL name which of the two occurred. It SHALL offer a
remedy only where one applies; where the cause is a missing network path, it SHALL NOT suggest
starting a process. It SHALL offer no write action in either case.

#### Scenario: A stopped proxy is named as stopped

- **GIVEN** the configured address accepts a connection but no proxy answers on it
- **WHEN** an admin opens the panel
- **THEN** the panel states that the proxy is not running and offers starting it as the remedy

#### Scenario: A missing path is named as a missing path

- **GIVEN** the proxy is running but the configured address does not resolve or refuses the connection
- **WHEN** an admin opens the panel
- **THEN** the panel states that the proxy cannot be reached from the cockpit, names the address it tried, and does not suggest starting the proxy

#### Scenario: Neither case offers a write action

- **GIVEN** the panel is in either unreachable state
- **WHEN** an admin views it
- **THEN** no control that would write to the proxy is offered
