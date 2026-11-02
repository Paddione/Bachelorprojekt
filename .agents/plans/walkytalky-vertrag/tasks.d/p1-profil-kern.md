# p1 — Profil-Kern (AGENTS.md)

Ziel: WalkyTalky-Profil-Abschnitt in `AGENTS.md` anlegen (neue Sektion, kein Umbau bestehender Abschnitte).

## Tasks

- [ ] Profil-Sektion `## WalkyTalky-Profil` nach dem Interaction Contract einfügen: Aktivierung (Hotkey ODER Signalwort, explizites Opt-in, jederzeit umschaltbar), Antwort-Stil (kurz, gesprochen, erst Inhalt dann Buttons/Frage).
- [ ] Footer-Karte definieren: alle 4 Werte bleiben (STATUS/RUNNING/BLOCKED/NEXT), Darstellung als Karte mit 2 Buttons — „Weiter" (empfohlene NEXT-Aktion ausführen), „Details" (Volltext).
- [ ] Fragen-Regel definieren: max. 3–4 Optionen, Empfehlung Option 1 mit `(Recommended)`-Präfix, Fristen/Auto-Run wie Vollvertrag.
- [ ] Normativ auf `docs/agent-guide/visual-accessibility.md` (§1 Modale, §2 Disclosure) verweisen statt neu zu definieren; Pointer-Sektion zu agentic-resources unangetastet lassen.
- [ ] Gate: `bash scripts/plan-lint.sh` bleibt grün für diesen Stand; kein Widerspruch zum Vollvertrag (Heads-down-Verhalten unverändert).

## Target files

- `AGENTS.md` (Sektion neu, `.md` ungated)
