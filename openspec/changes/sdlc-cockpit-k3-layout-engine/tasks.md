---
title: "sdlc-cockpit-k3-layout-engine — Implementation Plan"
ticket_id: T002462
domains: [website, test]
status: plan_staged
file_locks:
  - .lavish/kit/layout.js
  - .lavish/kit/layout.css
  - .lavish/kit/panel.js
  - .lavish/cockpit-shell.html
  - website/src/pages/admin/cockpit.astro
shared_changes: false
batch_id: null
parent_feature: T002458
depends_on_plans: [T002463]
---

# sdlc-cockpit-k3-layout-engine — Implementation Plan

_Ticket: T002462 · Epic T002458 · bindend: Design-Spec E3, E4, E7, E11, D1, D7, D8,
Abschnitt 3 (inkl. 3.2)_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `.lavish/kit/layout.js` | neu | 800 |
| `.lavish/kit/layout.css` | neu | ungegated |
| `.lavish/kit/panel.js` | 278 | 522 |
| `.lavish/kit/panel.css` | 240 | ungegated |
| `.lavish/cockpit-shell.html` | 163 | ungegated |
| `website/src/pages/admin/cockpit.astro` | 171 | 429 |
| `website/public/cockpit/kit/layout.js` | neu (Symlink) | ungegated |
| `website/public/cockpit/kit/layout.css` | neu (Symlink) | ungegated |
| `tests/unit/cockpit-layout.test.ts` | neu | 900 |
| `tests/spec/sdlc-cockpit/layout-buildfree.bats` | neu | ungegated |
| `tests/spec/sdlc-cockpit/layout-kit-asset-wiring.bats` | neu | ungegated |
| `tests/spec/sdlc-cockpit/layout-rail-fixed.bats` | neu | ungegated |
| `website/src/data/test-inventory.json` | generiert | ungegated |

Budget-Ermittlung nach `plan-quality-gates.md`: keine der berührten Dateien steht in
`docs/code-quality/baseline.json`, die wirksame Schwelle ist damit das statische
Extension-Limit aus `docs/code-quality/gates.yaml` (`.js` 800, `.astro` 600, `.ts` 900).
`.css`, `.html` und `.bats` haben kein S1-Limit. `layout.js` wird auf ~400 Zeilen
geschnitten, damit Wachstumsreserve unter dem Limit bleibt; wächst es beim Bau darüber
hinaus, wird die Persistenzschicht als eigene Kit-Datei neben layout.js echt herausgelöst
(nicht zusammengezogen); der Split gehört dann in Task 4.

<!-- vitest: neue Logik liegt in .lavish/kit/layout.js, nicht in website/src/lib —
     abgedeckt durch tests/unit/cockpit-layout.test.ts (Task 3/4). cockpit.astro
     verliert nur seinen Style-Block und gewinnt zwei Script-Tags, keine neue Logik. -->

## Ausgangslage und Randbedingungen

Verifizierte Befunde, gegen die dieser Plan geschrieben ist:

1. `website/public/cockpit/kit/*` sind **einzelne** Symlinks (git-mode 120000) auf
   `.lavish/kit/*` — Datei für Datei, kein Verzeichnis-Symlink
   (`git ls-files -s website/public/cockpit/kit`). Folge: der Admin nutzt die
   JS-Laufzeit direkt, eine nach Svelte portierte Zweitfassung entsteht nicht. Aber eine
   **neue** Kit-Datei erscheint dort nicht von selbst.
2. `website/Dockerfile` Zeile 35 kopiert mit `COPY .lavish/kit ./public/cockpit/kit` das
   **ganze Verzeichnis**. Eine neue Kit-Datei landet dadurch im Image, ohne dass das
   Dockerfile geändert werden muss. Was fehlt, ist der Symlink für Checkout und
   Dev-Server — und die Guard-Abdeckung dafür. Der bestehende Guard
   `tests/spec/sdlc-cockpit/kit-assets-in-image.bats` prüft nur die drei Einstiegspfade
   `kit`, `cockpit-shell.html`, `reference-board.html`, nicht einzelne Kit-Dateien.
   Task 6 schließt genau diese Lücke.
3. `.lavish/opencode-cockpit.html` **existiert nicht mehr** (`ls .lavish/` zeigt nur
   `cockpit-shell.html`, `reference-board.html`, `kit/`, `styles/`).
   `cockpit-shell.html` hat sie abgelöst; der Planungsstand in
   `docs/superpowers/plans/2026-08-02-sdlc-cockpit-k3-k8-plan.md` nennt sie noch. Sie ist
   deshalb nicht Teil der File Structure.
