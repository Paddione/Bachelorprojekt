# Proposal: brain-auto-memory

## Why

Auto-Memory (`~/.claude/projects/<project>/memory/*.md`) sammelt pro-Projekt Wissen
(Nutzerkontext, Feedback-Konventionen, Projektstand, Referenzen), bleibt aber rein
lokal und maschinengebunden — nicht mit dem gemeinsamen brain-Wiki (Paddione/brain)
verknüpft. Erkenntnisse aus Claude-Sessions gehen bei Rechnerwechsel oder für andere
Kollaborateure (Gekko) verloren, obwohl sie oft generisches Projektwissen enthalten,
das im brain-Wiki wertvoll wäre.

## What

Eine client-seitige Bash-Brücke, die Auto-Memory-Dateien **einseitig** (Export, kein
Import) in einer kuratierten, review-gestützten Auswahl ins brain-Repo überführt:

- `scripts/brain-auto-memory-scan.sh` — read-only, cron-tauglich. Findet neue/geänderte
  Memory-Dateien via Hash-Diff gegen eine lokale State-Datei, überspringt Dateien ohne
  parsbares Frontmatter oder mit erkennbaren Secret-Mustern, schreibt eine
  Kandidatenliste (JSON).
- `scripts/brain-auto-memory-export.sh` — interaktiv, manuell. Zeigt Kandidaten zum
  Review (`y/n/e`), wendet eine feste Type-Mapping-Tabelle
  (`project`/`reference`→`note`, `feedback`→`decision`, `user`→`note`) an, schreibt
  konvertierte Seiten nach `raw/auto-memory/<project>/<slug>.md` im brain-Repo,
  committed + pusht. State-Datei wird nur für tatsächlich exportierte Dateien
  aktualisiert.

**Nicht-Ziel:** Kein bidirektionaler Sync, keine CI-Integration (der bestehende
`brain-merge-hook.yml`-Workflow läuft in GitHub Actions ohne Zugriff auf lokale
`~/.claude/projects/`-Dateien — diese Brücke läuft zwingend lokal).

Vollständiges Design: `docs/superpowers/specs/2026-07-04-brain-auto-memory-design.md`

_Ticket: T001567 · Epic: brain-llm-wiki (T001566), Change 7_
