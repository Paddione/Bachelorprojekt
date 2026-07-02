---
name: lavish
description: Turn complex or visual agent responses into rich, reviewable HTML artifacts the user can annotate and send feedback on, using the lavish-axi CLI. Use when about to give a plan, comparison, diagram, table, code diff, report, or anything easier to grasp visually than as prose - but only after the user has agreed to it; see the consent gate below before opening a browser session.
argument-hint: <what the artifact should show>
author: Kun Chen (kunchenguid)
metadata:
  hermes:
    tags: [html, review, artifacts, visualization]
    category: productivity
---

# Lavish Editor

Lavish Editor helps agents turn rich HTML artifacts into collaborative human review surfaces. Whenever you are about to give the user a complex response that will be easier to understand via a rich / interactive page, consider using Lavish Editor — but confirm with the user first (see the consent gate below) unless they already asked for this format explicitly. Once you have buy-in, generate an interactive HTML artifact according to the user's request, then run `npx -y lavish-axi <html-file>` so the user can visually review it, annotate elements or selected text, queue prompts, and send feedback back through `npx -y lavish-axi poll`.

You do not need lavish-axi installed globally - invoke it with `npx -y lavish-axi <html-file>`.
If lavish-axi output shows a follow-up command starting with `lavish-axi`, run it as `npx -y lavish-axi ...` instead.

## Request

$ARGUMENTS

If the request above is non-empty, the user invoked `/lavish` explicitly - build an HTML artifact for that request now, following the workflow below.
If it is empty, infer what to visualize from the conversation.

## When to use

Use lavish-axi when the user asks for a visual artifact, HTML explainer, interactive prototype, review surface, product or technical plan, comparison, report, or browser-based feedback loop. Everything else in this skill (playbooks, design-system lookup, poll loop) only fires after the consent gate below has been cleared.

## Consent gate — get explicit buy-in before building

Opening a Lavish session starts a real browser tab and a background server on the user's machine. That is a side effect, not just a formatting choice, so **never invoke `npx -y lavish-axi ...` or start writing the HTML artifact until the user has actually agreed to it.**

- **Already consent** (skip the gate, proceed straight to Workflow): the user typed `/lavish`, or their message explicitly names an artifact, HTML page, Lavish, an interactive/reviewable surface, or otherwise directly asks for this format.
- **Not yet consent** (gate required): you decided on your own that a plan, comparison, diagram, table, or report from the current task "would be easier to grasp visually." A good idea for you is not the same as buy-in from the user.
- When the gate applies, ask a single short, concrete question before doing any Lavish work — e.g. "Soll ich das als interaktives Lavish-Artefakt statt als Text aufbereiten?" Use `AskUserQuestion` if the harness has it, otherwise ask in plain text and wait for the reply.
- If the user declines, doesn't respond affirmatively, or the ask would be disruptive mid-task, fall back to a normal prose/markdown response instead — do not silently build the artifact anyway.
- One confirmation covers the whole build → poll → feedback cycle for that artifact; don't re-ask on every poll iteration or layout fix.

## Workflow

1. Gather the concrete information the artifact will show *before* writing any HTML: read the actual files, diffs, logs, query results, or tool output involved — never fabricate placeholder content or numbers you haven't verified. Use whatever tools the task already calls for (Read/Grep, `git diff`, MCP queries, kubectl, etc.) to pull real data first, then shape it into the artifact.
2. Create the HTML artifact (default location `.lavish/<name>.html` in the working directory).
3. Before the first run in a session, confirm the CLI is actually reachable: `npx -y lavish-axi --help`. If it fails (no network, npx blocked, package unavailable), don't retry silently — tell the user Lavish isn't available right now and fall back to a normal response.
4. Run `npx -y lavish-axi <html-file>` to open or resume a review session in the browser. If the user ended a prior session for this file from the browser, this refuses to reopen it and explains why — don't force it with `--reopen` unless the user asks for further review or something important needs their visual attention; that refusal is itself a consent signal, not a bug to route around.
5. Run `npx -y lavish-axi poll <html-file>` to long-poll for the user's annotations, queued prompts, and browser-reported `layout_warnings`.
   The poll stays silent until the user acts or the real browser reports fresh layout warnings - leave it running, never kill it.
   If your harness limits how long a foreground command may run, run the poll as a background task; if it gets killed or times out anyway, just re-run it - queued feedback is never lost.
   When poll reports the session ended, stop polling and do not reopen it uninvited — deliver remaining updates in the conversation instead.
6. If poll returns `layout_warnings`, fix and re-check the fresh error-severity ones before involving the human; if every current warning is persistent or low-severity, proceed with a note instead of looping.
7. Apply human feedback, then poll again with `--agent-reply "<message>"` to reply in the browser and keep the loop going.
8. Run `npx -y lavish-axi end <html-file>` when the review is finished.

## Visual guidance

