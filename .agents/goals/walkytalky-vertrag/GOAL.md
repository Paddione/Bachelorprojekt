# Goal: WalkyTalky-Vertrag

## Objective

Den Agent-Gesprächsvertrag im Bachelorprojekt-Repo walkytalky-fähig machen — als neues
`WalkyTalky`-Profil in `AGENTS.md` (SSOT bleibt eine Datei), sodass Voice-Sessions kurze,
gesprochene Antworten mit interaktiven Schaltflächen statt langem Textblock-Protokoll bekommen.

## Erfolgskriterien

1. `AGENTS.md` enthält ein `WalkyTalky`-Profil, das den Status-Footer als kompakte Karte
   (Inhalt Status/Laufend/Blockiert/Nächstes bleibt) mit Aktions-Buttons statt Textblock definiert.
2. Entscheidungsfragen nutzen das `question`-Tool mit max. 3–4 Optionen; die Empfehlung steht
   immer als Option 1, ist visuell hervorgehoben und läuft nach Frist automatisch.
3. Interaction Contract (Run-to-end, Stop-Trigger, Frage-Protokoll), Eskalationsprotokoll
   (`.claude/lib/behaviors/`), Agent-Koordination (Locks, Worktrees, Messaging) sowie
   Beitragsregeln (Commit-Konventionen, PR-Flow, CI-Gates) sind auf Voice-Realität angepasst.
4. Heads-down-Sessions behalten den bisherigen Vollvertrag — das Profil schaltet um,
   ersetzt nichts pauschal.
5. Relevante Gates bleiben grün (`task workspace:validate`; CI-Gate-Dreiklang
   `test:changed`, `freshness:check`, `workspace:validate`); PR per Squash-Merge.

## Nicht-Ziele

- Keine neue Tool-Implementierung (nur Konvention via existierendem `question`-Tool).
- Kein Umschreiben für andere Harnesses außerhalb des Profils.
- Keine Manifest-/Produktcode-Änderung.
- Keine Aufweichung der Gates selbst (nur ihre walkytalky-taugliche Vermittlung).

## Abhängigkeiten

- Issue #7062 (Pre-push-Quality-Gate auf `main` defekt: 4 S4-Violations) — Push des Profil-PRs
  ggf. mit `SKIP_CI_CHECK=1` plus Vermerk, bis das Issue behoben ist.
- `plan_refs:` wird von `dev-flow-plan` bei Planerstellung bidirektional verlinkt (Modell B).
