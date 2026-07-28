# Proposal: pipeline-divergence-T002393

## Why

pipeline.js und pipeline.mjs sind auseinandergelaufen — pipeline.mjs (der dispatchte Pfad) hat die Änderungen aus T002074 (Partial-Fanout) und T002286 (Guard-Overwrite) nicht, die in pipeline.js bereits enthalten sind.

Alle Kontrakttests laufen gegen pipeline.js, nicht gegen pipeline.mjs — Regressionen im Live-Pfad bleiben unentdeckt.

## What

1. Fehlende Blöcke aus pipeline.js nach pipeline.mjs portieren (Partial-Fanout, Guard-Overwrite)
2. Dispatched-Pfad verifizieren — pipeline.mjs läuft vollständig mit portierten Blöcken
3. Pipeline.js-Dublette entfernen, alle Referenzen auf pipeline.mjs umstellen
4. Kontrakttests aktualisieren: PIPELINE_SCRIPT/PJS gegen pipeline.mjs
5. Negativtest: Regression in pipeline.mjs wird erkannt

_Ticket: T002393_
