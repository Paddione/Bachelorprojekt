# Proposal: factory-mcp-ask-key-slots

## Why

`factory_ask` (factory-mcp, `scripts/factory/mcp-go/main.go`) schlägt zuverlässig fehl, sobald
llamacpp (lokaler Provider, Priorität 0) belegt ist. Zwei unabhängige Ursachen wurden bereits im
ersten Diagnose-Lauf (siehe Ticket-Verlauf T002663) verifiziert:

1. **Falscher Key beim Fallback:** `toolFactoryAsk()` authentifiziert IMMER mit
   `llmKey() = envOr("FACTORY_LLM_API_KEY", "lmstudio")` — einem hartcodierten Literal. Der von
   `route-provider.sh` im JSON-Feld `apiKeyEnv` gelieferte Name der tatsächlich zuständigen
   Umgebungsvariable (z. B. `DEEPSEEK_API_KEY_PK`) wird von `resolveLLM()` verworfen, weil die
   Funktion nur `provider`/`modelId`/`baseUrl` aus der Antwort liest. Fällt der Router auf einen
   externen Anbieter (deepseek) zurück, geht dorthin das Literal `"lmstudio"` als Bearer-Token —
   erklärt die beobachtete Fehlermeldung `Authentication Fails, Your api key ****udio is invalid`
   exakt.
2. **Slot-Leak:** `toolFactoryAsk()` ruft nach dem LLM-Request nirgends
   `scripts/factory/release-slot.sh` auf — weder bei Erfolg noch bei Fehlschlag. Jeder Aufruf
   claimt einen Slot über `route-provider.sh`, aber keiner gibt ihn frei. Sobald llamacpp
   (`max_concurrent=3`) durch drei nie freigegebene Claims belegt ist, überspringt
   `route-provider.sh` den technisch erreichbaren lokalen Provider (127.0.0.1:18235) und fällt auf
   den nächsten Kandidaten in der `provider_config`-Prioritätskette zurück — dorthin geht dann der
   kaputte Key aus Punkt 1.

`scripts/factory/reap-provider-slots.sh` ist bewusst NICHT Teil dieses Fixes: `wakeup.sh` ruft es
bei jedem Tick auf, die TTL von 30 Minuten ist absichtlich konservativ gewählt (eine kürzere TTL
gäbe Slots noch laufender Anfragen frei). Der Reaper ist das Netz und funktioniert korrekt — er
räumt nur mit bis zu 30 Minuten Verzögerung auf. Die eigentliche Quelle des Leaks bleibt der
fehlende `release-slot.sh`-Aufruf in `main.go`.

## What

- `resolveLLM()` in `scripts/factory/mcp-go/main.go` liest zusätzlich `slotId`, `apiKeyEnv` und
  `ctx` aus der `route-provider.sh`-Antwort (statt nur `provider`/`modelId`/`baseUrl`) und gibt sie
  an den Aufrufer zurück.
- `toolFactoryAsk()` authentifiziert mit dem Wert der durch `apiKeyEnv` benannten Umgebungsvariable
  (`os.Getenv(apiKeyEnv)`), NICHT mehr mit dem hartcodierten Literal `"lmstudio"`. Ist `apiKeyEnv`
  leer/null (lokaler Provider ohne Auth) oder die benannte Variable ungesetzt, bleibt der bisherige
  `envOr("FACTORY_LLM_API_KEY", "lmstudio")`-Fallback als letzte Stufe erhalten — damit lokale
  Backends ohne Auth weiterhin funktionieren und ein fehlkonfiguriertes `apiKeyEnv` klar statt
  stillschweigend fehlschlägt.
- `toolFactoryAsk()` ruft nach dem LLM-Request — Erfolg wie Fehlschlag, über `defer` — 
  `scripts/factory/release-slot.sh <slotId> <success> <ctx>` auf, damit der Slot sofort statt erst
  nach bis zu 30 Minuten TTL freigegeben wird. Bei `slotId == null` (opus/emergency-Pfad) entfällt
  der Aufruf wie in `release-slot.sh` bereits vorgesehen (`[[ "$PROV" == "null" ]] && exit 0`).
- Test: `scripts/factory/mcp-go/main_test.go` (neu) — `httptest.Server` prüft den empfangenen
  `Authorization`-Header gegen das erwartete `apiKeyEnv`-Secret UND belegt (per Fake/Stub des
  `release-slot.sh`-Aufrufs oder Prozess-Mock), dass die Freigabe nach dem Request erfolgt.
  Positiv-Anker: ein Testfall mit korrektem `apiKeyEnv` MUSS grün sein, bevor der Negativfall
  (Literal `"lmstudio"` darf NICHT im Header stehen) geprüft wird (T002356-M1).

_Ticket: T002663_
