# Partial p6 — CI/Tools Fixes (M1+M2+M7+M8)

**Ticket:** T002471
**Rolle:** `ci-tools`
**Ziel-Dateien:** siehe unten
**Mishaps:** M1 (pre-push node_modules), M2 (gh update-branch), M7 (gitleaks), M8 (openspec-embed)

## Mishaps

- **M1:** pre-push schlägt fehl wenn node_modules fehlt (frischer Worktree). Fix: graceful degradation wenn madge nicht verfügbar.
- **M2:** gh 2.45.0 hat kein `pr update-branch`. Fix: Fallback auf lokalen Rebase+Push.
- **M7:** gitleaks fehlt lokal. Fix: Installation ins Setup aufnehmen oder Hinweis verbessern.
- **M8:** openspec-embed-Backend fällt transient aus, Specs bleiben unindexiert. Fix: Backfill-Mechanismus.

_Genaue Implementierung pro Mishap ist dokumentationslastig — Fokus auf erkennbare Guards._
