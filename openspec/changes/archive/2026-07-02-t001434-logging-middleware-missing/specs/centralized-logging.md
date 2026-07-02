## ADDED Requirements

### Requirement: Astro middleware entry point chains the logging middleware

The system SHALL compose `website/src/middleware.ts` (the Astro entry point)
such that `onRequest` invokes `loggingMiddleware` from
`website/src/middleware/logging.ts` before any other handler in the chain.
After the chain runs, `context.locals.requestId` and
`context.locals.requestLogger` SHALL be populated for every request, and the
response SHALL carry the `X-Request-ID` header.

#### Scenario: locals.requestLogger is defined after onRequest

- **WHEN** a request reaches `onRequest` (with or without an incoming
  `X-Request-ID` header)
- **THEN** `context.locals.requestId` is a non-empty string
- **AND** `context.locals.requestLogger` is a defined `pino.Logger` instance
- **AND** the response carries the `X-Request-ID` header with the same value
  as `context.locals.requestId`

#### Scenario: logging middleware runs before the locale middleware

- **WHEN** a handler in the chain (the user-supplied `next` or any subsequent
  middleware) reads `context.locals.requestLogger`
- **THEN** the logger is already defined (the logging step has run to
  completion before user code is invoked)
