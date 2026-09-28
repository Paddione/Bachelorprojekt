## Task p4: sync.mjs als Adapter-Dispatcher, check.mjs mit Harness-Guards (grün)

Context. Ticket T900791, Spec `design.md` Abschnitte 2 und 3. Setzt p5 voraus (rote Tests, siehe Manifest depends_on).

Ist-Stand (2026-09-28): `scripts/toolset/sync.mjs` (100 Zeilen) hat drei Blöcke:
(1) claude `disabledMcpjsonServers` = suppressed MCPs, (3) Plugin-Entscheidungen nach
`registry/settings.json`, (2) opencode über `config.mcpServers` (No-op, Key existiert nicht,
würde Kommentare zerstören). `scripts/toolset/check.mjs` (183 Zeilen) hat `VALID_ROLES`
(Zeilen 25-41), Invarianten (§1), claude-Drift nur für suppressed (§2), Plugin-Advisory (§2b),
Quarantäne (§3, fail-open).

Target files:

| Datei | Ist | Budget |
|---|---|---|
| `scripts/toolset/sync.mjs` | 100 | 700 |
| `scripts/toolset/check.mjs` | 183 | 617 |

- `.claude/settings.json` (durch den echten Sync-Lauf in Step 4, .json nicht S1-gated)

### Steps

- [ ] Step 1 — `sync.mjs`: Blöcke (1) und (2) ersetzen durch eine Schleife über
  `ADAPTERS` aus `lib/adapters/index.mjs`. Für jede Harness mit `config !== null` und
  Adapter-Eintrag: Werkzeugsatz via `resolveToolset`, Kontext bauen (`registryMcp`,
  `suppressedMcp`, `projectMcp` aus `readClaudeCodeConfig(outDir).mcp.mcpServers`), Datei lesen,
  `render()`. Fehlt die Zieldatei, `SKIP <harness>: <pfad> missing` ausgeben. Flags:
  `--dry-run` gibt für jede abweichende Datei einen Unified-Diff aus
  (`diff -u` via `child_process.spawnSync` auf zwei Temp-Dateien) und schreibt nichts,
  `--harness <name>` beschränkt den Lauf. Ohne `--dry-run` wird atomar per Temp-Datei und
  `renameSync` geschrieben, wie heute. Vor jedem Lauf `validateHarnesses` aufrufen, bei Fehlern
  ausgeben und mit Exit 1 abbrechen. Block (3) Plugin-Entscheidungen bleibt unverändert.
- [ ] Step 2 — `check.mjs`: `VALID_ROLES` bleibt die einzige Rollenliste. Neu hinzufügen:
  (a) nach §1 `validateHarnesses(registry.harnesses, registry.forbiddenProviders, VALID_ROLES)`,
  jede Meldung auf stderr, `hasError = true`; (b) §2 (claude-Drift nur suppressed) ersetzen durch
  eine allgemeine Drift-Prüfung: für jede Harness mit Adapter und existierender Zieldatei im
  Speicher rendern und bei Ungleichheit `DRIFT <harness> <pfad>` plus Diff ausgeben,
  `hasError = true`. Die Fehlermeldung aus der ersetzten §2 (`Drift detected in …`) wird von
  `tests/spec/toolset-registry/check-drift-detection.bats` erwartet: vor dem Ersetzen die
  Erwartung dort lesen und die neue Meldung so formulieren, dass sie weiter passt (z. B.
  `Drift detected in <pfad> (DRIFT <harness>)`). §2b und §3 bleiben unverändert.
- [ ] Step 3 — GREEN-Lauf:
  ```bash
  node --test scripts/toolset/*.test.mjs scripts/toolset/lib/adapters/adapters.test.mjs
  tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/
  ```
  Alle Tests grün, auch die bestehenden (`sync-surgical`, `sync-all-harnesses`,
  `check-drift-detection`, `schema-gate`).
- [ ] Step 4 — Echten Sync ausführen: erst `node scripts/toolset/sync.mjs --dry-run`. Erwartet
  ist genau ein Diff in `.claude/settings.json` (`mcp-task-runner` kommt in
  `disabledMcpjsonServers`, Effekt E1) und keiner in `.opencode/opencode.jsonc`. Weicht der
  Dry-Run davon ab, stoppen und im Ticket kommentieren statt zu schreiben. Sonst
  `node scripts/toolset/sync.mjs`, danach `node scripts/toolset/check.mjs` → Exit 0.
- [ ] Step 5 — Commit:
  ```bash
  git add scripts/toolset/sync.mjs scripts/toolset/check.mjs .claude/settings.json
  git commit -m "feat(T900791): adapter-driven toolset sync and harness guards [T900791]"
  ```

### Acceptance criteria

- [ ] Alle Tests aus Step 3 grün, die p5-Tests wechseln von rot auf grün.
- [ ] `check.mjs` gegen das echte Repo Exit 0, `sync.mjs --dry-run` danach ohne Diff.
- [ ] `.opencode/opencode.jsonc` unverändert (`git diff --quiet origin/main -- .opencode/opencode.jsonc`).
