# p5-tests — Test-Partial für T901032 (Slug license-manifest)

Scope: genau eine neue Datei (exklusiv, keine anderen Dateien einplanen,
keine Implementierung — nur Tests):

- `tests/spec/license-manifest.bats` (BATS Spec-Guards, Stilvorlage:
  `tests/spec/agent-skills/post-merge-finalize-safety.bats`)

Lesereihenfolge vor Task 1: `intel.json` dieses Plan-Ordners,
`.agents/skills/references/plan-quality-gates.md`, die Stilvorlage oben,
p1- bis p4-Pläne (Vertrags-Anker unten).

## File Structure

| Datei | Status | S1-Schwelle | Budget | Planziel |
| `tests/spec/license-manifest.bats` | neu, Ist 0, nicht-baselined | keine (`.bats` steht nicht in `s1.limits`) | unlimitiert, trotzdem knapp halten | max. 150 Zeilen |

S1-Budget-Notizen:

- `.bats` ist in `docs/code-quality/gates.yaml` unter `s1.limits` nicht
  gelistet; es gibt keine wirksame S1-Schwelle.
- Neue Datei: kein Baseline-Eintrag, keine Baseline-Key-Erhöhung.
- Kein Split nötig.

Vertrags-Anker (nur lesen, nicht ändern — Implementierung liefern die
Geschwister-Partials):

- Policy: `docs/legal/reuse-policy.md` (Anker RP-1 bis RP-7)
- Manifest: `docs/legal/third-party-manifest.json` (Schema name, version,
  source, license, notices, transitive, policy_ref)
- NOTICE: `docs/legal/NOTICE.md` (ein Abschnitt je Manifest-Eintrag)
- Checker: `scripts/legal/license-check.sh` (meldet `license-check: PASS`)
- Workflow: `.github/workflows/license-policy.yml`
- Assets: `docs/legal/asset-licensing.md`
- Release: `docs/legal/release-attribution.md`

## Task 1 — BATS Spec-Guards anlegen

Lege `tests/spec/license-manifest.bats` an (shebang `#!/usr/bin/env bats`,
Repo-Root-Auflösung am Dateikopf wie in der Stilvorlage). Sechs Guards mit
`@test "T901032-<n>: ..."`-Titeln:

1. Policy existiert und enthält alle Anker RP-1 bis RP-7.
2. Manifest parst mit `jq empty` und jede Version ist exakt gepinnt.
3. Jeder Manifest-Name kommt in NOTICE vor.
4. Der Checker meldet `license-check: PASS` (Runner: `bats`).
5. Der Workflow existiert und referenziert den Checker-Pfad.
6. Asset- und Release-Dokumente existieren mit Pflichtbegriffen.

Rotphase: Guards zuerst gegen den unimplementierten Stand laufen lassen,
expected: FAIL. Befehl: `bats tests/spec/license-manifest.bats`.
Erst danach gelten sie als grün, wenn p1 bis p4 umgesetzt sind.

## Task 2 — Verify

- `bats tests/spec/license-manifest.bats` — alle sechs Guards grün.
- Negativprobe: Guard 4 erkennt eine Denylist-Verletzung (Manifest-Kopie
  mit AGPL-Eintrag im Temp-Verzeichnis, Checker dagegen geprüft).
