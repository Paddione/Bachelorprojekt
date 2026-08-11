---
title: Admin-Menü — tote SDLC-Einträge entfernen und Navigation neu gruppieren
ticket_id: T003826
domains: [website, admin, navigation, test]
status: plan_staged
---

# admin-nav-sdlc-cleanup — Implementation Plan

## File Structure

| Datei | Ist | Budget | Rolle |
|---|---|---|---|
| `website/src/lib/admin/nav-items.ts` | neu | — | Nav-Definition als importierbares Modul (Extraktion) |
| `website/src/components/admin/AdminSidebarNav.astro` | 180 | 420 | rendert nur noch; Definition und Akkordeon entfallen |
| `website/src/lib/admin/__tests__/nav-items.test.ts` | neu | — | Guard: kein `href` löst auf `/sdlc/` auf |
| `tests/spec/admin-cockpit.bats` | 85 | — | sechs Source-Grep-Assertions entfallen |
| `website/src/middleware/redirect-map.ts` | 51 | — | veralteter Kopfkommentar zu `/admin/pipeline` |
| `openspec/changes/admin-nav-sdlc-cleanup/specs/*.md` | — | — | drei Delta-Specs (bereits geschrieben) |

`AdminSidebarNav.astro` ist nicht gebaselined; wirksame Schwelle ist das `.astro`-Limit 600
aus `docs/code-quality/gates.yaml`, Budget also 420 — die Datei wird durch diesen Change
ohnehin **kleiner**, weil Definition und Akkordeon-Skript herauswandern. Für `.bats` und
`.md` führt `gates.yaml` kein S1-Limit, deshalb steht dort bewusst keine Budget-Zahl.

## Partials

| Partial | Rolle | Dateien |
|---|---|---|
| p1 | Nav-Extraktion und Bereinigung | `website/src/lib/admin/nav-items.ts`, `website/src/components/admin/AdminSidebarNav.astro`, `website/src/middleware/redirect-map.ts` |
| p2 | Tests | `website/src/lib/admin/__tests__/nav-items.test.ts`, `tests/spec/admin-cockpit.bats` |

Die Dateimengen sind disjunkt. p2 ist die Tests-Rolle und trägt den Failing-Test-Step.

## Warum die Nav-Definition ein eigenes Modul wird

Der geforderte Guard soll prüfen, ob ein Menü-Eintrag über `redirect-map.ts` in einer
`/sdlc/`-Route landet. Solange die Einträge als Objektliteral im Frontmatter einer
`.astro`-Datei stehen, kann ein Test sie nur per `grep` aus dem Quelltext klauben — also
genau die Prüfform, die `CLAUDE.md` § Test-Resultats-Konvention (T002448-M4) ausschließt und
die diesen Fehler überhaupt erst hat durchrutschen lassen.

Als `.ts`-Modul lassen sich die Einträge importieren und zusammen mit der ebenfalls
exportierten `resolveRedirect()` echt auflösen. Der Guard misst dann das Ergebnis der
Auflösung statt die Schreibweise des Quelltexts, und er bleibt gültig, wenn jemand die Datei
umformatiert oder ein Label umbenennt.

---

## Task 1 — Nav-Definition nach `nav-items.ts` extrahieren (p1)

Neue Datei `website/src/lib/admin/nav-items.ts`, die den `NavItem`-Typ und die
Sektionsstruktur exportiert. Das Modul bleibt **pur**: keine Imports aus DB- oder
API-Schichten, damit kein S2-Import-Zyklus entsteht. Die dynamischen Werte (`inboxPending`,
`brettUrl`) bleiben Props der Komponente und werden über eine Fabrikfunktion
`buildNavSections({ inboxPending, brettUrl })` hineingereicht, statt im Modul zu leben.

Exportiert werden:

- `type NavItem` mit `href`, `label`, `icon`, optional `matches`, `badge`, `external`
- `type NavSection` mit optionalem `label` und `items`
- `buildNavSections(opts): NavSection[]`

Typisierung ist vollständig — kein `any`, damit CQ02 nicht wächst.

**Step:** Modul anlegen, `pnpm exec tsc --noEmit` im `website/`-Verzeichnis läuft ohne neue
Fehler durch.

---

## Task 2 — Tote Einträge entfernen und neu gruppieren (p1)

In `buildNavSections()` die sechs Einträge streichen, deren Ziel im prod-Build fehlt:
Cockpit, App-Katalog, KI-Konfig., Prompts, Systemtest, Repo Health. Beim Cockpit-Eintrag
entfällt auch das `matches`-Array, das `/admin/pipeline` und `/admin/tickets` mitführte.

Die verbleibenden zwölf Einträge werden so gegliedert:

```
(ohne Label)  Dashboard · Postfach
GESCHÄFT      Klienten · Sessions · Fakturierung
INHALTE       Content Hub · Wissensbasis · Content-DB
WERKZEUGE     Assets · 3D Generator · Systembrett (extern)
SYSTEM        Einstellungen
```

Die `matches`-Arrays der verbleibenden Einträge bleiben unverändert — sie steuern die
Aktiv-Markierung und referenzieren ausschließlich `/admin/`-Pfade, die im prod-Build
existieren.

**Step:** `bash -c 'cd website && grep -c "sdlc" src/lib/admin/nav-items.ts'` liefert `0`.

---

## Task 3 — Akkordeon aus `AdminSidebarNav.astro` entfernen (p1)

Die Komponente importiert `buildNavSections` und rendert nur noch. Es entfallen: das
Objektliteral `werkstattItems`, die Konstante `navSections`, die Variable `werkstattActive`,
der Akkordeon-Zweig im Template (`sidebar-group-btn`, `accordion-arrow`, `werkstatt-items`),
der `<script>`-Block mit dem Click-Listener und die `.werkstatt-items`/`.sidebar-group-btn`/
`.accordion-arrow`-Regeln im `<style>`-Block.

