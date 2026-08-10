# Fix: 502 bei coaching/generate — agent.generate() wirft Fehler

## Purpose

Der `coaching/generate`-Endpoint gibt einen 502 zurück mit "KI-Anfrage fehlgeschlagen" wenn `agent.generate()` wirft. Die Fehlermeldung ist zu vage — es fehlt die Info WARUM die Anfrage fehlgeschlagen ist (API-Key fehlt? Netzwerkfehler? Modell-Timeout?).

## Scope

- Detailliertere Fehlermeldung im 502-Response (ohne Secrets zu loggen)
- Besseres Error-Logging für Debugging
- Kein funktioneller Bug — die Fehlerbehandlung existiert, sie ist nur zu vage
