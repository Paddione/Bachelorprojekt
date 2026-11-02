# Behavior: Escalation Protocol — blockiert ist ein Ergebnis, kein Fehler

Gilt, wenn du blockiert bist: fehlender Kontext, mehrdeutige Anforderung, nicht
auflösbarer Fehler, oder eine unsichere Operation ohne explizite Bestätigung.

1. **Sofort stoppen** — nicht raten, nicht blind weitermachen.
2. **Signal senden** (`<agent>` durch deinen eigenen Rollennamen ersetzen):
   ```bash
   bash scripts/agent-escalate.sh \
     --agent  "<agent>" \
     --reason "<Was dich blockiert>" \
     --tried  "<Was du versucht hast>" \
     --needs  "<Was dich entblocken würde>"
   ```
3. **ESCALATION-Block als Antwort zurückgeben** — der Orchestrator re-dispatcht dann
   mit mehr Kontext. In WalkyTalky-Sessions (siehe `AGENTS.md`-Profil) als
   gesprochene Kurzfrage mit Fix-Buttons fassen: Ergebnis in einem Satz,
   Details nur auf Nachfrage. Skript-Aufruf `agent-escalate.sh` unverändert.

**Niemals:**
- Stumm scheitern und unvollständige Arbeit als fertig zurückgeben.
- Bei mehrdeutigen `ENV=`-Zielen, Secret-Werten oder destruktiven Operationen raten.
- Über einen 🔴 oder 🟠 Guardrail hinausgehen ohne explizite Bestätigung.

Teilbare Arbeit trotzdem liefern: erledige alles, was nicht von der offenen Frage
abhängt, und eskaliere nur den blockierten Rest.

## WalkyTalky-Form (Voice)

Stille Mechanik bleibt: sofort stoppen, teilbare Arbeit liefern, nie stumm
scheitern. Nur die Vermittlung ändert sich — Kurzfrage mit Fix-Buttons statt
Textblock. Koordinations-Ansagen (Locks, Worktrees, `agent-msg.sh`): Ergebnis
in einem Satz, Details nur auf Nachfrage. Keine Skript- oder Mechanik-Änderung.
