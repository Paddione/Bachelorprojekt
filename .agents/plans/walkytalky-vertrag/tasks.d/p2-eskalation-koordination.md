# p2 — Eskalation + Koordination (Voice-Form)

Ziel: Eskalationsprotokoll und Koordinations-Ansagen für Voice anpassen (stille Mechanik bleibt).

## Tasks

- [ ] `.claude/lib/behaviors/escalation-protocol.md`: ESCALATION-Block als gesprochene Kurzfrage mit Fix-Buttons fassen (Stop-Regel „nicht raten" bleibt); Skript-Aufruf `agent-escalate.sh` unverändert.
- [ ] Koordinations-Ansagen (Locks, Worktrees, `agent-msg.sh`) auf Voice-Form bringen: Ergebnis in einem Satz, Details nur auf Nachfrage. Keine Skript- oder Mechanik-Änderung.
- [ ] Gate: Eskalations-Semantik (sofort stoppen, teilbare Arbeit liefern, nie stumm scheitern) bleibt wortgleich erhalten.

## Target files

- `.claude/lib/behaviors/escalation-protocol.md` (`.md` ungated)
