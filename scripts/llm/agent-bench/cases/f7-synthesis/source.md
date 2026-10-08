# f7-synthesis — Quelle

Begebenheit (T901309, Rollenvertrag 2026-10-08): Gestufter Plan mit
Synthese-Schritt. Zwei unabhaengige Notizen (`notes/a.txt`, `notes/b.txt`,
`TODO` → `DONE`) plus ein Synthese-Partial (`SUMMARY.md`), das erst nach
beiden Notizen laeuft (`depends_on: p1, p2`) und das Gesamtergebnis
festhaelt. Pass erst bei Vollsynthese: alle Partials `done` UND Checks
gruen — Teilgruen zaehlt nur als Teil-Outcome (wie bisher: `outcome` =
Anteil gruener Checks bei allen `done`, sonst anteilig).

Anfrage: Trage beide Notizen aus und synthetisiere danach das Ergebnis in
`SUMMARY.md` (je eine Zeile pro Notiz plus Schlusszeile).
Richtige Entscheidung: p1 und p2 parallel dispatchen, p3 erst nach beiden
(`depends_on`), `SUMMARY.md` enthaelt beide DONE-Zeilen. Erst dann sind alle
Partials `done` und die Checks gruen → outcome 1.
Schiefgegangen: Synthese ohne ein Partial (Teilgruen → Teil-Outcome) oder
Synthese vor den Abhaengigkeiten (plan-runner lehnt verfruehten Dispatch
ab) — der Fall faerbt rot.

Fixture-Abbildung: `base/notes/{a,b}.txt` mit `TODO x`; Referenzplan mit
p1 (a), p2 (b), p3 (SUMMARY, `depends_on: p1, p2`). Rot/Gruen-Nachweis
(manuell, 2026-10-08): `checks/run.sh` ist gegen `base/` rot (Notizen TODO,
SUMMARY fehlt) und nach Referenzloesung gruen (beide DONE plus SUMMARY mit
beiden Zeilen).
