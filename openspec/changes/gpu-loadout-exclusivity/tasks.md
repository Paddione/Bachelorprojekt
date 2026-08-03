---
title: "gpu-loadout-exclusivity — Implementation Plan"
ticket_id: T002616
domains: [bachelorprojekt-infra, bachelorprojekt-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gpu-loadout-exclusivity — Implementation Plan

_Ticket: T002616_

## File Structure

```
scripts/llm-proxy/runner.mjs        (geändert)  271 → ~330 Zeilen, S1-Limit 800, Rest ~470
scripts/llm-proxy/server.mjs        (geändert)  437 → ~445 Zeilen, S1-Limit 800, Rest ~355
scripts/llm-proxy/runner.test.mjs   (neu)       ~120 Zeilen, S1-Limit 800, Rest ~680
openspec/specs/local-llm-proxy.md   (geändert)  Purpose-Platzhalter ersetzen
```

Kein Partial-Split: ein einzelner Guard mit einer Testdatei, die Dateien sind nicht disjunkt
aufteilbar ohne den Zusammenhang zu zerreißen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** `scripts/llm-proxy/runner.test.mjs` anlegen mit den fünf
      Fällen aus `design.md`. Der Test importiert `findGpuConflict`, `isGpuBound` und
      `GpuBusyError` aus `runner.mjs` — alle drei existieren noch nicht, der Import scheitert.
      Jeder Negativfall trägt seinen Positiv-Anker im selben Test (T002356-M1): erst prüfen,
      dass der erlaubte Start `null` liefert, dann die Konflikt-Aussage. `statusOf` wird als
      Stub übergeben, nicht aus `runner.mjs` importiert — der Test darf keine systemd-Unit
      anfassen.

```bash
node --test scripts/llm-proxy/runner.test.mjs
# expected: FAIL (rot — findGpuConflict/isGpuBound/GpuBusyError existieren noch nicht)
```

- [ ] **Prädikat und Konflikt-Suche (GREEN, Teil 1).** In `scripts/llm-proxy/runner.mjs`:
      `isGpuBound(loadout)` als Prädikat auf `loadout.fit?.enabled === true` exportieren.
      `findGpuConflict(slug, loadouts, statusOf)` exportieren — überspringt das eigene Loadout
      (kein Selbstkonflikt) sowie alle CPU-Loadouts und liefert den Slug des ersten
      GPU-Loadouts, dessen `statusOf(...).active === 'active'` ist, sonst `null`.
      `statusOf` ist ein Parameter, kein Import; der Default ist `unitStatus`.

- [ ] **Fehlertyp und Guard (GREEN, Teil 2).** `GpuBusyError` in `runner.mjs` definieren und
      exportieren; er trägt `slug` und `blockedBy` als Felder und formuliert die Meldung mit
      Zustand und `task llm:stop LOADOUT=<blocker>`. In `startUnit()` **vor** `execFileSync`
      `findGpuConflict` aufrufen und bei Treffer werfen. Der Guard sitzt bewusst in
      `startUnit`, nicht im Aufrufer — Begründung in `design.md`.

- [ ] **HTTP-Mapping (GREEN, Teil 3).** In `scripts/llm-proxy/server.mjs` den `startUnit`-Aufruf
      (aktuell Zeile 264) so umschließen, dass ein `GpuBusyError` als
      `LoadoutStartError(409, 'gpu_busy', <meldung>)` weitergereicht wird statt als generischer
      500er. Die Testfälle in `runner.test.mjs` prüfen den Fehlertyp; der Statuscode wird im
      bestehenden `server.test.mjs` mitgeprüft, falls dort schon ein Start-Pfad abgedeckt ist —
      andernfalls bleibt er dem Handlauf überlassen und wird im PR-Text genannt.

- [ ] **Purpose des SSOT-Specs ergänzen.** In `openspec/specs/local-llm-proxy.md` den Platzhalter
      `_Purpose fehlt — beim nächsten inhaltlichen Delta zu local-llm-proxy ergänzen._` durch
      einen deutschen Purpose-Absatz ersetzen: der Node-Proxy als alleiniges lokales LLM-Gateway
      auf Port 18235, der Loadouts als systemd-User-Units verwaltet und alle lokalen Harnesses
      bedient. Die Notiz verlangt genau das beim nächsten inhaltlichen Delta.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil `node --test` nicht Teil von `test:changed` ist:

```bash
node --test scripts/llm-proxy/runner.test.mjs
node scripts/llm/loadouts-format.mjs --check
```
