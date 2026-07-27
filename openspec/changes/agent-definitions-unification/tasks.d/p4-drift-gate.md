# p4 — Fail-closed Drift-Gate

Rolle: `tests`. `depends_on: p1, p2, p3`. Letztes Partial.

`target_files`: `tests/spec/agent-roster.bats` (neu),
`website/src/data/test-inventory.json` (regeneriert).

Der Test ist der eigentliche Ertrag dieses Changes. Registry und Karte beschreiben den Ist-Zustand
— nur das Gate hält ihn. Genau dieses Gate fehlte, weshalb `CLAUDE.md` vom 2026-07-22 bis zum
2026-07-27 vier gelöschte Agenten nannte, ohne dass etwas fehlschlug.

## Aufgaben

- [ ] **P4.1 — RED: Test anlegen, der jetzt fehlschlägt.** Die dritte Assertion (CLAUDE.md gegen
      Registry) ist vor p3 rot, weil `CLAUDE.md` noch die vier qwen-Namen trägt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
# expected: FAIL (rot — CLAUDE.md nennt vier Agenten, die weder in roles noch in runtimes stehen)
```

- [ ] **P4.2 — Assertion 1: `roles` gegen `.claude/agents/`.** In beide Richtungen prüfen — eine
      einseitige Prüfung fängt nur die halbe Drift:

```bash
# Registry -> Dateien
#   jeder roles-Schluessel hat eine .claude/agents/<name>.md
# Dateien -> Registry
#   jede .claude/agents/*.md hat einen roles-Eintrag
ls -1 .claude/agents/*.md | xargs -n1 basename | sed 's/\.md$//'
```

- [ ] **P4.3 — Assertion 2: `runtimes` gegen `.opencode/agent-models.jsonc`.** Ebenfalls
      beidseitig. `agent-models.jsonc` ist JSONC — Kommentare vor dem Parsen strippen:

```bash
sed -e 's://.*$::' .opencode/agent-models.jsonc | jq -r '.agent | keys[]'
```

      Nur die Schlüssel unter `agent` vergleichen, **nicht** die unter `provider.*.models` — dort
      stehen Modell-IDs wie `qwen3.5-9b@q4_k_xl`, die genau die Verwechslung tragen, die diesen
      Change ausgelöst hat.

- [ ] **P4.4 — Assertion 3: Agentennamen in `CLAUDE.md` gegen die Registry.** Jeder in
      `CLAUDE.md` als Agent genannte Bezeichner muss in `roles` oder `runtimes` vorkommen. Der
      Match muss eng genug sein, um Modell-IDs und Fließtext nicht als Agentennamen zu lesen —
      an den `bachelorprojekt-`-Präfix und die bekannten Runtime-Schlüssel binden, nicht an ein
      generisches Wortmuster.

- [ ] **P4.5 — Assertion 4: Karte ist aktuell.** Nach `task agent-guide:maps` darf
      `agents-map.md` keinen Diff haben — sonst wurde die Registry geändert, ohne zu
      regenerieren.

- [ ] **P4.6 — Assertion 5: keine `.tmp`-Reste (T002308).**

```bash
ls docs/agent-guide/maps/*.tmp 2>/dev/null && echo "tmp-Reste vorhanden" || echo "sauber"
```

- [ ] **P4.7 — Negativ verifizieren.** Ein Test, der nie fehlschlagen kann, ist kein Gate. Für
      jede der fünf Assertions einmal künstlich brechen und bestätigen, dass BATS rot wird —
      zum Beispiel einen `roles`-Eintrag entfernen, einen erfundenen Agentennamen in `CLAUDE.md`
      einfügen, eine `.tmp`-Datei anlegen. Danach zurücknehmen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
```

- [ ] **P4.8 — Test-Inventar regenerieren.** CI vergleicht `website/src/data/test-inventory.json`
      gegen eine Neuberechnung und schlägt bei Abweichung fehl; dieses Partial legt eine neue
      BATS-Datei an:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] **P4.9 — Finale Verifikation.**

```bash
task test:agent-guide
task test:changed
task freshness:regenerate
task freshness:check
```

## Abnahmekriterien

- `tests/spec/agent-roster.bats` enthält alle fünf Assertions, beidseitig wo zutreffend.
- Jede Assertion wurde einmal künstlich zum Fehlschlagen gebracht (P4.7) — nicht nur grün
  gesehen.
- `task test:agent-guide`, `task test:changed`, `task freshness:regenerate` und
  `task freshness:check` sind grün.
- `website/src/data/test-inventory.json` ist regeneriert und mitcommittet.