- Use visual hierarchy to make the most important decisions, risks, tradeoffs, and next actions obvious at a glance
- Use visual structure such as sections, cards, tables, diagrams, annotated snippets, and side-by-side comparisons instead of long prose
- Choose typography, spacing, color, and layout deliberately so the artifact has a clear point of view
- Prevent horizontal overflow at every nesting level: nested grid/flex children also need minmax(0, 1fr) tracks and min-width: 0, especially when badges, labels, or status text use wide pixel or monospace fonts; wrap, truncate, or contain long unbreakable text deliberately
- When the artifact would describe existing or current UI or state, show it instead of describing it: capture screenshots of the real pages (run the app read-only if needed, e.g. via the chrome-devtools skill) and embed them, rather than explaining the current look in prose; reserve prose for what can't be shown, such as rationale, trade-offs, and open questions

## Playbooks

Run `npx -y lavish-axi playbook <id>` for focused, detailed guidance on any of these.
One artifact often combines several playbooks (for example a plan that includes a comparison and a diagram), so MUST open each matching playbook before writing HTML.
For flows, architecture, state, or sequence diagrams, do not hand-build boxes-and-arrows from div/flexbox; open the diagram playbook and use Mermaid unless SVG is needed for richly annotated nodes.

- `diagram` - Map relationships, flows, state, and architecture
- `table` - Turn dense records into scan-friendly review surfaces
- `comparison` - Show options, tradeoffs, and current vs target behavior
- `plan` - Explain a product or technical plan before implementation
- `code` - Render source code, code files, patches, PR diffs, and before/after code inside Lavish artifacts
- `input` - Must be used when the agent needs to collect user input on decisions, choices, preferences, triage, scope, or other structured feedback from within the artifact
- `slides` - Create a deliberate presentation when slides are requested

## Reload Safety

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

## Commands & rules

- Run `npx -y lavish-axi <html-file>` to open or resume a Lavish Editor session
- Unless the user specifies another location, create HTML artifacts in the current working directory under `.lavish/`
- Lavish serves the html file through a local express.js server. If your html needs to reference other filesystem assets such as images, CSS, fonts, and local scripts, copy them into the same directory as the HTML file, then reference them with relative paths from that directory. Never prepend `/` to those asset paths - root paths won't work
- Run `npx -y lavish-axi poll <html-file>` to wait for user feedback or browser-reported layout_warnings. It long-polls and stays silent until the user sends feedback, ends the session, or the real browser reports fresh layout_warnings, so leave it running - never kill it. Fix layout_warnings before involving the human. If your harness limits how long a foreground command may run, run the poll as a background task; if it gets killed or times out anyway, just re-run it - queued feedback is never lost
- Run `npx -y lavish-axi end <html-file>` to end a session as the agent - the session can still be reopened plainly afterwards. If the user ends it from the browser instead, a later open refuses to reopen without `--reopen` (see Workflow step 4) - respect that instead of forcing it back open
- Run `npx -y lavish-axi export <html-file> [--out <path>]` to write a portable, standalone copy with local assets inlined - no Lavish server or sibling files needed to open it. Remote CDN/font references stay as links and need network to render. Offer this when the user wants to keep or share the artifact outside the live review loop
- Run `npx -y lavish-axi share <html-file> [--password <pw>]` to publish the artifact on the third-party host ht-ml.app and get a visitable URL. **Shares are PUBLIC by default** - always pass `--password` for anything sensitive, and confirm with the user before publishing since this sends the artifact's content to a service outside this repo
- Run `npx -y lavish-axi stop` to shut down the background server (it also self-stops when idle or after the last session ends with nothing connected)
- Run `npx -y lavish-axi playbook <playbook_id>` for focused artifact guidance. One artifact often combines several playbooks (for example a plan that includes a comparison and a diagram), so MUST open each matching playbook before writing HTML.
- Lavish does not auto-inject any design system - artifacts stay portable so they render identically when opened directly without lavish-axi running. Before writing any HTML, decide the design direction in this strict priority order, and only move to the next step when the current one truly yields nothing: (1) if the user asked for a specific look or named design system, use that; (2) otherwise you must first inspect the project the artifact is about - the subject or product whose content or UI it represents, which may differ from your current working directory - and match that project's design system: Tailwind or theme config, shared CSS variables or design tokens, component library, brand assets, or existing styled pages. If the artifact previews, proposes, or mocks a specific app's UI, render it in that app's own design system so it faithfully shows the product, even when you are running in a different repo; (3) only when both steps come up empty, use the Lavish-recommended Tailwind CSS browser runtime v4 + DaisyUI v5, available via CDN - run `npx -y lavish-axi design` for a content-to-playbook router, a copy-pasteable CDN snippet, a Mermaid CDN snippet/init for diagrams, and the DaisyUI component reference, and prefer the Tailwind/DaisyUI CDN snippet over hand-writing styles unless explicitly instructed otherwise by the user. When you deliver the artifact, state which of the three design sources you used and why.
- Use lavish-axi when the user asks for a visual artifact, HTML explainer, interactive prototype, review surface, product or technical plan, comparison, report, or browser-based feedback loop
