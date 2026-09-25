---
title: "lobby-template-apply — Fix Plan"
ticket_id: T900361
domains: [brett]
status: planned
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# lobby-template-apply — Implementation Plan

_Ticket: T900361 — Lobby preset selection shows no figures. Root cause: two
breaks in the manual board-template path (client handler never wired,
server type missing from ADMIN_TYPES). Rationale: ticket description;
decisions: `design.md`; contract delta: `specs/brett.md`._

## File Structure

- `components/brett/src/server/ws-handler.ts` — add
  `admin_set_board_template` to `ADMIN_TYPES` (gate routes to
  `handleAdminMessage`).
- `components/brett/src/client/main.ts` — wire `onSetBoardTemplate`
  (leiter-gated) in `renderLobby`, sending `{ type:
  'admin_set_board_template', boardTemplateId }`.
- `components/brett/src/server/ws-admin-commands.ts` — send sender error
  `{ type: 'error', reason: 'unknown-board-template' }` on unresolvable id.
- `components/brett/src/client/ws-client.ts` — map
  `unknown-board-template` to toast `Vorlage nicht gefunden.`
- `tests/spec/brett.bats` — T900361 (a)–(d) (already added, RED).

## RED (failing test first — expected: FAIL)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
# expected: FAIL — tests 39–42 (T900361 a–d) fail on the unfixed tree
```

## Fix steps

1. **Server gate:** add `'admin_set_board_template'` to `ADMIN_TYPES`
   in `components/brett/src/server/ws-handler.ts` (existing
   Keycloak-admin-OR-leiter gate applies, no new auth logic).
   Verify: T900361 (a) green.
2. **Client wiring:** add `onSetBoardTemplate` entry in `renderLobby`
   (`components/brett/src/client/main.ts`), gated on `isLeader` like
   `onSetTemplate`/`onSetOptik`, calling `ws.sendClient({ type:
   'admin_set_board_template', boardTemplateId: id })`.
   Verify: T900361 (b) green.
3. **Sender feedback:** in the `admin_set_board_template` case
   (`components/brett/src/server/ws-admin-commands.ts`), send
   `{ type: 'error', reason: 'unknown-board-template' }` to the sender
   when the id is not a string or the template is missing (replacing the
   silent return / silent no-op).
   Verify: T900361 (c) green.
4. **Client toast:** map reason `unknown-board-template` to
   `showExportToast('Vorlage nicht gefunden.', 'error')` in
   `components/brett/src/client/ws-client.ts` (generic error branch
   `ws-client.ts:463–469` exists).
   Verify: T900361 (d) green + full file GREEN (42 ok).
5. **Manual browser check (leiter):** select each system scenario in the
   lobby dropdown → staged figures appear; invalid id → error toast.

## Verify

```bash
npm run typecheck --prefix components/brett && npm test --prefix components/brett
tests/unit/lib/bats-core/bin/bats tests/spec/brett.bats
task freshness:regenerate && task test:changed && task freshness:check
```
