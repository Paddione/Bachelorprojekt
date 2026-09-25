## ADDED Requirements

### Requirement: Website Schema Init Installs the Latest Purge Function

The website's schema initialisation SHALL install `tickets.fn_purge_test_data()` from a single runtime definition
(`components/website/src/lib/tickets/purge-fn.ts`) whose body equals the latest
`scripts/one-shot/purge-fn-v*.sql` and carries that file's `RUNTIME-CHECK` marker. No other website module SHALL
define the function.

Rationale: an embedded v6 copy in `tickets/migrations.ts` re-installed itself on every website start and silently
reverted the manually applied v7/v8 migrations on fleet (T900381), which the runtime drift check then reported.

#### Scenario: The runtime definition carries the latest marker

- **GIVEN** the latest `scripts/one-shot/purge-fn-v*.sql` declares `-- RUNTIME-CHECK: function=tickets.fn_purge_test_data marker=<m>`
- **WHEN** the runtime definition in `purge-fn.ts` is read
- **THEN** its function body contains `<m>`

#### Scenario: No second definition in the website

- **GIVEN** the website sources under `components/website/src/lib/`
- **WHEN** they are searched for `CREATE OR REPLACE FUNCTION tickets.fn_purge_test_data`
- **THEN** the only match is in `tickets/purge-fn.ts`
