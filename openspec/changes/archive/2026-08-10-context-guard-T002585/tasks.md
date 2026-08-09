---
title: "context-guard-T002585 — Implementation Plan"
ticket_id: T002585
domains: [test, llm]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# context-guard-T002585 — Implementation Plan

_Ticket: T002585_

## File Structure

```
CHANGED:
  tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats  — @test 3: Gleichheit → Toleranzkorridor um den Live-Wert
```

## Kontext: was bereits belegt ist

Diese Punkte sind gemessen, nicht angenommen — der Implementer muss sie nicht erneut erheben:

- **Der Fehlschlag ist reproduziert und die Ursache verifiziert** (Ticket-Beschreibung, 2026-08-02):
  `@test 'T002558: die deklarierte Kontextzahl stimmt mit dem laufenden Server ueberein'`
  vergleicht eine STATISCH in `agent-models.jsonc` gepflegte Zahl (`gemma26-factory.limit.context = 97840`)
  mit dem zur Ladezeit von llama.cpp per `--fit` dynamisch bestimmten `n_ctx` (`/props
  .default_generation_settings.n_ctx`, z.B. 88832). `--fit` waehlt `n_ctx` aus dem zum Startzeitpunkt
  FREIEN VRAM; die RTX 5070 Ti teilt sich den Speicher mit dem Windows-Desktop, der freie Betrag
  schwankt zwischen zwei Starts desselben Loadouts. Gemessen: **88832 bei 13792 MiB frei, 99328 bei
  mehr, 99840 bei einem Slot**. Exakte Gleichheit ist damit strukturell nicht stabil gruen.
- **Abgrenzung gegen T002579 ist nachgewiesen** (Ticket-Beschreibung): per `git stash -u` auf den
  Stand ohne jene Aenderungen faellt der Test ebenso durch. Der Fehlschlag ist NICHT durch T002579
  entstanden; er fiel nur nicht auf, weil er skippt, solange kein Server auf `:8091` laeuft.
- **`limit.context` ist NICHT nur ein Testziel — opencode konsumiert ihn zur Laufzeit.** opencode
  nutzt die Modell-Kontextgrenze fuer Auto-Compact (fasst bei 95 % der Grenze zusammen) und fuer das
  Kontext-Management. Wird der Wert entfernt, faellt opencode auf den Modell-Default zurueck
  (`n_ctx_train` = 262144 fuer dieses Modell) — Auto-Compact wuerde viel zu spaet feuern und opencode
  koennte Prompts senden, die den realen Server-Kontext (~88832) ueberschreiten und abgeschnitten
  werden. **Die Deklaration muss also bleiben**; nur der Test darf nicht mehr auf Punktgleichheit
  pruefen.
- **Der bestehende Test `tests/spec/llm-local-dev.bats:132` prueft bereits die richtige Eigenschaft**
  (plausibel, nicht `n_ctx_train`, 50000 < ctx < 200000) und ist stabil. Er muss NICHT geaendert
  werden. Nur der Punktgleichheits-Test in `opencode-routes-via-proxy.bats` ist der Defekt.

## Loesungsrichtung (gewaehlt: Hybrid aus a + b)

Der Melder praeferiert (b) "Deklaration entfernen, Wert zur Laufzeit aus /props beziehen". Das ist
als wörtliche Anweisung **unsicher**, weil opencode die statische Zahl fuer Auto-Compact braucht
(siehe Kontext). Die Absicht hinter (b) — der Test soll sich am LAUFENDEN Server verankern statt an
einer handgepflegten Punktzahl — wird trotzdem umgesetzt:

- **`limit.context` bleibt in `agent-models.jsonc`** (opencode braucht ihn).
- **Der Test leitet seine Erwartung aus dem Live-Wert ab** (per (b)) und prueft einen
  **Toleranzkorridor** statt Gleichheit (per (a)): `declared` muss innerhalb `[live * 0.8, live * 1.2]`
  liegen. Das modelliert die VRAM-Schwankung (88832–99840, ~±6 % um 94080) und ist stabil, faengt
  aber die `n_ctx_train`-Regression (262144 ≈ 2,6× live) weiterhin zuverlaessig.

