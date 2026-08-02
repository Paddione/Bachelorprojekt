# p4 — Fail-closed Drift-Gate

Rolle: `tests`. `depends_on: p1, p2, p3`. Letztes Partial.

`target_files`: `tests/spec/mcp-gateway.bats` (existiert, 72 Zeilen).

**Kein neues Testfile.** `tests/spec/mcp-gateway.bats` gehört zum passenden SSOT-Spec und prüft
heute bereits `.mcp.json exists with MCP server definitions`, `… registers factory-mcp`,
`… registers mcp-kubernetes`, `… registers mcp-postgres`. Diese vier Tests werden von den neuen
Assertions **abgelöst**, nicht ergänzt — sie prüfen künftig gegen die Registry statt gegen
hartcodierte Namen. Vorher lesen:

```bash
grep -n '^@test' tests/spec/mcp-gateway.bats
```

Damit entfällt jede Änderung an `.github/workflows/ci.yml`: die Spec-BATS-Suite läuft bereits im
Job `test-factory`.

## Aufgaben

- [ ] **P4.1 — RED.** Die neue Assertion ruft `scripts/mcp-sync.sh check`. Vor p2 existiert das
      Skript nicht:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway.bats
# expected: FAIL (rot — scripts/mcp-sync.sh existiert noch nicht)
```

- [ ] **P4.2 — Assertion: Registry vorhanden und wohlgeformt.** `docs/agent-guide/registry/mcp.yaml`
      existiert und trägt `clients` sowie `cluster`.

- [ ] **P4.3 — Assertion: `check` ist grün auf dem committeten Stand.** Der Kern des Gates.

```bash
bash scripts/mcp-sync.sh check
```

- [ ] **P4.4 — Assertion: `check` schreibt nicht.** Nach einem `check` muss
      `git status --porcelain` für die drei Zieldateien unverändert sein. Ohne diese Zusicherung
      kann ein späterer Umbau `check` versehentlich zu einem `render` machen und das Gate
      lautlos entwerten.

- [ ] **P4.5 — Assertion: agy-Ziel wird bei Abwesenheit sichtbar übersprungen.** In CI existiert
      `~/.gemini/config/mcp_config.json` nicht. Der Test prüft, dass `check` dann trotzdem exit 0
      liefert **und** eine Meldung über das übersprungene Ziel ausgibt. Ein grüner Exit ohne
      Meldung ist ein Fehlschlag.

      Hinweis zur Umsetzung: `$output` in BATS mischt stdout und stderr nur bei `run`; wenn die
      Skip-Meldung nach stderr geht, muss der Test sie explizit einfangen
      (`run bash -c '… 2>&1'`), sonst ist die Assertion blind.

- [ ] **P4.6 — Assertion: die `cluster`-Schicht bildet die Realität ab.** Die in `mcp.yaml`
      gelisteten Container entsprechen dem Deployment-Manifest. Der Test liest das Manifest, nicht
      den Cluster — BATS läuft in CI ohne Cluster-Zugang:

```bash
grep -c '"name": "keycloak"\|"name": "playwright"\|"name": "github"' \
  k3d/default/claude-code-mcp-monolith-deploy.yaml
```

- [ ] **P4.7 — Die vier alten `.mcp.json`-Tests ablösen.** Sie prüfen hartcodierte Servernamen.
      Künftig prüft `check` dieselbe Eigenschaft vollständig und automatisch. Die alten Tests
      entfernen, damit nicht zwei Stellen dieselbe Zusicherung mit unterschiedlicher Genauigkeit
      treffen.

      **Achtung T002309:** Dieser Change löscht `@test`-Blöcke, aber **keine Datei** —
      `tests/spec/mcp-gateway.bats` bleibt bestehen. Der Fehlermodus aus T002309
      (`find-changed-tests.sh` emittiert gelöschte `.bats`-Pfade → `not ok 1 bats-gather-tests`)
      tritt daher nicht auf.

- [ ] **P4.8 — Negativ verifizieren.** Jede neue Assertion einmal künstlich brechen und
      bestätigen, dass BATS rot wird: einen Server aus `.mcp.json` entfernen, einen
      `clients`-Eintrag aus der Registry löschen, `check` schreiben lassen. Danach zurücknehmen.

- [ ] **P4.9 — Test-Inventar.** Diese Datei existiert bereits, es kommt keine neue hinzu — das
      Inventar ändert sich also nur, wenn die Zählung der `@test`-Blöcke einfließt. Zur Sicherheit
      regenerieren:

```bash
task test:inventory
git status --porcelain website/src/data/test-inventory.json
```

- [ ] **P4.10 — Finale Verifikation.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Abnahmekriterien

- `tests/spec/mcp-gateway.bats` prüft Registry-Existenz, `check`-Grünstand,
  Seiteneffektfreiheit von `check`, das sichtbare Überspringen des agy-Ziels und die
  Übereinstimmung der `cluster`-Schicht mit dem Manifest.
- Die vier abgelösten `.mcp.json`-Tests sind entfernt; keine doppelte Zusicherung.
- Jede neue Assertion wurde einmal künstlich zum Fehlschlagen gebracht (P4.8).
- `.github/workflows/ci.yml` ist **unverändert**.
- `task test:changed`, `task freshness:regenerate` und `task freshness:check` sind grün.
