# AGB – Allgemeine Geschäftsbedingungen

**Datum:** 2026-04-13  
**Betrifft:** web.mentolder.de, web.korczewski.de  
**Status:** Approved

---

## Kontext

Beide Websites (mentolder.de und korczewski.de) bieten kostenpflichtige Dienstleistungen an. Es fehlen bisher Allgemeine Geschäftsbedingungen. Die AGB sollen als finale Rechtsdokumente erscheinen (kein Anwalts-Hinweis sichtbar).

---

## Dienstleistungen

### mentolder.de (Gerald Korczewski)
- Digital Café 50+ — ab 60 €/Stunde (B2C, Senioren)
- Führungskräfte-Coaching — ab 150 €/Session (B2C/B2B)
- Unternehmensberatung Digitale Transformation — nach Vereinbarung (B2B)
- Kleinunternehmer gem. § 19 Abs. 1 UStG (keine Umsatzsteuer)

### korczewski.de (Patrick Korczewski)
- KI-Beratung — 50 €/Stunde (B2C/B2B)
- Software-Entwicklung mit KI — 50 €/Stunde (B2C/B2B)
- Deployment & Infrastruktur — 50 €/Stunde (B2B)
- Kleinunternehmer gem. § 19 Abs. 1 UStG (keine Umsatzsteuer)

---

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Stornierung | Kostenlos bis 72 Stunden vor Termin; danach volle Vergütung fällig |
| Zahlung | Einzelstunden im Voraus; Pakete nach Vereinbarung |
| AGB-Zustimmung | Pflicht-Checkbox im Buchungsformular + Footer-Link |
| Darstellung | Finales Produkt, kein sichtbarer Entwurfs-Hinweis |
| Architektur | Wie impressum.astro – eine Seite, Config-Daten dynamisch |

---

## Zu ändernde Dateien

| Datei | Änderung |
|---|---|
| `website/src/pages/agb.astro` | Neu erstellen |
| `website/src/layouts/Layout.astro` | AGB-Link im Footer (Rechtliches-Block) |
| `website/src/components/BookingForm.svelte` | Pflicht-Checkbox vor Submit |
| `website/src/components/RegistrationForm.svelte` | AGB-Link im Datenschutz-Hinweis ergänzen |

---

## AGB-Seitenstruktur (`agb.astro`)

Alle Abschnitte nutzen `config` für Name, Adresse, E-Mail, Leistungsliste und Preise.

1. **§ 1 Geltungsbereich** — Anbieter, Geltung für alle Verträge
2. **§ 2 Vertragsschluss** — Buchungsanfrage als Angebot, Bestätigungsmail als Annahme
3. **§ 3 Leistungen** — dynamisch aus `config.services` (Titel + Preis)
4. **§ 4 Preise und Zahlung**
   - Kleinunternehmer gem. § 19 UStG (keine Umsatzsteuer ausgewiesen)
   - Einzelstunden: Zahlung im Voraus nach Rechnungsstellung
   - Pakete: Zahlung nach individueller Vereinbarung
   - Zahlungsmittel: Überweisung
5. **§ 5 Stornierung und Terminabsage**
   - Kostenlose Stornierung bis 72 Stunden vor dem vereinbarten Termin
   - Bei Absage weniger als 72 Stunden vorher: volle vereinbarte Vergütung fällig
   - Ausnahme: höhere Gewalt oder nachgewiesene Erkrankung (Attest erforderlich)
   - Recht des Anbieters, bei Verhinderung kostenfrei umzubuchen
6. **§ 6 Widerrufsrecht**
   - 14-tägiges Widerrufsrecht für Verbraucher (§ 312g BGB)
   - Erlöschen des Widerrufsrechts bei Dienstleistungsbeginn vor Ablauf der Widerrufsfrist mit ausdrücklicher Zustimmung
   - Muster-Widerrufsformular gemäß Anlage 2 EGBGB
7. **§ 7 Haftung**
   - Haftungsbeschränkung auf Vorsatz und grobe Fahrlässigkeit
   - Keine Haftung für entgangene Gewinne oder mittelbare Schäden
8. **§ 8 Datenschutz** — Verweis auf `/datenschutz`
9. **§ 9 Schlussbestimmungen**
   - Deutsches Recht
   - Gerichtsstand: Lüneburg
   - Salvatorische Klausel

---

## Formular-Änderungen

### BookingForm.svelte
- Neuer State: `agbAccepted = $state(false)`
- Checkbox mit `required` vor dem Submit-Button:
  ```
  ☐ Ich habe die AGB gelesen und akzeptiere sie. *
  ```
- Submit-Button deaktiviert solange `!agbAccepted`

### RegistrationForm.svelte
- Bestehenden Hinweis erweitern:
  > „Mit der Registrierung stimmen Sie unserer [Datenschutzerklärung] und unseren [AGB] zu."

---

## Footer

In `Layout.astro`, im `<ul>` des „Rechtliches"-Blocks, nach dem Datenschutz-Link:
```html
<li><a href="/agb" class="hover:text-gold transition-colors">AGB</a></li>
```
