# Proposal: openspec-scope-hardening

## Why

Das OpenSpec-System hat unkontrollierte Spec-Proliferation entwickelt: 74 SSOT-Specs, davon
31 leere Baselines und 23 thin Stubs. Root-Cause ist `openspec-merge.mjs`, das automatisch
neue SSOT-Dateien erstellt wenn das Delta-Ziel nicht existiert. Verstärkt wird das durch
Delta-Specs die nach dem Change-Slug statt dem Parent-Spec benannt werden, und durch ein
weiches `checkConfigDrift()`-Gate das nur warnt (WARN) statt CI zu blockieren.

## What

**Hebel 2 — openspec-merge.mjs: `--create-new` Guard**
`applyDelta()` schlägt fehl wenn die SSOT-Zieldatei nicht existiert und `--create-new` nicht
gesetzt ist. Legitime neue Komponenten brauchen explizites Opt-in.

**Hebel 4 — Batch-Konsolidierung thin Specs**
10 thin Specs werden in ihre Parent-Specs gemergt (Requirements übertragen, Datei gelöscht).
16 Specs werden archiviert (Health Goals done, Fix-Stubs geliefert, superseded).
Ergebnis: ~40 statt 74 Specs, alle substantiell.

**Hebel 3 — openspec-validate.ts: WARN → FAIL**
`checkConfigDrift()` wird zu einem harten CI-Gate. Jede neue SSOT-Spec muss in `config.yaml`
registriert sein — sonst schlägt `task test:openspec` fehl. Läuft nach Hebel 4.

**Hebel 1 — Propose-Time Guidance**
`openspec.sh propose` bekommt `--target-spec <existing-slug>` — erstellt die Delta-Datei
vorbenannt nach dem Parent. CLAUDE.md bekommt die Delta-Spec-Konvention als kurzen Hinweis.

_Ticket: T001304_
_Spec: docs/superpowers/specs/2026-06-28-openspec-scope-hardening-design.md_
