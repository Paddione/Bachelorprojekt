# Embed-Completeness-Slug-Scope

## Purpose (Deutsch)

Behebt das Fehlrauschen im post-commit-embed-Hook, wenn das Completeness-Gate Pläne aus
**anderen Worktrees** als fehlend meldet, obwohl der konkret gecommittete Slug sauber
indiziert wurde. Beobachtet am 2026-08-14: `listLocalActivePlans()` liest nur
`<repoRoot>/openspec/changes` des Haupt-Checkouts; aktive Pläne in `.worktrees/*/` fehlen
dann in der pgvector-Collection, das Gate meldet `20/31 fehlende aktive Plans` — und der
Wrapper behandelt jede solche WARN als harten Fehler: pro Commit 3×5s Retry +
`FEHLER: Embedding wurde NICHT indiziert`, obwohl der eigene Slug 10 Chunks erfolgreich
indiziert hat.

## Problem / Auslöser

`scripts/openspec-embed-lib.sh` → `embed_output_is_success()` (Zeile 22–27):

```bash
printf '%s' "$out" | grep -q "indexed slug='" || return 1
printf '%s' "$out" | grep -q "WARN: completeness gate" && return 1
```

Die zweite Zeile negiert den Erfolg des konkreten Slugs bei **jeder** completeness-WARN —
auch wenn die missing-Liste ausschließlich fremde Slugs (aus anderen Worktrees) enthält.
Die WARN ist advisory (Grenzfall des T003491-Fixes, kein Port-Konflikt), wird aber als
hartes Fehlersignal interpretiert.

## Fix-Richtung

- **`embed_output_is_success()` um optionalen Slug-Parameter erweitern:**
  `embed_output_is_success <output> [<slug>]`.
  - Mit Slug: WARN negiert den Erfolg NUR, wenn der eigene Slug in der missing-Liste der
    WARN-Zeile steht (`(^|, )<slug>(,|$)` auf dem Teil nach `missing`). Fremde missing-Slugs
    → Exit 0 (Erfolg bleibt Erfolg).
  - Ohne Slug: bisheriges Verhalten exakt beibehalten (Rückwärtskompatibilität, bestehender
    T002870-Test bleibt grün).
- **`scripts/openspec-embed-local.sh`** und **`.githooks/post-commit-embed`**: den aktuellen
  Slug an die Funktion durchreichen (`embed_output_is_success "$out" "$slug"`).
- Keine Änderung an `openspec-embed.mjs` (Gate selbst zählt korrekt), keine Änderung an
  `listLocalActivePlans` (Haupt-Checkout-Semantik ist gewollt).

## Out of Scope

- Keine Änderung am Completeness-Gate selbst (CoV-Zählung, Toleranz).
- Keine Worktree-Aggregation in `listLocalActivePlans`.
- Keine Änderung der Safety-Net-Semantik des Hooks (bleibt non-fatal).
