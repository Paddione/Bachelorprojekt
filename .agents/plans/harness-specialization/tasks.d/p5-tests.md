## Task p5: Tests für Adapter, Check und Sync (rot)

Context. Ticket T900791, Spec `design.md` Abschnitt 3. Setzt p2 voraus. Die Tests entstehen vor
p4 und sind rot, bis p4 `sync.mjs` und `check.mjs` umbaut. Geprüft wird Befehlsausgabe, nie
Quelltext (T002448-M4).

Ist-Stand (2026-09-28): Die Suite `tests/spec/toolset-registry/` enthält u. a.
`sync-all-harnesses.bats` und `check-drift-detection.bats`. Muster: `load '../test_helper.bash'`,
Fixture-Registry in `mktemp -d`, Aufruf mit `TOOLSET_REGISTRY=… TOOLSET_OUT_DIR=…`.
`scripts/toolset/check.test.mjs` zeigt das node:test-Muster.

Target files:

- `scripts/toolset/lib/adapters/adapters.test.mjs` (NEW)
- `tests/spec/toolset-registry/harness-specialization.bats` (NEW)
- `components/website/src/data/test-inventory.json` (nur falls die Regeneration sie ändert)

### Steps

- [ ] Step 1 — `adapters.test.mjs` (node:test, `assert/strict`):
  1. claude: Fixture `{"theme":"dark","disabledMcpjsonServers":[]}`, `projectMcp = {a, b, c}`,
     `registryMcp = {a, b}`, `toolset = {'mcp:a'}`, `suppressedMcp = {}` →
     `disabledMcpjsonServers` ist `["b"]`, `theme` bleibt.
  2. opencode: JSONC-Fixture mit einer Kommentarzeile `// keep me`, Servern `a` und `b` mit
     `"enabled": true` → nach Render mit `toolset = {'mcp:a'}` ist `b` `false`, `a` bleibt `true`,
     die Kommentarzeile ist unverändert enthalten.
  3. opencode: Server `x` ohne Registry-Eintrag bleibt unverändert.
- [ ] Step 2 — `harness-specialization.bats`, gemeinsame Helper-Funktion erzeugt eine
  Fixture-Registry mit `capabilities` (ein canonical `mcp:a` mit `roles: [orchestrator]`), einem
  `harnesses`-Block (eine Harness `opencode` mit `roles: [orchestrator]`,
  `config: .opencode/opencode.jsonc`) und `forbidden_providers: [deepseek]`, plus eine passende
  `.opencode/opencode.jsonc` in `TOOLSET_OUT_DIR`. Tests:
  1. `check: forbidden provider fails` — Harness-`provider: deepseek` → `status -eq 1`, Ausgabe
     enthält `forbidden provider deepseek`.
  2. `check: unknown harness role fails` — `roles: [orchestrater]` → `status -eq 1`, Ausgabe
     enthält `unknown role 'orchestrater'`.
  3. `check: drift fails` — `"enabled": false` für `a` in der Fixture-Datei → `status -eq 1`,
     Ausgabe enthält `DRIFT opencode`.
  4. `check: clean fixture passes` → `status -eq 0`.
  5. `sync: dry-run writes nothing` — Drift-Fixture, `sync.mjs --dry-run`, danach
     `sha256sum` der Datei unverändert und Ausgabe enthält die Zeile mit `"enabled": true`.
- [ ] Step 3 — RED-Lauf (vor p4):
  ```bash
  node --test scripts/toolset/lib/adapters/adapters.test.mjs
  tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/harness-specialization.bats
  ```
  Der node-Test ist grün (Adapter aus p2 existieren). Der BATS-Lauf hat expected: FAIL für die
  Tests 1, 2, 3 und 5, weil `check.mjs` den `harnesses`-Block noch ignoriert und `sync.mjs` kein
  `--dry-run` kennt. Die Fehlerausgabe als Rot-Beleg in den Commit-Body übernehmen.
- [ ] Step 4 — `task test:inventory` ausführen, falls der Inventar-Check die neuen Dateien
  meldet. Commit:
  ```bash
  git add scripts/toolset/lib/adapters/adapters.test.mjs tests/spec/toolset-registry/harness-specialization.bats
  git add components/website/src/data/test-inventory.json 2>/dev/null || true
  git commit -m "test(T900791): harness specialization check and adapter tests (red) [T900791]"
  ```

### Acceptance criteria

- [ ] Rot-Beleg vorhanden: BATS-Tests 1, 2, 3, 5 schlagen vor p4 fehl.
- [ ] Adapter-Tests grün.
- [ ] Keine anderen Dateien geändert.
