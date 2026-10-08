---
title: "preis-modell-t901430 — Massage-MVP Preismodell OQ-05"
ticket_id: T901430
domains: [website, massage]
status: staged
---

# preis-modell-t901430 — Implementation Plan

## File Structure

### New files

- `components/website/src/lib/massage-pricing.ts`: pure Preis-Helper (Basisstundensatz, Multiplier, Formatierung).
- `components/website/src/lib/__tests__/massage-pricing.test.ts`: Vitest-Abdeckung für den Helper.

### Changed files

- `components/website/src/content-schema/pages.ts`: `multiplier` im Leistungs-Row-Schema.
- `components/website/src/config/types.ts`: `multiplier` im config-seitigen `LeistungService`.
- `components/website/content/massage/leistungen.json`: Multiplier-Felder, Preis-Labels als Fallback aktualisiert.
- `components/website/src/config/brands/massage.ts`: Preis-Spiegel auf Helper umgestellt, Platzhalter ersetzt.
- `components/website/src/pages/leistungen.astro`: Massage-Zweig berechnet Preise beim Rendern.
- `components/website/src/pages/index.astro`: Massage-Angebotsblock berechnet Preise beim Rendern.
- `components/website/src/pages/kontakt.astro`: Journey-Services mit berechneten Preis-Labels.
- `components/website/src/components/ContactHub.svelte`: Platzhalter-Hinweis entfernt.
- `components/website/src/pages/api/booking.ts`: Snapshot nutzt den berechneten Preis.
- `components/website/src/pages/api/admin/angebote/save.ts`: Multiplier persistieren.
- `components/website/src/components/admin/inhalte/AngeboteSection.svelte`: Multiplier-Eingabe plus Live-Vorschau.
- `components/website/src/lib/__tests__/massage-brand.test.ts`: Platzhalter-Assertions auf Formelwerte migriert.
- `components/website/src/data/test-inventory.json`: generiert via Test-Inventar-Regeneration.

## Budgets

S1-Residualbudgets, gemessen im Plan-Worktree (Baseline-Key `S1:<pfad>`, sonst Extension-Limit aus `gates.yaml` minus Ist-Zeilen). Alle Dateien sind nicht gebaselined, Schwelle ist das statische Limit.

| file | ist | budget |
| `components/website/src/content-schema/pages.ts` | 167 | 733 |
| `components/website/src/config/types.ts` | 188 | 712 |
| `components/website/src/pages/leistungen.astro` | 265 | 735 |
| `components/website/src/pages/index.astro` | 431 | 569 |
| `components/website/src/pages/kontakt.astro` | 160 | 840 |
| `components/website/src/components/ContactHub.svelte` | 625 | 475 |
| `components/website/src/config/brands/massage.ts` | 208 | 692 |
| `components/website/src/pages/api/admin/angebote/save.ts` | 145 | 755 |
| `components/website/src/components/admin/inhalte/AngeboteSection.svelte` | 258 | 842 |
| `components/website/src/pages/api/booking.ts` | 249 | 651 |
| `components/website/src/lib/__tests__/massage-brand.test.ts` | 161 | 739 |

`components/website/content/massage/leistungen.json` ist S1-ungated (kein JSON-Limit, kein Baseline-Eintrag) und trägt deshalb keine Budgetzahl. Die zwei neuen Dateien bleiben als kleine Module deutlich unter dem TS-Limit. CQ02-Ist: 0 explizite `any` in `components/website/src`, Limit 200 — der Plan führt keine neuen ein.

## Context

OQ-05 legt das Massage-Preismodell fest: Preis gleich Basisstundensatz 60 Euro mal Multiplier pro Leistung (Default 1, admin-änderbar) mal Dauer in Minuten geteilt durch 60. Die Berechnung erfolgt beim Rendern, nicht als gespeicherter Festpreis. Daraus folgen die Katalogwerte 30 Minuten zu 30,00 Euro, 60 Minuten zu 60,00 Euro, 90 Minuten zu 90,00 Euro, formatiert per `Intl.NumberFormat` mit Gebietsschema de-DE und Währung EUR.

Heute steht an allen Preisstellen der Platzhalter `Preis folgt`: im Katalog-JSON, im statischen Brand-Spiegel, in den Journey-Services von `kontakt.astro`, in der Highlight-Zeile und im Journey-Hinweis von `ContactHub.svelte`. Der Admin-Pfad kennt bereits `stundensatz_cents` pro Katalogzeile (Formularpfad in der Save-Route), aber keinen Multiplier und keine Render-Berechnung.

Scope: nur Brand `massage`. Andere Brands haben keine `durationMin`-Werte, der Helper fällt dort auf das gespeicherte Preis-Label zurück, sodass sich ihr Rendering nicht ändert. Die Booking-Snapshot-Logik bleibt erhalten, sie liest nur den berechneten statt des gespeicherten Preises.

## Tasks

### Task 0: Rotphase zuerst

Schreibe zuerst `components/website/src/lib/__tests__/massage-pricing.test.ts` mit den Formelfällen (30 Minuten Multiplier 1 ergibt 3000 Cent und Label `30,00 €`, 60 Minuten ergibt `60,00 €`, 90 Minuten ergibt `90,00 €`, Multiplier 1,5 auf 60 Minuten ergibt 9000 Cent, fehlende Dauer fällt auf das gespeicherte Label zurück). Lasse dann den Runner gegen den noch nicht existierenden Helper laufen:

