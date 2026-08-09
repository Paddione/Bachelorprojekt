# Proposal: mishap-rollup-pipeline

## Why

Die Mishap-Pipeline hat zwischen dem 2026-08-03 und dem 2026-08-09 aus **keinem einzigen**
Batch mehr einen Chore-Plan erzeugt. Fünfzehn Batch-Kommentare mit rund 130 Eintragszeilen
lagen auf geschlossenen Container-Tickets und waren für den Rollup-Treiber unerreichbar.
Beide Hälften meldeten dabei Erfolg: der Flush „N Mishaps angehängt", der Rollup
„kein Container-Ticket — exit 0".

Drei Blocker liegen hintereinander; jeder für sich verhindert die Plan-Erzeugung
vollständig. Alle drei wurden am 2026-08-09 einzeln durch Ausführen reproduziert, nicht
aus dem Quelltext geschlossen — nach jeder Umgehung trat der nächste hervor:

1. **Container-Auflösung divergiert.** `buildFindAnyRollupTicketArgs`
   (`scripts/ticket-mcp/go/internal/tools/mishap.go:208`) sucht `list --type chore` ohne
   Statusfilter und akzeptiert damit auch `done`-Container. Der Kommentar zwei Zeilen
   darüber behauptet „über alle OFFENEN Status". Der Leser
   (`scripts/factory/mishap-rollup.sh:46-52`) verlangt dagegen hart `status='plan_staged'`.
   Zweite Facette: `findRollupTicketByTitle` nimmt den ersten Treffer aus einer
   ungeordneten Liste — die Batches wechselten belegbar zwischen zwei Containern hin und her.

2. **Fester ticketloser Branchname.** `mishap-rollup.sh` nutzt
   `chore/mishap-incident-rollup`, `mishap.go:25` nennt abweichend
   `chore/mishap-rollup`. `worktree-create.sh` lehnt beide ab: „keine Ticket-ID
   (T[0-9]{6,}) gefunden". Der einzige je erzeugte Rollup-Plan (2026-08-02) lief auf
   `chore/mishap-incident-rollup-T002541` — **mit** Ticket-ID. Der ticketlose feste Name
   ist eine spätere Regression; die Skill-Dokumentation beschreibt bis heute die korrekte
   Form.

3. **Vorbedingung „Haupt-Checkout auf main".** `worktree-create.sh` bricht ab, sobald der
   Haupt-Checkout auf einem anderen Branch steht. `mishap-rollup.sh` wird vom Factory-Tick
   **unbeaufsichtigt** aufgerufen und kann den Zeitpunkt nicht wählen — jede Session, die
   im Haupt-Checkout arbeitet, legt den Rollup still lahm. Genau das lag beim Testlauf vor.

Der gemeinsame Nenner ist nicht die Einzelursache, sondern dass alle drei **lautlos**
scheitern: der stille `exit 0` bei nicht getaner Arbeit hat den Defekt sechs Tage
unsichtbar gehalten.

## What

**Eine gemeinsame Container-Auflösung statt zweier Kopien.** `scripts/ticket.sh` erhält ein
Subkommando `rollup-container`, das den offenen Container auflöst **oder anlegt** und dessen
`external_id` ausgibt. Sowohl der Go-Flush als auch `mishap-rollup.sh` rufen es auf. Damit
ist die Divergenz strukturell ausgeschlossen — es gibt keine zweite Regel mehr, die
auseinanderlaufen könnte. Der Zustand „kein Container gefunden" entfällt ersatzlos, statt
lauter gemeldet zu werden.

**Ein `--unattended`-Modus in `worktree-create.sh`.** Er hebt die main-Vorbedingung auf und
lässt einen allowlisteten persistenten Branch ohne Ticket-ID zu. `git-crypt`-Behandlung und
`node_modules`-Verlinkung bleiben erhalten — der Grund, diesen Weg der Eigenimplementierung
im Rollup vorzuziehen. Zusätzlich bekommt das Skript ein `--help`, das **vor** allen Guards
antwortet; heute stirbt schon die Hilfe am main-Guard.

Nicht im Scope: T002714 (`ticket.sh` kann keinen Titel patchen). Das verhinderte die saubere
Stilllegung der Altcontainer per Umbenennung und erzwang deren Löschung; wer diesen Change
umsetzt, braucht die Fähigkeit voraussichtlich mit, sie wird aber getrennt geführt.

_Ticket: T002783_
