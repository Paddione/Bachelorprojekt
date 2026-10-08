# p1-header-cta — Brand-Override für den Header-CTA

## Ziel

Die Massage-Brand zeigt im Header `Termin anfragen` statt des geteilten
Strings `nav.cta-label`. Alle anderen Brands behalten den Shared-Fallback
`Erstgespräch` (de) bzw. `Consultation` (en). Der Header behält genau einen
CTA-Button, die T901310-Form (Breakpoints, `.nav-cta`-Regeln) bleibt
unangetastet.

## Budgets

- `components/website/src/components/Navigation.svelte`: Ist 523, Budget 577.
  Wachstum um wenige Zeilen (ein Prop plus Fallback-Ausdruck).
- `components/website/src/layouts/Layout.astro`: Ist 113, Budget 887.
  Wachstum null Zeilen (Prop wird in die bestehende Element-Zeile gesetzt).
- `components/website/src/config/types.ts`: Ist 188, Budget 712.
  Wachstum um wenige Zeilen (ein optionales Feld mit Kommentar).
- `components/website/src/config/brands/massage.ts`: Ist 208, Budget 692.
  Wachstum eine Zeile.

Keine Baseline-Einträge hinzufügen. Keine neuen Import-Zyklen (die Navigation
bekommt einen reinen String-Prop, keine neuen Modul-Importe). Keine neuen
`any`-Typen. Keine Brand-Domains in den Code aufnehmen (der Wortlaut ist ein
reiner Label-String, keine URL). Die Dateien `i18n/de.ts` und `i18n/en.ts`
bleiben unverändert — es gibt bewusst keinen neuen i18n-Schlüssel, der
Override ist absichtlich sprachunabhängig (die Massage-Brand ist deutsch).

## Steps

1. In `components/website/src/config/types.ts` das `BrandConfig`-Interface um
   ein optionales Feld erweitern, direkt nach dem `navigation`-Feld:
   ```ts
   /** Brand-spezifischer Header-CTA-Wortlaut. Wenn leer, fällt Navigation.svelte
    *  auf den geteilten i18n-Schlüssel nav.cta-label zurück. */
   navigationCta?: string;
   ```
2. In `components/website/src/config/brands/massage.ts` direkt nach dem
   `navigation`-Array setzen:
   ```ts
   navigationCta: 'Termin anfragen',
   ```
   Die Dateien `mentolder.ts` und `korczewski.ts` nicht anfassen — dort gilt
   der Fallback.
3. In `components/website/src/components/Navigation.svelte` das `Props`
   -Interface um `ctaLabel?: string;` erweitern, den Prop in der
   Destrukturierung aufnehmen und den CTA-Link (Zeile 172 bis 173) auf
   Override-oder-Fallback umstellen:
   ```svelte
   <a href="/kontakt" class="nav-cta">
     {ctaLabel ?? t(locale, 'nav.cta-label')}
   ```
   Genau ein `.nav-cta`-Anker, kein zweiter Button. Den
   `@media (max-width: 860px)`-Block und alle Styles unverändert lassen.
   `NavMobile.svelte` (Mobil-CTA via `hero.cta-primary`) nicht anfassen.
4. In `components/website/src/layouts/Layout.astro` das
   `Navigation`-Element (Zeile 99) um den Prop erweitern:
   `ctaLabel={config.navigationCta}`. Sonst keine Zeile ändern.
5. Verify im Worktree:
   `tests/unit/lib/bats-core/bin/bats tests/spec/massage-header-cta.bats`
   muss die Fälle T901431-1, T901431-2 und T901431-4 grün zeigen (T901431-3
   wird erst mit p2 grün). Danach
   `(cd components/website && pnpm vitest run src/components/Navigation.test.ts)`
   — alle Fälle grün.
6. Commit auf dem Partial-Branch-Stand: neuer Stand mit dem Header-CTA.
