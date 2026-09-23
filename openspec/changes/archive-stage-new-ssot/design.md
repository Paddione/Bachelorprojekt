# Design: archive-stage-new-ssot

_Ticket: T900339_

## Entscheidungen

**D1 — Gezielt stagen statt `git add -A openspec/specs`.** Die Ziel-Specs ergeben sich exakt aus
den Delta-Dateinamen (Parent-SSOT-Slug-Konvention, T001304): Delta `specs/<name>.md` merged nach
`openspec/specs/<name>.md`. Nur diese Pfade kommen zusaetzlich in den Index. Ein pauschales
`-A` wuerde die Absicht von T016597 (keine fremde untracked Arbeit im Archiv-Commit) brechen.

**D2 — Zweites Netz im selben Aufruf.** Nach dem Staging prueft die Funktion, dass jeder
Ziel-Spec im Index liegt (`git ls-files --error-unmatch` bzw. Pruefung gegen
`git diff --cached --name-only` plus getrackte Dateien). So faellt ein kuenftiger Staging-Fehler
im Finalizer auf, statt still einen Commit ohne SSOT zu erzeugen — dieselbe Positiv-Signal-Haltung
wie „Schritt 8 belegt seinen Abschluss am Positiv-Signal".

**D3 — `--no-merge` schaltet D1 und D2 ab.** `archive_stage_commit <slug> [archive-flags...]`
nimmt die Flags entgegen, mit denen `openspec.sh archive` lief. Bei `--no-merge`
(mishap-incident-rollup-*, `openspec_archive_args`) wird kein Delta gemergt und kein Spec angelegt;
gezieltes Staging und Pruefung entfallen. Andere Flags (`--create-new`) aendern nichts. Der
Finalizer ruft `archive_stage_commit "$SLUG" ${ARCHIVE_ARGS[@]+"${ARCHIVE_ARGS[@]}"}` — dieselbe
Zeile wie bisher, kein Zuwachs (Restbudget des Finalizers ist knapp, und T900340 aendert ihn parallel).
Im Resume-Pfad ist `ARCHIVE_ARGS` leer; dort gilt der Merge-Fall, was stimmt, weil nur ein
vollstaendiger `archive`-Lauf verschoben haben kann.

## Nicht im Scope

Der Session-Pfad ohne Finalizer (manuelles `openspec.sh archive` + eigenes Staging) — dort stagt
der Mensch selbst. Der CI-Workflow aus T900338 stagt `openspec/` pauschal und ist nicht betroffen.
