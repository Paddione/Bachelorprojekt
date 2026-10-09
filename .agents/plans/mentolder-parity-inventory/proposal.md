# Proposal: mentolder-parity-inventory (T901033)

## WARUM

Mentolder soll als kleinbetriebsfähiger Kern (Buchung bis Rechnung) von der
breiteren Plattform (SDLC/LLM/Coaching) abgrenzbar werden. Dafür fehlt eine
belegte Bestandsaufnahme: Welche öffentlichen/Admin-Flows, Integrationen,
Auth-/Isolationsmechanismen, Migrationen und Asset-Konsumenten existieren
tatsächlich — mit exakter Quell-Evidenz, nicht aus Erinnerung.

## WAS

Inventur-Dokumente unter `docs/parity/` plus BATS-Guards, die Vollständigkeit
und Evidenz-Verlinkung prüfen:

- Kernpfade zuerst: Buchung bis Rechnung inkl. Auth/Isolation.
- Danach: übrige Flows, Integrationen/Jobs, Migrationen, Asset-Konsumenten.
- Klassifikation je Eintrag: retain/extract/replace/defer.
- Vergleich Mom-MVP vs. bestehende Mentolder-Funktionalität.
- Staging-Baseline-Verfahren (Klon ohne Echtdaten, nie Prod berühren).

## Nicht-Ziele

- Keine Implementierung, kein Refactoring, keine Prod-Berührung.
- Keine neue Auth-/Tenant-Logik — nur Kartierung des Ist-Stands.
- SDLC/LLM/Coaching-Innereien bleiben per Default außerhalb des Kerns.

## Brainstorming-Entscheidungen (nicht-interaktiv, aus Ticket-Spec)

1. Baseline = STAGING-Klon ohne Echtdaten (Seed-/Synthetikdaten); Prod wird
   nie gelesen oder verändert.
2. Reihenfolge: Kernpfade (Buchung→Rechnung inkl. Auth/Isolation) zuerst,
   restliche Flows danach.
3. Vor-Evidenz wiederverwenden (Checkout 0ff76b4, K3-Graph), Lücken gezielt
   füllen statt blind neu erheben.
4. Tenant-Befunde (BRAND-Env-Fallback, Brand-CHECKs, fehlender Tenant-Parameter
   in messaging-db) als Audit-/Migrations-Befunde kartieren, nicht als Exploits
   beweisen.
5. Jede Inventur-Aussage braucht exakte Quell-Evidenz (Pfad + Symbol/Zeile)
   und Test-Referenz wo vorhanden.