Verifiziert gegen alle gemessenen Werte (declared=97840):
- live=88832 → Korridor [71066, 106598] → 97840 ∈ ✓
- live=99328 → Korridor [79462, 119194] → 97840 ∈ ✓
- live=99840 → Korridor [79872, 119808] → 97840 ∈ ✓

## Tasks

### 1. Failing Test (RED)

Der bestehende Test `opencode-routes-via-proxy.bats:48` schlaegt auf diesem Branch bereits fehl,
sobald ein gemma26-factory-Server auf `:8091` laeuft (deklariert 97840 vs. live 88832). Das ist der
RED-Nachweis — kein neuer Test noetig.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats
# expected: FAIL (Test 3) solange ein Server auf :8091 laeuft; ohne Server skip (CI-Normalfall)
```

### 2. Test auf Toleranzkorridor umstellen (GREEN)

In `tests/spec/local-llm-proxy/opencode-routes-via-proxy.bats`, `@test 'T002558: die deklarierte
Kontextzahl stimmt mit dem laufenden Server ueberein'`:

- Die Live-Messung (`/props .default_generation_settings.n_ctx`) bleibt unveraendert.
- Die `declared`-Extraktion aus `agent-models.jsonc` bleibt unveraendert.
- Ersetze die Punktgleichheits-Assertion `[ "${declared}" = "${live}" ]` durch eine
  Korridor-Pruefung: `declared` muss innerhalb `[live * 0.8, live * 1.2]` liegen (ganzzahlig
  gerundet). Nutze `awk` oder `python3` fuer die Arithmetik, damit keine Float-Falle entsteht.
- Aktualisiere den Kommentar im Test: statt einen einzelnen beobachteten Wert festzuhalten, wird die
  VRAM-Schwankung modelliert (Korridor statt Punktwert). Der Kommentar soll den Mechanismus
  (`--fit` entscheidet zur Laufzeit, freier VRAM schwankt) und die Begruendung fuer den Korridor
  (opencode braucht die statische Zahl fuer Auto-Compact) festhalten.

### 3. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Verify (RED → GREEN)

- [x] **RED:** `opencode-routes-via-proxy.bats` Test 3 schlaegt fehl, solange ein Server auf `:8091`
      laeuft (deklariert 97840 vs. live 88832). Ohne Server skip — das ist der CI-Normalfall.
- [ ] **GREEN:** Nach Task 2 besteht Test 3 fuer alle gemessenen Live-Werte (88832, 99328, 99840),
      weil 97840 in jedem ±20 %-Korridor liegt. Die `n_ctx_train`-Regression (262144) faellt weiterhin
      durch.
- [ ] `tests/spec/llm-local-dev.bats` bleibt gruen (unveraendert, prueft bereits die richtige
      Eigenschaft).

## Offene Risiken

- **gemma9-factory** (`limit.context = 32768`) ist ebenfalls ein `--fit`-Loadout und koennte dieselbe
  Driftklasse haben. Der Ticket-Scope ist bewusst auf `gemma26-factory` begrenzt (der fehlschlagende
  Test prueft nur diesen). Falls gemma9 spaeter auffaellt, ist das ein eigener Vorgang — hier bewusst
  nicht mitbehandelt, um den Fix klein und pruefbar zu halten.
- **Korridorbreite ±20 %** ist empirisch gegen die drei gemessenen Werte verifiziert. Sollte der freie
  VRAM staerker schwanken (z.B. Desktop-Last waehrend des Starts), koennte der Korridor zu eng werden.
  Der Kommentar im Test sollte deshalb die gemessene Spanne (88832–99840) dokumentieren, damit eine
  spaetere Anpassung begruendet ist.