4. `website/src/pages/admin/cockpit.astro` trägt in Zeile 26–36 denselben
   handgeschriebenen Layout-Block wie `cockpit-shell.html`. Beide werden hier ersetzt
   (dieser Punkt ist aus K10/T002531 herausgenommen worden und gehört hierher).
5. Der Branch zweigt von `main` ab, nicht von K4s Branch. Der `panel.js`-Konflikt mit K4
   wird bewusst in Kauf genommen: wer zuerst merged, gewinnt, der zweite rebased.

## Task 1 — Vorprüfung K4-Schnittstelle (vor Task 5, dem Mobilteil)

Abschnitt 3.2 verlangt, dass mobil das Terminal-Panel **und** nicht umkehrbare Aktionen
gesperrt sind (D8 → D6). Die Sperre der Aktionen ist K4s Mechanik
(`.lavish/kit/action-policy.js`), die Sperre des Terminal-Panels ist Layout-Sache und
damit unsere.

- [ ] Prüfen, ob K4 bereits auf `main` liegt:

```bash
git fetch origin main --quiet
git show origin/main:.lavish/kit/action-policy.js > /dev/null 2>&1 \
  && echo "K4-LIEGT-AUF-MAIN" || echo "K4-LIEGT-NICHT-AUF-MAIN"
```

- [ ] **Ergebnis `K4-LIEGT-AUF-MAIN`:** gegen die reale Datei bauen. Die tatsächlichen
      Signaturen aus `origin/main:.lavish/kit/action-policy.js` lesen und verwenden.
- [ ] **Ergebnis `K4-LIEGT-NICHT-AUF-MAIN`:** gegen die Schnittstelle bauen, die K4s Plan
      (`origin/feature/sdlc-cockpit-k4-steuerung-T002463:openspec/changes/sdlc-cockpit-k4-steuerung/tasks.md`,
      Task 6) festlegt. Erwartet wird ein klassisches Skript, das `window.actionPolicy`
      setzt, mit:

      - `ACTION_STATES` — Liste `['available','locked','confirming','running']`
      - `classify(action)` → `'repeatable' | 'reversible' | 'irreversible'`
      - `confirmationFor(action, target)` → `null` | `{ level:'simple' }` |
        `{ level:'named', target }`
      - `mobileLock(action, { viewport, unlockedThisSession })` → `boolean`

      Für K3 ist ausschließlich `mobileLock` mit dieser Signatur relevant. Die
      sitzungsweise Freischaltung legt K4 in `sessionStorage` ab; K3 liest sie nicht
      selbst, sondern reicht sie als `unlockedThisSession` durch.

- [ ] Der Zugriff läuft in `layout.js` über **eine einzige** Indirektion
      `mobileGate(action, ctx)`. Liegt `window.actionPolicy` nicht vor, sperrt sie
      fail-closed (Rückgabe `true` für jede Aktion, die nicht ausdrücklich als
      wiederholbar bekannt ist) und meldet den Grund `'action-policy-missing'`. Kein
      stiller Durchlass — der Negativfall muss sichtbar sein, nicht bequem.
- [ ] Die getroffene Wahl als Kommentarkopf in `layout.js` festhalten (welcher der beiden
      Zweige gegriffen hat und mit welchem Datum), damit beim Zusammenführen der beiden
      PRs erkennbar ist, was zusammenpassen muss.

## Task 2 — Berührung von `panel.js` eng begrenzen

K4 baut in derselben Datei `resize()` (Zeile 212–220) und `confirmAction()` (Zeile 240 ff.)
um. K3 fasst beide **nicht** an, um den Rebase absehbar zu halten.

- [ ] `destroy()` (Zeile 59–62) um `Panel.registry.delete(this.el)` ergänzen. Heute
      bleibt ein zerstörtes Panel in der statischen Map stehen — für Pop-out und
      Katalog-Rückkehr ist das ein echter Fehler, nicht Kosmetik.
- [ ] Statischen Lesezugriff `Panel.get(el)` ergänzen (gibt `Panel.registry.get(el)`
      zurück). Die Layout-Engine darf die Registry nicht direkt anfassen.
