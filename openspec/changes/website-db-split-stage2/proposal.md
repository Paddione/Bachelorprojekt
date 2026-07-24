# Proposal: website-db-split-stage2

## Why

Stufe 2 des zweistufigen `website-db.ts`-Splits (Stufe 1: T002149/`website-db-split`). Beide Stufen
editieren dieselbe Quelldatei (`website-db.ts`), was innerhalb eines einzelnen Partial-Plans gegen
die Disjoint-Files-Regel (plan-lint D1) verstoessen wuerde — deshalb zwei separate Tickets/Branches
mit echter `depends_on`-Sequenzierung statt zwei Partials in einem Ticket. Diese Stufe SOLLTE erst
implementiert werden, nachdem T002149 gemerged ist, da sie auf der von Stufe 1 bereits verkleinerten
Version von `website-db.ts` aufsetzt.

## What

- Zweite Haelfte (Time-Entries, Client-Notes, Onboarding, Follow-ups, Admin-Shortcuts,
  DSGVO-Audit-Log, Invoice-Counter, Brett, Custom-Sections, Content-Store) in ein weiteres neues
  Modul extrahieren; `website-db.ts` behaelt Re-Exports.
- Falls `website-db.ts` danach unter 600 Zeilen faellt: `s1.ignore`-Eintrag in
  `docs/code-quality/gates.yaml:72` entfernen (Bonus, kein Hard-Requirement).

_Ticket: T002150 (depends_on: T002149)_
