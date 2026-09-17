# Delta Spec: sdlc-isolation (wsl-exit-sdlc-console-fleet)

## MODIFIED Requirements

### Requirement: Die SDLC-Oberfläche hat eine Laufzeit-Heimat

Das SDLC-Console-Image MUSS im Fleet betrieben werden (ns workspace-dev);
der Host-Bridge-Endpoints-Hack ist entfernt. Der LLM-Zugang läuft über die
wg/NAT-Route zum Windows-Desktop (:1919) und ist als Best-Effort behandelt.

#### Scenario: Console ohne laufende Workstation

- **GIVEN** der Windows-Desktop (FreeToken :1919) ist aus
- **WHEN** die sdlc-console startet und LLM-Requests verarbeitet
- **THEN** bleibt der Pod Running, LLM-Endpunkte antworten mit explizitem
  degradiert-Fehler statt Crashloop; Eskalation über Cloud-APIs bleibt aktiv

#### Scenario: Alter Hack ist weg

- **GIVEN** das Fleet reconciled den Dev-Stack neu
- **WHEN** nach dem Umzug nach `llm-proxy-host`-Manifesten gesucht wird
- **THEN** existiert kein Service/Endpoints-Paar mehr, das eine manuell
  gepflegte Host-Bridge-IP bindet
