---
ticket_id: T000720
plan_ref: docs/superpowers/plans/2026-06-14-token-budget-tracking.md
status: active
date: 2026-06-14
---

# Spec: Token-Budget-Tracking per Factory-Run

## Kontext & Ist-Zustand

Die Software Factory (`scripts/factory/`) startet pro Ticket eine Pipeline aus bis zu
sechs Phasen (Scout → Design → Plan → Implement → Verify → Deploy), die je nach
Routing über die **Claude API** (Anthropic), die **DeepSeek API** oder den
**GPU-Worker (Ollama)** laufen. Heute gibt es **keinerlei Kostentransparenz**:

- Es ist nicht sichtbar, was ein Factory-Run an Tokens / USD gekostet hat.
- Es gibt **kein Budget-Limit** — die Factory kann unbegrenzt Runs starten, auch
  wenn ein Tageskontingent längst überschritten ist.
- Der Admin-Bereich (`dev-status.astro` / `FactoryFloor.svelte`) zeigt Phasen-Status
  und Slots, aber keine Kosten.

Die Factory schreibt bereits Phasen-Events nach `tickets.factory_phase_events` und
nutzt `tickets.factory_control` als Key/Value-Store (Killswitch, Daily-Cap).
Provider/Modell-Zuordnung liegt in `tickets.provider_config`. Diese Bausteine
existieren, werden aber nicht für Kosten genutzt.

## Was dieses Feature ändert

Ein **Token-Budget-Tracking** pro Factory-Run mit:

1. **Vorab-Schätzung** der Kosten je Ticket auf Basis von Effort + Modell-Wahl,
   gespeichert in einer neuen Tabelle `tickets.factory_run_budget`.
2. **Hard-Stop-Budget-Guard**: VOR jedem Pipeline-Launch prüft die Factory das
   Tages-Budget; bei Überschreitung wird das Ticket blockiert (kein Launch).
3. **Admin-Sichtbarkeit**: ein Budget-Panel auf der Dev-Status-Seite plus eine
   eigene Admin-Seite zum Konfigurieren des Limits und Einsehen der Kosten.

Genauigkeit-Ziel: **±20 %** — ausreichend für Budget-Planung, nicht für Abrechnung.

## Kern-Nutzerflow

1. Dispatcher claimt ein Ticket in einen Pipeline-Slot.
2. **Budget-Guard** prüft: `SUM(cost_usd_act) heute` vs. `budget-limit-daily-usd`.
   - Überschritten → Ticket auf `blocked`, Phasen-Event `blocked`, Operator-Notify,
     **kein** Pipeline-Launch.
   - OK → **Budget-Estimate** schreibt geschätzte Tokens/USD je Phase in
     `factory_run_budget`, danach startet die Pipeline.
3. Während/nach den Phasen werden Ist-Werte (`*_act`) ergänzt (best-effort, ±20 %).
4. Im Admin-Bereich sieht der Operator: heutiges Budget used/limit, Aufschlüsselung
   pro Provider, die letzten Runs und kann das Tages-Limit anpassen.

## Akzeptanzkriterien

- [ ] Tabelle `tickets.factory_run_budget` existiert mit Estimate- und Actual-Spalten
      sowie zwei Indizes; Migration ist idempotent.
- [ ] `scripts/factory/budget-estimate.sh <ticket_id> <brand>` liefert valides JSON
      `{estimate_usd, tokens_est, provider, model_id}` und schreibt Estimate-Rows.
- [ ] `scripts/factory/budget-guard.sh <brand>` gibt Exit 0 bei Budget OK, Exit 1 bei
      Überschreitung.
- [ ] Der Dispatcher ruft den Guard VOR `parallel()` auf; bei Exit 1 wird das Ticket
      auf `blocked` gesetzt und übersprungen (kein Launch).
- [ ] GPU-Worker-Runs werden mit `cost_usd=0`, aber realem Token-Äquivalent getrackt.
- [ ] Das Budget-Panel zeigt für heute used/limit + Provider-Aufschlüsselung + letzte
      5 Runs; eingebunden über `dev-status.astro` (NICHT `FactoryFloor.svelte`).
