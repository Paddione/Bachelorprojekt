# Proposal: g-size02-large-files-gate

_Ticket: T001292_

## Why

Das Repository hat aktuell 18 Quelldateien mit mehr als 600 Zeilen, die **vollständig außerhalb** des in `docs/code-quality/gates.yaml` definierten `scan.code_roots`-Universums liegen. Keine dieser Dateien wird vom S1-Gate (Zeilenlimit-Gate), vom S2-Gate (Import-Zyklen) oder einem anderen automatisierten Quality-Check erfasst. Damit wächst dort ein Blind-Spot-Schuldenblock unbeobachtet — 15 Dateien in `VideoVault/` und 3 Dateien in `.opencode/plugins/` — mit Einzeldateien bis 1983 Zeilen.

Das S1-Gate wurde eingeführt, um Monolith-Dateien frühzeitig zu stoppen. Dieser Mechanismus ist jedoch wirkungslos, solange ganze Verzeichnisse außerhalb von `code_roots` liegen. Die betroffenen Dateien akkumulieren Komplexität ohne Gegendruck: `VideoVault/client/src/hooks/use-video-manager.ts` (1762 Zeilen), `VideoVault/server/routes/processing.ts` (1273 Zeilen), `.opencode/plugins/background-agents.ts` (1983 Zeilen). Keine davon löst bei Commit eine Warnung aus.

## What

Die Maßnahme besteht aus zwei aufeinanderfolgenden Schritten:

**Schritt 1 — `.opencode/` in den Gate-Scope aufnehmen:**
`docs/code-quality/gates.yaml` erhält einen neuen Eintrag `.opencode` unter `scan.code_roots`. Die drei derzeit übergroßen Plugin-Dateien (`background-agents.ts`, `worktree.ts`, `worktree/terminal.ts`) werden in `s1.ignore` eingetragen mit einer Begründungszeile analog zu `pipeline.js`: Sie sind als monolithische Plugin-Registrierungseinheiten konzipiert, deren Splitting am Plugin-Loader scheitert. Dieser Schritt entfernt 3 Dateien aus dem "außerhalb Gate-Scope"-Zähler (18 → 15) und stellt sie unter dauerhafte Gate-Aufsicht.

**Schritt 2 — Sieben VideoVault-Dateien aufteilen:**
Die sieben volumenstärksten Dateien in `VideoVault/` werden auf je mindestens zwei Dateien unter 600 Zeilen aufgeteilt. Die Splits folgen fachlichen Schnittgrenzen:

- `use-video-manager.ts` (1762 Zeilen) → `use-video-state.ts` + `use-video-actions.ts` (je ≤600)
- `VideoVault/server/routes/processing.ts` (1273 Zeilen) → `routes/processing-ingest.ts` + `routes/processing-export.ts` (je ≤600)
- `VideoVault/shared/videovault/corrupt-performers.ts` (1232 Zeilen) → `corrupt-performers-index.ts` + `corrupt-performers-data.ts` (je ≤600)
- `VideoVault/client/src/components/video/video-card.tsx` (838 Zeilen) → Extraktion `VideoCardOverlay.tsx`
- `VideoVault/client/src/pages/categorize.tsx` (840 Zeilen) → Extraktion `CategorizeGrid.tsx`
- `VideoVault/client/src/pages/home.tsx` (815 Zeilen) → Extraktion `HomeGrid.tsx`
- `VideoVault/client/src/services/video-thumbnail.ts` (799 Zeilen) → `thumbnail-cache.ts` + `thumbnail-worker.ts`

Nach diesem Schritt verbleiben 8 Dateien über 600 Zeilen außerhalb des Gate-Scopes — exakt am Target (≤8).

## Impact

**Geänderte Dateien:**
- `docs/code-quality/gates.yaml` — `scan.code_roots` erweitert, `s1.ignore` ergänzt
- `VideoVault/client/src/hooks/use-video-manager.ts` — aufgeteilt
- `VideoVault/server/routes/processing.ts` — aufgeteilt
- `VideoVault/shared/videovault/corrupt-performers.ts` — aufgeteilt
- `VideoVault/client/src/components/video/video-card.tsx` — reduziert via Extraktion
- `VideoVault/client/src/pages/categorize.tsx` — reduziert via Extraktion
- `VideoVault/client/src/pages/home.tsx` — reduziert via Extraktion
- `VideoVault/client/src/services/video-thumbnail.ts` — aufgeteilt

**Neue Dateien:** je 1–2 extrahierte Module pro Split-Target (insgesamt 7–10 neue Dateien).

**Risiken:** VideoVault hat eigene TypeScript-Typen und einen eigenen Build — alle Splits müssen typsicher bleiben und der bestehende Test-Suite (`VideoVault/client/src/hooks/*.test.tsx`) muss grün bleiben. Die `.opencode`-Plugin-Dateien stehen unter `s1.ignore` und laufen daher durch Gate-Scans ohne Zeilenlimit-Fehler.

**Out-of-Scope:** Die verbleibenden 8 Dateien (z. B. `VideoVault/client/src/components/settings-modal.tsx` mit 651 Zeilen, 4 weitere mit 651–799 Zeilen) werden in diesem Schritt nicht aufgeteilt — sie landen auf dem Pfad zum nachgelagerten Target. Eine Ausgliederung von `VideoVault/` nach `~/projects/` ist eine mögliche Folge-Entscheidung, aber nicht Teil dieses Plans.
