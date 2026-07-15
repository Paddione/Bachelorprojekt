---
title: "Ignore locally installed market-cli skills"
ticket_id: "T001783"
status: planning
---

# ignore-market-cli-skills — Proposal

## Problem

Lokal via lobehub market-cli installierte Skills (Drittanbieter, nicht geprüft, nicht team-geteilt)
landen im Git-Index und können versehentlich committed werden. Der bisherige `.gitignore`-Eintrag
(`.claude/skills/haniakrim21-*/`) deckt nur einen PREFIX ab — andere market-cli Skills
(`gguf-quantization`, `llama-cpp`, `ui-ux-pro-max`, `unsloth`, `speculative-decoding`, `whisper`)
sind bereits im Repo getrackt und können nicht mehr einfach ignoriert werden (Git ignoriert
getrackte Dateien nicht automatisch).

## Ziel

Alle market-cli Skills werden vollständig aus dem Git-Index entfernt und zukünftig
systematisch ignoriert — unabhängig vom Installations-Prefix.

## Non-Goals

- Team-eigene Skills (`dev-flow-*`, `git-workflow`, `infra-ops`, etc.) bleiben getrackt.
- Keine Änderung am Skill-Loading-Verhalten (Skills bleiben lokal verfügbar).

## Lösungsansatz

1. **`.gitignore` erweitern:** Ein generisches Muster ergänzen, das alle known market-cli
   Skill-Verzeichnisse unter `.claude/skills/` abdeckt — plus ein Kommentar mit der
   Konvention für zukünftige market-cli Installationen.
2. **Bereits getrackte Dateien entfernen:** `git rm --cached` für alle betroffenen
   Skill-Verzeichnisse — löscht die Dateien nur aus dem Index, nicht vom Dateisystem.
3. **Verifikation:** Prüfen, dass `git status` keine markierten market-cli Skills mehr zeigt.
