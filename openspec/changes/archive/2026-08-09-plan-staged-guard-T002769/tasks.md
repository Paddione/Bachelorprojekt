# T002769 — plan_staged-Guard in mishap.go

> **Type:** fix | **Severity:** trivial | **Effort:** klein

## File Structure

| File | Role |
|------|------|
| `scripts/ticket-mcp/go/internal/tools/mishap.go` | Status-Änderung in `buildFactoryFixTicketArgs()` |
| `scripts/ticket-mcp/go/internal/tools/mishap_test.go` | Test-Erwartung anpassen + neuer Negativ-Test |

## Tasks

### 1. Failing Test schreiben (Rot)

- [ ] `TestFactoryFixTicketArgs_PlanStaged` → `TestFactoryFixTicketArgs_NotPlanStaged`: Erwartung
      von `--status plan_staged` auf `--status triage` ändern
- [ ] Neuer Test: `TestFactoryFixTicketArgs_NeverUsesPlanStaged`: assertet, dass factory fix
      tickets NIE `--status plan_staged` verwenden

### 2. Code fixen (Grün)

- [ ] `mishap.go:175`: `"--status", "plan_staged"` → `"--status", "triage"`
- [ ] `mishap.go:200-208`: DoR-Flag-Setting entfernen (war nur für plan_staged-Lane-Autoenqueue
      nötig; triage-Tickets brauchen keine 4/4 DoR zum Start)

### 3. Verifikation

- [ ] `cd scripts/ticket-mcp && go test ./internal/tools/ -run 'FactoryFix' -v`
- [ ] `go build ./...` in `scripts/ticket-mcp/` (keine Kompilationsfehler)

### 4. Recovery: Betroffene Tickets bereinigen

- [ ] T002767–T002774 (8 Tickets ohne Plan, plan_staged) auf `triage` zurücksetzen
- [ ] Je einen Kommentar anhängen: "T002769: plan_staged ohne Plan — auf triage zurückgesetzt
      (Root-Cause-Guard jetzt aktiv)"

## Test Strategy

- **Positiv-Anker:** `buildFactoryFixTicketArgs` erzeugt `--type fix` und `--status triage`
- **Negativ-Anker:** Kein `--status plan_staged` in factory fix args
- **Regression:** Rollup-Container-Tests (`TestRollupCreateArgs_StatusIsPlanStaged`,
  `TestRollupFindArgs_UsesChoreAndPlanStaged`) bleiben unverändert
