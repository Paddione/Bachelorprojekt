# p1 — Discovery: Live-Verhalten rekonstruieren (read-only)

## Ziel
`.agents/plans/fix-e2e-mentolder-nightly-11/discovery.md` (neu): exakte Feldnamen + Shapes, die p2/p3 brauchen —
(1) `klientId`-Flow: Feldname, Pflichtformat, Route (`/api/billing/` vs `/api/admin/billing/`), 401-vs-400-Ordering
gegen live verifiziert; (2) AGB-Feld für T6: exakter Feldname + erwarteter Wert, gegen live verifiziert.
Quellen in Reihenfolge: deployed Image / Deploy-Manifeste (`prod-fleet/`, `flux/`), Source-Branch des Prod-Deployments
(falls abweichend von `main`), notfalls OPTIONS/Fehlermeldungs-Probing gegen live (nur lesende Requests + die
bereits nightly-etablierten Test-Calls, keine neuen Schreib-Calls).

## Randbedingungen
- NUR lesen + `discovery.md` schreiben. Kein Spec-Edit, kein Helper-Edit (das ist p2/p3).
- Jede Angabe mit Beleg (Datei:Zeile aus Image/Source oder Live-Request/Response-Paar mit Datum).
- Scheitert eine Quelle (Image nicht pullbar, Branch unbekannt): als Lücke in `discovery.md` + `risks[]`-Eintrag,
  p2/p3 lesen sie verbindlich und stoppen bei fehlender Feld-Definition (kein Raten von Feldnamen).

## Gates
- `discovery.md` nennt für beide Felder Name + Beispiel-Payload + verifizierten Live-Status-Code.
- Kein offener Feldname → p2/p3 starten nicht (Fail-Closed, keine Platzhalter-Commits).
