# Proposal: sdlc-autopilot-skill-adoption

## Why

`.opencode/skills/sdlc-autopilot/SKILL.md` liegt ungetrackt im Haupt-Checkout
(Muster T012968/T016415/T016416): Der Skill existiert nur lokal und ist beim
Worktree-Wechsel, Rebase oder Clone verloren bzw. nicht reproduzierbar. Eine
Sicherung liegt unter `/tmp/opencode/dispatch-T016415-T016416/
sdlc-autopilot-backup/` — flüchtig. Ohne Commit ist der autonome SDLC-Loop
(ticket-ops → dev-flow-plan → Factory) kein beständiger Teil des Agent-Rosters.

## What

Aufnahme des vorhandenen 66-Zeilen-Skills als getrackte Datei unter
`.opencode/skills/sdlc-autopilot/SKILL.md` (1:1 aus der verifiziert identischen
Sicherung). Bewusste Entscheidungen:

1. **opencode-only** (keine Claude-Symlink-Erweiterung): Die Mehrheit der
   projekteeigenen Skills lebt ausschließlich unter `.opencode/skills/`
   (hf-mem, huggingface-*, skill-craft, trl-training u. a.). Symlinks auf
   Shared Sources gibt es nur für die in beiden Harnesses genutzten
   dev-flow-\*/openspec-\*-Skills (T014086-Konvention). Der Skill nutzt
   opencode-native Auto-Compact und den FreeToken-Alias — ein Claude-Pendant
   ist aktuell nicht gefordert.
2. **Kein BATS-Test**: `tests/spec/agent-skills.bats` scannt ausschließlich
   `.claude/skills/`; für reine Skill-Markdown-Dateien unter `.opencode/`
   existiert keine Testsurface. Gates bleiben `task test:changed` +
   Freshness.
3. **Abhängigkeit T016416**: Der Skill setzt den Vertrag aus T016416 voraus
   (`freetoken-active` advertised bis `SDLC_CONTEXT_CEILING`, KV-Pool wächst
   serverseitig mit). Merge-Reihenfolge: T016416 zuerst oder zusammen — der
   Skill referenziert das Ceiling nur dokumentarisch und bricht ohne es
   nicht, arbeitet dann aber mit dem schmaleren Default-Limit.

_Ticket: T016420_
