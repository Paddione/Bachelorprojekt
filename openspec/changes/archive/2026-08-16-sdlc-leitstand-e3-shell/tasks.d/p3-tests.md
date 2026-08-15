# p3 — Tests (purpose-Registry + URL-Weiche + Zonen-Smoke)

**Rolle:** tests
**target_files:**
- `tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats` (neu)
- `tests/spec/sdlc-cockpit/leitstand-url-scheme.bats` (neu)
- `components/website/src/lib/sdlc/__tests__/leitstand-metrics.test.ts` (neu, vitest)
- `components/website/src/lib/sdlc/__tests__/leitstand-url.test.ts` (neu, vitest)
- `components/website/src/lib/sdlc/__tests__/leitstand-purpose-registry.test.ts` (neu, vitest)
- `scripts/sdlc-cockpit-smoke.mjs` (Erweiterung um Zonen-Selektoren + testid-Stabilitaet)
- `tests/spec/pipeline-interface.bats` (Anpassung — D7.2 haengt an einer p2-Loeschung, siehe unten)
- `tests/spec/sdlc-cockpit/layout-rail-fixed.bats` (Anpassung — T003417 haengt an einer p1-Loeschung, siehe unten)
- `components/website/src/data/test-inventory.json` (Regenerat via `task test:inventory`)

_Ticket: T007957 · Epic: T007553 · Partial p3 (tests) · IMMER zuletzt (nach p1+p2). Deckt
Kontrakt A (purpose-Registry) und Kontrakt B (`leitstand-url.ts`) aus
`openspec/changes/sdlc-leitstand-e3-shell/design.md` § Schnittstellen-Kontrakte ab. p1 liefert
`components/website/src/lib/sdlc/leitstand-purpose-registry.ts`,
`components/website/src/lib/sdlc/leitstand-url.ts`, `components/website/src/lib/sdlc/leitstand-metrics.ts`
und die 5-Zonen-Shell; p2 liefert `DeckLeiste.svelte` + `decks/*.svelte`. Die Guards hier MUESSEN
erst nach p1+p2 gruen laufen (`tasks.md` Verify-Block)._

Runner: `tests/unit/lib/bats-core/bin/bats` (vendored — NICHT `which bats`). Beide `.bats`-Dateien
liegen unter `tests/spec/sdlc-cockpit/` gemaess Verzeichniskonvention (T002416, eine Datei pro
Vorgang). Praefmodus beider `.bats`-Dateien: Output-Verifikation (T002448-M4) — sie importieren
`leitstand-purpose-registry.ts`/`leitstand-url.ts` per `node --experimental-strip-types` und
werten die REALEN Rueckgabewerte aus, kein Grep auf den p1-Quelltext. Node-Verfuegbarkeits-Guard
in jedem `@test` (T002820):
```bash
command -v node >/dev/null 2>&1 || skip "node not installed"
node -e 'process.exit(process.versions.node.split(".")[0] >= 22 ? 0 : 1)' \
  || skip "node < 22 — kein TypeScript-Stripping"
```

## Schnittstellen-Kontrakte (verbindlich)

Die Kontrakte A (purpose-Registry: Shape, Key-Ableitung PascalCase→kebab-case,
`leitstand-`-Strip nur direkt unter `components/leitstand/`), B (`leitstand-url.ts`:
9 Stationen, 4 Decks, Praezedenz neu vor Legacy, Legacy-Mapping, Feld-Reihenfolge
`station,ticket,deck`, kein fuehrendes `?`) und C (Zonen-testids `leitstand-{statusband,
achse,kontextzone,deck-leiste}`; alte Floor-testids bleiben) sind in
`openspec/changes/sdlc-leitstand-e3-shell/design.md` § "Schnittstellen-Kontrakte"
festgeschrieben — **diese Tests setzen design.md um, sie definieren es nicht mehr
neu.** Die RED-Guards unten pruefen genau diese Semantik (Positiv-Anker zuerst, dann
Negativ-Aussagen).

## File `tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats` (neu)

