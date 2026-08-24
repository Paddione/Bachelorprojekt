---
title: "consolidate-sessions-specs — Implementation Plan"
ticket_id: T016250
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# consolidate-sessions-specs — Implementation Plan

_Ticket: T016250_

## File Structure

```
openspec/specs/sessions-server.md          (MODIFIED: BATS-Coverage-Requirement, Annotations)
openspec/specs/active-sessions-hub.md      (MODIFIED: Purpose, Registry-Requirement schlank, tunnel_pid raus)
tests/spec/sessions-server/register-list.bats        (NEU)
tests/spec/sessions-server/deregister-reap.bats      (NEU)
tests/spec/sessions-server/form-lifecycle.bats       (NEU: start-form/regen)
tests/spec/sessions-server/annotation-links.bats     (NEU: Guard — bats:-Annotationen resolven)
openspec/changes/consolidate-sessions-specs/**       (dieser Change)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Guard-Test schreiben, der prüft, dass jede
      `<!-- bats: … -->`-Annotation in `openspec/specs/sessions-server.md` auf eine
      existierende Datei resolvt. Er muss am aktuellen Stand scheitern
      (`session-hub.bats` existiert nicht). Use the phrase `expected: FAIL`
      in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sessions-server/annotation-links.bats
# expected: FAIL (red — die referenzierte Datei tests/spec/session-hub.bats existiert nicht)
```

- [ ] **Fix-Step (GREEN).** Spec-Text konsolidieren (Duplikate aus
      active-sessions-hub.md entfernen, Purpose reparieren, tunnel_pid streichen),
      Annotationen auf die neuen Suiten umbiegen, behavioral BATS-Suites unter
      `tests/spec/sessions-server/` ergänzen (Output-Verifikation mit
      `SESSION_HUB_REGISTRY`-Fixture und `SESSION_HUB_NO_TUNNEL=1`). Der
      RED-Test aus dem vorherigen Schritt muss jetzt bestehen; alle neuen
      Suiten müssen grün sein:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sessions-server*
bash scripts/openspec.sh validate consolidate-sessions-specs
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
