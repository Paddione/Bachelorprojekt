---
title: "freetoken-windows-native — Implementation Plan"
ticket_id: T900189
domains: [ops, sdlc]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freetoken-windows-native — Implementation Plan

_Ticket: T900189_

## File Structure

- `scripts/llm/install-freetoken.ps1` (new: automated FreeToken installation script for Windows with Python 3.12, PyTorch cu130, wheel checks)
- `scripts/llm/freetoken-autostart.ps1` (new: Windows ScheduledTask manager for FreeToken-Serve at logon)
- `scripts/migrations/2026-09-16-llm-proxy-freetoken-backend.sql` (new: SQL migration inserting freetoken-local into tickets.llm_proxy_backends and updating check constraint)
- `scripts/llm-proxy/discovery.mjs` (mod: add 'freetoken' to LOCAL_BACKEND_KINDS)
- `scripts/llm-proxy/fixups.mjs` (mod: add freetoken-thinking fixup handling -thinking and -fast aliases)
- `scripts/llm-proxy/fixups.test.mjs` (mod: unit tests for freetoken-thinking fixup)
- `scripts/llm-proxy/local-only.test.mjs` (mod: unit tests for freetoken local backend recognition)

## Tasks

### Task 1 — Unit Tests (RED → GREEN)
- [x] Write and run unit tests for `freetoken-thinking` fixup in `scripts/llm-proxy/fixups.test.mjs` and `isLocalBackend` in `scripts/llm-proxy/local-only.test.mjs`.
  ```bash
  node --test scripts/llm-proxy/fixups.test.mjs scripts/llm-proxy/local-only.test.mjs
  ```

### Task 2 — Implementation of Proxy Fixups & Discovery
- [x] Update `scripts/llm-proxy/discovery.mjs` to include `'freetoken'` in `LOCAL_BACKEND_KINDS`.
- [x] Update `scripts/llm-proxy/fixups.mjs` with `freetoken-thinking` fixup to inject `chat_template_kwargs.enable_thinking`.

### Task 3 — Windows Install and Autostart Scripts
- [x] Create `scripts/llm/install-freetoken.ps1` with Python 3.12 validation, PyTorch cu130 installation, wheel checks, and CUDA validation.
- [x] Create `scripts/llm/freetoken-autostart.ps1` to register, unregister, or check status of ScheduledTask `FreeToken-Serve`.

### Task 4 — Database Migration
- [x] Create `scripts/migrations/2026-09-16-llm-proxy-freetoken-backend.sql` to expand `llm_proxy_backends_kind_check` and register `freetoken-local`.

### Task 5 — Final Verification
- [x] Run local proxy spec tests:
  ```bash
  bash tests/bats tests/spec/local-llm-proxy.bats
  ```
- [x] Run local dev spec tests:
  ```bash
  bash tests/bats tests/spec/llm-local-dev.bats
  ```
