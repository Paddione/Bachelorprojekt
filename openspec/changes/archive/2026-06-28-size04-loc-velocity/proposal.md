# Proposal: size04-loc-velocity

## Why

G-SIZE04 misst die Netto-LOC-Wachstumsrate über die letzten 7 Tage. Nach einer
Intensivphase (T001277 astro-check-Types, T001280 LOC-Budget-Gate, T001279
Dockerfile-Migration) liegt die Messung bei **+3684 LOC/Woche** — deutlich über
dem Zielwert von ≤ +2000 LOC/Woche. Drei Ursachen sind identifiziert:

1. **Burst-PRs** mit mehr Additions als Deletions in kurzen Fenstern verzerren
   die 7-Tage-Messung stark (Shallow-Clone-Caveat).
2. **Dead-Code-Akkumulation**: `openspec/changes/mentolder-react-rebuild/.ds-sync/`
   enthält ~3800 Netto-LOC Build-Hilfsskripte, die im Gate-Scope landen.
   `scripts/backup-restore-recovery.sh` (+450 LOC) und
   `website/src/lib/tickets/` (+970 LOC) sind weitere Top-Contributor.
3. **S6-Gate-Schwelle zu weit**: `warn-pct` bei 5 % lässt Bursts dieser Größe
   ohne Warnung passieren.

## What

- **S6-Gate straffen**: `warn-pct` von 5 % auf 2 % setzen, damit zukünftige
  Bursts früher auffallen.
- **G-SIZE04-Dokumentation verbessern**: Shallow-Clone-Caveat und
  Burst-Toleranz in `docs/goals/goals.md` erklären; Messmethodik besser
  beschreiben.
- **Dead-Code-Scope klären**: `openspec/changes/mentolder-react-rebuild/`
  aus dem G-SIZE04-Messfenster ausschließen (openspec-Artefakte sind kein
  Produktionscode) oder nach `~/projects/` auslagern. Scope-Änderung in
  `scripts/check-loc-budget.mjs` dokumentieren.
- **Knip-Konfiguration (G-CQ08-Link)**: Initiale Knip-Bereinigung der
  unused exports in `website/src/lib` als erste Dead-Code-Reduktion nutzen.

_Ticket: T001284_
