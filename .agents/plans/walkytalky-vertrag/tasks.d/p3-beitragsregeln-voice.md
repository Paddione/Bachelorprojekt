# p3 — Beitragsregeln in Voice

Ziel: Hook-/Gate-Fehler werden in WalkyTalky-Sessions als gesprochene Kurzfrage mit Fix-Buttons vermittelt (Gates selbst unverändert).

## Tasks

- [ ] `.claude/lib/behaviors/commit-conventions.md`: `commit-msg`-Fehler (z.B. falscher Scope) als Kurzfrage fassen — angebotene Fixes als Buttons (korrekten Scope übernehmen / selbst formulieren).
- [ ] `.claude/lib/behaviors/never-push-main.md`: Push-Blockaden (pre-push-Hook, vgl. Issue #7062) als Kurzansage mit Fix-Buttons fassen (Warten/Fix auf main/Notfall-Bypass nur auf expliziten Eigner-Wunsch).
- [ ] Gate: Keine Aufweichung der Beitragsregeln — nur Vermittlung ändert sich; Bypass bleibt Eigner-Entscheidung.

## Target files

- `.claude/lib/behaviors/commit-conventions.md` (`.md` ungated)
- `.claude/lib/behaviors/never-push-main.md` (`.md` ungated)
