# Proposal: skill-path-guard-opencode-T900078

## Why

Der dead-link guard in `tests/spec/agent-skills/skill-path-references.bats` (T002356-M1, T002613)
ist nach dem Umzug von `.claude/skills/` → `.opencode/skills/` (T900070) nicht aktualisiert
worden. Das Resultat: alle repo-relativen Pfadverweise unter `.opencode/skills/` — das sind
derzeit 85+ Fundstellen allein in Referenz- und Skill-Dateien — sind unsichtbar für den Guard.
Tote Verweise im neuen SSOT-Layout werden nicht erkannt.

Zwei Defekte im Detail:

1. **SKILL_PATH_PATTERN (Zeile 41)** matcht nur `.claude/skills/[A-Za-z0-9_./-]+...`.
   Verweise der Form `](.opencode/skills/references/…)` oder `(.opencode/skills/dev-flow-execute/SKILL.md)`
   werden nicht extrahiert.

2. **skill_files() (Zeilen 46-57)** scannt `.claude/skills` und `.agents/skills`, nie aber
   `.opencode/skills` direkt. Auf Windows ist `.agents/skills` eine Textdatei (der git-Symlink
   `../.claude/skills` wurde als Datei gespeichert, nicht als Verzeichnis), also wird auch
   `.claude/skills` über `.agents/skills` nicht erreicht. `.opencode/skills/` — die neue SSOT
   mit 26+ Referenz-Dateien unter `references/` — ist komplett blind.

## What

- `SKILL_PATH_PATTERN` um eine alternation `.opencode/skills/` erweitern.
- `skill_files()` `.opencode/skills` als dritte Scan-Quelle aufnehmen; `.agents/skills`
  entfernen (nicht mehr canonical, auf Windows kein Verzeichnis, Duplikat von `.opencode/skills`
  nach T900070).
- Einen bidirektionalen shim-coverage Test hinzufügen, der sicherstellt, dass `.claude/skills`
  Shims ihre `.opencode/skills`-Ziele referenzieren und umgekehrt — kein Shim ohne Ziel, kein
  Ziel ohne Shim.

## Nicht im Scope

- Migration von `.claude/skills/` Shims (separates Ticket).
- Änderungen an den Referenz-Datei-Inhalten selbst.

_Ticket: T900078_
