---
name: fix-t001939-portal-sidekick-hydration
description: Replace server-only pino logger with browser-compatible logger in PortalSidekick
---

# Capability: fix-t001939-portal-sidekick-hydration

## Purpose

Prevent client-side hydration crash in `PortalSidekick.svelte` by replacing the server-only pino logger import with the browser-compatible `browser-logger`.

## ADDED Requirements

### Requirement: Browser-Compatible Logger Import

`PortalSidekick.svelte` must use `browser-logger` instead of the server-only pino logger.

#### Scenario: PortalSidekick hydrates on the client

```gherkin
GIVEN PortalSidekick.svelte is loaded with client:load or client:idle
WHEN the component hydrates on the client
THEN no "process is not defined" error occurs
AND the component renders without hydration warnings
```

#### Scenario: Logging still works in PortalSidekick

```gherkin
GIVEN PortalSidekick.svelte needs to log messages
WHEN a log call is made
THEN the message is written to the browser console via browser-logger
```
