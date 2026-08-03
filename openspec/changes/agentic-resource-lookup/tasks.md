---
title: "agentic-resource-lookup — Implementation Plan"
ticket_id: T002611
domains: [tooling, scripts, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agentic-resource-lookup — Implementation Plan

_Ticket: T002611_

## File Structure

```
NEU  scripts/agentic-lookup.mjs                                 (Kern, drei Verben)
NEU  .claude/skills/agentic-resource-lookup/SKILL.md            (Skill-Body)
NEU  tests/spec/toolset-registry/agentic-resource-lookup.bats   (Verhaltensprüfung)
NEU  tests/fixtures/agentic-lookup/registry-search.json         (Registry-Antwort, eingefroren)
NEU  tests/fixtures/agentic-lookup/tools-list.json              (tools/list-Antwort, eingefroren)
ÄNDERN  Taskfile.yml                                            (Task `toolset:lookup`, S4-Erreichbarkeit)
```

**S1-Budget.** `scripts/agentic-lookup.mjs` ist neu, `.mjs`-Limit laut
`docs/code-quality/gates.yaml → s1.limits` = **800**. Zielgröße ≤ 450 Zeilen, damit
Wachstumsreserve bleibt. Wird das im Verlauf überschritten, wird der Registry-Client als eigenes
Modul `scripts/agentic-lookup/registry.mjs` ausgelagert — echter Split, kein Zeilen-Zusammenziehen.
`.md` und `.bats` sind nicht S1-erfasst. `Taskfile.yml` ist gebaselined; die Änderung ist ein
Task-Block von ~6 Zeilen — vor dem Commit `jq -r '."S1:Taskfile.yml".metric' docs/code-quality/baseline.json`
gegen `wc -l Taskfile.yml` prüfen und bei Budget ≤ 0 den Task stattdessen in eine bestehende
Gruppe einhängen, statt Zeilen hinzuzufügen.

## Verify (RED → GREEN)

- [ ] **Task 1 — Failing-Test-Step (RED).** `tests/spec/toolset-registry/agentic-resource-lookup.bats`
      anlegen, zusammen mit den beiden Fixtures. Geprüft wird Kommando-Ausgabe (T002448-M4),
      nicht Quelltext. Abgedeckte Szenarien aus dem Delta:

      1. `find` annotiert einen in `capabilities.yaml` als `suppressed` geführten Treffer mit
         diesem Zustand und der hinterlegten `reason` — nicht als neuen Kandidaten.
      2. `find` liefert bei unerreichbarer Registry die lokalen Treffer, nennt die ausgefallene
         Quelle auf stderr und beendet mit Exit 0. Der Ausfall wird über eine unerreichbare URL
         **erzwungen**, nicht simuliert.
      3. `inspect` kennzeichnet die Quelle als `schema`, wenn `tools/list` antwortet.
      4. `inspect` kennzeichnet `readme` und nennt den Bezugsweg, wenn nur `packages[]` vorliegt.
      5. `record --state suppressed` ohne `--reason` beendet mit Exit 1, **bevor** die Datei
         angefasst wird — nach dem Lauf ist `capabilities.yaml` byte-identisch.

      Positiv-Anker nach T002356-M1 für Szenario 5: im selben Test zuerst belegen, dass ein
      `record`-Aufruf **mit** `--reason` durchläuft und den Eintrag schreibt. Ohne ihn bestünde
      der Negativtest auch dann, wenn `record` gar nicht existiert.

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/agentic-resource-lookup
tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/agentic-resource-lookup.bats
# expected: FAIL (rot — scripts/agentic-lookup.mjs existiert noch nicht)
```

- [ ] **Task 2 — Quellen-Resolver und Verb `find`.** Die drei Quellen in fester Reihenfolge lesen:
      `docs/agent-guide/registry/capabilities.yaml`, `~/.claude/plugins/known_marketplaces.json`
      (je Marketplace dessen `.claude-plugin/marketplace.json` unter `installLocation`), dann
      `https://registry.modelcontextprotocol.io/v0/servers?search=<query>`.
      Zusammenführung nach Servername; der lokale Kurationszustand gewinnt. Netz-Timeout 10 s.
      Eine ausgefallene Quelle wird namentlich auf stderr gemeldet und übersprungen.

      Ausgabe je Treffer: Name, Bezugsweg (`npm:<id>`, `oci:<ref>` oder Remote-URL),
      Kurationszustand (`canonical` | `suppressed` | `unreviewed`) und eine Zeile Beschreibung.
      Treffer mit lokalem Zustand zuerst — die Frage „haben wir das schon geprüft?" wird vor der
      Frage „was gibt es sonst?" beantwortet.

      Überschreitet `scripts/agentic-lookup.mjs` dabei 450 Zeilen, wird der Registry-Client hier
      nach `scripts/agentic-lookup/registry.mjs` ausgelagert (siehe S1-Budget oben) — echter
      Split, kein Zeilen-Zusammenziehen.

- [ ] **Task 3 — Verb `inspect`.** Bei mindestens einem `remotes[]`-Eintrag vom Typ
      `streamable-http` eine MCP-`initialize`+`tools/list`-Sequenz gegen die URL fahren und die
      Tool-Namen samt Parametern ausgeben, gekennzeichnet als `schema`. Fällt die Sequenz aus —
      auch bei einem Authentifizierungsfehler — auf das `README` des `repository`-Feldes
      zurückfallen, gekennzeichnet als `readme`, und bei Credential-Bedarf das ausdrücklich
      vermerken. Keine Installation, kein Schreiben nach `~/.claude/plugins/`.

- [ ] **Task 4 — Verb `record`.** Genau einen Eintrag nach `capabilities.yaml` schreiben.
      Fail-closed: gegen das Schema validieren, bevor die Datei geöffnet wird — `reason` ist
      Pflicht bei jedem `state` außer `canonical`, `roles` bei `canonical`. Nach dem Schreiben
      `node scripts/toolset/check.mjs` ausführen und dessen Exit-Code durchreichen.

- [ ] **Task 5 — Skill-Body und Erreichbarkeit.** `.claude/skills/agentic-resource-lookup/SKILL.md`
      mit `description:`-Frontmatter, das die Auslöser benennt („gibt es ein MCP für…",
      „welcher Server kann…", „schon geprüft?"). Dazu einen Taskfile-Eintrag, damit
      `scripts/agentic-lookup.mjs` nicht als S4-Orphan gilt.

- [ ] **Task 6 — Tests grün.** Der Test aus Task 1 muss nach den Tasks 2–5 bestehen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/agentic-resource-lookup.bats
# erwartet: gruen — alle Szenarien inklusive Positiv-Anker
```

- [ ] **Task 7 — Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
