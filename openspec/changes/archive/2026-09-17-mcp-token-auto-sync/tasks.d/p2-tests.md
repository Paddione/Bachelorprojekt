# p2 — Tests (Rolle tests, STRUCT2-Träger)

Frontmatter-Anker: Ticket T900223 · Rolle tests · depends_on=p1 (baut auf dem p1-Heal-Skript auf, testet es ERGEBNIS-orientiert).

Manifest: `id=p2` · `file=tasks.d/p2-tests.md` · `target_files=tests/spec/mcp-gateway/token-drift-auto-sync.bats` (NEW, eigene Datei pro T002416). Keine anderen Dateien — D1-disjunkt zu p1-impl.

SSOT: `openspec/changes/mcp-token-auto-sync/specs/mcp-gateway.md` (Delta-Spec, 6 Szenarien). Implementierung: `scripts/mcp-gateway/token-drift-heal.sh` (aus p1).

## Task T1 — RED-Beleg (STRUCT2 Failing-Test-Step, vor p1-GREEN)

- [ ] Neuen BATS-Guard gegen den Unveraendert-Stand laufen lassen — er scheitert, weil `scripts/mcp-gateway/token-drift-heal.sh` noch nicht existiert:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/token-drift-auto-sync.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] Positiv-Anker des RED-Laufs: mindestens der Match-Test (T1a unten) meldet `not ok` wegen fehlendem Skript — der RED-Beleg ist damit an echtem Verhalten (fehlendes Heal-Skript) verankert, nicht an leerem Output.

## Task T2 — Guard-Datei `tests/spec/mcp-gateway/token-drift-auto-sync.bats` (NEW)

Header-Kommentar: SSOT-Verweis auf die Delta-Spec, Ticket T900223, Pruefmodus ERGEBNIS-orientiert nach T002448-M4 (Skript wird per `run` AUSgefuehrt, `$status`/`$output` plus Dateizustand werden geprueft — kein Grep gegen den Skriptquelltext).

Gemeinsame Fixture-Konventionen (aus `tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats`, `tests/spec/mcp-gateway/client-env-check.bats`):

- [ ] `setup()`: `REPO_ROOT` aus `BATS_TEST_DIRNAME`, `HEAL="$REPO_ROOT/scripts/mcp-gateway/token-drift-heal.sh"`, `mktemp -d` als `TMPD`, `FAKEHOME="$TMPD/fakehome"` mit `mkdir -p "$FAKEHOME/.config/bge-mcp" "$FAKEHOME/.config/mcp-postgres"`, `HOME`-Isolation per `env HOME="$FAKEHOME"` bei jedem `run` (echte `~/.config/*/server.env` werden nie angefasst).
- [ ] Fixture-Secrets: Live-Wert via `MCP_LIVE_SECRET_FILE` (oder gleichwertigem Fixture-Env aus p1) einspeisen, `server.env`-Fixture per `echo "BGE_MCP_TOKEN=$old" > "$FAKEHOME/.config/bge-mcp/server.env"`. Token-Werte nur in Dateien/Env, nie als erwarteter Output.
- [ ] Python-Fake-Server nach dem `client-env-check.bats`-Muster (`Bearer <expected> → 200`, sonst `401`, `HTTPServer` auf `127.0.0.1`, Poll-Wait statt festem Sleep, `teardown()` killt `SERVER_PID` und raeumt `TMPD`).
- [ ] Hooks/Stubs: Unit-Restart (`systemctl --user restart …`) und `scripts/mcp-sync.sh render` sowie `scripts/agent-msg.sh post` via PATH-Stubdir (`TMPD/bin/`) mocken, das Aufrufe in Marker-Files (`$TMPD/calls/render`, `$TMPD/calls/restart-<unit>`, `$TMPD/calls/agent-msg`) protokolliert; `PATH="$TMPD/bin:$PATH"` im `run`-Env.
- [ ] Assert-Stil: `run …`, dann `echo "$output"`, `[ "$status" -eq N ]`, `[[ "$output" == *"…"* ]]` fuer Key-Namen/Keywords; Token-Redaction immer als Negativ-Aussage `[[ "$output" != *"$token"* ]]` NACH einem Positiv-Anker im selben Test (T002356-M1). Keine nackte `!`-Pipeline als Negativ-Assertion (explizite `[ -z … ]` / `!=`-Form).

