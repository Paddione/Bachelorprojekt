# Proposal: openspec-tracking-cleanup

## Why

Das OpenSpec-Tracking pflegt denselben Zustand mehrfach und vermischt dauerhafte
Komponenten-Specs mit Einweg-Ticket-Artefakten:

1. **Shadow State:** Die `OpenSpec-Komponenten:`-Liste in `openspec/config.yaml`
   dupliziert das Verzeichnis `openspec/specs/`. Die Eskalationskette T001266
   (Liste manuell vervollständigt) → T001304 (Drift-Hard-Gate `checkConfigDrift`)
   → T001389 (Auto-Registrierung `registerComponent`) hat die Pflege der Kopie
   immer weiter automatisiert, statt die Kopie abzuschaffen. Nebenwirkung: Die
   Liste bläht den `context:`-Block auf, der in jede Proposal-Phase injiziert wird.
2. **SSOT-Verschmutzung:** 36 von 94 Dateien in `openspec/specs/` sind ticket-/
   gate-nummerierte One-offs (`t001363-mishap-bundle`, `g-cq05-todo-cleanup`, …) —
   abgeschlossene Changes, keine Komponenten. 46 Specs tragen den Platzhalter-
   Purpose „SSOT spec." (Herkunft: Skeleton in `openspec-merge.mjs`), der die
   eigene Purpose-Deutsch-Regel verletzt.
3. **Duplikate:** `cq05-todo-cleanup`/`g-cq05-todo-cleanup` und
   `g-dep02-major-deps-website`/`t001360-dep02-major-deps` beschreiben dasselbe
   Ziel mit divergierenden Requirements — der `--create-new`-Ausweg unterläuft
   die Delta-Spec-Konvention aus T001304.

## What

- `OpenSpec-Komponenten:`-Block aus `openspec/config.yaml` ersatzlos streichen;
  `checkConfigDrift()` (openspec-validate.ts) und `registerComponent()`
  (openspec-merge.mjs, T001389) samt Tests zurückbauen — das Verzeichnis
  `openspec/specs/` ist die einzige Komponenten-Quelle.
- Neues Verzeichnis `openspec/specs/archive/`: die 36 One-off-Specs (inkl. der
  4 Duplikate) per `git mv` dorthin verschieben; Validator und Kontext-Loader
  behandeln nur Top-Level-`.md` als Komponenten.
- `openspec.sh archive --create-new` härten: Slug-Denylist für One-off-Muster
  (`^(t[0-9]{6}|g-[a-z]+[0-9]{2})` …) mit explizitem
  `--force-new-component`-Override; Skeleton-Platzhalter „SSOT spec." durch
  deutschen Stub-Satz ersetzen.
- Vorgelagert: Change `openspec-auto-register` (T001389, done) regulär
  archivieren; anschließend die Auto-Register-Requirement aus
  `openspec-workflow.md` per Delta entfernen.
- Verbleibende kanonische Specs mit Platzhalter-Purpose erhalten einen echten
  deutschen Purpose-Satz.

Design-Spec: `docs/superpowers/specs/2026-07-02-openspec-tracking-cleanup-design.md`

_Ticket: T001452_
