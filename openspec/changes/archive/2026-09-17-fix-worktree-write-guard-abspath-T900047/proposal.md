# Proposal: fix-worktree-write-guard-abspath-T900047

## Why

`scripts/hooks/worktree-write-guard.sh` (PreToolUse) lehnt Write/Edit im EIGENEN,
korrekt geclaimten Worktree ab (beobachtet waehrend T900041, 2026-09-03).
Fehlerbild: `Pfad: /c/Users/.../Bachelorprojekt/C:\Users\...\k3d\cronjob-scheduled-publish.yaml`
— der Repo-Root wurde vor einen bereits absoluten Pfad gehaengt. Wirkung: Write/Edit
im Worktree unbenutzbar; Workaround per Bash-Heredoc umgeht genau den Schutz, den der
Guard leisten soll. Fix-Ticket: T900047 (type=fix, prio=hoch, sev=major, comp=scripts).

## What

- **Symptom (Fakt, reproduziert):** TARGET-Verstuemmelung bei (a) Windows-Pfad
  `C:\Users\...` und (b) POSIX-Pfad `/c/Users/...` — beide Male identisch.
- **Ursachen-Hypothese (verifiziert am Code, `worktree-write-guard.sh:66`):**
  `case "$TARGET" in /*) ;; *) TARGET="$PWD/$TARGET";; esac` erkennt nur POSIX-`/...`
  als absolut. `C:\...` / `C:/...` faellt in den `*`-Zweig und bekommt `$PWD/` vorangestellt.
  Fuer (b) ist der Pfad zwar absolut, matcht aber anschliessend nicht gegen `MAIN_ROOT`
  (`git rev-parse` liefert Windows-Schreibweise mit Backslashes), sodass dieselbe
  Verstuemmelung in der Ablehnungsmeldung erscheint.
- **Fixansatz:** TARGET-Normalisierung vor Zeile 66 erweitern — Windows-absolut erkennen
  (Laufwerksbuchstabe `^[A-Za-z]:`, UNC `\\`), Backslashes zu Slashes normalisieren,
  POSIX-`/c/...`- vs. `C:/...`-Schreibweise kanonisieren und gegen `MAIN_ROOT` in derselben
  kanonischen Form vergleichen; `_abs_wt()` spiegelt dieselbe Normalisierung, damit
  Claim-Pfade und TARGET vergleichbar bleiben. Failing-Test zuerst (Rot-Gruen, Fix-Pfad-Pflicht):
  Guard mit Windows- und POSIX-absoluten Pfaden im eigenen geclaimten Worktree aufrufen,
  erwartet Exit 0; vor dem Fix Exit 2 mit verstuemmeltem Pfad.
- **Ausserhalb des Scopes:** SID-Logik, Claim-Semantik, Bypass bleiben unberuehrt.

## Entschiede (User, 2026-09-04)

- Test-Harness: BATS unter `tests/spec/` (Fix-Pfad-Standard, ohne externe
  Binaries ausser `bash`/`git`, damit CI ihn ausfuehrt). Ablage gemaess
  T002416-Konvention als Verzeichnis pro SSOT-Spec:
  `tests/spec/agent-skills/worktree-write-guard-abspath-T900047.bats`.
- Kanonisierung: Laufwerksbuchstabe case-insensitiv (`c:` vs `C:` gleich).

## Offene Fragen

Keine — beide Fragen aus dem Entwurf sind mit den Entscheiden oben beantwortet.

_Ticket: T900047_
