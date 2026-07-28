# Proposal: bug-consolidation-T002330

## Why

Teil C des Epics T002326. 7 Bug-Helper + 7 `/api/admin/bugs/*` + `/api/bug-report` laufen parallel zu `/api/admin/tickets/*` auf derselben Tabelle. Zwei Pfade statt einem.

## What

- `/api/admin/bugs/{create,list,resolve,reopen,assign,delete,show}` entfernen
- Bug-Helper-Klasse abbauen  
- `/api/bug-report`-Route abbauen
- FA-26 (bug-report E2E-Test) auf tickets-Pfad migrieren oder entfernen
- scope-Spalte für Bug/Kategorie-Differenzierung einführen

_Ticket: T002330_
