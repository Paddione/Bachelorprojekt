# Proposal: llm-routing-freetoken-finish

## Why

T900208 (#5689) hat den Code auf die T900208-Welt umgestellt (direkt auf
FreeToken `:1919`, Proxy `:18235` tot), aber zwei Stellen blieben in der alten
Welt zurueck — und eine dritte ist ein unbeschriftetes Residuum:

1. **`scripts/llm/routing-check.sh` probt den toten Proxy.** Die Probe-Liste
   (`:18235` + `:1234`, T900164-Kommentar) kennt `:1919` nicht. Der Check ist
   heute nur deshalb gruen, weil der „stillgelegte" `llm-proxy.service`
   real noch laeuft und auf `:18235` Qwen3.6 serviert (gemessen 2026-09-17:
   Service aktiv seit 03:15 CEST, `/health` degraded). Sobald der Service
   faellt (Teil dieser Change, P2), meldet der Check `Qwen3.6-35B-A3B-NVFP4`
   als FEHLT und wird hart rot — der Guard wuerde die Vollendung blockieren,
   die er absichern soll. Zudem prueft keine Quelle, ob das in
   `.opencode/opencode.jsonc` versprochene Default-Modell
   (`llamacpp-local/Qwen3.6-35B-A3B-NVFP4`) ueberhaupt serviert wird: ein
   T900189-Klasse-Drift (Versprechen vs. Backend) waere wieder still.
2. **Der Proxy-Service laeuft trotz Stilllegung.** `llm-proxy.service`
   (User-Unit, Symlink auf `scripts/llm-proxy/llm-proxy.service`) ist enabled
   und aktiv. Die Unit-Datei selbst dokumentiert den toten Zustand und
   verweist den Rueckbau in einen eigenen infra-Change — abgeschaltet wird
   hier nur: stoppen + disablen, Datei bleibt (reversibel).
3. **`factory.model` in `scripts/llm/loadouts.json` ist Residuum ohne
   Leser.** Der einzige Leser war der Proxy-Pin (`GET /admin/factory`,
   mit T900208 entfernt: „Model choice is FACTORY_MODEL_ID plus the
   provider_config chain"). Der Wert (`qwen38-220k`) MUSS trotzdem ein
   gueltiger Loadout-Slug bleiben, solange `loadouts.mjs:298` das validiert
   (`factory-pin.test.mjs` laeuft in der node-Suite) — eine „intuitive"
   Korrektur auf `freetoken-local` wuerde CI rot faerben (kein solcher
   Loadout; T900164-Guard verbietet ihn explizit). Das wird hier als
   Requirement festgeschrieben, damit die naechste F-Analyse nicht denselben
   Fehlschluss zieht (Option B, approved).

## What

1. **P1 — routing-check auf die T900208-Welt:** Probe-Liste `:18235` →
   `:1919` (`:1234` bleibt: Embeddings); dritte Expected-ID-Quelle: das
   Top-Level-`model` aus `.opencode/opencode.jsonc` (nicht-Cloud). Flip der
   T900164-Tests in `factory-default-not-freetoken.bats`, die heute `:1919`
   im routing-check verbieten. Fail-soft ohne Backend bleibt.
2. **P2 — Service stilllegen (nach P1 gruen):** neues guarded Script
   `scripts/llm-proxy/retire-service.sh --confirm` (verweigert ohne Flag und
   unter `CI=true`; idempotent; nur `systemctl --user stop/disable`), plus
   BATS-Guard mit gestubbtem systemctl. Echte Ausfuehrung auf diesem Host in
   dev-flow-execute.
3. **P3 — SSOT-Deltas:** `routing-check-freetoken-t014552` (Probes + Promise-
   Quelle), `software-factory` (`factory.model` ist vestigial + Slug-Pflicht).
   Precondition: Change `local-llm-freetoken-direct` (T900208, merged aber noch
   nicht archiviert) ist archiviert, sonst Rebase der Deltas.
4. **P4 — Verify:** BATS + node-Suite + `routing-check.sh` live gegen `:1919`
   + Standard-Gates.

## Non-Goals

- Vollstaendiger Proxy-Rueckbau (Unit-Datei, `scripts/llm-proxy/*.mjs`,
  Website `/admin/factory`-Pfad): eigener infra-Change laut Unit-Notiz.
- Alt-Requirements in `software-factory.md`, die noch `:18235` als Gateway
  vorschreiben (ca. 10 Stellen, z. B. L1497/2441/3538): von T900208s Delta
  nicht angefasst, bleiben bewusst draussen — Folgeticket.
- `loadouts.json`-Umbau (kein freetoken-Eintrag, kein Key-Delete): siehe
  Punkt 3 oben.

_Ticket: T900213_
