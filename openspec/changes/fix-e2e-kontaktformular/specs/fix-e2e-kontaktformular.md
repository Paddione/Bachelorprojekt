# fix-e2e-kontaktformular — Delta-Spec

## Purpose

Behebt den E2E-Smoke-Test T6 ("Valid form submission succeeds"), der reproduzierbar gegen die Live-Produktionsseite `https://web.mentolder.de` fehlschlägt.

## MODIFIED Requirements

### Requirement: E2E-CONTACT-FORM — Kontaktformular-Submission muss funktionieren

Der Playwright-E2E-Test T6 muss gegen die Live-Seite grün sein.

#### Scenario: Formular-Submission auf Live-Seite
GIVEN die Live-Seite `https://web.mentolder.de/kontakt` ist erreichbar
WHEN der E2E-Test T6 das Formular ausfüllt und absendet
THEN erscheint `.cf-result.is-success` mit Text "Vielen Dank" innerhalb von 60s

#### Scenario: Formularfelder sind nach Tab-Klick sichtbar
GIVEN die Kontaktseite ist geladen und der ContactHub ist hydratisiert
WHEN auf `tab-nachricht` geklickt wird
THEN sind die Formularfelder (Name, E-Mail, Nachricht) innerhalb von 15s sichtbar
