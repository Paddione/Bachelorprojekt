# Mentolder-Assistent — Help Widget Redesign

**Date:** 2026-05-08
**Scope:** `website/src/components/HelpPanel.svelte`, `website/src/lib/helpContent.ts`, mounting in `AdminLayout.astro` + `PortalLayout.astro`, plus a new `/api/assistant/*` surface and a `NudgeEngine`.

---

## Problem

The current `HelpPanel.svelte` is a static slide-over keyed off a section ID, fed by 508 lines of hardcoded German copy in `helpContent.ts`. Last content change: 2026-04-15 (3 weeks ago) — already drifting from features that have shipped since (live cockpit, unified tickets, dashboard redesign, portal sidebar redesign).

Two failure modes:

1. **Stale content.** Static text can't keep up with feature work. Anything that referenced Stripe/booking/Mattermost/InvoiceNinja is wrong now. Even when fresh, the copy describes UI rather than answering live questions ("how many meetings need finalizing today" — it can't).
2. **Passive trigger.** The "?" icon at bottom-left requires a click. The primary admin user (the coach) is regularly distracted across multiple tools and rarely clicks. The icon is essentially invisible to him.

---

## Decisions Made

| Question | Decision |
|---|---|
| Direction | Conversational help (not proactive-only, not always-visible bar, not inline coachmarks) |
| Agency level | Explain + Act with confirmation — every write goes through an approval card |
| Presence | Reactive icon + proactive speech bubbles (icon stays the default surface) |
| Input modality | Text + Push-to-Talk (Whisper for STT, already in cluster) |
| Output modality | Text only (no TTS in v1) |
| Wake-word | Out — push-to-talk only |
| Nudge style | Speech bubble popping out of the icon, with 1–2 inline action buttons |
| Nudge triggers | Morning briefing (1×/day) · Live events · Error rescue. **Not** triggered by mere navigation. |
| Profiles | Both `admin` and `portal` ship in v1 — same component, two configurations |
| Tonality | Casual "du", warm, brief sentences — same voice as existing site copy |
| Backend | User's call (intentionally out of this spec) |

---

## The Widget (three states)

The widget replaces `HelpPanel.svelte` with `AssistantWidget.svelte` mounted in both `AdminLayout` and `PortalLayout`. It has three visible states:

### 1. Idle

A floating circular icon in the bottom-right corner (40 px). Persistent across all admin/portal pages.

**Position change vs today:** the current `HelpPanel` icon sits bottom-**left**. The new widget moves it to bottom-**right** — the standard place for chat affordances (Intercom, Crisp, etc.). The right side is also less crowded in the existing portal/admin layouts and reads more clearly as "talk to me" rather than "look up docs".

### 2. Speech bubble (proactive)

Pops out of the icon on a trigger. Contains:

- A short headline (assistant name + key fact, e.g. *"3 Meetings warten auf Finalisierung"*)
- A one-sentence offer (*"Soll ich dir die offenen Meetings einzeln durchgehen?"*)
- 1–2 inline buttons — primary action and a "Später" / dismiss

Behavior:

- Pulses a subtle ring around the icon for ~2 s when first appearing
- Stays visible until acknowledged or 8 s without interaction → shrinks back to a small dot indicator on the icon
- Multiple pending nudges queue; only one bubble visible at a time, dot indicator shows there are more
- Clicking the bubble opens the chat panel with the bubble's content as a kickoff message

### 3. Chat panel (on click)

Bottom-right floating box, 290–320 px wide × ~360 px tall (mobile: full-width drawer from bottom). Components:

- **Header:** assistant name ("Mentolder-Assistent" with a `✦` glyph), close button
- **Body:** scrolling message list — user messages right-aligned (gold-tinted), assistant left-aligned (sage/dark), plus inline confirmation cards for any write action
- **Input row:** text field + push-to-talk mic button on the right. Holding the mic button records audio (Web Audio API), releasing sends to Whisper STT and inserts the transcript as a normal user message. Visual recording indicator (red pulse) while held.

