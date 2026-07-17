---
name: fix-t001940-coaching-generate-502
description: Better error messages for coaching/generate KI request failures
---

# Capability: fix-t001940-coaching-generate-502

## Purpose

Improve error messages returned by the coaching/generate endpoint when KI requests fail, replacing the generic "KI-Anfrage fehlgeschlagen" with specific messages based on error type.

## ADDED Requirements

### Requirement: Descriptive Error Messages

The coaching/generate endpoint must return descriptive error messages based on the error type from the KI provider.

#### Scenario: API key missing

```gherkin
GIVEN the KI provider is not configured (missing API key)
WHEN a coaching step is generated
THEN the response contains "KI-Provider nicht konfiguriert — API-Key fehlt"
```

#### Scenario: Timeout

```gherkin
GIVEN the KI provider times out
WHEN a coaching step is generated
THEN the response contains "KI-Anfrage Timeout — Provider antwortet nicht"
```

#### Scenario: Rate limit or overloaded

```gherkin
GIVEN the KI provider returns 429 or 529
WHEN a coaching step is generated
THEN the response contains "KI-Provider überlastet — bitte später erneut versuchen"
```

### Requirement: Streaming Error Messages

The streaming path must return the same descriptive error messages as the non-streaming path.

#### Scenario: Stream error with timeout

```gherkin
GIVEN the KI provider times out during streaming
WHEN a coaching step is generated via SSE
THEN the stream error contains "KI-Anfrage Timeout"
```
