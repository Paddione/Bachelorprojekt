# Proposal: fix-update-status-planstaged-guard-T002876

## Why

`update-status.sh` prueft ausschliesslich terminale Uebergaenge (done/archived,
T002382). Ein Wechsel nach `plan_staged` ohne existierenden
FACTORY-PLAN-REF-Kommentar ist fuer JEDEN Aufrufer moeglich (CLI, MCP, Agent,
Skript) — der widerspruechliche Zustand "plan_staged ohne Plan" ist am
2026-08-09 28-fach eingetreten (halbgestagte Plans). Kein Guard macht den
Zustand strukturell unerreichbar.

`reconcile-ticket-status.sh` umgeht update-status.sh bewusst per direktem SQL
(dort dokumentiert) — der neue Guard darf diesen Watchdog-Pfad nicht blockieren.
Da der Guard IN update-status.sh sitzt und reconcile das Skript nicht aufruft,
ist der Watchdog-Pfad automatisch ausgenommen.

## What

`update-status.sh` lehnt einen Wechsel nach `plan_staged` ab, wenn fuer das
Ticket kein `FACTORY-PLAN-REF`-Kommentar existiert (Fehlermeldung, Exit 2).
Die Pruefung ist eine separate SELECT-Abfrage vor dem UPDATE, analog zum
T002382-Terminal-Guard.

_Ticket: T002876_