- [ ] Statisches `Panel.adopt(el)` ergänzen: liefert das bestehende Panel, falls
      registriert, sonst `Panel.create(el)`. Damit findet ein ausgeklinktes Panel sauber
      zurück, ohne dass die Engine `create`/`destroy` selbst abwägen muss.
- [ ] Beide Ergänzungen liegen bei Zeile 3–14 und 59–62 — also weit von K4s Eingriffen.
      Diese drei Punkte sind der **vollständige** Umfang der `panel.js`-Änderung in K3.
      Alles weitere gehört in `layout.js`.
- [ ] `resize(size)` wird von der Engine nur **aufgerufen**, nicht verändert. Die
      unvollständige Mobilsperre darin bleibt so, wie sie ist; K4 korrigiert sie.

## Task 3 — Layout-Kern als reine Rechnung (RED zuerst)

Die Layout-Entscheidung wird als DOM-freie Rechnung gebaut, damit sie ohne Browser messbar
ist. Der DOM-Teil (Task 5) ruft sie nur auf.

- [ ] `tests/unit/cockpit-layout.test.ts` anlegen (Vitest, die Root-Config erfasst
      `tests/unit/**/*.test.ts`). Der Test **führt die echte Quelle aus** — Vorbild ist
      K4s Verfahren: Datei per `readFileSync` lesen, per `new Function('window', src)` mit
      einem Fenster-Attrappenobjekt ausführen, danach das entstandene `window.cockpitLayout`
      befragen. Damit misst er Verhalten, nicht Text.
- [ ] Abgedeckte Fälle:
      - `RAIL_GROUPS` enthält genau die vier Gruppen aus D7 in dieser Reihenfolge:
        laufende Epics, was Aufmerksamkeit braucht, aktive Agenten, Modell-Server.
      - `RAIL_GROUPS` ist eingefroren: ein Schreibversuch (`push`, Index-Zuweisung)
        lässt die Liste unverändert. Positiv-Anker im selben Test: vorher prüfen, dass
        die Liste die vier erwarteten Einträge **hat** — sonst bestünde die
        Unveränderlichkeitsaussage auch für eine leere Liste vakuos.
      - Es gibt keine Funktion und keinen Schlüssel, über den sich die Rail-Gruppen
        setzen ließen. Auch hier zuerst der Positiv-Anker (`RAIL_GROUPS` ist lesbar und
        nicht leer), dann die Negativaussage.
      - `computePlacement({panels, viewport:'desktop'})` platziert höchstens drei Panels
        als Karte; überzählige bleiben im Katalog (E3, keine Kachelwand).
      - `computePlacement` mit gesetzter Vollfläche platziert genau ein Panel.
      - `computePlacement({viewport:'mobile'})` liefert genau ein sichtbares Panel in
        Vollflächengröße (3.2).
      - `computePlacement({viewport:'mobile'})` meldet ein Terminal-Panel als
        `locked` mit angegebenem Grund und platziert es nicht (D8).
      - Die Rail-Gruppen sind auch mobil vorhanden, nur als `topbar` + `sheet`
        ausgewiesen statt als `column`.
- [ ] Lauf **vor** der Implementierung:

```bash
npx vitest run tests/unit/cockpit-layout.test.ts
# expected: FAIL — .lavish/kit/layout.js existiert noch nicht, window.cockpitLayout ist undefined
```

- [ ] Danach `.lavish/kit/layout.js` anlegen: klassisches Skript ohne `import`/`export`,
      ohne npm-Abhängigkeit, ohne Bundler-Schritt (D1). Es setzt `window.cockpitLayout`
      mit `RAIL_GROUPS` (per `Object.freeze`), `computePlacement(state)`,
      `mobileGate(action, ctx)` aus Task 1 und den Persistenzfunktionen aus Task 4.
      Es lädt per `<script src>` und muss auch von `file://` funktionieren.
- [ ] Test erneut laufen lassen, bis er grün ist.

## Task 4 — Persistenz über eigenen `localStorage`-Schlüssel

Die Anordnung ist Ansichtsvorliebe, kein Arbeitsergebnis. Sie kommt deshalb **nicht** in
den Canvas-Store von K5 (`.lavish/kit/canvas-store.js`): der hat mit K5 eine ausdrückliche
Eigentumsgrenze samt Fremdänderungserkennung, und ein Canvas-Export umfasste sonst
plötzlich Panel-Positionen.

