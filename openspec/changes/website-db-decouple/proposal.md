# Proposal: website-db-decouple

## Why

Die Website (Astro/Svelte SSR) greift aktuell in ~60 `*-db.ts`-Modulen direkt per `pg.Pool` auf PostgreSQL zu. Dies führt zu:

- **Security:** DB-Zugangsdaten (`SESSIONS_DATABASE_URL`) liegen im Frontend-Code und werden im Website-Pod exponiert.
- **Kopplung:** Schema-Änderungen an der DB können direkt die Website-Compilation brechen. Es gibt keinen API-Vertrag zwischen Daten- und Präsentationsschicht.
- **Skalierung:** Die Website kann nicht unabhängig vom Datenzugriff skaliert werden.
- **Testbarkeit:** Tests benötigen eine echte PostgreSQL-Instanz statt gemockter API-Antworten.
- **Architektur:** Vermischung von Datenzugriff und Präsentationslogik erschwert Wartbarkeit und erschwert den Austausch der Datenhaltung.

## What

Einführung einer **API-Bridge-Schicht**, die sämtliche Datenbankzugriffe der Website kapselt. Die Bridge ist ein eigenständiger Node.js-Dienst (neues Package `packages/website-api/`), der von der Website per HTTP aufgerufen wird.

### Prinzipien

1. **Inkrementell:** Jedes DB-Modul wird einzeln migriert. Kein Big-Bang-Refactoring.
2. **API-First:** Vor der Implementierung wird der API-Contract definiert (Typen + Route).
3. **Rückwärtskompatibel:** Bestehende Importe aus `website-db.ts` werden über Re-Exports erhalten, bis alle Caller migriert sind.
4. **Brand-agnostisch:** Die Bridge läuft pro Brand (mentolder/korczewski), analog zum Website-Deployment.

### Phasen

- **Phase 1 (dieser Change):** Grundlegende Bridge-Architektur + Migration der 5 häufigsten aufgerufenen DB-Module (content, website-db, coaching-db, tickets-db, billing-db).
- **Phase 2:** Nächste 10–15 Module (customer-crm, messaging, appointments, etc.).
- **Phase 3:** Residuale Module mit geringer Aufruf-Frequenz.
- **Phase 4:** Alte DB-Pools aus der Website entfernen; `db-pool.ts` lebt nur noch in der Bridge.

_Ticket: T001490_
