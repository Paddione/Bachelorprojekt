# f2-link-guard — Quelle

Begebenheit (T900238, Change `2026-09-23-fix-agent-skills-symlink-tests`):
Der Guard `skill-symlink-targets.bats` sollte Symlinks von `.claude/skills/*`
nach `.opencode/skills/*` absichern, war aber wirkungslos: `[ -d "$link" ]
|| continue` uebersprang jeden Nicht-Verzeichnis-Link still, und die
Existenz-plus-Anzahl-Pruefung blieb gruen, als alle Symlinks geloescht waren —
der Positiv-Anker mass nicht die Menge, die er absichern sollte.

Anfrage: Der Guard faerbt nie rot, auch bei geloeschten oder kaputten Links.
Richtige Entscheidung: Soll-Ist-Abgleich gegen die getrackten Verzeichnisse
(fehlende UND ueberzaehlige faerben rot), Nicht-Verzeichnis-Ziele nur fuer
`OVERVIEW.md` erlaubt, Rest faerbt rot.
Schiefgegangen: Vor dem Fix gab der Guard falsche Sicherheit — der Fall misst,
ob ein Modell einen wirkungslosen Guard hart macht statt nur umzuformulieren.

Fixture-Abbildung: `check-links.sh` prueft Symlinks in einem Verzeichnis gegen
`links/manifest.txt`. Loesung: exakter Mengenabgleich, kaputte Links und
Nicht-Verzeichnis-Ziele (ausser README) faerben rot.

Rot/Gruen-Nachweis (manuell, 2026-09-27): `checks/run.sh` ist gegen `base/`
rot (Exit 1: kaputter Link und Fremdlink bleiben unentdeckt, geloescht
bleibt gruen) und nach der Referenzloesung (Manifest-Abgleich, README-
Ausnahme) gruen (Exit 0). Die §1-Variante des Guards (ohne README-Ausnahme)
ist gegen dieselben Checks rot — sie liegt als seeded-1.diff bei.
