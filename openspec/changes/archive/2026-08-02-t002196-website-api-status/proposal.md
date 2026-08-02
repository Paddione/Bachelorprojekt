# Proposal: t002196-website-api-status

## Why

Sechs E2E-Specs (`fa-07-search`, `fa-16-booking`, `fa-20-finalize`,
`fa-26-bug-report-form`, `fa-admin-db-crud-clients`,
`fa-coaching-publish`) schlagen mit insgesamt 7 einzelnen Testfällen fehl —
jeweils mit einem falschen HTTP-Status oder einer kaputten Response gegen
eine andere API-Route. Diagnose der 6 betroffenen Handler
(`website/src/pages/api/status.ts`, `booking.ts`, `meeting/finalize.ts`,
`bug-report.ts`, `admin/clients.astro`+Middleware,
`admin/knowledge/snippets/[id]/publish.astro`) zeigt **keinen einzelnen
gemeinsamen Auth-/Middleware-Defekt** — die betroffenen Erwartungen
(200, 404, 409, 403, <500) und Domänen (Booking-Validierung,
Finalize-Pipeline, Bug-Report-Marker-Logik, Admin-Auth-Gate,
Coaching-Publish-Fehlerbehandlung) sind zu unterschiedlich, um aus einer
einzigen Middleware-Regression zu stammen. Es gibt **zwei
Nebenverdächtige**, die mehrere Fälle gemeinsam betreffen könnten und
daher zuerst geprüft werden:

1. **Shared IP-Rate-Limiter in `status.ts`** (`rateLimitMap`,
   10 req/min pro IP, In-Memory, Modul-State) — betrifft sowohl
   fa-07 T4 (`GET /api/status` non-existent ticket → erwartet 404) als
   auch fa-26 (`GET /api/status` valid format → erwartet [200,404]).
   Läuft die volle E2E-Suite (nicht nur die 6 gelisteten Specs) gegen
   dieselbe Runner-IP, könnte der Zähler bereits bei 10 sein und beide
   Assertions mit 429 statt der erwarteten Codes brechen.
2. **Invertierte Skip-Bedingung in `tests/e2e/specs/fa-26-bug-report-form.spec.ts`**
   (`test.skip(markerAvailable(), …)`) — der Kommentar sagt, der Test
   solle übersprungen werden, wenn `CRON_SECRET` **fehlt** (damit keine
   ungemarkten Test-Daten in der Prod-Inbox landen), aber der Code
   überspringt ihn, wenn `CRON_SECRET` **vorhanden** ist — das genaue
   Gegenteil. Läuft der Runner ohne `CRON_SECRET`, feuert der Test
   ungeschützt und erzeugt ungemarkte Prod-Daten statt zu skippen; läuft
   er mit `CRON_SECRET` (Normalfall in Prod-CI), wird der Test übersprungen
   und die eigentliche 200/ticketId-Assertion nie geprüft — was erklärt,
   warum die Regression bisher unbemerkt blieb.

Für die übrigen 4-5 Fälle (Booking-Slot-Validierung `fa-16` T6,
Finalize-Pipeline `fa-20` T2, Admin-Clients-Auth-Gate
`fa-admin-db-crud-clients`, Coaching-Publish-Fehlerpfad
`fa-coaching-publish` T5) ist aktuell **kein gemeinsamer Ursprung**
erkennbar — sie sind vorläufig als unabhängige Endpoint-Bugs zu
behandeln, bis die Live-Reproduktion (siehe Ticket-Repro-Kommando)
Gegenteiliges zeigt.

## What

Reproduziere alle 7 Testfälle live gegen `https://web.mentolder.de`
(Repro-Kommando aus dem Ticket), fixiere Root Cause pro Fall in dieser
Reihenfolge:

1. `status.ts`-Rate-Limiter zuerst ausschließen/fixen (gemeinsamer
   Nebenverdächtiger für 2 von 7 Fällen).
2. `fa-26-bug-report-form.spec.ts`-Skip-Bedingung korrigieren (Test-Bug,
   kein Produktionscode-Bug, aber verdeckt die eigentliche Assertion).
3. Die verbleibenden 4-5 unabhängigen Endpoint-Bugs (Booking, Finalize,
   Admin-Clients-Auth, Coaching-Publish) einzeln diagnostizieren und
   fixen.

Jeder Fix wird mit dem exakt zitierten Testfall verifiziert (RED → GREEN),
keine neuen Testfälle ohne Ticket-Bezug.

_Ticket: T002196_
