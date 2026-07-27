---
title: "p4 — Fail-closed Instruktionsdatei-Gate in tests/spec/agent-skills.bats"
ticket_id: T002305
domains: [agent-config, test]
status: active
partial_id: p4
role: tests
target_files: ["tests/spec/agent-skills.bats", "website/src/data/test-inventory.json"]
depends_on: [p1, p2, p3]
---

# p4 — Instruktionsdatei-Gate

_Ticket: T002305 · Partial p4 · target_files: `tests/spec/agent-skills.bats`, `website/src/data/test-inventory.json`_

## File Structure

| Datei | Änderung |
|---|---|
| `tests/spec/agent-skills.bats` | vier neue `@test`-Blöcke anhängen; bestehende Tests unverändert |
| `website/src/data/test-inventory.json` | via `task test:inventory` regeneriert |

## Kontext

Die Korrekturen aus `p1`–`p3` sind eine Momentaufnahme. Ohne Gate schreibt die nächste Session den
Spiegel zurück — genau so sind die sechzehn Fehler entstanden. Das Gate ist deterministisch und
fail-closed, analog zum 250-Zeilen-Skill-Gate aus K4 (T002303).

`tests/spec/agent-skills.bats` existiert bereits (K4) und ist der richtige Ort: die zugehörige SSOT
ist `openspec/specs/agent-skills.md`, in die das Delta dieses Changes gemerged wird. Kein neues
Testfile, kein Eingriff in `ci.yml` — die Datei liegt bereits im BATS-Lauf.

**BATS-Runner:** `tests/unit/lib/bats-core/bin/bats` (vendored). Nicht `which bats`.

## Schritte

- [ ] **RED zuerst.** Die vier Tests schreiben und gegen den **unkorrigierten** Stand der drei
      Instruktionsdateien laufen lassen. Sie müssen fehlschlagen — das ist der Nachweis, dass das
      Gate die realen Fehler sieht und nicht bloß tautologisch grün ist. Falls `p1`–`p3` bereits im
      Worktree umgesetzt sind, den RED-Lauf gegen `origin/main` erzwingen:

```bash
git stash push -- GEMINI.md CLAUDE.md AGENTS.md 2>/dev/null || true
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats
# expected: FAIL (rot — GEMINI.md hat 107 Zeilen, nennt Keycloak und fuehrt eine Task-Liste)
git stash pop 2>/dev/null || true
```

- [ ] **Test 1 — kein Keycloak in den Root-Instruktionsdateien.** Für jede der drei Dateien
      `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` prüfen, dass `Keycloak` (case-insensitive) nicht
      vorkommt. Der Identity Provider ist Pocket ID; jedes Vorkommen ist eine Regression. Die
      Fehlermeldung nennt Datei und Zeilennummer.

- [ ] **Test 2 — GEMINI.md bleibt ein Zeiger.** Drei Bedingungen in einem `@test`:
      1. `wc -l < GEMINI.md` ist höchstens `40`.
      2. Kein `task <gruppe>:<name>`-Literal außer `task mcp:sync` und `task mcp:check` —
         `CLAUDE.md` verbietet hartkodierte Task-Kommandos zugunsten von `scripts/vda.sh oracle`.
      3. Keiner der Service-Namen `Nextcloud`, `Vaultwarden`, `Collabora`, `DocuSeal`, `Janus`,
         `coturn`, `Traefik`, `LiveKit` kommt vor — das war die Sektion, in der die Keycloak- und
         LiveKit-Fehler saßen.

- [ ] **Test 3 — Rollen decken sich mit der Registry.** Die `roles:`-Schlüssel aus
      `docs/agent-guide/registry/agents.yaml` auslesen und prüfen, dass jeder davon sowohl in
      `CLAUDE.md` als auch in `AGENTS.md` vorkommt, und dass keine der beiden Dateien einen
      `bachelorprojekt-*`-Namen nennt, den die Registry nicht kennt. YAML-Parsing wie in den
      bestehenden Tests derselben Datei über `node -e` mit `yaml`.

- [ ] **Test 4 — opencode-Runtimes decken sich mit der Registry.** Analog für die
      `runtimes:`-Schlüssel gegen `AGENTS.md`. Dieser Test fängt genau die Lücke, die `p3`
      schließt (`orchestrator` fehlte).

- [ ] **GREEN.** Nach `p1`–`p3` alle vier Tests grün.

- [ ] **Test-Inventar regenerieren.** CI vergleicht `website/src/data/test-inventory.json` gegen
      den neu generierten Stand und schlägt bei Abweichung fehl:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

## Verifikation dieses Partials

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats
task test:inventory
git diff --exit-code website/src/data/test-inventory.json
```

**Akzeptanz:**

- `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats` endet mit Exit 0 und führt die
  vier neuen `@test`-Namen auf.
- Der RED-Lauf gegen den unkorrigierten Stand ist dokumentiert und hat fehlgeschlagen.
- `git diff --exit-code website/src/data/test-inventory.json` endet nach `task test:inventory` mit
  Exit 0.
- Die bestehenden `@test`-Blöcke aus K4 in derselben Datei laufen unverändert grün.
