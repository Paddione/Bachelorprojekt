# Proposal: freetoken-runtime-guard

## Why

Die Desktop-App kann einen gesunden FreeToken-Server auf Port 1919 betreiben,
ohne dass der separate Daemon diesen Prozess adoptiert. Der Daemon meldet dann
`running=false` und `model=null`; der bestehende OpenCode-Plugin bleibt dadurch
auf seinem statischen Alias-Fallback. Gleichzeitig lief der Desktop-Start mit
drei parallelen Requests entgegen dem kalibrierten Single-Request-Vertrag.

## What

- Resident-Modell und KV-Kapazität ersatzweise direkt am Serving-Endpunkt
  ermitteln, wenn der Daemon kein laufendes Modell kennt.
- Den Smoke-Test um Engine-Version, konsistente Modell-IDs, nutzbare
  KV-Kapazität und den Windows-Prozessparameter für genau einen Request ergänzen.
- Den lokalen Qwen-200k-Prozess mit dem kalibrierten Single-Request-Profil neu
  starten und die Betriebsdokumentation aktualisieren.

_Ticket: T900051_
