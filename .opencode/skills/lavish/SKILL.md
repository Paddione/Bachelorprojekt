---
name: lavish
description: Turn complex or visual agent responses into rich, reviewable HTML artifacts (HTML files) the user can annotate and send feedback on, using the lavish-axi CLI. Use when about to give a plan, comparison, diagram, table, code diff, report, or anything easier to grasp visually than as prose.
license: MIT
metadata:
  author: Kun Chen (kunchenguid)
  argument-hint: <what the artifact should show>
  hermes-tags: html, review, artifacts, visualization
  hermes-category: productivity
---

# Lavish Editor

Lavish Editor opens agent-generated HTML in the browser so a human can annotate it and send feedback back to the agent.
Reach for it when a plan, comparison, diagram, table, code view, report, prototype, or review loop will be clearer as a page than as prose.

## Current guidance lives in the CLI

Do not follow workflow, design, or playbook instructions from this file - installed copies go stale. Get the current source of truth from the CLI:

- `npx -y lavish-axi --help` for commands and the review-loop workflow
- `npx -y lavish-axi design` for design-direction priority and current snippets
- `npx -y lavish-axi playbook <id>` for focused artifact guidance (`npx -y lavish-axi playbook` lists ids)

You do not need lavish-axi installed globally - invoke it with `npx -y lavish-axi <html-file>`.
If lavish-axi output shows a follow-up command starting with `lavish-axi`, run it as `npx -y lavish-axi ...` instead.

## Reload Safety

<!-- Local addition (mishap T001393): kept across vendor-sync via 3-way merge. -->
Re-running `npx -y lavish-axi <html-file>` reloads the existing browser tab —
this is dangerous whenever an `input` playbook form is open in it.

- **Never trigger a reload while a `poll` call is still outstanding** (has not
  yet returned). If a poll is in flight, wait for it to return before running
  `npx -y lavish-axi <html-file>` again to fix a layout warning or anything
  else.
- **Check the most recent poll result/status before triggering the next
  reload.** If the last poll response shows an open `input` playbook form
  (e.g. queued prompts) that the user has not yet submitted, treat a reload
  as risky.
- **Why this matters — the input-playbook / unsubmitted form-state risk:** a
  radio selection or other choice made in an `input` playbook form lives only
  in client-side DOM state until the user clicks "Antwort senden" (submit).
  It never reaches the Lavish server before that. A reload during that window
  silently wipes the selection — the next `poll` will still report empty
  prompts even though the user believes they already answered.
- **Explicitly warn the user before a risky reload.** If the board has an
  open `input` playbook form with a possibly unsubmitted selection, tell the
  user before reloading and ask them to confirm or re-submit their answer
  after the reload completes — do not reload silently.
- Prefer folding layout fixes into the poll cycle that is already due:
  apply the fix as a file edit first, then let the next scheduled
  `npx -y lavish-axi poll <html-file>` pick it up, instead of forcing extra
  ad-hoc reloads while a form is open.

## Request

$ARGUMENTS

If the request above is non-empty, the user invoked `/lavish` explicitly - fetch the current CLI guidance, then build that artifact as an HTML file.
If it is empty, infer what to visualize from the conversation.