- [ ] **setup(): gemeinsamer Checker.** Schreibt `$BATS_TEST_TMPDIR/check-registry.mjs`, das per
      argv `(registryPath, componentsDir)` `leitstandPurposes` importiert und drei Dinge prueft —
      Nichtleere, `zweck`-Eindeutigkeit, Vollstaendigkeit gegen die Key-Ableitung aus Kontrakt A —
      und je Schritt eine `OK <label> <n>` oder `FAIL <label> <detail>`-Zeile schreibt (Semantik
      statt Darstellung, T002716):
      ```javascript
      import { readdirSync, existsSync } from 'node:fs';
      import { join, relative } from 'node:path';
      const [, , registryPath, componentsDir] = process.argv;
      const { leitstandPurposes } = await import(registryPath);
      const entries = Object.entries(leitstandPurposes ?? {});
      if (entries.length === 0) { console.log('FAIL empty-registry'); process.exit(1); }
      console.log('OK registry-nonempty ' + entries.length);

      const zwecke = entries.map(([, v]) => v.zweck);
      const dupes = zwecke.filter((z, i) => zwecke.indexOf(z) !== i);
      if (dupes.length > 0) { console.log('FAIL zweck-duplicate ' + dupes.join(',')); process.exit(1); }
      console.log('OK zweck-unique ' + zwecke.length);

      function walk(dir, acc = []) {
        if (!existsSync(dir)) return acc;
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, ent.name);
          if (ent.isDirectory()) walk(p, acc); else if (ent.name.endsWith('.svelte')) acc.push(p);
        }
        return acc;
      }
      function toKey(rel) {
        const base = rel.split('/').pop().replace(/\.svelte$/, '');
        const kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        return (!rel.includes('/') && kebab.startsWith('leitstand-')) ? kebab.slice(10) : kebab;
      }
      const files = walk(componentsDir).map((f) => relative(componentsDir, f));
      if (files.length === 0) { console.log('FAIL no-components-found ' + componentsDir); process.exit(1); }
      console.log('OK components-found ' + files.length);
      const missing = files.filter((f) => !(toKey(f) in leitstandPurposes));
      if (missing.length > 0) { console.log('FAIL missing-entries ' + missing.map(toKey).join(',')); process.exit(1); }
      console.log('OK all-components-covered ' + files.length);
      ```

- [ ] **T1 — Registry ist nicht leer, `zweck` ist einzigartig, jede reale
      `components/leitstand/**/*.svelte` hat einen Eintrag (Positiv-Anker: alle drei `OK`-Zeilen).**
      ```bash
      run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-registry.mjs" \
        "$REPO/components/website/src/lib/sdlc/leitstand-purpose-registry.ts" \
        "$REPO/components/website/src/components/leitstand"
      [ "$status" -eq 0 ]
      echo "$output" | grep -qE '^OK registry-nonempty [1-9][0-9]*'
      echo "$output" | grep -qE '^OK zweck-unique [1-9][0-9]*'
      echo "$output" | grep -qE '^OK all-components-covered [1-9][0-9]*'
      ```

- [ ] **T2 — Guard schlaegt an, wenn eine Komponente ohne Eintrag eingeschleust wird
      [Negativtest + Positiv-Anker, T002356-M1: gueltiger Fixture-Fall zuerst im selben Test].**
      Fixture spiegelt Kontrakt A 1:1 (eine abgedeckte, eine fehlende Komponente):
      ```bash
      fx="$BATS_TEST_TMPDIR/fixture-components"
      mkdir -p "$fx/decks"
      : > "$fx/Kontextzone.svelte"
      : > "$fx/decks/DeckWissen.svelte"
      cat > "$BATS_TEST_TMPDIR/fixture-registry.mjs" <<'EOF'
export const leitstandPurposes = {
  kontextzone: { zweck: 'Tiefe/Aktion folgt Selektion', datenquelle: 'floorStore', aktionen: [] },
};
EOF
      # Positiv-Fall: Fixture mit vollstaendiger Registry laeuft durch.
      cat > "$BATS_TEST_TMPDIR/fixture-registry-complete.mjs" <<'EOF'
export const leitstandPurposes = {
  kontextzone: { zweck: 'Tiefe/Aktion folgt Selektion', datenquelle: 'floorStore', aktionen: [] },
  'deck-wissen': { zweck: 'API-Katalog + OpenSpec-Suche', datenquelle: 'api-inventory', aktionen: [] },
};
EOF
      run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-registry.mjs" \
        "$BATS_TEST_TMPDIR/fixture-registry-complete.mjs" "$fx"
      [ "$status" -eq 0 ]
      # Negativ: unvollstaendige Fixture-Registry faellt benannt durch.
      run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-registry.mjs" \
        "$BATS_TEST_TMPDIR/fixture-registry.mjs" "$fx"
      [ "$status" -eq 1 ]
      echo "$output" | grep -qF 'FAIL missing-entries deck-wissen'
      ```

