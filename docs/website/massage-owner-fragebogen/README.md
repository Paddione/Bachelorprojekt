# Owner-Fragebogen Massage-MVP (T901308)

Alle offenen Owner-Entscheide für das Epic T901016 in einem Dokument.
Jede Frage hat eine ID, Kontext (wo die Antwort einfließt) und eine
Empfehlung. Platzhalter im Code (`[slot:…]`, `[PLATZHALTER: …]`) werden
nach Beantwortung durch echte Inhalte ersetzt (Folge-Tickets).

**So antworten:** Nummerierte Antworten an T901308 als Ticket-Kommentar
oder Chat-Antwort, z. B. `OQ-01: Massagepraxis Vögelsen`. „OK" übernimmt
die Empfehlung. Unbeantwortete Fragen blockieren den Launch der
betreffenden Stelle (nicht das ganze Epic).

## A. Identität und Kontakt

### OQ-01: Praxis-Name (exakter Wortlaut)

- **Kontext:** Header, Footer, SEO-Titel, Rechnungen. Aktuell rendert
  „Massagepraxis Vögelsen" (`PRAXIS-NAME`).
- **Empfehlung:** „Massagepraxis Vögelsen" bestätigen (oder exakten
  Wunsch-Wortlaut nennen).
- **Antwortformat:** Ein Zeile, z. B. `OQ-01: Massagepraxis Vögelsen`.

### OQ-02: Inhaberinnen-Name und Qualifikation

- **Kontext:** Profilseite (`slot-inhaberin-name`,
  `slot-inhaberin-qualifikation`), Footer, E-Mail-Signatur.
- **Empfehlung:** Voller Name + höchste relevante Qualifikation
  (z. B. „staatl. geprüfte Masseurin"), so wie sie öffentlich
  stehen darf.
- **Antwortformat:** `OQ-02: <Name> / <Qualifikation>`.

### OQ-03: Telefonnummer und E-Mail-Adresse

- **Kontext:** Kontaktseite, Footer, `mailto:`/`tel:`-Links
  (`slot-telefon`, `stammdaten.email` — E-Mail ist aktuell leer,
  daher rendert kein Mail-Link).
- **Empfehlung:** Geschäftsnummer + -adresse nennen; beides wird
  öffentlich angezeigt.
- **Antwortformat:** `OQ-03: <Telefon> / <E-Mail>`.

### OQ-04: Profiltext

- **Kontext:** Seite „Über mich" (`PROFILTEXT`), ca. 600–900 Zeichen.
- **Empfehlung:** 3–5 Sätze: Werdegang, Schwerpunkte, Arbeitsweise.
  Stichpunkte genügen — Redaktion übernimmt Formulierung.
- **Antwortformat:** Freitext oder Stichpunkte.

## B. Leistungen und Preise

### OQ-05: Preise je Leistung

- **Kontext:** Leistungsseite + Buchungs-Journey
  (`PREIS-RUECKEN-30`, `PREIS-GANZKOERPER-60`,
  `PREIS-GANZKOERPER-90`). Alle drei Leistungen sind aktiv.
- **Empfehlung:** Endpreise inkl. MwSt.-Hinweis nennen (oder
  „Kleinunternehmer §19, keine MwSt." — siehe OQ-08).
- **Antwortformat:** `OQ-05: Rücken-30=<€>, Ganzkörper-60=<€>,
  Ganzkörper-90=<€>`.

### OQ-06: Storno-Regel (Wortlaut)

- **Kontext:** Buchungsstrecke, Bestätigungsmail, AGB-nah
  (`STORNO-REGEL`, `slot-storno-regel`). Aktuell nur Struktur,
  kein Regeltext.
- **Empfehlung (Beispiel, bitte bestätigen oder ändern):**
  „Kostenfreier Storno bis 24 h vor Terminbeginn, danach 50 % des
  Preises." Steuerberatung bei Bedarf einbeziehen.
- **Antwortformat:** Regeltext oder „Beispiel OK".

## C. Medien

### OQ-07: Fotos (Portrait, Praxisraum, Stimmung)

- **Kontext:** Profilseite, Homepage, Kontakt
  (`slot-portrait-inhaberin`, `slot-praxis-raum`,
  `slot-stimmung-*`). Aktuell Platzhalter-Markierungen.
- **Empfehlung:** Eigene, lizenzsaubere Fotos liefern (Portrait
  Pflicht, Rest Kür). Alternative: lizenzfreie Stock-Fotos
  akzeptieren (Vorschlag folgt nach Freigabe).
- **Antwortformat:** `OQ-07: eigene Fotos folgen / Stock OK`.

## D. Rechnungswesen

### OQ-08: Rechnungsangaben und §19-Status

- **Kontext:** Rechnungsdruck + Export (`CREDITOR-NAME`,
  `CREDITOR-ADRESSE`, `STEUERNUMMER`). §19-UStG ist
  konfigurierbar, Default: an (T901027).
- **Empfehlung:** Name, Adresse, Steuernummer nennen; §19-Default
  bestätigen (oder „regelbesteuert" melden).
- **Antwortformat:** `OQ-08: <Name> / <Adresse> / <Steuernr.> /
  §19 an|aus`.

## E. Freigaben

### OQ-09: Performance- und Accessibility-Budgets freigeben?

- **Kontext:** Runbook §11 (T901307): axe 0 critical/serious
  (enforced, grün), Tastatur-Journey (enforced, grün), CWV
  Live-Ziele LCP ≤ 2,5 s / INP ≤ 200 ms / CLS ≤ 0,1 (Prüfung
  nach Deploy).
- **Empfehlung:** Freigeben („OK").
- **Antwortformat:** `OQ-09: OK | Änderungswunsch: …`.

### OQ-10: Header-CTA „Erstgespräch" oder „Termin anfragen"?

- **Kontext:** Der Header-Button nutzt den geteilten String
  `nav.cta-label` („Erstgespräch", Coaching-Duktus). Die
  Massage-Seiten nutzen sonst „Termin anfragen".
- **Empfehlung:** Massage-spezifisch „Termin anfragen"
  (einheitlicher Duktus, kleiner Folge-Change).
- **Antwortformat:** `OQ-10: Termin anfragen | Erstgespräch OK`.

### OQ-11: Live-Smoke und Publish freigeben?

- **Kontext:** Epic-Kriterium 3 (Besucherweg live getestet) und
  Runbook-Checkliste verlangen einen Live-Smoke mit
  Owner-Freigabe. Publish nur mit Autorisierung.
- **Empfehlung:** Freigeben, sobald OQ-01–OQ-08 beantwortet sind
  (oder „später" mit Termin).
- **Antwortformat:** `OQ-11: freigegeben | später (<wann>)`.

### OQ-12: Questionnaire-Hold formal aufheben?

- **Kontext:** Epic-Vorbehalt (T901016): Lieferarbeit wartet auf
  beantworteten Fragebogen. Dieses Dokument IST der Fragebogen;
  mit OQ-01–OQ-11 ist der Vorbehalt gegenstandslos.
- **Empfehlung:** Mit Beantwortung automatisch aufgehoben („OK").
- **Antwortformat:** `OQ-12: OK`.

## Nach der Beantwortung

1. Inhalte einpflegen (Folge-Tickets je Bereich: Content,
   Preise, Medien, Rechnungswesen).
2. E2E gegen echte Inhalte wiederholen (FA-62/63/64/65).
3. Live-Smoke nach OQ-11-Freigabe.
4. Epic T901016 als shipped schließen.
