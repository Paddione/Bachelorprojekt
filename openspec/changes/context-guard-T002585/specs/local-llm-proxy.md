## ADDED Requirements

### Requirement: Kontextzahl-Guard prueft einen Toleranzkorridor statt Punktgleichheit

Der Guard-Test `tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats` SHALL die deklarierte
Kontextzahl eines `--fit`-Loadouts (z.B. `gemma26-factory.limit.context` in
`.opencode/agent-models.jsonc`) gegen den LAUFENDEN Server pruefen, indem er einen Toleranzkorridor
um den Live-Wert anlegt: `declared` muss innerhalb `[live * 0.8, live * 1.2]` liegen. Der Test SHALL
NICHT auf Punktgleichheit pruefen, weil `--fit` den `n_ctx` zur Ladezeit aus dem zum Startzeitpunkt
FREIEN VRAM bestimmt und dieser Betrag zwischen zwei Starts desselben Loadouts schwankt (gemessen
88832–99840). Die statische Deklaration SHALL bestehen bleiben, weil opencode sie zur Laufzeit fuer
Auto-Compact (fasst bei 95 % der Grenze zusammen) benoetigt.

#### Scenario: Deklaration liegt im Korridor um den Live-Wert

- **GIVEN** ein `gemma26-factory`-Server laeuft auf `:8091` und meldet per `/props` einen Live-`n_ctx`
- **WHEN** der Guard-Test die deklarierte Kontextzahl (97840) mit dem Live-Wert vergleicht
- **THEN** der Test besteht, solange `declared` innerhalb `[live * 0.8, live * 1.2]` liegt — fuer alle
  gemessenen Live-Werte (88832, 99328, 99840)

#### Scenario: n_ctx_train-Regression faellt weiterhin durch

- **GIVEN** die deklarierte Kontextzahl faellt auf den Modell-Default `n_ctx_train` (262144) zurueck
- **WHEN** der Guard-Test diesen Wert gegen den Live-Wert (~88832) prueft
- **THEN** der Test schlaegt fehl, weil 262144 ausserhalb des ±20 %-Korridors liegt
