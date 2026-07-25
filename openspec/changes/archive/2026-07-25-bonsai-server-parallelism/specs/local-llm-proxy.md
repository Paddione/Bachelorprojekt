## MODIFIED Requirements

### Requirement: Proxy as sole LLM gateway

The system SHALL support concurrent request processing (`max_inflight > 1`) and backend fixups to ensure stable gang-parallelism across multi-slot LLM backends without GBNF grammar parsing errors.

#### Scenario: Multi-slot requests run in parallel with GBNF pattern sanitization

- **GIVEN** a multi-slot backend configured with `max_inflight > 1`
- **WHEN** concurrent requests containing tool schemas with escaped regex patterns (`\-`) are received
- **THEN** `sanitizeGbnfPattern` cleans pattern escapes to prevent GBNF grammar parser failures and requests execute concurrently.
