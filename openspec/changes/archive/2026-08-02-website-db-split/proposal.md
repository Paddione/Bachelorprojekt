# Proposal: website-db-split

## Why

`website/src/lib/website-db.ts` ist bereits einmal aus einem God-File-Zustand heraus verkleinert
worden (T001293: 4436→2890 Zeilen, `billing-db.ts` extrahiert) und liegt aktuell bei 1939 Zeilen —
unter dem G-SIZE03-Budget (<=3000), aber mit erkennbarem Wachstumstrend. Statt erneut zu warten, bis
das Budget gerissen wird, wird die Datei jetzt praeventiv und in zwei Etappen weiter aufgeteilt,
nach demselben Extraktions-Muster wie `billing-db.ts` (Re-Export-Kompatibilitaet, keine
Signatur-Aenderungen an den Call-Sites).

Zweistufig statt Einzel-PR, weil die Datei ueber 20 funktionale Bereiche (Customer, Bug-Tickets,
Time-Entries, Content-Store, ...) mit unterschiedlicher Kopplung an andere Module abdeckt — ein
Einzelschritt waere ein hohes Blast-Radius-PR ueber die gesamte Datei.

## What

- Stufe 1: Erste Haelfte (Customer, Bug-Tickets, Site-Settings, Vacation/Blackout, Legal-Pages,
  ca. Zeilen 5–740) in ein neues Modul extrahieren; `website-db.ts` behaelt Re-Exports fuer
  Bestandskompatibilitaet.
- Stufe 2: Zweite Haelfte (Time-Entries, Client-Notes, Onboarding, Follow-ups, Admin-Shortcuts,
  DSGVO-Audit-Log, Invoice-Counter, Brett, Custom-Sections, Content-Store, ca. Zeilen 741–Ende) in
  ein weiteres neues Modul extrahieren.

_Ticket: T002149_
