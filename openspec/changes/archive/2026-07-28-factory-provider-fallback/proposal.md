# Proposal: factory-provider-fallback

## Why

Die Software Factory hatte nominell eine dreistufige Provider-Kaskade, praktisch aber keine. Fünf
voneinander unabhängige Ursachen griffen ineinander, und jede einzelne war für sich lautlos:

1. **Der Phase-Pin war ein Shortcut, keine Präferenz.** `scripts/factory/route-provider.sh` gab beim
   ersten Treffer in `tickets.factory_model_slots` sofort zurück. Für die Phasen `plan`, `implement`
   und `verify` — also den Normalbetrieb — war damit alles darunter toter Code: Priority-Kette,
   `provider_health`, Cooldown und der Slot-Claim wurden nie erreicht.
2. **Die Tiers hatten nichts zum Fallen.** `cheap`, `flash` und `sonnet` trugen je genau eine
   `enabled`-Zeile. Selbst eine intakte Kette hätte keinen zweiten Kandidaten gefunden.
3. **Der TTL-Reaper machte sich nach dem ersten Lauf selbst unerreichbar.** Er dekrementierte
   `active_agents` um genau eins und setzte gleichzeitig `claimed_at = NULL`; die Bedingung
   `claimed_at IS NOT NULL` traf danach nie wieder zu. `llamacpp` stand dadurch seit dem 2026-07-27
   03:30 UTC dauerhaft auf `active_agents = 3 = max_concurrent` und wurde von der Kandidatenkette
   still übersprungen.
4. **Der Reaper hatte überhaupt keinen Aufrufer** — kein systemd-Timer, kein Cron, kein
   Taskfile-Eintrag. Das Netz unter dem Slot-Leak war geschrieben, aber nie aufgehängt.
5. **Der Emergency-Zweig nannte ein Modell ohne Backend.** `qwythos-9b-v2` wird von LM Studio seit
   dem Gemma-Cutover nicht mehr serviert. Dass das nirgends auffiel, liegt an `resolveModel()` im
   llm-proxy: es biegt unbekannte Modelle still auf das erste gesunde Backend um. Dieselbe
   Nachsicht hielt auch `ANTHROPIC_MODEL=ternary-bonsai-27b` in `autopilot.env` monatelang am Leben.

Dazu kommt ein Fehlgriff bei der Key-Auflösung: `auto-triage.sh` ordnete Keys über eine
Fallunterscheidung auf den **Provider-Namen** zu und las für `deepseek` den Coaching-Key
`DEEPSEEK_API_KEY` statt des Factory-Keys `DEEPSEEK_API_KEY_PK` (Account `pk-deepseek`, getrennte
Abrechnung). Ein Provider-Name kann zwei Accounts desselben Anbieters nicht unterscheiden.

## What

- **Genau ein Auswahlpfad im Router.** Der Phase-Pin aus `factory_model_slots` wird zu Kandidat #0
  derselben Claim-Schleife, die auch `provider_config` durchläuft. Kein unbedingtes `exit` mehr im
  Phase-Block. Der Emergency-Zweig zeigt auf ein real serviertes Modell und meldet sich auf stderr,
  statt lautlos zurückzugeben.
- **Provider→Key als Daten, nicht als Code.** Neue Spalte `api_key_env` in `provider_config` und
  `factory_model_slots` trägt den **Namen** der Env-Variable; der Router gibt ihn als `apiKeyEnv`
  aus, `auto-triage.sh` und `scout-llm-fallback.sh` lösen ihn per Indirektion auf.
- **Dreistufige Kaskade in den real angefragten Tiers.** `cheap`, `flash` und `sonnet` bekommen
  LM Studio direkt als Stufe 2 (deckt einen Proxy-Ausfall bei laufendem Backend ab) und DeepSeek als
  Stufe 3 (fängt den Totalausfall des GPU-Hosts).
- **Reaper repariert und aufgehängt.** Nullsetzung statt Dekrement — eine Zeile, deren jüngster
  Claim älter als die TTL ist, hält ausschließlich verwaiste Slots. Aufruf pro Factory-Tick in
  `wakeup.sh`, bewusst dort statt in einem eigenen Timer: der Reaper soll nur laufen, wenn die
  Factory läuft.
- **Regressionssperre gegen den nächsten stillen Cutover.** `scripts/llm/routing-check.sh`
  (`task llm:routing:check`) prüft jede konfigurierte Modell-ID gegen die `/v1/models`-Kataloge der
  erreichbaren lokalen Backends — sowohl aus der DB als auch aus `autopilot.env`.

## Non-Goals

- **Der `opus`-Zweig bleibt unverändert.** Er hat bewusst keinen Slot-Claim, weil der Aufrufer
  keinen Release-Pfad hat; ginge er durch die normale Kette, wäre der Provider nach
  `max_concurrent` Aufrufen dauerhaft blockiert.
- **Kein API-Key wandert in die Datenbank.** `api_key_env` trägt ausschließlich einen
  Variablennamen; die Werte bleiben git-crypt-verschlüsselt.
- **Tier `haiku` sowie die `coaching`/`ticket-triage`/`assistant-chat`-Zeilen bleiben unangetastet.**
- **Cloud-Provider werden vom routing-check nicht geprüft** — ihre Modell-Kataloge sind nicht ohne
  API-Key abfragbar, und ein Key gehört nicht in einen Health-Check.

_Ticket: T002359_
