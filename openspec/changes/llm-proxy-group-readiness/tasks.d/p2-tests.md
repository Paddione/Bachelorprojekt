# p2 — BATS-Tests für Gruppen-Readiness (Tests-Rolle)

## Ziel

BATS-Tests decken die exclusiveGroup-Aggregation ab. Diese Partial ist die
Tests-Rolle — IMMER zuletzt, nach p1.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-proxy/group-readiness.bats
# expected: FAIL (red — Gruppe gilt noch nicht als healthy)
```

## Steps

1. **Sammel-Testdatei.** `tests/spec/llm-proxy/group-readiness.bats`:
   - `group healthy`: mehrere chat-gpu-Loadouts (exclusiveGroup), eines healthy → ready=true
   - `group all down`: kein Mitglied der Gruppe healthy → ready=false, degraded nennt Gruppe
   - `cloud fallback alone`: nur Cloud (priority>1) healthy → ready=false
   - `no primary`: kein priority=1-Backend → ready=false
   - `mixed groups`: zwei Gruppen, je ein healthy Mitglied → ready=true

2. **Delta-Spec-Finalisierung.** `openspec/changes/llm-proxy-group-readiness/specs/local-llm-proxy.md`
   gegen die implementierte Aggregation abgleichen.

3. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/llm-proxy/group-readiness.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle Testblöcke grün (Gruppen-Aggregation implementiert).
- Kein vakues Bestehen (jeder Fall hat echten Negativ- und Positiv-Pfad).
