# p1-banner-tone — Banner-Texte auf AA-Ton umstellen

## Ziel

Alle `text-muted`-Verwendungen in CookieConsent.svelte verschwinden;
die Banner-Texte lesen einen AA-sicheren hellen Ton (4.5 auf dem
Banner-Grund, per AxeBuilder verifiziert, nicht geraten).

## Budgets

- `components/website/src/components/CookieConsent.svelte`: Ist 108 Zeilen,
  nicht-baselined, wirksame Schwelle ist das statische Limit — nur
  Klassen-Tausch, keine Zeilen dazu. Budget ausreichend.

Keine Baseline-Einträge hinzufügen. Keine neuen Import-Zyklen. Keine neuen
`any`-Typen. Kein Re-Design (nur Ton-Wechsel auf Dunkel).

<!-- vitest: kein neuer Test nötig, weil Klassen-Tausch ohne Logikänderung -->

## Steps

1. In `components/website/src/components/CookieConsent.svelte` jede
   `text-muted`-Klasse (Details-Button, Info-Text, Details-Tabelle) durch
   einen hellen Ton ersetzen, der auf dem Banner-Grund 4.5 erreicht.
   Ton per AxeBuilder gegen die Dev-Instanz verifizieren (fixe Hex-/Klasse,
   kein Raten). Keine sonstige Zeile anfassen.
2. Guard grün laufen lassen (im Worktree):
   `tests/unit/lib/bats-core/bin/bats tests/spec/cookie-consent.bats`
   Der Case muss grün sein.
