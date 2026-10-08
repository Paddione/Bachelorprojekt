# p3-tests — Guards, Vitest-Fälle und Inventar

## Ziel

Rot-grün abgesicherte Guards für beide OQ-10-Ziele: eine neue BATS-Datei mit
vier statischen Guards plus zwei verhaltensbasierte Vitest-Fälle für den
Header-CTA. Danach das Test-Inventar regenerieren.

## Budgets

- `tests/spec/massage-header-cta.bats`: neue Datei, klein (vier Fälle im
  Stil von `navigation-responsive.bats`). Erreichbar via
  `tests/runner.sh`-Entdeckung und `scripts/build-test-inventory.sh`
  (kein Orphan).
- `components/website/src/components/Navigation.test.ts`: Ist 74,
  Budget 826. Wachstum um zwei Fälle (rund zwanzig Zeilen).
- `components/website/src/data/test-inventory.json`: generiert, wird per
  `task test:inventory` neu erzeugt und mitcommittet.

Keine neuen `any`-Typen in den Vitest-Fällen (typisierte Props wie im
Bestand).

## Steps

1. Rotphase — Tests zuerst schreiben, gegen den ungefixten Stand laufen
   lassen, `expected: FAIL` beobachten:
   - `tests/spec/massage-header-cta.bats` neu anlegen (ausführbar, Stil wie
     `tests/spec/navigation-responsive.bats`, Pfade relativ über
     `BATS_TEST_DIRNAME` auflösen):
     - T901431-1: `config/brands/massage.ts` enthält
       `navigationCta: 'Termin anfragen'`.
     - T901431-2: `Navigation.svelte` rendert den Override-oder-Fallback
       (`ctaLabel ?? t(locale, 'nav.cta-label')` im `.nav-cta`-Anker).
     - T901431-3: `ContactHub.svelte` enthält den journey-gesteuerten
       Wortlaut (eine Zeile mit `journeyEnabled` und
       `Schriftliche Rückfrage stellen`).
     - T901431-4: `mentolder.ts` und `korczewski.ts` enthalten kein
       `navigationCta` (Shared-Fallback intakt).
   - `Navigation.test.ts` um zwei Fälle erweitern
     (`@testing-library/svelte`, Muster wie der Bestand):
     - rendert mit Prop `ctaLabel: 'Termin anfragen'` einen
       `/kontakt`-Link mit diesem Wortlaut;
     - rendert ohne den Prop den Shared-Wortlaut `Erstgespräch`.
   - Rotlauf im Worktree:
     `tests/unit/lib/bats-core/bin/bats tests/spec/massage-header-cta.bats`
     — alle vier Fälle rot, `expected: FAIL`.
     `(cd components/website && pnpm vitest run src/components/Navigation.test.ts)`
     — der Override-Fall rot, `expected: FAIL`, die Bestandsfälle grün.
   Erst nach beobachtetem Rot dürfen p1 und p2 starten.
2. Grünphase (nach p1 und p2): beide Befehle aus Schritt 1 erneut laufen
   lassen — alle Fälle grün.
3. `task test:inventory` im Worktree ausführen und die regenerierte Datei
   `components/website/src/data/test-inventory.json` mitcommitten.
4. CQ02-Probe (kein `any`-Zuwachs, Limit 200):
   `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`
   — Ist-Stand 0, muss 0 bleiben.
5. Commit auf dem Partial-Branch-Stand: neuer Stand mit Tests und Inventar.