- [ ] Schlüsselform an das bestehende Muster in `panel.js` anlehnen (`loadCanvas`/`save`,
      Zeile 193–210 nutzen `lavish-canvas-${id}`): der Layout-Schlüssel heißt
      `lavish-layout-v1`. Die Version steckt im Schlüssel **und** im Nutzdatenobjekt.
- [ ] `serializeLayout(state)` → JSON-Zeichenkette mit `{ version, workspace: [ids],
      fullscreen: id|null, catalog: [ids] }`. Kein DOM-Inhalt, keine Panel-Daten — nur
      Anordnung.
- [ ] `restoreLayout(raw, knownPanelIds)` → Anordnung. Verhalten bei Störung:
      - fehlender Wert, nicht parsbares JSON oder unbekannte Version → Standardanordnung,
        und der Canvas-Schlüssel wird dabei weder gelesen noch geschrieben.
      - Einträge auf nicht mehr vorhandene Panel-Kennungen werden verworfen, der Rest
        wird wiederhergestellt (kein Totalausfall wegen eines entfernten Panels).
- [ ] Diese Fälle in `tests/unit/cockpit-layout.test.ts` ergänzen, einschließlich der
      Aussage „bei unbekannter Version wird kein `lavish-canvas-`-Schlüssel berührt" —
      mit Positiv-Anker im selben Test: zuerst zeigen, dass eine **gültige** gespeicherte
      Anordnung korrekt wiederhergestellt wird.

## Task 5 — DOM-Schicht: Katalog, Ziehen, Pop-out, Vollfläche, Mobil

Eingabe-API ist ausschließlich **Pointer Events** — ein Codepfad für Maus, Touch und Stift.
Die HTML5-Drag-and-Drop-API ist verworfen: auf Touch startet sie Scroll- und
Textauswahlgesten und hätte einen zweiten Codepfad erzwungen. Ablegezonen und
Auto-Scroll werden deshalb selbst geschrieben; das ist der bekannte, akzeptierte Preis.

- [ ] **Fläche (E3).** `layout.js` baut aus dem vorhandenen Markup die Fokus-Spalte und
      den Arbeitsbereich auf und ruft für Größenwechsel `panel.resize(size)` auf. Die
      Fokus-Spalte trägt die vier D7-Gruppen; es gibt keinen Weg, sie zu ändern.
- [ ] **Katalog.** Panels, die nicht im Arbeitsbereich liegen, erscheinen im
      Panel-Katalog. Verschieben zwischen Katalog und Arbeitsbereich geht in beide
      Richtungen. Beim Verschieben wird das Element **bewegt**, das Panel-Objekt bleibt
      dasselbe (`Panel.adopt` aus Task 2), damit laufende Abfragen und der
      IntersectionObserver nicht neu aufgesetzt werden müssen.
- [ ] **Ziehen.** `pointerdown` → `setPointerCapture` auf dem Griff (der Panel-Kopf), damit
      das Element bei schnellem Ziehen nicht verloren geht. `pointermove` → Trefferprüfung
      gegen die selbst geführten Ablegezonen plus Auto-Scroll, wenn der Zeiger näher als
      eine feste Randzone an den Rand des Arbeitsbereichs kommt. `pointerup` → übernehmen
      und speichern. `pointercancel` → auf den Zustand vor dem Ziehen zurücksetzen.
      `touch-action: none` auf dem Griff, sonst frisst der Browser die Geste.
- [ ] **Pop-out.** Ein Panel klinkt sich in ein eigenes Fenster aus: `window.open` auf die
      Hülle mit der Panel-Kennung im Fragment. Im Ursprungsfenster wird das Panel über
      `panel.destroy()` abgebaut — das räumt jetzt auch die Registry (Task 2) — und ein
      Platzhalter im Katalog bleibt zurück. Schließt das Kindfenster, meldet es das über
      einen `BroadcastChannel`, und das Ursprungsfenster nimmt das Panel über
      `Panel.adopt` wieder auf. Kein zweiter Eintrag in der Registry, kein verwaistes
      Intervall.
- [ ] **Vollfläche (E7).** Umschalten auf Vollfläche und zurück bewegt das
      Panel-Element in den Vollflächenbereich, ohne es zu zerstören: ein Zustand, zwei
      Layouts. Der Canvas-Inhalt und die Änderungsmarkierung
      (`panel__body--modified`) überleben beide Richtungen.
