---
title: "ticket-lifecycle-hardening — Implementation Plan"
ticket_id: T015014
domains: [website, tickets, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-lifecycle-hardening — Implementation Plan

_Ticket: T015014 (Batch-Parent) · Kinder: T015009 (Löschpfad/Audit), T015010 (Closure-Matching).
T015011 läuft separat über PR #5142 und ist hier out of scope._

Incident T015005: `cleanupEphemeral()` löschte blind `status='planning'`-Zeilen (T014936 starb),
DELETE war auditfrei, und die Post-Merge-Closure matchte die wiederverwendete external_id auf das
falsche Ticket. Root-Cause-Evidenz: Ticketkommentar T015009 vom 2026-08-23.

## File Structure

```
components/website/src/lib/planning-office.ts            # EDIT: createIdea-Origin-Marker + cleanupEphemeral-Marker-Filter
components/website/src/lib/tickets/tables/tickets.ts     # EDIT: fn_audit_log DELETE-Zweig + Trigger OR DELETE
scripts/factory/auto-close-merged.sh                     # EDIT: ticket_corroborates() + Korroboration vor Closure
components/website/src/lib/planning-office.test.ts       # TEST: Marker-/Survival-Cases (pg-mem, echte DML)
tests/spec/software-factory/closure-id-reuse-guard.bats  # TEST: Korroborationseinheit (RED im Stage-Commit)
```

Disjunkte Partials (D1): keine Datei in zwei Partials. Der BATS-Guard liegt im
Stage-Commit bei und ist gegen den ungefixten Stand rot verifiziert.

## Partial P1 — p1-planning-office (`components/website/src/lib/planning-office.ts`)

- [ ] **P1.1 Origin-Marker setzen.** `createIdea()` (Zeile 85): den hartkodierten
      Readiness-Wert `'{}'::jsonb` durch einen parametrisierten JSONB ersetzen, der
      `"origin": "idea-generator"` trägt (`$8::jsonb`, Wert `JSON.stringify({origin:'idea-generator'})`).
      Der Marker muss `patchItem`-Readiness-Merges überleben (JSONB-Merge erhält fremde Keys — kein Zusatzcode nötig).

- [ ] **P1.2 cleanupEphemeral eingzäunen.** `cleanupEphemeral()` (Zeile 193): das DELETE um
      `AND readiness->>'origin' = 'idea-generator'` erweitern. Kommentar am Funktionkopf auf den
      neuen Vertrag umstellen (nur noch Ursprungs-markierte Ideen, nie blinde Status-Löschung).

## Partial P2 — p2-closure-audit (`scripts/factory/auto-close-merged.sh`, `components/website/src/lib/tickets/tables/tickets.ts`)

- [ ] **P2.1 Korroborationseinheit.** In `auto-close-merged.sh` eine reine Funktion ergänzen:

```bash
# ticket_corroborates <head_branch> <pr_num> <plan_ref> <linked_prs>
# 0 = PR gehört zu dieser Ticket-Zeile (plan_ref-Branch gleich ODER expliziter PR-Link)
ticket_corroborates() {
  local head_branch="$1" pr_num="$2" plan_ref="$3" linked_prs="$4"
  local ref_branch
  ref_branch="$(printf '%s' "$plan_ref" | grep -oE 'branch=[^ ]+' | head -1 | sed 's/^branch=//')"
  [[ -n "$ref_branch" && "$ref_branch" == "$head_branch" ]] && return 0
  printf '%s\n' "$linked_prs" | grep -qx "$pr_num" && return 0
  return 1
}
```

- [ ] **P2.2 Lookup erweitern.** Das per-Ticket-SQL (Zeile 165) holt zusätzlich `plan_ref`
      sowie verknüpfte PR-Nummern (`SELECT pr FROM tickets.ticket_links WHERE ticket_id=t.id AND kind='pr'`,
      als Zeilenliste). Vor dem `update-status`: `ticket_corroborates "$branch" "$pr_num" "$plan_ref" "$linked_prs"`
      — bei rc≠0 Warnung `id-reuse-suspected` (mit Ticket-ID + beiden Branchen) auf stderr und `continue`
      statt Closure. Dry-Run-Pfad gibt den Skip analog aus.

- [ ] **P2.3 DELETE-Audit.** In `fn_audit_log()` (tickets.ts, Zeile 408) nach dem INSERT-Zweig einen
      DELETE-Zweig ergänzen: `INSERT INTO tickets.ticket_activity (ticket_id, actor_id, actor_label,
      field, old_value) VALUES (OLD.id, …, '_deleted', to_jsonb(OLD)); RETURN NULL;`.
      Trigger-DDL (Zeile 448) auf `AFTER INSERT OR UPDATE OR DELETE` erweitern.

## Partial P3 — p3-tests (Tests-Rolle, STRUCT2)

- [ ] **P3.1 Failing-Test-Step (RED).** Der Guard
      `tests/spec/software-factory/closure-id-reuse-guard.bats` liegt dem Stage-Commit bei und ist
      dort rot verifiziert (Funktion `ticket_corroborates` existiert vor P2 nicht):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/closure-id-reuse-guard.bats
# expected: FAIL (red — Korroborationseinheit fehlt vor P2; 4 Tests schlagen zuverlässig fehl)
```

- [ ] **P3.2 Vitest-Cases.** In `components/website/src/lib/planning-office.test.ts` (pg-mem,
      echte DML) ergänzen: (a) `createIdea` setzt `readiness->>'origin'='idea-generator'`;
      (b) direkt eingefügte planning/unpinned-Zeile OHNE Marker überlebt `cleanupEphemeral()`;
      (c) markierte ungepinnte Idee wird gelöscht, gepinnte bleibt (Bestandstest bleibt grün).

- [ ] **P3.3 GREEN-Nachweis.** Nach P1/P2 müssen beide Suiten grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/closure-id-reuse-guard.bats
(cd components/website && pnpm vitest run src/lib/planning-office.test.ts)
```

- [ ] **P3.4 Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
