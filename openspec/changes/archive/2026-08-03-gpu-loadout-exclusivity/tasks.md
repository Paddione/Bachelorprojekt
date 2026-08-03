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
scripts/llm-proxy/loadouts.mjs                214 → ~232 Zeilen, S1-Limit 800, Rest ~568
scripts/llm-proxy/server.mjs                  437 → ~448 Zeilen, S1-Limit 800, Rest ~352
scripts/llm-proxy/exclusive-conflict.test.mjs (neu) ~110 Zeilen, S1-Limit 800, Rest ~690
openspec/specs/local-llm-proxy.md             Purpose-Platzhalter ersetzen
```

Kein Partial-Split: eine Extraktion und ihr Aufrufer, nicht sinnvoll disjunkt trennbar.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `scripts/llm-proxy/exclusive-conflict.test.mjs` anlegen mit
      den sechs Fällen aus `design.md`. Der Test importiert `findExclusiveConflict` aus
      `loadouts.mjs` — die Funktion existiert noch nicht, der Import scheitert. `activeSlugs`
      wird als Array übergeben, nie aus `unitStatus` gelesen: der Test darf keine systemd-Unit
      anfassen. Jeder Negativfall trägt seinen Positiv-Anker im selben Test (T002356-M1).

```bash
node --test scripts/llm-proxy/exclusive-conflict.test.mjs
# expected: FAIL (rot — findExclusiveConflict existiert noch nicht)
```

- [x] **Konfliktsuche herauslösen (GREEN, Teil 1).** In `scripts/llm-proxy/loadouts.mjs`
      `findExclusiveConflict(doc, slug, activeSlugs)` exportieren: liefert
      `{conflictSlug, group}` für das erste andere aktive Loadout derselben
      `exclusiveGroup`, sonst `null`. Ohne `exclusiveGroup` immer `null`, eigener Slug
      ausgeschlossen. Die Logik wird aus `planAutoStart` (Zeilen 207–212) übernommen, nicht
      neu formuliert.

- [x] **`planAutoStart` auf die neue Funktion umstellen (GREEN, Teil 2).** Der Block in
      `planAutoStart` ruft `findExclusiveConflict` auf, statt die Suche selbst zu führen. Das
      Rückgabeformat `{action:'conflict', slug, conflictSlug, group}` bleibt unverändert —
      `proxyV1` hängt daran. Die bestehenden Tests in `loadouts.test.mjs` müssen ohne Änderung
      grün bleiben; werden sie rot, ist die Extraktion nicht verhaltensgleich.

- [x] **Prüfung in `startLoadout` (GREEN, Teil 3).** In `scripts/llm-proxy/server.mjs` nach dem
      `port_busy`-Check und vor `resolveModelPath` den Konflikt prüfen und bei Treffer
      `LoadoutStartError(409, 'exclusive_conflict', …)` werfen. Die aktiven Slugs werden wie in
      `ensureLoadoutForModel` über `unitStatus(l.slug).active === 'active'` ermittelt. Meldung
      wortgleich zum `/v1`-Pfad: blockierender Slug, Gruppe, Stop-Befehl, Hinweis dass der
      Proxy nichts von selbst stoppt.

- [x] **Purpose des SSOT-Specs ergänzen.** In `openspec/specs/local-llm-proxy.md` den Platzhalter
      `_Purpose fehlt — beim nächsten inhaltlichen Delta zu local-llm-proxy ergänzen._` durch
      einen deutschen Purpose-Absatz ersetzen: der Node-Proxy als alleiniges lokales
      LLM-Gateway auf Port 18235, das Loadouts als systemd-User-Units verwaltet, sie bei Bedarf
      startet und dabei die `exclusiveGroup`-Belegung der GPU durchsetzt.

- [x] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil `node --test` nicht Teil von `test:changed` ist — der zweite Aufruf ist die
Regressionsprobe auf die Extraktion:

```bash
node --test scripts/llm-proxy/exclusive-conflict.test.mjs
node --test scripts/llm-proxy/loadouts.test.mjs
node scripts/llm/loadouts-format.mjs --check
```