The chat is per-user, persistent across page loads (history stored server-side).

---

## Profiles: admin vs portal

One component, two profiles selected by route. Layouts pass `profile="admin"` or `profile="portal"` as a prop.

### Admin profile (the coach)

**Triggers:**

- **Morning briefing** — first dashboard visit per calendar day → bubble: *"Heute: N Termine, M Meetings warten auf Finalisierung. Durchgehen?"*
- **Live: term in 5 min** — meeting starts in ≤ 5 min → bubble with "Jetzt beitreten" button
- **Live: new Fragebogen** — client just submitted → bubble with "Antwort sehen"
- **Live: payment received** — invoice paid → bubble with "Quittung versenden"
- **Error rescue** — any admin API call returns ≥ 400 → bubble explains in plain German and offers a fix

**Action whitelist (write actions, all require confirmation card):**

- Finalize meeting (attach transcript, send follow-up suggestion)
- Send invoice (existing draft) / mark invoice paid
- Resolve / archive ticket
- Schedule follow-up appointment for a client
- Add note to a client record

**Knowledge scope:** all admin data — clients, meetings, tickets, billing, transcripts, KPIs.

### Portal profile (clients)

**Triggers:**

- **First-login onboarding** — first portal session ever → bubble: *"Willkommen — willst du, dass ich dir kurz dein Portal zeige?"* Replaces the static `onboarding` section.
- **Signature waiting** — DocuSeal document pending → bubble with "Zeig mir das Dokument"
- **24-hour reminder** — next session in 24 h → bubble with "Vorbereiten?" / "In Kalender exportieren"
- **1-hour reminder** — next session in 1 h → bubble with "Beitreten" once the link is live
- **New coach message** — unread message from coach → bubble with "Lesen"
- **Open Fragebogen request** — coach assigned a Fragebogen → bubble with "Jetzt starten"

**Action whitelist (write actions, all require confirmation):**

- Book / move / cancel a session
- Sign a pending document
- Upload a file to the shared folder
- Send a message to the coach
- Start or continue a Fragebogen
- Mark a notification as read

**Knowledge scope:** the requesting client's own data only. RLS / server-side authorization is the boundary, not the prompt — a client must never reach admin data even with a clever question. The assistant API enforces the scope on every read.

### What's identical between profiles

- The visual (icon → bubble → chat panel)
- Push-to-talk affordance
- Confirmation card pattern for every write
- Tonality and German "du" voice
- Animation/timing (pulse, 8 s shrink-back, dot indicator)

---

## Confirmation card (write actions)

Every write the assistant intends to perform appears in the chat as a structured card before execution:

```
┌─────────────────────────────────┐
│ ✦ Soll ich das machen?          │
│                                 │
│ Meeting "Marc · 06.05."         │
│ finalisieren — Transkript       │
│ anhängen, Folgetermin-Vorschlag │
│ senden.                         │
│                                 │
│ [ Ja, mach ]  [ Abbrechen ]     │
└─────────────────────────────────┘
```

Rules:

- The card lists the **target object** (with a stable identifier visible to the user) and the **side-effects** in plain German
- Default focus is **never** on the affirmative button — user must move to confirm
- "Abbrechen" leaves the chat history intact (the assistant says "OK, lasse ich") — no silent reversal
- The assistant cannot bundle multiple writes into one card — one action per confirmation

---

## What gets retired

- **`website/src/components/HelpPanel.svelte`** — deleted
- **`website/src/lib/helpContent.ts`** — deleted (content migrated as seed knowledge)
- Mount points in `AdminLayout.astro` (line ~420) and `PortalLayout.astro` (line ~258) — replaced with `AssistantWidget`
- Static section-ID prop (`section={section}` / `section={helpSection}`) — replaced by route-derived context (the assistant infers from the URL + user role)

---

## What gets created

