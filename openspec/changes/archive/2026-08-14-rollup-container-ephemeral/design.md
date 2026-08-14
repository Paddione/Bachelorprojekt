# Design: rollup-container-ephemeral

Brainstorming-Ergebnis (mit User abgestimmt, 2026-08-14). Entscheidungen:

1. **Container-Lifecycle: ephemer mit Reuse bis Verarbeitung.** Der Container bleibt
   kein dauerhaft-offenes Ticket. Der Flusher hängt an den offenen Container an; der
   Generator schließt ihn (`done · resolution=obsolete` — Konvention der heutigen
   Ephemer-Container T004613/T004752), sobald sein Batch in den Plan übergegangen ist.
   Invariante: höchstens ein offener Container. Ein `blocked`-Container bleibt sichtbar.
2. **Branch-Lifecycle: pro Zyklus, PR-Merge nach main.** Der permanente Branch
   `chore/mishap-incident-rollup` entfällt. Jeder Zyklus erhält einen eigenen Branch mit
   Slug-Suffix, der Change wird per PR auf `main` gemergt und dort archiviert (Präzedenz:
   `openspec/changes/archive/2026-08-02-mishap-incident-rollup/`). Danach Branch + Worktree
   aufräumen. Die Amend-/Lease-Maschinerie (T002914/T002931) entfällt ersatzlos.

## Änderungen

### 1. `scripts/ticket.sh` — cmd_rollup_container (Suchfilter)

`AND status IN ('triage','backlog','planning','plan_staged','in_progress')` wird zu
`AND status NOT IN ('done','archived')`. `ORDER BY created_at ASC` bleibt: ältester
offener Container zuerst. Der Code folgt damit seinem eigenen Kommentar und der
Semantik, die der Go-Flusher-Kommentar bereits beschreibt. Step 2 (Anlegen) bleibt
unverändert als Fallback bei leerem Ergebnis.

### 2. `scripts/factory/mishap-rollup.sh` — Zyklus-Branch + Closure

- Statt festem `SLUG="mishap-incident-rollup"`/`BRANCH="chore/${SLUG}"`: Slug-Suffix
  pro Zyklus (Datum; bei Kollision am selben Tag Container-ID), z. B.
  `mishap-incident-rollup-2026-08-14`, Branch `chore/${SLUG}`. Der Worktree wird nach
  dem Lauf wieder aufgeräumt (trap-cleanup wie bei auto-chore-plan.sh).
- Nach erfolgreichem Plan-Commit + Push: Container schließen via
  `ticket.sh update-status --id <container> --status done --resolution obsolete`.
- Header-Kommentar („bleibt dauerhaft offen", „Branch bleibt persistent") korrigieren.

### 3. `scripts/factory/rollup-publish.sh` — Amend-Maschinerie entfernen

Pro Zyklus existiert genau ein Generator-Commit; es gibt nichts zu amendieren. Der
Publisher reduziert sich auf: einfacher `git push -u origin <branch>` (Commit übernimmt
der Generator). Die Amend-/Force-with-Lease-/Rebase-Konfliktlogik entfällt.

### 4. `scripts/ticket-mcp/go/internal/tools/mishap.go` — keine Änderung

Der Flusher nutzt bereits die gemeinsame Auflösung (`rollup-container --brand`); Append-
Logik unverändert. Nur der Kommentar („offene Chore-Tickets (nicht done/archived)") ist
nach dem Fix zutreffend.

### 5. SSOT-Delta `openspec/specs/mishap-rollup.md`

- MODIFIED „rollup-container self-heals on an empty search result": GIVEN auf
  `status NOT IN ('done','archived')`.
- MODIFIED „Mishap rollup generates compliant change per run": Zielverzeichnis ist der
  Zyklus-Slug, nicht mehr der feste Pfad.
- REMOVED „Rollup branch advances instead of accumulating generator commits" und
  „Generator never rewrites foreign commits" (Amend-Semantik entfällt).
- ADDED „Rollup container SHALL be ephemeral" (Reuse bis Verarbeitung, Closure
  done/obsolete, blocked sichtbar, max. ein offener Container) und „Rollup change SHALL
  merge to main per cycle" (eigener Branch, ein normaler Push, PR-Merge → Archiv, danach
  Branch/Worktree aufräumen).

### 6. Tests

- Neu: `tests/spec/mishap-rollup/container-finds-blocked-status.bats` — RED belegt gegen
  die Allowlist; prüft per kubectl-Mock das emittierte WHERE-Prädikat (`NOT IN
  ('done','archived')`, keine positive Aufzählung) plus Find-statt-Create-Verhalten.
- Ersetzt: `tests/spec/mishap-rollup/rollup-branch-progress.bats` (pinned Amend-Modus)
  → neuer Test für den Zyklus-Push (kein Force, einfacher Push).
- Unverändert gültig: `rollup-container-empty-list-selfheal.bats` (leeres Ergebnis →
  Create-Pfad) und `container-resolution-and-unattended-worktree.bats`.

## Migrationssequenz Bestand (nach Merge dieses Fixes)

1. Sammelbestand des permanenten Branchs (`openspec/changes/mishap-incident-rollup/`,
   `chore/mishap-incident-rollup`) einmalig per PR nach `main` mergen und archivieren —
   die Sammlungshistorie bleibt so in `openspec/changes/archive/` erhalten.
2. Branch `chore/mishap-incident-rollup` auf origin löschen, Überreste
   `.worktrees/mishap-incident-rollup/` entfernen.
3. Bereits ausgeführt: T003533 und T004887 sind `done · resolution=obsolete`. Der
   Buffer (8 Einträge) erzeugt beim nächsten Flush den ersten ephemeren Container.

## Edge-Cases

- **Container bleibt `blocked`:** Flusher/Generator finden ihn weiterhin (NOT IN) und
  arbeiten den Batch ab; der Closure-Schritt setzt `done` und löst damit auch den
  Blockade-Zustand auf.
- **Zwei offene Container** (Altlast): `ORDER BY created_at ASC` wählt den ältesten;
  weitere offene Streuner werden manuell `done/obsolete` gesetzt (wie T004887).
- **Mehrere Zyklen am selben Tag:** Slug-Kollision wird durch Container-ID-Suffix
  aufgelöst; `openspec:validate` bleibt grün, weil jeder Slug ein eigenes Verzeichnis hat.
