# Proposal: purge-fn-website-sync

## Why

`scripts/runtime-drift-check.sh` meldet auf fleet, dass `tickets.fn_purge_test_data()` nicht den Stand von
`scripts/one-shot/purge-fn-v8.sql` trägt; `task test:changed` bricht deshalb lokal ab. Beobachtet (Fakt): die
Live-Funktion enthält kein `to_regclass`. Ursache (belegt, siehe `design.md`): die Website spielt beim Start über
`applyLegacyMigrations()` eine eingebettete **v6**-Kopie per `CREATE OR REPLACE` ein und überschreibt damit jede
von Hand eingespielte neuere Fassung — bei jedem Neustart.

## What

- Die Funktionsdefinition wandert aus `components/website/src/lib/tickets/migrations.ts` in ein eigenes Modul
  `components/website/src/lib/tickets/purge-fn.ts` und entspricht dort dem v8-Stand.
- `migrations.ts` ruft das Modul auf; der Website-Start installiert damit die aktuelle Fassung.
- Ein Guard-Test stellt sicher, dass die Laufzeit-Definition den `RUNTIME-CHECK`-Marker der neuesten
  `purge-fn-v*.sql` trägt — eine künftige v9 kann nicht mehr still von der TS-Kopie überschrieben werden.
- Die Live-Datenbank wird nicht von Hand geändert; der nächste Website-Deploy spielt v8 ein.

_Ticket: T900381_