## File `tests/spec/sdlc-cockpit/leitstand-url-scheme.bats` (neu)

- [ ] **setup(): gemeinsamer Checker.** Schreibt `$BATS_TEST_TMPDIR/check-url.mjs`, importiert
      `parseLeitstandQuery`/`toLeitstandQuery` aus der REALEN `leitstand-url.ts` (argv[2]) und
      laeuft alle Faelle aus Kontrakt B durch; je Fall eine `OK <case>`/`FAIL <case> <detail>`-Zeile,
      abschliessend `CHECKED <n>`:
      ```javascript
      const [, , modPath] = process.argv;
      const { parseLeitstandQuery, toLeitstandQuery } = await import(modPath);
      const cases = [];
      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const P = (qs) => { try { return parseLeitstandQuery(new URLSearchParams(qs)); } catch (e) { return { __threw: e.message }; } };

      cases.push(['new-params-passthrough', eq(P('station=implement&ticket=T007957&deck=ki'),
        { station: 'implement', ticket: 'T007957', deck: 'ki' })]);
      cases.push(['legacy-phase-triage', eq(P('phase=triage'), { station: 'triage' })]);
      cases.push(['legacy-phase-planung', eq(P('phase=planung'), { station: 'planung' })]);
      cases.push(['legacy-phase-deploy', eq(P('phase=deploy'), { station: 'deploy' })]);
      cases.push(['legacy-phase-ship', eq(P('phase=ship'), { station: 'ship' })]);
      cases.push(['legacy-phase-bauen-no-station', P('phase=bauen').station === undefined]);
      cases.push(['legacy-phase-review-maps-verify', eq(P('phase=review'), { station: 'verify' })]);
      cases.push(['legacy-mode-insights', eq(P('mode=insights'), { deck: 'ki' })]);
      cases.push(['legacy-mode-overview-empty', Object.keys(P('mode=overview')).length === 0]);
      cases.push(['unknown-station-ignored', P('station=doesnotexist').station === undefined]);
      cases.push(['unknown-deck-ignored', P('deck=doesnotexist').deck === undefined]);
      cases.push(['unknown-phase-never-throws', P('phase=doesnotexist').__threw === undefined]);
      cases.push(['unknown-mode-never-throws', P('mode=doesnotexist').__threw === undefined]);
      cases.push(['new-wins-over-legacy', eq(P('station=verify&phase=triage'), { station: 'verify' })]);
      cases.push(['serialize-order-omits-empty', toLeitstandQuery({ station: 'implement', ticket: 'T007957' }) === 'station=implement&ticket=T007957']);
      cases.push(['serialize-empty', toLeitstandQuery({}) === '']);
      const sel = { station: 'verify', ticket: 'T007957', deck: 'plattform' };
      cases.push(['round-trip', eq(parseLeitstandQuery(new URLSearchParams(toLeitstandQuery(sel))), sel)]);

      let bad = 0;
      for (const [name, ok] of cases) {
        console.log((ok ? 'OK ' : 'FAIL ') + name);
        if (!ok) bad++;
      }
      console.log('CHECKED ' + cases.length);
      process.exit(bad > 0 ? 1 : 0);
      ```

- [ ] **T1 — alle Kontrakt-B-Faelle bestehen (Positiv-Anker: Fallzahl + Erfolg).**
      ```bash
      run node --experimental-strip-types "$BATS_TEST_TMPDIR/check-url.mjs" \
        "$REPO/components/website/src/lib/sdlc/leitstand-url.ts"
      echo "$output" | grep -qE '^CHECKED (1[6-9]|[2-9][0-9])$'
      if [ "$status" -ne 0 ]; then
        echo "URL-Weiche-Defekte:" >&3
        echo "$output" | grep '^FAIL ' >&3
      fi
      [ "$status" -eq 0 ]
      ```

