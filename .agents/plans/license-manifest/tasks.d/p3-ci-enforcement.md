# p3-ci-enforcement — CI-Partial für T901032 (Slug license-manifest)

Scope: genau zwei neue Dateien (exklusiv, keine anderen Dateien einplanen):

- `scripts/legal/license-check.sh` (fail-closed Checker, `set -euo pipefail`)
- `.github/workflows/license-policy.yml` (CI-Workflow, ruft den Checker auf)

Lesereihenfolge vor Task 1: `intel.json` dieses Plan-Ordners,
`.agents/skills/references/plan-quality-gates.md`, p1-Policy und p2-Manifest,
ein bestehender Workflow aus `.github/workflows/` als Stilvorlage
(zum Beispiel `health-goals.yml`).

## File Structure

| Datei | Status | S1-Schwelle | Budget | Planziel |
| `scripts/legal/license-check.sh` | neu, Ist 0, nicht-baselined | `.sh`-Limit 800 aus `docs/code-quality/gates.yaml` | 800 | max. 200 Zeilen (25 % der Schwelle) |
| `.github/workflows/license-policy.yml` | neu, Ist 0, nicht-baselined | keine (`.yml` steht nicht in `s1.limits`) | unlimitiert, trotzdem knapp halten | max. 60 Zeilen |

S1-Budget-Notizen:

- `jq`-Abfrage auf `docs/code-quality/baseline.json` für beide Pfade liefert
  `nicht-baselined`; wirksame Schwelle für `.sh` ist das statische Limit 800,
  Budget 800 minus 0 ist 800. Bei 200 Zeilen liegt die Datei bei 25 % der
  Schwelle — kein Split einplanen.
- Neue Dateien: kein Baseline-Eintrag, keine Baseline-Key-Erhöhung.
- S4: Das Skript ist per CI-Workflow und per Doku-Referenz aus der p1-Policy
  erreichbar — kein Orphan, kein Taskfile-Eingriff nötig.

## Task 1 — Checker schreiben

Lege `scripts/legal/license-check.sh` an (shebang, `set -euo pipefail`).
Fail-closed Prüfungen, jede mit eigenem Exit-Pfad ungleich 0:

1. Manifest parst (`jq empty`).
2. Jeder Eintrag hat nicht-leere `name`, `version`, `source`, `license`.
3. Keine `version` enthält `^`, `~` oder `latest`.
4. Denylist: keine `license` aus der AGPL/GPL-Familie im Manifest.
5. Jeder Manifest-`name` kommt in `docs/legal/NOTICE.md` vor.
6. Die Policy-Datei enthält alle Anker RP-1 bis RP-7.

Erfolgsfall gibt eine Zeile `license-check: PASS` aus. Keine stillen Skips:
fehlt eine Eingabedatei, ist das ein Fehler.

## Task 2 — Workflow schreiben

Lege `.github/workflows/license-policy.yml` an: läuft bei Pull Requests und
auf main, ruft `bash scripts/legal/license-check.sh` auf. Keine Secrets,
keine Matrix, keine Fremd-Actions außer `actions/checkout` mit gepinnter
Revision.

## Task 3 — Verify

- `bash scripts/legal/license-check.sh` meldet `license-check: PASS`.
- Negativprobe: Denylist-Verletzung in einer Kopie des Manifests im
  Temp-Verzeichnis wird erkannt (Checker gegen Kopie parametrisierbar oder
  Negativprobe per `jq`-Mutation im Test).
- Workflow-YAML parst (`python3 -c` mit `yaml.safe_load` oder `yq`).
