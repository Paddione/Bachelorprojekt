---
title: "half-archive-worktree-guard — Implementation Plan"
ticket_id: T015875
domains: [scripts, openspec]
status: active
file_locks: [scripts/openspec-half-archive-check.sh, tests/spec/openspec-workflow/half-archive-worktree-guard.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# half-archive-worktree-guard — Implementation Plan

_Ticket: T015875_

## File Structure

```
scripts/openspec-half-archive-check.sh                              (modified — Worktree-Sicht)
tests/spec/openspec-workflow/half-archive-worktree-guard.bats       (new — BATS-Guard)
```

## Tasks

### Partial 1: Worktree-Sicht + BATS-Guard

1. **RED — BATS-Guard anlegen.** Neue Datei
   `tests/spec/openspec-workflow/half-archive-worktree-guard.bats` (neben dem bestehenden
   `half-archive-guard.bats`); Setup baut ein Temp-Git-Repo (`git init`, Initial-Commit mit
   `openspec/changes/<slug>/`, sekundären Worktree via `git worktree add`) und setzt
   `OPENSPEC_ROOT` + `REPO` auf die Fixtures:
   - **Test A:** Im Sekundär-Worktree Quelle löschen (`rm -r`) und Archivdir untracked anlegen,
     während main-Branch den Slug regulär unter `changes/` trägt → Check meldet
     `WORKTREE-HALB-ARCHIV: <slug>` mit Worktree-Pfad, exit 0 (Warnmodus).
   - **Test B:** Sauberer Zustand (kein Sekundär-Worktree bzw. nichts unter `openspec/changes/**`)
     → keine Worktree-Warnung, bestehende Grünausgabe unverändert.
   - **Test C:** Befund plus `OPENSPEC_HALF_ARCHIVE_WT_STRICT=1` → exit 1.
   - **Test D:** Bestehende Haupt-Checkout-Befundklassen (Slug doppelt, Praefix fehlt) failen
     weiterhin unabhängig vom Strict-Flag (Regressionsschutz).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-worktree-guard.bats
# expected: FAIL (red — die Worktree-Sicht existiert noch nicht)
```

2. **GREEN — Guard erweitern** in `scripts/openspec-half-archive-check.sh`:
   - Nach der bestehenden Haupt-Prüfung (vor dem finalen Echo) Worktree-Sammelfunktion:
     `git worktree list --porcelain | awk '/^worktree /'` — Pfad des Haupt-Checkouts
     ausschließen; für jeden Rest: `git -C <wt> status --porcelain -- openspec/changes/`
     auswerten (Signaturen ` D`/`D `/`?? `/`A `), Slug-Normalisierung wie im bestehenden
     Archiv-Parse (`<date>-<slug>` → slug), Vergleich gegen die offenen Slugs auf
     `origin/main` (`git ls-tree --name-only origin/main openspec/changes/<slug>/`).
   - Warnausgabe pro Befund inkl. Heal-Hinweis (commit+push oder verwerfen); Exit nur bei
     `OPENSPEC_HALF_ARCHIVE_WT_STRICT=1`.
   - Stil an das bestehende Skript angleichen (deutsche Kommentare mit Ticket-Tag [T015875],
     gleiche Meldungsform `openspec-half-archive-check: ...`).

3. **Verifizieren.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-worktree-guard.bats
# expected: PASS (green)
bash scripts/openspec-half-archive-check.sh
# expected: ✓ (Bestandsverhalten grün, keine Fehlwarnungen gegen aktive Parallelsessions)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/half-archive-worktree-guard.bats
# expected: FAIL (red — die Worktree-Sicht ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Guard-Erweiterung umsetzen, bis der BATS-Guard grün ist und der
      Live-Lauf gegen dieses Repo grün bleibt.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
