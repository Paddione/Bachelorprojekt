# p2-manifest-notice — Manifest-Partial für T901032 (Slug license-manifest)

Scope: genau zwei neue Dateien (exklusiv, keine anderen Dateien einplanen):

- `docs/legal/third-party-manifest.json` (maschinenlesbares Manifest)
- `docs/legal/NOTICE.md` (menschliche Attribution)

Lesereihenfolge vor Task 1: `intel.json` dieses Plan-Ordners,
`.agents/skills/references/plan-quality-gates.md`, p1-Policy
(`docs/legal/reuse-policy.md`, Anker RP-1 bis RP-7), `package.json` und
`components/website/package.json` (Dependency-Closure).

## File Structure

| Datei | Status | S1-Schwelle | Budget | Planziel |
| `docs/legal/third-party-manifest.json` | neu, Ist 0, nicht-baselined | keine (`.json` steht nicht in `s1.limits`) | unlimitiert, trotzdem knapp halten | max. 300 Zeilen |
| `docs/legal/NOTICE.md` | neu, Ist 0, nicht-baselined | keine (`.md` steht nicht in `s1.limits`) | unlimitiert, trotzdem knapp halten | max. 200 Zeilen |

S1-Budget-Notizen:

- Beide Extensions sind in `docs/code-quality/gates.yaml` unter `s1.limits`
  nicht gelistet; es gibt keine wirksame S1-Schwelle.
- Neue Dateien: kein Baseline-Eintrag, keine Baseline-Key-Erhöhung.
- Kein Split nötig.

## Task 1 — Manifest-Schema und initiale Einträge

Lege `docs/legal/third-party-manifest.json` an. Schema je Eintrag: `name`,
`version` (exakt gepinnt, kein Range), `source` (Upstream-URL), `license`
(SPDX-ID), `notices` (Pfad zum Lizenztext-Auszug oder Upstream-LICENSE-URL),
`transitive` (bool), `policy_ref` (RP-Anker aus p1).

Initiale Einträge aus der Ticket-Spec: HyperUI, shadcn-svelte, Bits UI,
frontend-design-Skill — jeweils mit exakt verifizierter Revision und
MIT-Lizenz. Dazu ein Abschnitt `npm_closure` mit der Ableitungsmethode
(Lockfile plus `npm ls`) und dem Datum der letzten Inventur.

Das JSON muss mit `jq empty` fehlerfrei parsen.

## Task 2 — NOTICE schreiben

Lege `docs/legal/NOTICE.md` an: menschliche Attribution, ein Abschnitt je
Manifest-Eintrag mit Name, exakter Version, Quelle, Lizenz und
Copyright-Zeile. Der Checker aus p3 prüft, dass jeder Manifest-Name in NOTICE
vorkommt.

## Task 3 — Verify

- `jq empty docs/legal/third-party-manifest.json` erfolgreich.
- Jede `version` ist exakt gepinnt (kein `^`, kein `~`, kein `latest`).
- Jeder Manifest-`name` kommt in `docs/legal/NOTICE.md` vor.
- Keine Brand-Domain-Literale in beiden Dateien.
