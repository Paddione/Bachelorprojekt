## ADDED Requirements

### Requirement: Loadout-Ports und lokale Port-Forwards sind disjunkt

Kein in `scripts/llm/loadouts.json` deklarierter Port SHALL zugleich die lokale Seite eines
`port-forward` aus `scripts/bge-mcp/*.service` sein. Loadouts untereinander duerfen Ports
teilen, solange sie dieselbe `exclusiveGroup` tragen — ein Loadout und ein Port-Forward
koennen dagegen nie koexistieren, weil der Forward permanent laeuft.

Die Pruefung SHALL ausschliesslich Repo-Artefakte lesen und niemals die Laufzeitbelegung,
damit sie in CI den Zustand des Codes misst statt der Ausstattung des Runners. Sie SHALL
zuerst belegen, dass beide Extraktionen nicht leer sind, damit eine ins Leere laufende
Extraktion laut scheitert statt vakuos zu bestehen.

Das Loadout `brain-ingest`, der Default in `scripts/brain-ingest.sh` und die base_url des
Backends `llamacpp-bonsai` SHALL denselben Port nennen.

#### Scenario: Ein Loadout beansprucht einen Forward-Port

- **GIVEN** ein Loadout in `loadouts.json` nennt Port 8093
- **AND** `bge-forward-rerank.service` legt einen `port-forward` auf dieselbe lokale Portnummer
- **WHEN** die Testsuite laeuft
- **THEN** schlaegt die Pruefung fehl und nennt den betroffenen Port samt Loadout-Slug

#### Scenario: brain-ingest nennt ueberall denselben Port

- **GIVEN** `loadouts.json`, `brain-ingest.sh` und die Backend-Migration nennen alle Port 8100
- **WHEN** die Testsuite laeuft
- **THEN** besteht die Pruefung

#### Scenario: Eine Deklaration laeuft weg

- **GIVEN** der Loadout-Port wird geaendert, der Default in `brain-ingest.sh` aber nicht
- **WHEN** die Testsuite laeuft
- **THEN** schlaegt die Pruefung fehl