- [ ] Die Admin-Seite `admin/factory-budget.astro` erlaubt das Setzen des Tages-Limits
      (via `writeControl`) und zeigt Tages-Übersicht + per-Ticket-Kosten.
- [ ] Der API-Endpoint `api/factory-budget.ts` liefert GET (Summary) und POST
      (Limit setzen, Admin-geschützt).
- [ ] `task test:all`, `task freshness:regenerate`, `task freshness:check` grün.

## Nicht-Scope

- Kein Realtime-/Live-Update der Kosten (Reload genügt).
- Kein Grafana-/Prometheus-Export.
- Keine exakte abrechnungsgenaue Token-Zählung (±20 % reicht).
- Keine Provider-übergreifende Preis-Auto-Aktualisierung (Preise hartkodiert im Script).
- Keine Änderung an `pipeline.js` (SANCTIONED EXCEPTION) oder `FactoryFloor.svelte`.

## Edge Cases

- **Kein `budget-limit-daily-usd` gesetzt** → Guard behandelt es als „unbegrenzt"
  (Exit 0), Panel zeigt „kein Limit".
- **Ticket ohne Effort** → Estimate nutzt einen Default-Effort (Medium).
- **provider_config-Eintrag fehlt** → Estimate fällt auf Anthropic-Default-Preise
  zurück und markiert den Run als unsicher (kein Crash).
- **GPU-Worker** → `cost_usd_est/act = 0`, Token-Äquivalent dennoch gespeichert.
- **Mehrere Runs am selben Tag (Retry)** → jede Phase erzeugt eigene Row; Tages-Summe
  aggregiert über `run_date`.

## Fehlerfall-Behandlung

- Guard schlägt fehl (DB nicht erreichbar) → **fail-closed**: Exit 1, Ticket NICHT
  launchen (kein unkontrollierter Spend); Phasen-Event `blocked` mit Detail.
- Estimate-Script-Fehler → Pipeline startet trotzdem (Estimate ist optional/best-effort),
  aber der Fehler wird geloggt; Tracking bleibt lückenhaft, blockiert aber nicht.
- API-POST ohne Admin-Session → 403.

## Erfolgsmetrik

Factory-Runs zeigen ihre Kosten sichtbar im Admin-Bereich, und Budget-Alarme
(Hard-Stop) feuern korrekt, sobald das Tages-Limit überschritten ist.

## Technische Constraints

- `pipeline.js` und `website-db.ts` sind SANCTIONED EXCEPTIONS — nicht anfassen.
- `FactoryFloor.svelte` (486/500) und `factory-floor.ts` (540/600) sind nahezu am
  Limit → neue Logik in **neue Dateien** auslagern; an `factory-floor.ts` maximal
  ein Re-Export (1–2 Zeilen).
- Keine Brand-Hostnamen im Code hardcoden (S3).
- Neue `.sh`-Scripts müssen über den Taskfile erreichbar sein (S4).
- Alle neuen Dateien unter ihrem Zeilen-Limit (.sh/.ts < 500/600, .svelte < 500,
  .astro < 400).

## Betroffene Dateien

| Datei | Typ | Art | Ist | Limit |
|-------|-----|-----|-----|-------|
| `scripts/migrations/2026-06-14-factory-run-budget.sql` | sql | neu | — | — |
| `scripts/factory/budget-estimate.sh` | sh | neu | ~60 | 500 |
| `scripts/factory/budget-guard.sh` | sh | neu | ~80 | 500 |
| `scripts/factory/dispatcher.js` | js | geändert (+~82) | 198 | 600 |
| `website/src/lib/factory-budget.ts` | ts | neu | ~200 | 600 |
| `website/src/lib/factory-floor.ts` | ts | geändert (+1–2) | 540 | 600 |
| `website/src/components/factory/BudgetPanel.svelte` | svelte | neu | ~120 | 500 |
| `website/src/pages/dev-status.astro` | astro | geändert | 30 | 400 |
| `website/src/pages/admin/factory-budget.astro` | astro | neu | ~120 | 400 |
| `website/src/pages/api/factory-budget.ts` | ts | neu | ~100 | 600 |
