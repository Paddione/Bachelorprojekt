# ticket-mcp-freshness-guard-t014735 — Implementation Plan

_Ticket: T014735_ · Domänen: ci, scripts · Aufwand: klein

## Task List

- [ ] **Version einbetten.** `scripts/ticket-mcp/go/Makefile`: Build-Ziel um
      `-ldflags "-X main.buildSHA=$(shell git rev-parse --short HEAD)"` erweitern.
      `cmd/ticket-mcp/main.go`: `var buildSHA = "unknown"` + `--version`-Flag
      (druckt `ticket-mcp-go <buildSHA>` und beendet mit Exit 0, vor `flag.Parse()`-Rest).
- [ ] **Guard-Skript.** `scripts/ticket-mcp/freshness-check.sh`:
      - Binary fehlt → `echo skip` + Exit 0
      - `--version`-Output ohne Sha-Pattern → stale melden + Exit 1
      - Sha ≠ `git log -1 --format=%h -- scripts/ticket-mcp/go` → Differenz melden
        (beide Shas + Alter des installierten Builds) + Exit 1
      - Gleich → grün + Exit 0
      - Nicht in einem Git-Repo (Worktree-Kante) → Skip mit Notiz
- [ ] **Task einhängen.** Taskfile: `ticket-mcp:freshness` (desc, cmds ruft das
      Skript); in `freshness:check` als letzten Schritt warn-only integrieren
      (Exit-Code abfangen, sichtbare Notiz), damit CI-Grün nicht an der lokalen
      Binär-Lage hängt — der harte Fail bleibt im Direktaufruf des Tasks.
- [ ] **Guard-BATS.** `tests/spec/ci-cd/ticket-mcp-freshness-guard.bats`:
      1. Makefile enthält ldflags-X-Einbettung (REGRESSION)
      2. Guard-Skript: fehlendes Binary → Exit 0 (FIXTURE: leerer TMPDIR-Pfad)
      3. Guard-Skript: Sha-Differenz → Exit 1 (FIXTURE: Fake-Binary mit falschem Sha)
      4. freshness:check ruft den Guard auf (GREP-Assertion)

## Verify

- [ ] `make -C scripts/ticket-mcp/go build && ./scripts/ticket-mcp/ticket-mcp-go --version`
      zeigt den aktuellen Short-Sha
- [ ] BATS 4/4 grün
- [ ] `task ticket-mcp:freshness` lokal: nach frischem Build grün; nach simuliertem
      Touch an scripts/ticket-mcp/go (leerer Commit-Bereich) rot mit verständlicher Meldung
- [ ] `task freshness:check` bleibt grün, auch wenn das installierte Binary stale ist
      (warn-only-Notiz sichtbar)