- **`website/src/components/AssistantWidget.svelte`** — the three-state visual surface
- **`website/src/components/AssistantBubble.svelte`** — speech-bubble subcomponent (used both for proactive nudges and as a closed-state hint)
- **`website/src/components/AssistantChat.svelte`** — chat panel with PTT
- **`website/src/components/AssistantConfirmCard.svelte`** — confirmation card subcomponent
- **`website/src/lib/assistant/triggers.ts`** — declarative trigger registry (per profile), evaluated client-side against periodically-fetched state
- **`website/src/lib/assistant/actions.ts`** — typed action whitelist per profile (admin + portal), each with a `describe()` for the confirmation card and a server-side handler reference
- **`website/src/pages/api/assistant/chat.ts`** — POST: user message in, assistant message + optional action-proposal out
- **`website/src/pages/api/assistant/execute.ts`** — POST: confirmed action ID + payload → executes via the existing admin/portal API surface, returns result; rejects anything not in the profile's whitelist
- **`website/src/pages/api/assistant/transcribe.ts`** — POST: audio blob → Whisper STT → text
- **`website/src/pages/api/assistant/nudges.ts`** — GET: returns the active nudges for the current user/profile; backed by a small evaluator that reads existing data sources (meetings, tickets, signatures, fragebögen)
- A new DB table `assistant_conversations` (per-user history) and `assistant_nudge_dismissals` (per-user-per-nudge "snooze-until")

The list above is the structural surface — the user sized the spec; specific module decomposition can shift during implementation.

---

## Onboarding & first-run

On the very first interaction with the widget (per user, per profile):

- A one-time bubble: *"Hi — ich bin dein Mentolder-Assistent. Tippen oder Mikro halten und reden. Ich kann auch Sachen für dich erledigen — frag einfach mal."*
- Two suggested kickoff prompts visible in the bubble: *"Was steht heute an?"* and *"Hilf mir mit X"* (X depends on profile)
- After dismissal, a smaller "First-time tour" entry remains accessible from the chat header overflow menu so the user can re-trigger it

This replaces the static `onboarding` content in the current `helpContent.ts`.

---

## Out of scope (v1)

- **TTS / voice output** — replies are text only
- **Wake-word** — push-to-talk only
- **Cross-session memory of patterns** — the assistant has conversation history but no learned model of the user's habits ("you usually finalize meetings on Friday afternoon")
- **Multi-step agentic plans** — one confirmation per write; the assistant doesn't pre-commit to a chain
- **Mobile push notifications for nudges** — nudges only fire while the app is open in a browser tab
- **Translations** — German only (matches current site)
- **Backend / model selection** — explicitly the user's call, not part of this spec

---

## Acceptance signals (how we know it works)

- The 508-line static `helpContent.ts` is gone
- Both `/admin/*` and `/portal/*` pages render the new widget
- A first-login portal user sees the onboarding nudge
- Asking "wie finalisiere ich ein Meeting?" returns instructions specific to the current admin's open meetings, not a generic blob
- Saying *"finalisier das Marc-Meeting"* into the mic produces a confirmation card with that exact meeting referenced
- An admin user cannot read another client's data via the chat (server-side authz)
- A portal user cannot read another client's data via the chat (server-side authz)
- Existing FA/SA/NFA tests for the help icon still pass (or are updated to match the new affordance)

---

## Migration

1. Ship `AssistantWidget` behind a feature flag (`feature.assistant.enabled` per profile)
2. Mount it alongside the existing `HelpPanel` for one release — flag-off by default
3. Enable for admin profile first; observe nudge volume and confirmation outcomes
4. Enable for portal profile next
5. Remove `HelpPanel.svelte` + `helpContent.ts` + `helpSection` props once both are live and stable

---

## Open questions (deferred to plan / build)

- Exact polling cadence for nudge evaluation (likely 30–60 s while tab is visible)
- Storage of conversation history (probably the existing shared-db `website` schema, but the table layout is for the plan)
- Snooze model for nudges — per-day vs per-trigger-type vs both
- The action handler's relationship to existing API endpoints — wrap or reuse?

These are implementation choices, not design decisions.
