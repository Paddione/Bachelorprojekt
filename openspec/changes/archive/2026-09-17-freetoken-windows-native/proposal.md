# Proposal: freetoken-windows-native

## Why

FreeToken running natively on Windows provides local GPU inference. Previously, manual setups failed due to unexpanded environment paths, wrong Python versions (3.11 instead of cp312), or lack of automatic startup on logon. Furthermore, the local LLM proxy required proper recognition of `kind='freetoken'` as a local backend, request body fixups for thinking toggle aliases (`-thinking` and `-fast`), and registration of the `freetoken-local` backend in the `tickets.llm_proxy_backends` database table.

## What

- **`scripts/llm/install-freetoken.ps1`**: Automated PowerShell installation script for Windows native FreeToken (Python 3.12 pinned, torch cu130, wheel verification in `%USERPROFILE%\Downloads\ft-wheels`).
- **`scripts/llm/freetoken-autostart.ps1`**: PowerShell management script to register, unregister, or check status of the `FreeToken-Serve` Windows ScheduledTask triggered at logon.
- **`scripts/migrations/2026-09-16-llm-proxy-freetoken-backend.sql`**: Database migration to update `llm_proxy_backends_kind_check` constraint to allow `freetoken`, and insert/update `freetoken-local` backend with `kind='freetoken'`, `max_inflight=1`, and `freetoken-thinking` fixup.
- **`scripts/llm-proxy/discovery.mjs`**: Include `'freetoken'` in `LOCAL_BACKEND_KINDS` so requests marked `x-llm-local-only: 1` recognize FreeToken as a valid local backend.
- **`scripts/llm-proxy/fixups.mjs`**: Add `freetoken-thinking` fixup mapping model alias suffixes (`-thinking` -> `enable_thinking: true`, `-fast` -> `enable_thinking: false`).
- **`scripts/llm-proxy/fixups.test.mjs` & `local-only.test.mjs`**: Unit tests verifying `freetoken-thinking` fixup and local backend recognition.

_Ticket: T900189_
