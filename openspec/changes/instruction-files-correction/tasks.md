---
title: "instruction-files-correction — Implementation Plan"
ticket_id: T002305
domains: [agent-config, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# instruction-files-correction — Implementation Plan

_Ticket: T002305_

K6 des Epics T002299. Korrigiert jede verifizierte Falschaussage in den drei Root-Instruktions-
dateien und verankert das Ergebnis in einem fail-closed BATS-Gate.
Spec: `openspec/changes/instruction-files-correction/design.md` ·
Delta: `openspec/changes/instruction-files-correction/specs/agent-skills.md`

**Entscheidung zu GEMINI.md (Herleitung in `design.md` § Entscheidung):** Die Datei **bleibt** eine
eigene Datei, wird aber vom Architektur-Spiegel zum dünnen Zeiger. Sie wird **nicht** generiert —
das K1-Muster (T002300) projiziert strukturierte YAML auf Configs, ein GEMINI.md-Generator müsste
Prosa projizieren und bräuchte Marker-Regionen in CLAUDE.md. Nachweis, dass beim Kürzen nichts
verloren geht: jede GEMINI-exklusive Sektion existiert bereits an anderer Stelle (Tabelle in
`design.md`).

## File Structure

| Datei | Änderung |
|---|---|
| `GEMINI.md` | 107 → höchstens 40 Zeilen. Keycloak-, LiveKit- und Push-Deploy-Aussagen entfallen mit dem Architektur-Block; die Task-Liste (vier nicht existierende Einträge) wird ersatzlos durch den Task-Oracle-Verweis ersetzt; es bleiben Deferral auf CLAUDE.md/AGENTS.md plus die agy-spezifische MCP-Config-Notiz |
| `CLAUDE.md` | `plan-context.sh`-Beispiel auf den gültigen Rollennamen `bachelorprojekt-infra` korrigieren, gültige Rollennamen benennen, Kurzform-Falle explizit machen; MCP-Absatz auf die K1-Registry `docs/agent-guide/registry/mcp.yaml` samt `task mcp:check` / `task mcp:sync` beziehen |
| `AGENTS.md` | Flux-Korrektur (Zeilen 37 und 42), `write_capable`-Korrektur gegen die K5-Registry (Zeilen 13 und 19), `orchestrator` in die Runtime-Tabelle aufnehmen, Zeilenziel auf den einhaltbaren Wert setzen, Branch-Präfix-Divergenz gegen CLAUDE.md markieren |
| `tests/spec/agent-skills.bats` | Vier neue `@test`-Blöcke als Instruktionsdatei-Gate: Keycloak-Verbot, GEMINI-Zeilenbudget plus Inventar-Verbot, Registry-Konsistenz Rollen, Registry-Konsistenz Runtimes |
| `website/src/data/test-inventory.json` | regeneriert nach den Test-Änderungen |

`website/CLAUDE.md` und `VideoVault/CLAUDE.md` werden **nicht geändert**. Die vom Ticket verlangte
Prüfung auf Widersprüche ist ein Nachweisschritt in `p3`; der Vorbefund lautet: keine Widersprüche,
beide Dateien beschreiben ausschließlich ihren eigenen Scope und behaupten nichts über Identity
Provider, Deploy-Pfad oder Agent-Routing.

## Partials

| id | Plan | Rolle | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.d/p1-gemini.md` | impl | `GEMINI.md` | |
| p2 | `tasks.d/p2-claude.md` | impl | `CLAUDE.md` | |
| p3 | `tasks.d/p3-agents.md` | impl | `AGENTS.md` | |
| p4 | `tasks.d/p4-gate.md` | tests | `tests/spec/agent-skills.bats`, `website/src/data/test-inventory.json` | p1, p2, p3 |

`p4` hängt an allen drei Impl-Partials, weil das Gate erst grün werden kann, wenn die drei Dateien
korrigiert sind. Der RED-Schritt in `p4` wird bewusst **vor** den Korrekturen ausgeführt und muss
dort fehlschlagen — er ist der Nachweis, dass das Gate die Fehler wirklich sieht.

<!-- vitest: kein neuer Test nötig — der Change berührt keine Datei unter `website/src/lib/**` oder `website/src/pages/api/**`; die Verifikation läuft über BATS. -->

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Das Instruktionsdatei-Gate aus `p4` gegen den unkorrigierten
      Stand laufen lassen. Es muss fehlschlagen, weil `GEMINI.md` 107 Zeilen hat, viermal
      `Keycloak` nennt und eine hartkodierte Task-Liste führt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats
# expected: FAIL (rot — GEMINI.md ist noch der ungekuerzte Spiegel mit Keycloak-Eintraegen)
```

- [ ] **Fix-Step (GREEN).** `p1` bis `p3` umsetzen. Danach muss derselbe Aufruf durchlaufen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats
# erwartet: alle @test gruen
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich explizit, weil nicht alle betroffenen Prüfungen in `test:changed` liegen:

```bash
bash scripts/openspec.sh validate
task test:inventory
git diff --exit-code website/CLAUDE.md VideoVault/CLAUDE.md
```

**Akzeptanz:**

- `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats` endet mit Exit 0.
- `grep -c Keycloak CLAUDE.md AGENTS.md GEMINI.md` liefert für jede der drei Dateien `0`.
- `wc -l < GEMINI.md` liefert höchstens `40`.
- In `GEMINI.md` findet sich kein `task <gruppe>:<name>`-Literal außer `task mcp:sync`.
- `bash scripts/plan-context.sh bachelorprojekt-infra --with-openspec 2>&1 | grep -c 'unknown role'`
  liefert `0` — das korrigierte CLAUDE.md-Beispiel läuft nachweislich ohne WARN.
- `git diff --exit-code website/CLAUDE.md VideoVault/CLAUDE.md` endet mit Exit 0 (beide unberührt).
- `task freshness:check` endet mit Exit 0.
