# GOAL: OD-2 VideoVault God-Components splitten (Bachelorprojekt)

## Objective
VideoVault-Client-God-Components in View + Hook + Query-Module zerlegen,
keine Datei >200 LOC / out-degree >15 nach dem Split.

## Erfolgskriterien
- [ ] `video-card.tsx:39` (Komplexität 79) → `VideoCardView` + `useVideoCard` + `video-queries`, Tests grün.
- [ ] `advanced-filters.tsx:26-357` (out 26), `categorize.tsx:528-840` (out 28), `browse.tsx:52-346`, `analytics.tsx:25-277`, `audiobook-player-modal.tsx:39-472` ebenso zerlegt.
- [ ] `pnpm --dir components/VideoVault/client tsc --noEmit` + Vitest-Suites grün.
- [ ] Graph-Re-Query: keine Funktion >200 LOC / out-degree >15 in angefassten Dateien.

## Nicht-Ziele
- Kein Website-Sink (→ `od1-website-sink`), kein Server-Job-Queue (→ `od3-bachelor-cycles`).
- Props-Verträge bleiben erhalten (kein Redesign).

## Abhängigkeiten
- Graph-Receipt 2026-11-06. Enabler: `od5-graph-refresh`.
- `plan_refs:` (wird ergänzt).

## Evidenz-Anker
- `components/VideoVault/client/src/components/video/video-card.tsx:39` (c79).
- `components/VideoVault/client/src/components/filters/advanced-filters.tsx:26-357`.
- `components/VideoVault/client/src/pages/categorize.tsx:528-840`.

health_goals: none (Abgeschlossenes Einmal-/Refactoring-Ziel ohne separaten Dauer-Probe; Vertragsinvariante über G-GOALS01 überwacht)
