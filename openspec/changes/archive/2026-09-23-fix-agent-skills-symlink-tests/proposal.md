# Proposal: fix-agent-skills-symlink-tests

## Why

Der Guard `tests/spec/agent-skills/skill-symlink-targets.bats` (T900236) soll
die Symlinks von `.claude/skills/*` nach `.opencode/skills/*` absichern, die PR
#5749 (T900070) eingefuehrt hat. Drei Schwachstellen machen ihn wirkungslos:

1. **Test 3 toleriert Nicht-Verzeichnis-Ziele** (F1): `[ -d "$link" ] || continue`
   ueberspringt jeden Symlink, der nicht auf ein Verzeichnis zeigt. Ein
   geloeschter oder auf eine Datei zeigender Skill faerbt den Guard nicht rot.
2. **Test 1 prueft nur Existenz + Anzahl** (F2): `[ -d "$SKILL_DIR" ]` und
   `[ "$count" -gt 0 ]` bleiben gruen, wenn alle Symlinks geloescht werden —
   der Positiv-Anker misst nicht die Menge, die er absichern soll.
3. **Windows-Checkouts ohne Symlinks** (F4): Bei `core.symlinks=false`
   materialisiert `git checkout` keine Symlinks; die Assertions sind dort
   strukturell unerfuellbar und faerben CI rot, ohne dass ein Defekt vorliegt.

Zusaetzlich dokumentiert der Change den seit der Reparatur (2026-09-17) gruenen
Test aus `tests/spec/agent-skills.bats` (F3): OVERVIEW.md darf nur auf
existierende SKILL.md-Dateien zeigen.

## What

- `tests/spec/agent-skills/skill-symlink-targets.bats` wird haerter:
  - Test 1 fuehrt einen Soll-Ist-Abgleich gegen die getrackten
    `.opencode/skills/*/SKILL.md`-Verzeichnisse (via `git ls-files`) plus
    `OVERVIEW.md` durch — fehlende und ueberzaehlige Symlinks faerben rot.
  - Test 3 erlaubt Nicht-Verzeichnis-Ziele ausschliesslich fuer `OVERVIEW.md`;
    alle anderen Nicht-Verzeichnis-Ziele faerben rot.
  - `setup()` ueberspringt die Assertions bei `core.symlinks=false`
    (unset gilt als symlink-faehig).
- Die drei OpenSpec-Artefakte (`proposal.md`, `specs/agent-skills.md`,
  `tasks.md`) werden vervollstaendigt.

_Ticket: T900238_
