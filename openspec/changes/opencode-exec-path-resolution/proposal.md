# Proposal: opencode-exec-path-resolution

## Why

`scripts/factory/opencode-exec.sh:89` ruft `opencode run --agent orchestrator`
ohne Pfadauflösung. Der Factory-Lauf läuft als systemd-User-Service; dessen PATH
enthält `~/.npm-global/bin` nicht. Interaktiv funktioniert der Aufruf (Login-Shell
ergänzt den Pfad), im unbeaufsichtigten Dienst endet jede Pipeline mit Exit 127 —
lokal unsichtbar, weil nur der Dienst betroffen ist. Die bisherige Sofortmassnahme
(`export PATH=...` in `~/.config/factory/autopilot.env`) ist Maschinenkonfiguration
außerhalb der Versionierung und geht bei jedem Neuaufsetzen verloren.

## What

`opencode-exec.sh` löst das Binary selbst auf:

1. `OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode || echo "$HOME/.npm-global/bin/opencode")}"`
2. Existenz- + Executable-Prüfung; bei Fehlen Abbruch mit von 127 unterscheidbarem
   Exit-Code und Diagnose, die Binary + Suchreihenfolge nennt.
3. Aufruf über `"$OPENCODE_BIN" run …` statt nacktem `opencode`.

Der bestehende Ergebnis-Check (T003335) bleibt unberührt. Die anderen Executor-/
Hilfsskripte, die `command -v opencode` nur als Bedingung nutzen (oracle.sh,
pr-babysit-ticket.sh), bleiben außerhalb des Scopes — sie sind interaktiv, nicht
im Dienstkontext.

## Messung

- Ursache gemessen 2026-08-10 (Repo-Stand 9055fdb17): `command -v opencode` →
  `/home/patrick/.npm-global/bin/opencode`; `systemctl --user show-environment | grep PATH`
  ohne `~/.npm-global/bin`.
- Reproduktion: Pipeline-Lauf mit `FACTORY_EXECUTOR=opencode` → `opencode-exec: … exited 127`.
- Test: `opencode-exec.sh` mit restriktivem `PATH=/usr/bin:/bin` aufrufen (Stub-Binary
  im npm-global-Fallback), Positiv-Anker mit Binary im PATH.

_Ticket: T003275_
