# p1-reuse-policy — Policy-Partial für T901032 (Slug license-manifest)

Scope: genau eine neue Datei (exklusiv, keine anderen Dateien einplanen):

- `docs/legal/reuse-policy.md` (Policy-Dokument, Stilvorlage Struktur:
  `docs/adr/ADR-004-llm-fail-closed.md` für ADR-nahe Dokusprache)

Lesereihenfolge vor Task 1: `intel.json` dieses Plan-Ordners,
`.agents/skills/references/plan-quality-gates.md`, Ticket T901032
Beschreibungstext (Policy-Fakten), `LICENSE` (Repo-Root, MIT-Wortlaut).

## File Structure

| Datei | Status | S1-Schwelle | Budget | Planziel |
| `docs/legal/reuse-policy.md` | neu, Ist 0, nicht-baselined | keine (`.md` steht nicht in `s1.limits`) | unlimitiert, trotzdem knapp halten | max. 200 Zeilen |

S1-Budget-Notizen:

- Markdown ist in `docs/code-quality/gates.yaml` unter `s1.limits` nicht
  gelistet (geprüft: nur `.astro`, `.ts`, `.svelte`, `.sh`, `.mjs`, `.mts`,
  `.py`, `.js`, `.jsx`, `.tsx`, `.cjs`, `.bash`, `.java`, `.php`).
- Neue Datei: kein Baseline-Eintrag, keine Baseline-Key-Erhöhung.
- Kein Split nötig.

## Task 1 — Reuse-Policy schreiben

Lege `docs/legal/reuse-policy.md` an mit folgenden Abschnitten:

1. Geltungsbereich: eigener Plattform- und Tooling-Code (MIT, Verweis auf
   Repo-`LICENSE`), Drittkomponenten, Skills, Assets.
2. Eigener Code: MIT für Original-Code; bestehende gültige MIT-Grants werden
   nicht zurückgezogen.
3. Erlaubte Dritt-Lizenzen: MIT und Apache-2.0 mit anwendbaren LICENSE/NOTICE-
   und Änderungs-Hinweisen; exakte Revisions- und Closure-Prüfung Pflicht.
4. AGPL-Sperre: keine Einbettung und kein Kopieren von AGPL-Code in den
   MIT-Kern, keine MIT-Umetikettierung; AGPL-Adoption nur per separatem
   Architektur- und Lizenzbeschluss mit Compliance-Plan.
5. Kein automatisches Relicensing von Dritt-Code, Fonts, Bildern, Fotos,
   Marken oder generierten Outputs.
6. Design-Repo: Code darf MIT sein, jedes Asset behält dokumentierte
   Quelle, Inhaber, Lizenz und Permissions; Start privat, Material mit
   ungeklärten Rechten bleibt in Quarantäne und wird nicht publiziert.
7. Hinweis: Engineering-Policy, kein Versprechen dass ein Top-Level-LICENSE
   alles abdeckt.

Jede Regel bekommt eine stabile Anker-ID (`RP-1` bis `RP-7`), damit Checker,
Manifest und Guards sie zitieren können.

## Task 2 — Verify

- Datei vorhanden, alle sieben Anker-IDs genau einmal enthalten.
- Begriffe `AGPL`, `Apache-2.0`, `MIT`, `Quarantäne` je mindestens einmal.
- Keine Brand-Domain-Literale im Dokument.
