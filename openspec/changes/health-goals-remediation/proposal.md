# Proposal: health-goals-remediation

## Why

Das Health-Goals-Dashboard (`scripts/health-goals-check.sh`, SSOT `.claude/lib/goals.md`) zeigt sieben
Verletzungen von Zielen mit `Target: =0`/`<=0`/`>=90%`: G-AGENTIC02, G-AGENTIC06, G-AGENTIC07,
G-AGENTIC08, G-AGENTIC09, G-DB09, G-E2E01, G-E2E02. Root-Cause-Recherche (siehe unten) zeigt: drei
davon (G-AGENTIC02, G-DB09, G-E2E01) sind **Messfehler im Check-Script selbst**, keine echten
Regressionen im geprueften System — der Agent-Routing-Heading-Parser trifft die falsche Ueberschrift
in `AGENTS.md`, die `pg_stat_statements`-Exclusion greift nicht mehr wegen rollenbasierter
Query-Text-Maskierung, und die E2E-Erfolgsrate zaehlt manuell abgebrochene `workflow_dispatch`-Runs
statt nur `schedule`-Runs. Die vier uebrigen (G-AGENTIC06/07/08, G-E2E02) sind echte
Registrierungs-/Hygiene-Luecken: 3 neue `gitops-*`-Skills wurden nie in `OVERVIEW.md` verzeichnet,
3 Script-Pfade in `gitops-repo-audit/SKILL.md` fehlt ein Verzeichnis-Praefix, und der bereits
gemergte E2E-Testdaten-Purge-Fix (T002096) verschluckt Fehler still.

Unbehoben verzerren diese Verletzungen die SDLC-Health-Metriken und verstecken echte Probleme
hinter Mess-Rauschen — insbesondere G-DB09 und G-AGENTIC02 suggerieren produktive Drift, wo keine
existiert.

G-SIZE03 (`website-db.ts` God-File) ist explizit **ausgenommen** — dafuer existiert das separate
Ticket T002149 (`website-db-split`), da der Split zweistufig und risikoreicher ist als diese
Doku-/Script-Korrekturen.

## What

- G-AGENTIC02 + G-DB09 + G-E2E01: `scripts/health-goals-check.sh` robuster machen (Heading-Parser
  auf `<details>`-Bloecke erweitern; `pg_stat_statements`-Exclusion gegen maskierten Query-Text
  absichern; E2E-Erfolgsrate nur ueber `event=schedule`-Runs berechnen).
- G-AGENTIC06 + G-AGENTIC07: `.claude/skills/OVERVIEW.md` Skill-Zaehler korrigieren (36→39) und die
  3 `gitops-*`-Skills referenzieren.
- G-AGENTIC08: 3 tote Script-Pfade in `.claude/skills/gitops-repo-audit/SKILL.md` korrigieren.
- G-AGENTIC09: `.claude/skills/dev-flow-plan/SKILL.md` von 523 auf <=500 Zeilen kuerzen.
- G-E2E02: Purge-Step-Fehlerbehandlung in `.github/workflows/e2e.yml` sichtbar machen (kein
  stilles `|| true`); `openspec/changes/e2e-testdata-leak/` archivieren.

_Ticket: T002148_
