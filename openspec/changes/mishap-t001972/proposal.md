# Proposal: mishap-t001972

## Why

Drei reproduzierte Mishaps aus ticket-ops 2026-07-19:

1. **ticket-mcp `triage_ticket` setzt `component` nicht**, obwohl der Parameter
   offiziell unterstützt wird. In `scripts/vda/ticket/triage.sh:108` setzt das
   SQL-Update `component=NULLIF(:'c','')` — asymmetrisch zu den anderen
   Feldern, die mit `COALESCE(NULLIF(...), <alt>)` arbeiten. Resultat: bei
   `triage_ticket`-Aufrufen ohne expliziten `component` (z. B. wenn die AI
   den Wert vergisst) wird ein bereits gesetzter component auf NULL
   zurückgesetzt; bei Aufrufen mit Wert scheint der Wert laut Reproduktion
   (T001961/2/4–7) ebenfalls nicht zu landen → noch ein Bug zu identifizieren.
2. **`scripts/openspec.sh archive --create-new`** erzeugt nur ein leeres
   Spec-Skelett ohne den anschließenden Delta-Merge. Der Skeleton-Write in
   `scripts/openspec-merge.mjs:90` läuft, der darauffolgende `applyDelta`-
   Schritt für die Delta-Blöcke fehlt im `--create-new`-Pfad.
3. **OpenSpec-Archivierungen im main-Checkout** wiederholen das T001880-
   Muster. Die Skill-Trigger-Warnung ist zu schwach.

## What

- `scripts/vda/ticket/triage.sh`: `component`-Update auf `COALESCE(NULLIF(...), component)` angleichen und einen Debug-Pfad einbauen, der im `--apply`-Modus loggt, ob `component` aus dem CLI-Args kam.
- `scripts/openspec-merge.mjs` + `scripts/openspec.sh`: Der `--create-new`-Pfad in `applyDelta` muss nach dem Skeleton-Write zwingend die Delta-Blöcke mergen, sonst leerer SSOT.
- `AGENTS.md` und/oder `.claude/skills/dev-flow-chore/SKILL.md`: Warntext aufnehmen, dass `task openspec:archive` (oder `scripts/openspec.sh archive`) **niemals im main-Checkout** ausgeführt werden darf — nur via Worktree.

_Ticket: T001972_
