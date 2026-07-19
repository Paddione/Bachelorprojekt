# Proposal: brain-wiki-quality

## Why

Das brain-Wiki (`Paddione/brain`) ist nach dem vollen Ingest-Lauf (T001951) auf 468 Seiten
gewachsen — aber 72 % davon (338 Seiten) sind stale: ihre Quellen wurden im Doc-Purge
T001869/T001874 aus dem Bachelorprojekt gelöscht, der Ingest kennt jedoch keine
Löschsynchronisation. 85 % der Seiten haben keinen einzigen Body-Wikilink (kein
Wissensgraph), 150 Seiten verletzen die SSOT-Regel „kompilieren, nicht verschieben" durch
fehlenden `source::`-Rückverweis, und der LLM-Transform liefert unvalidiertes
Denglisch-Mangling. Die brain-CI-Lints sind grün, weil sie keinen dieser Defekte prüfen.

## What

1. **Prune-Phase** in `scripts/brain-ingest.sh`: Wiki-Seiten, deren `source::`-Quelle (oder
   State-File-Quellpfad) im Bachelorprojekt nicht mehr existiert und nicht in der
   Manifest-Worklist steht, werden entfernt — default-dry, `--prune` schaltet scharf;
   State-File-Einträge werden mitbereinigt. Handgeschriebene Meta-Seiten (source `self` /
   ohne Bachelorprojekt-Präfix) sind ausgenommen.
2. **Fail-closed Output-Validierung** in `scripts/brain-ingest-transform.sh`: `source::`-Zeile
   und ≥1 Body-Wikilink Pflicht, genau ein Retry mit Fehlerhinweis, danach harter Fehler.
   Prompt-Schärfung (Sprachregel gegen Mischübersetzung), `max_tokens` 2048→3072.
3. **Einmaliger Stale-Purge** der 338 Seiten via Prune-Lauf → separater PR ins brain-Repo
   (Dual-Target), inkl. MOC-Rebuild und log.md-Eintrag.
4. **Lint-Härtung im brain-Repo**: `source::`-Pflicht in `lint-frontmatter.sh`, advisory
   Orphan-Audit. Keine weiteren harten Gates (T001608 Scope B bleibt).

Design-Spec: `docs/superpowers/specs/2026-07-19-brain-wiki-quality-design.md` (D1–D5).

_Ticket: T001963_