- [ ] **Mobil (3.2).** Unterhalb der Mobilschwelle: Fokus-Spalte wird obere Leiste plus
      aufziehbares Bottom-Sheet mit den vier Rail-Gruppen (Aufziehen ebenfalls per Pointer
      Events); der Arbeitsbereich wird ein Ein-Panel-Stack, gewischt statt gekachelt;
      Panels erscheinen ausschließlich in Vollflächengröße. Das Terminal-Panel wird
      **sichtbar gesperrt**, nicht ausgeblendet (D8). Für nicht umkehrbare Aktionen ruft
      die Engine `mobileGate` aus Task 1 auf und setzt den gesperrten Zustand am
      Aktions-Slot; die Abstufung selbst bleibt K4s Sache.
- [ ] `website/src/styles/mobile-cockpit.css` wird **nicht** übernommen — es gehört zum
      alten Admin-Cockpit und beschreibt eine andere Struktur (Spec 3.2). Ob es ersatzlos
      entfällt, entscheidet K7.
- [ ] `.lavish/kit/layout.css` anlegen: alle neuen Layout-Klassen mit ausschließlich
      Token-Bezügen. `tokens.css` bleibt selektorfrei (E11) und wird nicht angefasst.

## Task 6 — Auslieferung: Symlinks, Image, Guards (RED zuerst)

Ein Plan, der diesen Schritt als Nebensatz behandelt, ist lokal grün und im Cluster tot.

- [ ] `tests/spec/sdlc-cockpit/layout-kit-asset-wiring.bats` anlegen. Prüfmodus im
      Header dokumentieren: **Ergebnis-Test** — der Test bildet die Docker-COPY-Semantik
      nach (Vorbild `kit-assets-in-image.bats`) und misst, ob `layout.js` und `layout.css`
      am Ende unter `public/cockpit/kit/` auflösbar und nicht leer sind. Zusätzlich:
      `website/public/cockpit/kit/layout.js` und `layout.css` müssen im Checkout
      auflösen (Dev-Server-Fall). Positiv-Anker im selben Test: zuerst prüfen, dass eine
      **bestehende** Kit-Datei (`panel.js`) beide Prüfungen besteht — sonst bestünde ein
      Test, der schlicht nichts findet.
- [ ] `tests/spec/sdlc-cockpit/layout-buildfree.bats` anlegen: die Kit-Dateien
      werden mit `node --check` geprüft und dürfen keine Modul-Syntax und keine
      npm-Abhängigkeit enthalten (D1). Positiv-Anker im selben Test: `node --check` auf
      `.lavish/kit/panel.js` muss zuerst durchlaufen.
- [ ] `tests/spec/sdlc-cockpit/layout-rail-fixed.bats` anlegen: die vier D7-Gruppen sind
      in beiden Hüllen vorhanden, und es gibt kein Markup-Attribut und keinen
      Konfigurationsschlüssel, mit dem sie sich umstellen ließen. Positiv-Anker im selben
      Test: die vier Gruppen müssen zuerst gefunden werden.
- [ ] Läufe **vor** der Umsetzung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/layout-kit-asset-wiring.bats \
                                  tests/spec/sdlc-cockpit/layout-buildfree.bats \
                                  tests/spec/sdlc-cockpit/layout-rail-fixed.bats
