# Proposal: commit-scope-openspec

## Why

Der commit-msg-Guard lehnt `chore(openspec)` ab, obwohl `openspec/` das Verzeichnis,
`openspec:*` die Tasks, `/opsx:*` die Slash-Commands und „OpenSpec native change workflow"
ein eigener CLAUDE.md-Abschnitt ist. Ein Agent waehlt den naheliegenden Namen — und der ist
seit T002328 ein Alias von `plans` (T003139, reproduziert am 2026-08-10).

Das Ticket stellt zwei Wege zur Wahl. Die Belege sprechen gegen den ersten:

**Nicht die Liste aufweichen.** Die Kuration ist dokumentiert und begruendet:
`openspec/changes/archive/2026-07-27-commit-scope-consolidation/design.md` reduziert 95 auf
14 Scopes entlang der Agent-Domaenen aus CLAUDE.md und fuehrt `openspec` ausdruecklich als
Alias von `plans` (`commitlint.config.cjs:41`). Anker der Konsolidierung ist **ein Name pro
Begriff**; `openspec` wieder zuzulassen erzeugte zwei akzeptierte Schreibweisen fuer
dieselbe Sache und setzte den Praezedenzfall fuer die uebrigen ~90 Aliase, die mit exakt
demselben Argument antreten koennen („das Verzeichnis heisst doch `k3d/`", „die Tests liegen
in `tests/`", „die Hooks heissen `hooks`").

**Die gemessene Haeufigkeit traegt den Preis nicht.** Seit dem Merge der Konsolidierung
(2026-07-27) gibt es genau einen `(openspec)`-Commit — vom Merge-Tag selbst, also noch aus
dem alten Regime; im Fenster der letzten 400 Commits null. Belegt ist der Fall bislang durch
genau eine Meldung: T003139.

**Erklaeren hilft bei jedem Scope.** Die Diagnose nennt heute den Zielnamen, aber weder wo
die Liste gepflegt wird noch wie man sie sich ausgeben laesst — obwohl
`validate-commit-msg.sh scopes` genau das kann. Der Geschwister-Check fuer PR-Titel ist an
dieser Stelle bereits weiter: `openspec/specs/software-factory.md:488` fordert fuer ihn eine
Meldung, die „the allowlist" nennt und die gueltigen Scopes auflistet. Der commit-msg-Pfad
bleibt dahinter zurueck — das ist eine Inkonsistenz, kein neuer Wunsch.

## What

- `scripts/validate-commit-msg.sh`: bei jeder Scope-Ablehnung zwei Zeilen ergaenzen, die
  `commitlint.config.cjs` als Quelle und `scripts/validate-commit-msg.sh scopes` als
  Auflistungsbefehl nennen — zusaetzlich zu Alias-Hinweis (T002328) und
  Nearest-Scope-Vorschlag (T002240), nicht an deren Stelle.
- `commitlint.config.cjs`: `NAMED_SCOPES` bleibt unveraendert bei 14 Eintraegen.
- Delta-Spec auf `ci-cd` (SSOT-Parent), Guard in `tests/spec/ci-cd/`.

_Ticket: T003139_