Damit bleibt ein einziger Render-Zweig für alle Sektionen statt der bisherigen Verzweigung
zwischen Akkordeon- und Flach-Darstellung. Die Funktion `isActive()` und das Markup der
einzelnen Einträge (Icon, Label, Badge, `target`/`rel` bei `external`) bleiben unverändert —
dieser Change fasst die Optik nicht an.

**Step:** `wc -l website/src/components/admin/AdminSidebarNav.astro` liegt unter dem
Ausgangswert 180 und damit im Budget 420.

---

## Task 4 — Veralteten Kommentar in `redirect-map.ts` korrigieren (p1)

Der Kopfkommentar behauptet in Zeile 5: „`/admin/pipeline` steht NICHT in dieser Karte".
Der Eintrag steht dort aber (Zeile 13). Die Zeile wird auf den tatsächlichen Zustand
korrigiert. Die Karte selbst bleibt inhaltlich unverändert: die Redirects werden weiterhin
gebraucht, damit gespeicherte Lesezeichen innerhalb des SDLC-Build-Ziels ihr Ziel finden.

<!-- vitest: kein neuer Test nötig, weil reine Kommentarkorrektur ohne Verhaltensänderung -->

**Step:** `grep -n 'NICHT in dieser Karte' website/src/middleware/redirect-map.ts` liefert
keinen Treffer mehr.

---

## Task 5 — Guard-Test schreiben (p2, rot → grün)

Neue Datei `website/src/lib/admin/__tests__/nav-items.test.ts`. Der Test importiert
`buildNavSections` und `resolveRedirect` und prüft für jeden nicht-externen Eintrag, dass
sein `href` nicht über die Redirect-Karte in einer `/sdlc/`-Route landet. Bei Verstoß nennt
die Fehlermeldung den betroffenen `href`, damit der Verursacher aus dem CI-Log ablesbar ist.

Abgedeckte Fälle:

1. Kein `href` löst auf ein Ziel mit Präfix `/sdlc/` auf — inklusive transitiver Auflösung,
   denn `/admin/planungsbuero` zeigt auf `/sdlc/cockpit?tab=planung` und ist damit ebenso
   betroffen wie ein direkter Eintrag.
2. Auch die Einträge der `matches`-Arrays lösen nicht nach `/sdlc/` auf — sie sind zwar
   keine Links, benennen aber Routen, die es im prod-Build geben muss.
3. Ein synthetischer Eintrag mit `href: '/admin/cockpit'` lässt den Guard fehlschlagen
   (Positiv-Anker: ohne ihn bestünde der Test auch bei leerer Kandidatenliste vakuos, siehe
   `CLAUDE.md` § Positiv-Anker-Pflicht bei Negativtests, T002356-M1).
4. Die vier Sektionslabel „Geschäft", „Inhalte", „Werkzeuge", „System" sind vorhanden und
   „Werkstatt" ist es nicht.

**Rot-Schritt** — vor Task 1 bis 4, gegen die unveränderte Sidebar:

```bash
cd website && pnpm exec vitest run src/lib/admin/__tests__/nav-items.test.ts
# expected: FAIL — buildNavSections existiert noch nicht und die sechs SDLC-Einträge
# stehen noch in der Komponente
```

**Grün-Schritt** — nach Task 1 bis 4:

```bash
cd website && pnpm exec vitest run src/lib/admin/__tests__/nav-items.test.ts
# expected: PASS
```

---

## Task 6 — Veraltete Assertions in `tests/spec/admin-cockpit.bats` entfernen (p2)

Die sechs Tests in den Zeilen 45 bis 85 entfallen: `sidebar-group-btn`, `accordion-arrow`,
`is-collapsed`-Toggle, Click-Listener, `Werkstatt`, `Infrastruktur`. Sie greppen die
Quelldatei nach Zeichenketten und beschreiben nach dieser Änderung einen Zustand, den es
nicht mehr gibt. Der Guard aus Task 5 tritt an ihre Stelle.

Der Test `admin-nav-accordion: AdminSidebarNav.astro exists` (Zeile 36) bleibt bestehen —
er prüft die Existenz der Datei, nicht ihre Formatierung, und trägt weiterhin.

**Step:**

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/admin-cockpit*
# expected: PASS — die verbleibenden Tests der Datei laufen durch
```

Beide Formen erfassen (Sammeldatei und Verzeichnis), weil `tests/spec/admin-cockpit.bats`
und ein etwaiges `tests/spec/admin-cockpit/` gleichzeitig gültig sind — eine Suche nur nach
der Sammeldatei fände die Hälfte (`CLAUDE.md` § BATS-Konvention, T002696).

---

## Task 7 — Verifikation

```bash
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```

Zusätzlich:

```bash
# CQ02 — die any-Zahl darf nicht wachsen
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"

# Positiv-Anker: der Guard läuft und findet die reale Sidebar (nicht leere Kandidatenliste)
cd website && pnpm exec vitest run src/lib/admin/__tests__/nav-items.test.ts --reporter=verbose
```

`task test:inventory` ist Pflicht, weil mit `nav-items.test.ts` eine neue Testdatei entsteht;
`website/src/data/test-inventory.json` wird mitcommittet, sonst schlägt der CI-Inventar-Check
fehl.

Die drei Delta-Specs unter `openspec/changes/admin-nav-sdlc-cleanup/specs/` sind bereits
geschrieben und werden in diesem Change nicht mehr angefasst; ihre Zusammenführung in die
SSOT-Specs erfolgt beim Archivieren nach dem Merge.
