# Proposal: fix-ticket-tracking-T002279

## Why

Wenn eine Session einen Bug beiläufig mitfixt (im Rahmen eines anderen Tickets), bleibt das Bug-Ticket auf triage/planning stehen. Der Verweis im Commit zeigt nur nach vorne — nichts schließt den Kreis zurück zum Ticket.

## What

1. Commit-Message-Nachverfolgung: beim Merge PRs durchsuchen, welche Tickets beiläufig geschlossen wurden
2. Ticket-ID im Commit/Diff wird zurückverfolgt und das referenzierte Ticket auf done gesetzt
3. Post-Merge-Hook oder CI-Step der offene Tickets aufräumt

_Ticket: T002279_
