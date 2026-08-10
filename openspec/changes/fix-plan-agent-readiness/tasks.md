# T002929: Plan-Agenten melden falsche Readiness-Flags

## Ziel
Plan-Agenten melden Readiness-Flags und Status korrekt an die DB zurück, sodass die gemeldeten Werte mit dem DB-Stand übereinstimmen.

## Tasks

### 1. Diskrepanz analysieren
- [ ] `scripts/vda/ticket/stage-plan.sh` — schreibt es alle Readiness-Flags korrekt?
- [ ] `scripts/ticket.sh plan-meta` — werden die Flags via JSONB-Merge gesetzt?

### 2. Fix
- [ ] Readiness-Flags nach stage-plan verifizieren (Read-After-Write-Check)
- [ ] Diskrepanz als Fehler melden, nicht stillschweigend übergehen

### Verify
- [ ] Nach `stage-plan`: `readiness.spec_skizziert = true` in der DB
- [ ] Plan-Agent-Rückmeldung stimmt mit DB überein
