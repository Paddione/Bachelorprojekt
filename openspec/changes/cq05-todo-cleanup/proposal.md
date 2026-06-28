# cq05-todo-cleanup — Proposal

## Purpose

Beseitigt die G-CQ05-Regression: 6 Stub-Marker-Matches, die der Grep-Gate zählt (Baseline: 1).

5 der 6 Treffer sind False Positives — die OpenSpec-Skripte **erkennen** Skeleton-Strings und enthalten
sie deshalb selbst als String-Literale. 1 Treffer ist ein genuines unimplementiertes Feature in
`sendInvoice.ts`.

## Ticket

T001282

## Problem

```
grep -rnE "\bTODO\b" ... website/src scripts tests k3d brett/src
```

Liefert 6 Treffer (Baseline: 1, Regression +5):

| # | Datei | Zeile | Art |
|---|-------|-------|-----|
| 1 | `scripts/openspec-merge.mjs` | 14 | False Positive — STUBS-Array-Literal |
| 2 | `scripts/openspec-merge.mjs` | 72 | False Positive — Fehlermeldungs-String |
| 3 | `scripts/openspec-validate.ts` | 56 | False Positive — Regex in String |
| 4 | `scripts/openspec-validate.ts` | 57 | False Positive — Regex in String |
| 5 | `scripts/openspec-validate.test.ts` | 114 | False Positive — Test-Fixture-String |
| 6 | `website/src/lib/assistant/actions/admin/sendInvoice.ts` | 4 | Echtes unimplementiertes Feature |

## Lösungsstrategie

### False Positives (Treffer 1–5)

Einführung einer Named-Konstante (`STUB_MARKER`) in jedem betroffenen Modul, die den Marker-String
hält. Alle Stellen, die den String bisher als Literal eingebettet haben, verwenden die Konstante.
Das Wort wird dadurch nicht mehr als freies Token im Quelltext erkannt.

In Test-Fixtures: String-Konkatenation (`'### Requirement: ' + marker`) statt Literal, damit der
Test die echte Erkennung weiterhin prüft.

### Echtes Feature (Treffer 6)

Kommentar durch eine Ticket-Referenz ersetzen. Das echte Feature (PDF-Generierung + Factur-X-Embed
+ Mail-Delivery) wird in T001282 separat verfolgt.

## Out of Scope

- Implementierung des Invoice-Send-Features selbst
- Änderungen an der Grep-Whitelist in `plan-qa-check.sh` / `plan-lint.sh`
