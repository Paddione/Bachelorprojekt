# Proposal: mishap-auto-chore-plan

## Why

Der `mishap-tracker` bündelt Ausführungs-Mishaps heute nur zu einem `type=task`-Ticket
(`attention_mode=ai_ready`, `status=triage`), das liegen bleibt, bis eine
menschliche/`ticket-ops`-Session es manuell in einen Plan überführt. Für nicht-kritische
Bundles (kein `broken`/`security`-Eintrag) ist das unnötiger Leerlauf — die Ticket-
Beschreibung enthält bereits alles, was ein Chore-Fix braucht. Ziel: den mishap-tracker
selbst einen echten OpenSpec-Chore-Plan erzeugen und stagen lassen, den die Software-Factory
automatisch aufgreift und implementiert.

## What

- **Gating:** `ticket.sh get --id <ext-id>` nach Bundle-Ticket-Erstellung prüfen — bei
  `severity=major` (enthält `broken`/`security`) kein Auto-Plan (wie heute); bei
  `severity≠major` Auto-Plan-Flow.
- **Plan-Autoring (im mishap-tracker, keine neue Infrastruktur):** `openspec propose`
  (headless) → Subagent schreibt echten `tasks.md` (echter Fix-Task je Mishap + echter
  Failing-Test-Step) → `plan-lint.sh`-Gate → `ticket.sh stage-plan --branch chore/<slug>`
  → Commit+Push.
- **Factory-Pipeline (4 Dateien, rein mechanisch, kein Schema-/Go-Change):**
  `scripts/factory/queue.sh` (OR-Klausel für `type='task' AND status='plan_staged'`),
  `scripts/factory/slots.sh` (Status-IN-Liste erweitern), `scripts/factory/pipeline.js`
  (Deploy-Guard-Regex + PR-Titel `chore(...)`), `scripts/factory/dispatcher-bridge.sh`
  (präfix-agnostischer Slug-Strip).
- Details siehe Design-Spec: `docs/superpowers/specs/2026-07-15-mishap-auto-chore-plan-design.md`.

_Ticket: T001844_