## File `components/website/src/lib/sdlc/__tests__/leitstand-metrics.test.ts` (neu, vitest)

Extrahiert `buildSections()` aus `CockpitRail.svelte` (Zeilen 53-192) 1:1 als benannten Export
`buildRailSections(mode, phase, metrics)` — reine Funktion, Praezisierung fuer p1: der Name ist
`buildRailSections` (nicht `buildSections`, um Kollision mit dem alten lokalen Namen zu vermeiden),
mitgefuehrte Typen `Phase`, `CockpitMode`, `RailSection`, `RailItem` sind aus `leitstand-metrics.ts`
importierbar. Kein Mocking noetig (pure function) — Muster wie `factory-metrics-derive.test.ts`.

- [ ] `describe('buildRailSections')`:
  - `mode='overview'` → 4 Sektionen `['attention','epics','agents','models']` in dieser Reihenfolge
    (IDs exakt wie CockpitRail Zeilen 56-86).
  - `mode='fokus', phase='planung'` → 1 Sektion `id='planning'`, Items-Keys `['dor','queue','ready']`.
  - `mode='fokus', phase='bauen'` → 2 Sektionen `['factory','models']`.
  - `mode='fokus', phase='review'` → 1 Sektion `id='prs'`.
  - `mode='fokus', phase='deploy'` → 1 Sektion `id='deploy'`.
  - `mode='fokus', phase='ship'` → 1 Sektion `id='shipped'`.
  - `mode='fokus', phase='triage'` (kein expliziter Case in CockpitRail, faellt auf `default`) →
    `[]` — Regressionsschutz: die Extraktion darf hier kein neues Verhalten einfuehren.
  - `mode='insights', metrics=null` → beide Sektionen (`metrics`,`traces`) vorhanden, alle
    `metrics`-Werte sind `'—'`.
  - `mode='insights', metrics={shipped:5, avgCycleTimeH:12, escalations:2, daysCovered:3}` →
    Item `throughput.value === '5'`, `escalations.value === '2'`, `avg_time.value` entspricht
    `formatCycleTime(12)` (Re-Use aus `factory-metrics-derive.ts`, kein Duplikat der Formatierlogik).

## File `components/website/src/lib/sdlc/__tests__/leitstand-url.test.ts` (neu, vitest)

Leichte, native vitest-Ergaenzung zu den BATS-Guards (Vitest-Pflicht laut
`plan-quality-gates.md` fuer jede neue `lib/`-Datei — gilt unabhaengig davon, dass die BATS-Datei
dieselbe Semantik bereits per Sandbox-Import prueft):

- [ ] `describe('parseLeitstandQuery')`: `it.each` ueber dieselben 14 Faelle aus Kontrakt B
      (neue Parameter, Legacy-`phase`-Tabelle vollstaendig, Legacy-`mode`-Tabelle, unbekannte
      Werte werfen nie, Praezedenz neu-vor-legacy).
- [ ] `describe('toLeitstandQuery')`: Feld-Reihenfolge, leere Felder ausgelassen, kein
      fuehrendes `?`, leere Selektion → `''`.
- [ ] `it('round-trip')`: `parseLeitstandQuery(new URLSearchParams(toLeitstandQuery(sel)))`
      ergibt `sel` fuer `sel = { station: 'verify', ticket: 'T007957', deck: 'plattform' }`.

## File `components/website/src/lib/sdlc/__tests__/leitstand-purpose-registry.test.ts` (neu, vitest)

- [ ] `it('ist nicht leer')`: `Object.keys(leitstandPurposes).length > 0`.
- [ ] `it('jeder Eintrag hat zweck/datenquelle/aktionen')`: `aktionen` ist ein Array (auch leer
      erlaubt), `zweck`/`datenquelle` sind nicht-leere Strings.
- [ ] `it('zweck ist global einzigartig')`: `new Set(Object.values(p).map(v => v.zweck)).size`
      entspricht der Eintragsanzahl.
