# T005563 — vda.sh frontmatter versteht YAML-List-Form von `domains` nicht

## Problem

Beim Plan-Lauf für T005308 (dev-flow-plan in-context): `tasks.md` trug gültiges YAML in
List-Form (`domains:\n  - factory`), `plan-lint` meldete trotzdem F1/F2
("frontmatter missing required key 'domains'", "domains is empty"). Der danach obligatorische
`bash scripts/vda.sh frontmatter <plan>` "reparierte" das Frontmatter und erzeugte dabei einen
strukturell falschen Zustand: `domains: [website, test]` (geratene, falsche Domains — der Change
betrifft factory/test, nicht website) mit dem Rest `  - factory` als losem Folgeblock darunter.

**Root-Cause:** Beide Extraktions-Funktionen lesen nur die **erste Zeile** nach `domains:`:
- `scripts/plan-lint.sh` → `fm_field()` (awk, `$0 ~ "^"k":"` — matcht nur Flow-Form)
- `scripts/vda/frontmatter.sh` → `_fm_field()` (awk, identisches Muster)

Bei List-Form (`domains:` mit `- item`-Zeilen darunter) liefert das einen leeren Wert →
F2 schlägt fehl bzw. der Repair hält `domains` für leer und rät neu.

## Lösung

Beide Extraktoren auf die YAML-List-Form erweitern: Wenn `domains:` ohne Inline-Wert gefunden
wird, die folgenden `  - <item>`-Zeilen einsammeln und zu `[item1, item2]` normalisieren.
Damit:
- `plan-lint` liest die List-Form korrekt → F1/F2 grün.
- `frontmatter.sh`-Repair liest die tatsächlichen Domains statt zu raten → konvertiert die
  Liste in Flow-Form, lässt keinen losen List-Rest zurück.

## Scope

- **In Scope:** `scripts/plan-lint.sh` (fm_field), `scripts/vda/frontmatter.sh` (_fm_field +
  List→Flow-Konvertierung im Repair-Pfad), Rot-Tests in `tests/unit/vda-frontmatter.bats`.
- **Nicht in Scope:** Kein generischer YAML-Parser; nur die `domains`-List-Form (die einzige
  als Liste geschriebene Frontmatter-Zeile laut plan-lint F1_KEYS). Keine Änderung an der
  Flow-Form-Semantik.

## Offene Fragen

Keine — Repro aus T005308 ist dokumentiert: `tasks.md` mit `domains:\n  - factory` anlegen →
plan-lint → vda.sh frontmatter → Frontmatter betrachten.