```bash
cd components/website && npx vitest run src/lib/__tests__/massage-pricing.test.ts
```

Ergebnis vor Task 1: expected: FAIL (Modul fehlt). Dieser Rot-Nachweis ist der Startbeleg, erst danach beginnt die Implementierung.

### Task 1: Preis-Helper als pures Modul

Lege `components/website/src/lib/massage-pricing.ts` an. S2-Vorgabe: pures Modul ohne Laufzeit-Importe aus DB- oder API-Schichten, nur Typ-Importe aus dem Content-Schema. Exportiere die Konstante für 6000 Cent Basisstundensatz, eine Cent-Berechnung aus Dauer und Multiplier (Multiplier kleiner gleich 0 oder ungültig fällt auf 1 zurück, Ergebnis kaufmännisch auf ganze Cent gerundet), eine de-DE-EUR-Formatierung und eine Zeilenfunktion, die für eine Katalogzeile mit `durationMin` den berechneten Wert und sonst das gespeicherte `price`-Label liefert. Kein `any`, alle Exporte typisiert. Lasse danach den Vitest-Lauf aus Task 0 erneut laufen und erwarte grün.

### Task 2: Multiplier in Schema und Config-Typen

Erweitere in `components/website/src/content-schema/pages.ts` das Interface `LeistungServiceRow` und das Zod-Objekt in `LeistungCategorySchema` um das optionale Feld `multiplier` als Zahl. Erweitere in `components/website/src/config/types.ts` das Interface `LeistungService` um dasselbe optionale Feld. Optionalität erhält die Abwärtskompatibilität: alle bestehenden Bundles ohne Multiplier validieren weiter, der Helper interpretiert Fehlen als 1.

### Task 3: Katalogdaten und statischer Spiegel

Trage in `components/website/content/massage/leistungen.json` pro Service `multiplier` mit Wert 1 ein und aktualisiere die drei `price`-Labels auf die Formelwerte als Fallback. Stelle in `components/website/src/config/brands/massage.ts` die Katalogzeilen, die Service-Kartenpreise samt `pageContent.pricing` und die Highlight-Zeile auf den Helper um: Der Modulimport des puren Helpers berechnet die Labels einmalig beim Laden, die Highlight-Zeile wird zur echten Preiszeile der Ganzkörpermassage 60 Minuten mit dem Hinweis auf Zahlung vor Ort mit Rechnung. Danach enthält kein Massage-Datensatz mehr den alten Platzhalter.

### Task 4: Render-Pfade berechnen beim Rendern

Ersetze in `components/website/src/pages/leistungen.astro` im Massage-Zweig die direkte Ausgabe des gespeicherten Labels durch die Helper-Zeilenfunktion. Ersetze in `components/website/src/pages/index.astro` im Massage-Angebotsblock die Preisausgabe ebenso. Ersetze in `components/website/src/pages/kontakt.astro` die hartcodierten `priceLabel`-Werte der Journey-Services durch Helper-Aufrufe mit Dauer und Multiplier 1. Entferne in `components/website/src/components/ContactHub.svelte` den Absatz mit dem Platzhalter-Hinweis, die Karten lesen die Labels bereits aus den Props. Stelle in `components/website/src/pages/api/booking.ts` den Preis-Snapshot auf die Helper-Zeilenfunktion um, sodass gespeicherte Anfragen dem angezeigten Preis entsprechen.

### Task 5: Admin-Override für den Multiplier

Erweitere in `components/website/src/pages/api/admin/angebote/save.ts` den Formularpfad der Leistungskatalog-Overrides um das Feld `multiplier` analog zum bestehenden `stundensatz_cents`-Feld (Zahl parsen, nur gültige positive Werte übernehmen). Der JSON-Pfad übernimmt das Feld automatisch mit der Payload. Erweitere in `components/website/src/components/admin/inhalte/AngeboteSection.svelte` den Katalog-Editor um eine nummerische Multiplier-Eingabe pro Zeile und eine Live-Vorschau des berechneten Preises über den Helper-Import.

### Task 6: Testmigration und Inventar

Migriere in `components/website/src/lib/__tests__/massage-brand.test.ts` die drei Platzhalter-Assertionen auf die Formelwerte (`30,00 €`, `60,00 €`, `90,00 €` für Katalog, Spiegel und Bundle) und ergänze eine Assertion, dass jede Massage-Katalogzeile `durationMin` und einen wirksamen Multiplier 1 trägt. Regeneriere anschließend das Test-Inventar (`task test:inventory`) und committe `components/website/src/data/test-inventory.json` mit, da die neue Testdatei aus Task 0 sonst den Inventar-Check fehlschlagen lässt.

### Task 7: Abschluss-Verifikation

Führe im Worktree nacheinander aus: `task test:changed`, `task freshness:regenerate`, `task freshness:check`. Alle drei müssen grün sein. Prüfe zusätzlich die CQ02-Zahl mit dem Zählbefehl aus den Quality-Gates (Erwartung: weiter 0, Limit 200) und stelle per Suche sicher, dass kein `Preis folgt` mehr in `components/website/src` oder `components/website/content/massage` steht.