- [ ] `it('enthaelt die in design.md genannten Kern-Keys')`: `['statusband', 'kontextzone',
      'deck-qualitaet', 'deck-plattform', 'deck-ki', 'deck-wissen']` sind alle vorhanden (staerkere,
      lokale Ergaenzung zur dateisystembasierten BATS-Pruefung — haengt nicht vom Vorhandensein der
      `components/leitstand/`-Dateien im Testlauf ab).

## File `scripts/sdlc-cockpit-smoke.mjs` (Erweiterung, Ist 123 · Budget 677)

Der Smoke-Test braucht eine LIVE-Session (`--token-url`) und laeuft nicht offline/CI — die
Erweiterung ergaenzt bestehende `check(...)`-Aufrufe nach der `bodyText`-Pruefung (Zeile ~99),
vor dem Screenshot. Keine neuen Locale-Faelle im BATS/vitest-Sinn, sondern zusaetzliche
`page.locator('[data-testid="…"]').count()`-Proben, analog zu den bestehenden `check(...)`-Zeilen:

- [ ] **Alte Floor-testids bleiben stabil (SSOT `software-factory.md` § "FA-SF: Factory Floor
      Hallendarstellung" — INVARIANT, kein Delta in diesem Change):**
      ```javascript
      for (const id of ['factory-floor', 'floor-leitstand', 'floor-hall', 'floor-shipped', 'floor-slots']) {
        check(`testid stabil: ${id}`, (await page.locator(`[data-testid="${id}"]`).count()) > 0, id);
      }
      // floor-workpiece/floor-detail nur pruefen, wenn ein Workpiece vorhanden ist —
      // eine leere Halle ist kein Smoke-Fehler.
      const wp = page.locator('[data-testid="floor-workpiece"]').first();
      if (await wp.count()) {
        check('testid stabil: floor-workpiece', true);
        await wp.click({ timeout: 5_000 }).catch(() => {});
        check('testid stabil: floor-detail (nach Klick)', (await page.locator('[data-testid="floor-detail"]').count()) > 0);
      }
      ```
- [ ] **Neue Zonen-Selektoren sind vorhanden (Kontrakt C):**
      ```javascript
      for (const id of ['leitstand-statusband', 'leitstand-achse', 'leitstand-kontextzone', 'leitstand-deck-leiste']) {
        check(`Zone gerendert: ${id}`, (await page.locator(`[data-testid="${id}"]`).count()) > 0, id);
      }
      ```
- [ ] Kein neuer CLI-Parameter noetig — beide Bloecke laufen unter dem bestehenden
      `--token-url`/`--base`-Aufruf.

## RED — Failing-Test-Step (STRUCT2)

Beide `.bats`-Dateien werden mit diesem Plan committet (Stage-Commit) und laufen auf dem
aktuellen Branch rot, weil weder `leitstand-purpose-registry.ts` noch `leitstand-url.ts` noch
`components/leitstand/` existieren:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: FAIL (rot — leitstand-purpose-registry.bats: leitstand-purpose-registry.ts fehlt,
# T1 scheitert bereits am node-Import (MODULE_NOT_FOUND); leitstand-url-scheme.bats:
# leitstand-url.ts fehlt, T1 scheitert ebenso am Import)
```

Nach p1 (liefert beide `.ts`-Dateien + `LeitstandStatusband.svelte`/`Kontextzone.svelte`) UND p2
(liefert `DeckLeiste.svelte` + `decks/*.svelte`, erst dann ist Kontrakt A vollstaendig erfuellbar)
laufen dieselben Guards gruen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
```

## File `tests/spec/pipeline-interface.bats` (Anpassung — Nachtrag, Befund aus p2)

p2 loescht `components/website/src/components/DevStatusTabs.svelte` (`tasks.md` § File Structure,
"toter Code"). `tests/spec/pipeline-interface.bats` deklariert
`TABS="components/website/src/components/DevStatusTabs.svelte"` (Zeile 7) und referenziert `$TABS`
ausschliesslich in einem einzigen Test:

```bash
@test "D7.2: DevStatusTabs prefers the URL tab over localStorage" {
  grep -q "urlTab" "$TABS"
}
```

**(a) Gesicherte Semantik.** `DevStatusTabs.svelte` liest beim Mount zuerst `?tab=` aus der URL
(`urlTab`, Zeilen 38-40) und faellt nur bei dessen Fehlen auf den per `localStorage.getItem(
'dev-status-tab')` gespeicherten Wert zurueck (Zeile 44); bei jedem Tab-Wechsel schreibt es in
dasselbe `localStorage`-Feld zurueck (Zeile 34). D7.2 sichert also NICHT "es gibt eine Variable
`urlTab`" als Selbstzweck, sondern die Praezedenz-Eigenschaft: ein expliziter Deep-Link-Parameter
in der URL darf nie von einem staler gespeicherten Client-Zustand ueberschrieben werden. Ohne die
Datei bricht der Test nicht an dieser Aussage, sondern schon am `grep`-Aufruf selbst ("file not
found") — ein falscher Fehlermodus, der eine echte spaetere Regression verdecken wuerde.

**(b) Aufloesung: D7.2 entfernen, kein Redirect auf einen Nachfolger.** `design.md` §
E3-Entscheidungsprotokoll ("Toter Plattform/KI-Zweig") stellt fest, dass `DevStatusTabs.svelte`
"ersatzlos" stirbt — die 12 Karten wandern in `DeckPlattform`/`DeckKi`, aber die
URL-vs-localStorage-Praezedenz der Tab-Auswahl wandert nicht mit, weil es in der Nachfolge-
Architektur keine Gegenquelle mehr gibt, gegen die eine Praezedenz noetig waere: Kontrakt B
(`leitstand-url.ts`) und `design.md` § Navigation ("SSR liefert den initialen Zustand aus den
Query-Params") legen fest, dass Deck-/Stations-Auswahl AUSSCHLIESSLICH aus der URL kommt —
`DeckLeiste.svelte` liest kein `localStorage`. Ein Redirect der Assertion auf `DeckLeiste.svelte`
(z. B. `grep -q 'urlTab-aequivalent' DeckLeiste.svelte`) wuerde nur behaupten "liest aus der URL",
ohne das eigentlich gesicherte Verhalten (Vorrang VOR etwas) zu pruefen — es gibt kein "etwas"
mehr. Ersetze T2 daher durch einen reinen Kommentar-Block, kein neuer Assertion-Code:
- [ ] **Task: D7.2 entfernen, Rationale dokumentieren, `$TABS` mitentfernen.**
      ```bash
      # D7.2 entfernt (T007957/E3): pruefte "grep -q 'urlTab' $TABS" — dass DevStatusTabs.svelte
      # einen expliziten ?tab=-URL-Parameter nie von einem gespeicherten localStorage-Wert
      # ueberschreiben laesst (Datei-Zeilen 34-44 vor der Loeschung). DevStatusTabs.svelte stirbt
      # in T007957/E3 ersatzlos (design.md § E3-Entscheidungsprotokoll, "Toter Plattform/KI-Zweig"):
      # die 12 Karten wandern in DeckPlattform/DeckKi, die urlTab-vs-localStorage-Praezedenz nicht,
      # weil die Nachfolge-Architektur keine localStorage-Gegenquelle mehr kennt — Deck-/Stations-
      # Auswahl kommt ausschliesslich aus der URL (Kontrakt B, design.md § Navigation: "SSR liefert
      # den initialen Zustand aus den Query-Params"). Die Nachfolge-Semantik (URL -> Selektion,
      # deterministisch, kein lokaler Fallback, wirft nie) ist bereits abgedeckt durch
      # tests/spec/sdlc-cockpit/leitstand-url-scheme.bats.
      ```
      Entferne zusammen mit dem Test-Block auch die jetzt ungenutzte Deklaration
      `TABS="components/website/src/components/DevStatusTabs.svelte"` (Zeile 7) — sie wird nach
      dem Loeschen von D7.2 nirgends mehr referenziert (keine andere `@test` in dieser Datei nutzt
      `$TABS`; geprueft per `grep -n '\$TABS' tests/spec/pipeline-interface.bats`). Alle anderen
      `@test`-Bloecke der Datei (D1, D2, D3, D4, D5, D6, D7.3, D7.4, D7.6) bleiben unveraendert —
      das ist eine gezielte Anpassung, kein Neuschrieb der Datei.
      Positiv-Anker-Pflicht (T002356-M1) gilt hier weiterhin, betrifft aber keine neue Assertion:
      die verbleibenden Tests der Datei sichern ihre jeweils eigenen Positiv-Anker unveraendert
      (z. B. D4s expliziter Verzeichnis-Anker, D7.3s Datei-plus-Repo-weite-Grep-Kombination); D7.2
      wird ersatzlos entfernt, nicht durch eine neue vakuose Absenz-Aussage ersetzt.
      **Out of scope (nicht Teil dieses Tasks):** `tests/e2e/specs/fa-48-factory-devflow.spec.ts`
      und `tests/factory-eval/fixtures/T000726/expected.json` referenzieren `DevStatusTabs`
      ebenfalls (gefunden per `grep -rln DevStatusTabs tests/`) — E2E-Specs und Factory-Eval-
      Fixtures liegen ausserhalb der `tests/spec/`-BATS-Suite und damit ausserhalb von p3s
      target_files; falls sie nach der p2-Loeschung brechen, ist das ein separater Befund fuer
      `dev-flow-e2e` bzw. die Factory-Eval-Pflege, nicht dieser Task.

## File `tests/spec/sdlc-cockpit/layout-rail-fixed.bats` (Anpassung — Nachtrag, Befund aus p1)

p1 loescht `components/website/src/components/cockpit/CockpitRail.svelte` und entfernt ihre
Einbindung aus `cockpit.astro` (`tasks.md` § File Structure, Sterbeliste "Metrik-Logik wird
extrahiert"). Die Datei enthaelt drei `@test`-Bloecke; nur EINER haengt an dieser Loeschung.

**Bestandsaufnahme aller drei Bloecke (Pruefung vor der Aenderung):**
1. `T002462 Die vier D7-Gruppen sind in der Shell-Huelle vorhanden` — greift ausschliesslich auf
   `.lavish/cockpit-shell.html` (statische Attrappe) zu, nicht auf `CockpitRail.svelte` oder
   `cockpit.astro`. Der Dateikommentar (Zeilen 28-36 der Bestandsdatei) haelt bereits fest, dass
   D7 fuer diese Attrappe unveraendert weitergilt. **Bleibt unveraendert.**
2. `T003417 Die Astro-Huelle delegiert die Rail an die Komponente` — greppt `cockpit.astro` auf
   `CockpitRail` sowie `CockpitRail[^>]*mode=`/`CockpitRail[^>]*phase=`. **Bricht nach p1** (nicht
   mit einer echten Assertion, sondern am fehlenden Treffer — der Positiv-Anker "Huelle bindet
   CockpitRail ein" schlaegt fehl, weil die Komponente komplett weg ist, nicht weil eine reale
   Verhaltensaenderung geprueft wuerde). **Wird entfernt (a-c unten).**
3. `T002462 Es gibt keinen Konfigurationsschluessel, der die Rail-Gruppen umstellt` — reine
   Negativ-Pruefung (kein `data-rail-group`/`data-rail=`/`data-groups=`-Attribut) gegen
   `cockpit-shell.html` UND `cockpit.astro`; haengt an keiner CockpitRail-Referenz, nur an der
   Abwesenheit eines Konfigurationsattributs, das auch nach dem Umbau nicht existieren soll.
   `cockpit.astro` selbst bleibt bestehen (Umbau, keine Loeschung). **Bleibt unveraendert.**

**(a) Gesicherte Semantik von T003417.** Dass die statische Astro-Huelle die (vormals) vier festen
D7-Gruppen NICHT selbst rendert, sondern an eine Komponente delegiert, die ihren Inhalt nach
`mode`/`phase` variiert — die eigentliche Eigenschaft dahinter: **Layout-Inhalt ist
kontext-abhaengig, nicht in der Huelle festgeschrieben.**

**(b) Aufloesung: T003417 entfernen, kein Redirect mit `mode=`/`phase=`-Wortlaut.** Das
MODIFIED Requirement "Kontext-sensitive lebendige Rail" (`openspec/changes/sdlc-leitstand-e3-shell/
specs/sdlc-cockpit.md` Zeilen 421-434) ersetzt die Rail durch die selektionsgetriebene Z4
Kontextzone: Inhalt haengt jetzt an `?station=`/`?ticket=` (nicht mehr an `mode=`/`phase=`) und wird
aus `floorStore` bezogen, nicht aus Props, die eine Komponente durchreicht. Der Scenario-Block "Old
Command-Bar/Rail structure no longer applies" (Zeilen 144-148 derselben Delta-Spec) verlangt sogar
explizit: "no element carries the legacy `CommandBar` or `CockpitRail` role" — ein Redirect der
Assertion auf `grep -qF 'CockpitRail' cockpit.astro` wuerde also GENAU DAS pruefen, was die
Spec verbietet. Ein woertlicher `mode=`/`phase=`-Redirect auf `Kontextzone.svelte` waere ebenso
falsch, weil Kontrakt B diese Parameter zu Legacy erklaert (`leitstand-url.ts` normalisiert
`phase=`/`mode=` auf `station=`/`deck=` — die Kontextzone selbst liest `station=`/`ticket=`, nicht
`mode=`/`phase=` direkt). Die gesicherte Eigenschaft ist damit nicht 1:1 uebertragbar, sondern
durch eine andere Mechanik ersetzt — Loeschung mit Begruendung, kein Redirect:
- [ ] **Task: T003417 entfernen, Rationale dokumentieren.**
      ```bash
      # T003417 entfernt (T007957/E3): pruefte "grep -qF 'CockpitRail' cockpit.astro" plus
      # 'CockpitRail[^>]*mode='/'CockpitRail[^>]*phase=' — dass die Astro-Huelle die Rail-
      # Komponente einbindet und ihr mode/phase durchreicht, von denen die vier D7-Gruppen
      # abhingen. Das MODIFIED Requirement "Kontext-sensitive lebendige Rail" (design.md /
      # specs/sdlc-cockpit.md) ersetzt die Rail ersatzlos durch die selektionsgetriebene Z4
      # Kontextzone: Inhalt haengt an ?station=/?ticket= (floorStore), nicht mehr an mode=/phase=
      # (Props); das Scenario "Old Command-Bar/Rail structure no longer applies" verlangt sogar,
      # dass KEIN Element mehr die CockpitRail-Rolle traegt — ein Redirect dieser Assertion auf
      # cockpit.astro wuerde also das Gegenteil der Spec pruefen. Nachfolger-Coverage: die
      # Zonen-Selektor-Checks in scripts/sdlc-cockpit-smoke.mjs (Kontrakt C, leitstand-*-testids)
      # belegen, dass Kontextzone/Achse/Statusband/Deck-Leiste tatsaechlich gerendert werden;
      # tests/spec/sdlc-cockpit/leitstand-url-scheme.bats belegt die mode=/phase=-Normalisierung
      # auf station=/deck= (Kontrakt B), die die alte mode/phase-Weiterreichung ersetzt.
      ```
      Die beiden `T002462`-Bloecke (Shell-Attrappe, Konfigurationsschluessel-Negativtest) bleiben
      unveraendert stehen — sie haengen an `cockpit-shell.html` bzw. an einer Abwesenheitsaussage,
      die von der CockpitRail-Loeschung unberuehrt ist. Das ist eine gezielte Anpassung (ein
      `@test`-Block von dreien entfaellt), kein Neuschrieb der Datei; `setup()` bleibt unveraendert,
      da `$ASTRO` weiterhin von Block 3 gebraucht wird (nur `cockpit.astro` selbst wird umgebaut,
      nicht geloescht).
      Positiv-Anker-Pflicht (T002356-M1) betrifft hier keine neue Assertion — T003417 wird
      ersatzlos entfernt, nicht durch eine neue Absenz-Aussage ersetzt; die verbleibenden zwei
      Bloecke behalten ihre je eigenen Positiv-Anker (Block 1: Gruppenlabels muessen gefunden
      werden; Block 3: iteriert ueber real existierende Dateien, keine leere Kandidatenmenge).

## Test-Inventar

- [ ] **Inventar regenerieren.** Nach dem Anlegen aller neuen Test-Dateien (2× `.bats`, 3× vitest):
      ```bash
      task test:inventory
      ```
      `components/website/src/data/test-inventory.json` mitcommitten — CI failt sonst am
      Inventar-Drift-Check.

## Finale Verifikation (STRUCT3)

- [ ] **Alle drei Pflicht-Gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
