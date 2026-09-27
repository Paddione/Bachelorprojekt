---
page: infrastructure-status
ticket: T900655
status: complete
actions:
  - Show current buffer git root
---

## Voraussetzungen

- Neovim is installed with the repo config, and the dashboard is open
  (see `home.md`).
- The current buffer is a file inside a Git checkout (the action needs a
  git-rooted buffer; see `lua/config/gitroot.lua`).

## Geordnete Schritte

1. From Home, select **Infrastructure** (chapter 8), then **Status**.
2. Select or focus the **Show current buffer git root** action (via the
   dashboard search or direct key selection).
3. Run the action as the separate, explicit step.

## Erwartetes Ergebnis

A notification shows the Git top-level directory of the buffer that was
current when the action ran, resolved through the buffer-based Git-root
function. Selecting or focusing the action beforehand runs nothing.

## Troubleshooting

- **Notification says "no project".** The buffer used to invoke the
  action is unnamed, not a file buffer, or outside any Git checkout; move
  to a real repo file first.
- **Page does not show the Status link.** Confirm `config.dashboard`
  loaded without error (`:messages`).

## Recovery

No state changes beyond a notification; nothing to roll back. For a
config-wide rollback, see `home.md`.
