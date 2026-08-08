# Proposal: skill-path-guard

## Why

Ein Skill, der auf eine nicht existierende Datei verweist, führt den Agenten ins Leere: er liest
den Verweis als Handlungsanweisung, findet nichts, und rät weiter. Der Fehler ist still — kein
Gate prüft heute, ob ein im Skill-Fließtext genannter Repo-Pfad existiert. `openspec validate`
prüft Delta-Dateinamen, aber niemand prüft Pfadangaben in Fließtext. Der auslösende Fund:
`.claude/skills/dev-flow-e2e/SKILL.md` verweist zweimal auf `openspec/specs/k8-headed-tests/spec.md`
— einen Pfad, den es nie gegeben hat (die Archivierung hat korrekt in den SSOT-Spec
`e2e-test-infrastructure.md` gemerged; der Skill benennt nur den falschen Slug).

## What

Ein BATS-Guard unter `tests/spec/agent-skills/skill-path-references.bats`, der jeden
repo-relativen Pfadverweis in eigenen Skill-Dateien gegen das Dateisystem prüft (Vendored
Fremdskills `gitops-*`/`vitest` ausgenommen) und fehlschlägt, wenn ein Verweis nicht auflösbar
ist. Dazu werden die drei bestehenden toten Verweise korrigiert und der Vision-Pfad des
headed-Laufs (8094 primär, 8091 als Rückfall samt Prüfbefehl) belegt beschrieben.

_Ticket: T002613_
