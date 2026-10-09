# p4-assets-release — Asset- und Release-Partial für T901032 (Slug license-manifest)

Scope: genau zwei neue Dateien (exklusiv, keine anderen Dateien einplanen):

- `docs/legal/asset-licensing.md` (Asset-Lizenzierung, getrennt von Code)
- `docs/legal/release-attribution.md` (Release-Checkliste)

Lesereihenfolge vor Task 1: `intel.json` dieses Plan-Ordners,
`.agents/skills/references/plan-quality-gates.md`, p1-Policy
(`docs/legal/reuse-policy.md`), p2-NOTICE (`docs/legal/NOTICE.md`).

## File Structure

| Datei | Status | S1-Schwelle | Budget | Planziel |
| `docs/legal/asset-licensing.md` | neu, Ist 0, nicht-baselined | keine (`.md` steht nicht in `s1.limits`) | unlimitiert, trotzdem knapp halten | max. 150 Zeilen |
| `docs/legal/release-attribution.md` | neu, Ist 0, nicht-baselined | keine (`.md` steht nicht in `s1.limits`) | unlimitiert, trotzdem knapp halten | max. 150 Zeilen |

S1-Budget-Notizen:

- Markdown ist in `docs/code-quality/gates.yaml` unter `s1.limits` nicht
  gelistet; es gibt keine wirksame S1-Schwelle.
- Neue Dateien: kein Baseline-Eintrag, keine Baseline-Key-Erhöhung.
- Kein Split nötig.

## Task 1 — Asset-Lizenzierung schreiben

Lege `docs/legal/asset-licensing.md` an. Inhalt:

1. Grundsatz: Asset-Lizenzierung ist getrennt von Code-Lizenzierung; das
   Top-Level-LICENSE deckt Assets nicht automatisch ab.
2. Pro Asset dokumentieren: Quelle, Inhaber, Lizenz, Permissions.
3. Kategorien: Fonts, Bilder, Fotos, Marken, generierte Outputs.
4. Quarantäne-Prozess: Material mit ungeklärten Rechten wird nicht publiziert,
   Ablage und Freigabe-Kriterien.
5. Design-Repo startet privat; Verweis auf die RP-Anker der p1-Policy.

## Task 2 — Release-Attribution schreiben

Lege `docs/legal/release-attribution.md` an. Inhalt: Release-Checkliste —
Manifest aktuell, NOTICE aktuell, Lizenztexte beigelegt, Checker grün,
keine AGPL-Ausnahme still genehmigt, Quell-Angebots-Pflichten bei
Netznutzung modifizierter Versionen geprüft. Jeder Punkt verweist auf die
prüfende Stelle (Manifest, NOTICE, Checker, Policy-Anker).

## Task 3 — Verify

- Beide Dateien vorhanden; Begriffe `Quarantäne`, `Attribution`,
  `AGPL-Ausnahme` je mindestens einmal in der passenden Datei.
- Keine Brand-Domain-Literale in beiden Dateien.