Tests (einer je Delta-Szenario, Reihenfolge: Positiv-Anker zuerst):

- [ ] T1a Match → no-op + exit 0 (Szenario „Fingerprints match"): Live-Wert und `server.env`-Wert identisch; `run … check`; `[ "$status" -eq 0 ]`; Positiv-Anker `[[ "$output" == *"match"* ]]` plus Key-Name im Output; kein Restart-Marker, kein Render-Marker, `server.env`-mtime unveraendert; Negativ: `[[ "$output" != *"$token"* ]]`.
- [ ] T1b Drift → Report nur mit Key-Namen, exit non-zero, keine Werte (Szenario „Fingerprints differ"): Fixture-Werte unterscheiden sich; `run … check`; `[ "$status" -ne 0 ]`; Positiv-Anker `[[ "$output" == *"drift"* ]]` und Key-Name (`BGE_MCP_TOKEN`) im Output; Negativ: weder Live- noch `server.env`-Wert im Output (`!=` gegen beide Werte).
- [ ] T1c Cluster-unreachable → skip + exit 0 + kein Heal (Szenario „Cluster unreachable"): kein Fake-Server / Live-Secret nicht lesbar (Exit-Pfad aus p1, z. B. fehlende Fixture-Datei oder unerreichbarer Port); `run … check`; `[ "$status" -eq 0 ]`; Positiv-Anker `[[ "$output" == *"skip"* ]]`; kein Restart-/Render-Marker, `server.env` unveraendert, kein Token-Wert im Output.
- [ ] T2a Drift → Full Heal (Szenario „Drift triggers full heal"): drifted Fixture-Key + gemockte Hooks; `run … heal`; `[ "$status" -eq 0 ]`; dann: Fixture-`server.env` enthaelt den neuen Wert (`grep -qF "$newvalue"`, Datei lesen ist hier zulaessig — es ist das Heal-ERGEBNIS, kein Source-Grep), Modus `600` (`[ "$(stat -c %a …)" = 600 ]`); Render-Marker existiert; betroffener Unit-Marker existiert (`restart-bge-mcp`); unbetroffene Unit-Marker existieren NICHT (`[ ! -f … ]` als explizite File-Assertion); Positiv-Anker Key-Name im Output; Negativ: kein Token-Wert (alt wie neu) im Output.
- [ ] T2b No-Drift → Heal ist Total-No-op (Szenario „No drift — heal is a no-op"): identische Fingerprints; `run … heal`; `[ "$status" -eq 0 ]`; kein Render-Marker, kein Restart-Marker, `server.env`-Checksumme (`sha256sum` vorher/nachher) unveraendert.
- [ ] T2c Heal notifiziert Harness-Restart (Szenario „Heal notifies"): drifted Fixture-Key; `run … heal`; `[ "$status" -eq 0 ]`; Positiv-Anker: `agent-msg`-Marker enthaelt den Key-Namen UND einen Restart-Hinweis (z. B. `restart`/`neustart`/`Harness` — Wortlaut aus p1-Implementierung, finales Keyword legt p1 fest, hier als `grep -qiF` gegen Marker-Datei).

## Task T3 — GREEN nach p1 + STRUCT3 Final Verification

- [ ] Guard-Suite gruen nach p1-Implementierung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/token-drift-auto-sync.bats
```

- [ ] Bestands-Guards im selben Spec-Slug bleiben gruen (Redaction-Nachbarn, keine Regression am bestehenden Sync):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/mcp-sync-drift-no-secret-leak.bats tests/spec/mcp-gateway/client-env-check.bats
```

- [ ] Finale Mandatory-Gates (STRUCT3 — dieser Task ist der letzte des Partials):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Test-Inventar: nach der Test-Aenderung `task test:inventory` regenerieren und `components/website/src/data/test-inventory.json` mitcommitten, falls der Inventar-Check es verlangt.
