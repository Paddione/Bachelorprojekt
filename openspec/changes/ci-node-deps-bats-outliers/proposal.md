# Proposal: ci-node-deps-bats-outliers

## Why

Zwei Befunde aus derselben Laufzeitanalyse, beide über den `test-bats`-Job verbunden.

Der Job installiert nur die Wurzel-Dependencies. `components/website/node_modules` richtet
er nicht ein, und deshalb überspringen vier Runtime-Tests in
`tests/unit/tickets-transition.bats` jeden einzelnen CI-Lauf. Ein bats-`skip` zählt als
`ok`: der Job meldet grün, ohne die Validierungslogik von `transition.ts` je ausgeführt zu
haben. Dieselbe Klasse wie T002508, wo 24 von 41 Cockpit-Tests dauerhaft skippten und die
Suite trotzdem grün war.

Ein zweiter Fall derselben Art steht in `tests/unit/test_art_library_manifest.bats`: er
ruft `npm install` im eigenen `setup_file` auf und fängt das Scheitern mit `|| skip` ab.
Netzwerk-I/O in der Testphase, und bei einer Registry-Störung entfernt sich der Test
selbst aus der Suite.

Daneben tragen 19 von 659 Spec-Dateien 57 % der Suite-Laufzeit. Bei zweien davon ist die
Ursache Testaufbau, nicht Testumfang: eine 30-Runden-Race-Schleife, die 89 % ihrer Datei
verbraucht, und eine Datei, die ihren Inventar-Builder neunmal statt einmal aufruft und
dabei pro Testdatei ein eigenes `jq` forkt.

## What

**Node-Dependencies.** Der `test-bats`-Job bekommt `pnpm/action-setup` und
`pnpm install --frozen-lockfile` für `components/website`; die vier `skip`-Zweige in
`tickets-transition.bats` fallen weg. Die Tests brauchen keine Datenbank — die geprüften
Validierungsfehler werden vor dem ersten DB-Zugriff geworfen.

Die Alternative, sie in den Vitest-Job zu verschieben, scheidet aus: der ist an geänderte
`components/website`-Dateien gekoppelt und lief in den letzten 30 CI-Läufen kein einziges
Mal. Aus "skippt immer" würde "läuft fast nie" — derselbe blinde Fleck unter anderer
Adresse.

Bei `test_art_library_manifest.bats` wandert die Installation aus dem `setup_file` in
einen CI-Step, und der `|| skip`-Zweig wird fail-closed.

**Laufzeitausreißer.** Die Race-Schleife in `agent-lock-claim-persist.bats` wird so
umgebaut, dass sie ihre Aussage ohne 30 Wiederholungen trägt.
`test-inventory-coverage.bats` baut sein Inventar einmal in `setup_file` statt neunmal,
und die Mengendifferenz über 659 Dateien läuft in einem `jq`-Aufruf statt in 659.

## Nicht im Scope

Die übrigen 16 Dateien über 60 s. Der Fork-Defekt im Half-Archive-Check läuft getrennt als
T013673.

_Ticket: T013674_
