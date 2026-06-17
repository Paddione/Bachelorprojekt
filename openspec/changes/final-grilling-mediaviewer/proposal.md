# Proposal: final-grilling-mediaviewer

## Why

Vor der Implementierung eines Softwareentwicklungs-Tickets gibt es oft ungeklärte Fragen
zu Architektur, Edge Cases, Testing-Strategie und Deployment. Die bestehende
Deep-Grilling-Funktionalität (`ticket.sh grill`) persistiert Antworten im Ticket, hat aber
keine Widget-basierte UI für die finale Klärungsrunde. Entwickler müssen die Grilling-Antworten
aktuell im Admin-Ticket-Detail (`GrillingStepper`) einsehen — nicht im Sidekick-Widget,
das der primäre Interaktionspunkt während der Arbeit am Ticket ist.

## What

Der Mediaviewer-Widget (React, iframe-embedded im Sidekick) erhält einen zweiten Modus
`grilling` neben dem bestehenden `video`-Mode. Im Grilling-Mode wird ein neuer Fragebogen
`final-grilling-v1` (Softwareentwicklungs-Klärungsfragen: 6 Sektionen, 23 Fragen) angezeigt.
Die Fragen werden implizit aus Ticket-Daten angereichert (kontextspezifische Hinweise,
KI-Vorschläge). Antworten werden via postMessage → Host → PATCH API im Ticket persistiert.

_Ticket: T000942_