# expected: FAIL — layout.js/layout.css und ihre Symlinks existieren noch nicht
```

- [ ] Symlinks anlegen, in derselben Form wie die bestehenden neun Einträge
      (`git ls-files -s website/public/cockpit/kit` zeigt mode 120000, relativer Pfad):

```bash
ln -s ../../../../.lavish/kit/layout.js  website/public/cockpit/kit/layout.js
ln -s ../../../../.lavish/kit/layout.css website/public/cockpit/kit/layout.css
readlink -f website/public/cockpit/kit/layout.js   # muss auf .lavish/kit/layout.js zeigen
git ls-files -s website/public/cockpit/kit | grep layout   # muss mode 120000 zeigen
```

      Die Zieltiefe vor dem Anlegen an einem bestehenden Symlink ablesen
      (`readlink website/public/cockpit/kit/panel.js`) und exakt übernehmen, statt die
      Anzahl der `../` zu raten.

- [ ] `website/Dockerfile` prüfen, nicht blind ändern: Zeile 35 lautet
      `COPY .lavish/kit ./public/cockpit/kit` und kopiert das ganze Verzeichnis — eine
      neue Kit-Datei kommt dadurch ohne Änderung ins Image. Diese Feststellung als
      Kommentar am Guard festhalten. Ergibt die Prüfung etwas anderes (weil das
      Dockerfile inzwischen einzelne Dateien kopiert), die fehlenden `COPY`-Zeilen
      ergänzen. Maßgeblich ist in beiden Fällen der Testlauf, nicht die Annahme.
- [ ] Beide Hüllen verdrahten:
      - `.lavish/cockpit-shell.html`: `layout.css` nach `panel.css` einbinden,
        `layout.js` nach `panel.js`; den lokalen `<style>`-Block mit `.cockpit-layout`,
        `.cockpit-focus`, `.cockpit-workspace` entfernen.
      - `website/src/pages/admin/cockpit.astro`: dieselben zwei Einbindungen, das Script
        zwingend als `<script is:inline src="/cockpit/kit/layout.js">` — ohne `is:inline`
        zieht Astro die Datei in den Bundle-Graph und der Build bricht mit
        „references an asset in the public/ directory" ab; der Fehler fällt **nur** beim
        Build auf, `pnpm dev` und vitest laufen grün daran vorbei (Kommentar Zeile 15–23
        der Datei). Den lokalen Layout-Style-Block (Zeile 27–36) entfernen.
- [ ] Die drei BATS-Dateien erneut laufen lassen, bis sie grün sind.

## Task 7 — Testabgrenzung gegen K8 (T002467) festschreiben

Behauptete Abdeckung, die nur ein echter Browser erbringen kann, ist schlimmer als keine.

- [ ] In `tests/unit/cockpit-layout.test.ts` einen Kommentarkopf setzen, der ausdrücklich
      nennt, was hier **nicht** geprüft wird und an K8 (T002467, Headed-Tests) übergeben
      wird: die Pointer-Gesten selbst (Ziehen mit `setPointerCapture`, Trefferprüfung
      gegen Ablegezonen, Auto-Scroll am Rand, Abbruch per `pointercancel`), das
      Aufziehen des Bottom-Sheets, das Wischen im Ein-Panel-Stack, das Pop-out-Fenster
      samt `BroadcastChannel`-Rückkehr, und dass die Vollflächen-Umschaltung optisch
      trägt.
- [ ] Unit-geprüft ist ausschließlich das DOM-freie Verhalten: Rail-Festlegung,
      Platzierungsrechnung, Mobilregeln als Rechnung, Persistenz-Serialisierung und
      -Wiederherstellung, Registry-Verhalten von `Panel.get`/`adopt`/`destroy`.
- [ ] Die Registry-Aussagen aus Task 2 in `tests/unit/cockpit-panel.test.ts` ergänzen
      (bestehende Datei erweitern statt neue anlegen): nach `destroy()` liefert
      `Panel.get(el)` nichts mehr, und `Panel.adopt(el)` liefert für ein bereits
      registriertes Element dasselbe Objekt. Positiv-Anker im selben Test: vor `destroy()`
      liefert `Panel.get(el)` das Panel.
- [ ] Denselben Abgrenzungshinweis als kurzen Absatz in
      `openspec/changes/sdlc-cockpit-k3-layout-engine/proposal.md` nicht wiederholen — er
      steht dort bereits als Abgrenzung gegen K4; hier geht es allein um K8.

## Task 8 — Verifikation

- [ ] Alle in diesem Plan angelegten und geänderten Testdateien laufen lassen:

```bash
npx vitest run tests/unit/cockpit-layout.test.ts tests/unit/cockpit-panel.test.ts
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit/
```

- [ ] Syntaxprüfung der neuen BATS-Dateien mit dem tauglichen Mittel (`bash -n` meldet
      für `@test`-Blöcke einen irreführenden Fehler):

```bash
for f in tests/spec/sdlc-cockpit/layout-*.bats; do
  tests/unit/lib/bats-core/bin/bats --count "$f"
done
```

- [ ] Testinventar regenerieren und mitcommitten — CI vergleicht es gegen die
      eingecheckte Fassung:

```bash
task test:inventory
```

- [ ] Astro-Build gegenprüfen, weil der `is:inline`-Fehler aus Task 6 ausschließlich beim
      Build sichtbar wird:

```bash
cd website && pnpm build
```

- [ ] Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `any`-Zählung darf nicht steigen (CQ02):

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```
