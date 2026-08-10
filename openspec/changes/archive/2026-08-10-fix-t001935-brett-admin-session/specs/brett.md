---
name: fix-t001935-brett-admin-session
description: Toast notification when admin_session_create receives session-active error
---

# Capability: fix-t001935-brett-admin-session

## Purpose

Show a user-visible toast notification in the Brett client when the server sends a `session-active` error in response to an `admin_session_create` message, instead of only logging to console.

## ADDED Requirements

### Requirement: Toast on session-active Error

When the server sends `{type:'error', reason:'session-active'}`, the client must display a toast notification.

#### Scenario: Admin tries to create session when one exists

```gherkin
GIVEN a Brett admin sends admin_session_create
WHEN the server responds with {type:'error', reason:'session-active'}
THEN a toast notification is shown with "Es läuft bereits eine Sitzung. Bitte beende diese zuerst."
```

#### Scenario: Other server errors

```gherkin
GIVEN a Brett admin sends admin_session_create
WHEN the server responds with {type:'error', reason:'some-other-reason'}
THEN a toast notification is shown with "Server-Fehler: some-other-reason"
```
