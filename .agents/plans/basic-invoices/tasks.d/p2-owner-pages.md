---
title: "p2-owner-pages — Owner-Rechnungsseiten (Liste + Detail)"
ticket_id: "T901027"
domains: [plan-authoring, factory]
status: "staged"
---

# basic-invoices — Implementation Plan

## File Structure

Neue Dateien (exklusiv für dieses Partial, setzt p1-Lib voraus):

| Datei | Zweck |
|---|---|
| `components/website/src/pages/owner/rechnungen.astro` | Owner-Liste aller Rechnungen, ohne JS |
| `components/website/src/pages/owner/rechnungen/[id].astro` | Owner-Detail mit Pflichtangaben, Druckansicht, Status-Aktionen |

## S1-Budget-Notizen

Quelle der Limits: `docs/code-quality/gates.yaml` (`yq '.s1.limits'`), Baseline per `jq` geprüft.

- `components/website/src/pages/owner/rechnungen.astro` ist neu (Ist 0, nicht-baselined). Wirksame Schwelle ist das statische `.astro`-Limit 1000, Budget 1000. Geplant sind rund 120–180 Zeilen, deutlich unter 80 % der Schwelle, daher ist kein Split nötig.
- `components/website/src/pages/owner/rechnungen/[id].astro` ist neu (Ist 0, nicht-baselined). Wirksame Schwelle ist das statische `.astro`-Limit 1000, Budget 1000. Geplant sind rund 250–400 Zeilen (Detail plus Druck-CSS), deutlich unter 80 % der Schwelle, daher ist kein Split nötig.
- Referenz-Musterdateien (`owner/kunden.astro`, `owner/anfragen.astro`, `admin/billing/[id]/drucken.astro`) werden nur gelesen, nicht geändert.
- S2: Beide Seiten importieren nur abwärts (`lib/owner-guard`, `lib/auth`, p1-Lib `lib/invoices`), keine Rück-Importe, keine neuen Zyklen.
- S3: Keine Brand-Domains als String-Literale. Brand-Auflösung wie im Muster über `ownerBusiness(session).brand ?? process.env.BRAND`, Kontakt/Domain über Env (`CONTACT_EMAIL`, `PUBLIC_DOMAIN`).
- CQ02: Keine `any`-Typen in neuem Code. Alle Handler-Daten und Props werden explizit typisiert.

<!-- vitest: kein neuer Test nötig, weil dieses Partial nur zwei .astro-Seiten ohne neue lib-/API-Logik anlegt; Logik-Tests liefert p1, BATS-Spec liefert das Test-Partial -->

## Voraussetzungen

- p1-Lib ist gemergt verfügbar: `components/website/src/lib/invoices.ts` mit typisierten Lesefunktionen für Liste und Einzelrechnung (inkl. Positionen, Beträge, Status, §14-Felder) sowie der Migration `20261008_invoices.sql`.
- Falls die p1- Funktionsnamen abweichen, passt der Implementierer die Importnamen in den Tasks 2 und 3 entsprechend an.

## Task 1 — Rot-Probe: Seiten fehlen (red)

Ziel: Belegen, dass beide Zielseiten vor der Implementierung fehlen.

Steps:

1. Temporäre BATS-Probe nach `/tmp/p2-owner-pages-probe.bats` schreiben (Wegwerf-Probe, kein Repo-Commit). Die Probe prüft je Zielseite die Dateiexistenz sowie je ein Inhaltsmerkmal (`/owner/rechnungen` enthält die Tabellenspalte `Rechnungsnummer`, die Detailseite enthält den Kleinunternehmer-Hinweis `§ 19`):
   ```bash
   bats /tmp/p2-owner-pages-probe.bats
   # expected: FAIL — beide Dateien existieren noch nicht
   ```

Akzeptanzkriterien:

- Der `bats`-Lauf schlägt fehl, weil beide Zielseiten fehlen.
- Die Probe liegt ausschließlich unter `/tmp` und wird nicht ins Repo übernommen.

## Task 2 — Owner-Liste `owner/rechnungen.astro` anlegen (green)

Ziel: Übersicht aller Rechnungen des eingeloggten Owners, serverseitig gerendert, ohne clientseitiges JS.

Steps:

1. Neue Datei `components/website/src/pages/owner/rechnungen.astro` nach dem Muster von `owner/kunden.astro` anlegen: Frontmatter mit `requireOwner(Astro.request.headers.get('cookie'))`, Redirect auf `getLoginUrl(Astro.url.pathname)` ohne Session, Brand via `ownerBusiness(session).brand ?? process.env.BRAND`.
2. Rechnungsliste über die p1-Lib laden (strikte Owner-Isolierung: nur Rechnungen der eigenen Brand, neueste zuerst).
3. Tabelle mit den Spalten Nummer, Datum (de-DE, `Europe/Berlin`), Kunde (Name oder E-Mail), Betrag (EUR, de-DE-Format) und Status rendern. Statuswerte mindestens `offen` und `bezahlt`, als Text ohne JS-Filter.
4. Jede Zeile verlinkt auf `/owner/rechnungen/<id>`. Leerzustand mit dem Satz `Noch keine Rechnungen vorhanden.` abdecken. Navigation `Zurück zur Übersicht` nach `/owner` aufnehmen.
5. Styling analog zum Muster (`owner/kunden.astro`): Systemschrift, Karten oder Tabelle, responsive Basis-Layout, keine externen Assets, keine `<script>`-Tags.

Akzeptanzkriterien:

- Nicht eingeloggte Aufrufe landen auf der Login-Seite.
- Die Liste zeigt Nummer, Datum, Kunde, Betrag und Status je Rechnung.
- Die Seite enthält kein `<script>`-Element und keine clientseitigen Event-Handler.
- Die Datei bleibt unter 300 Zeilen (Budget 1000, Reserve eingehalten).

Verify:

```bash
grep -c '<script' components/website/src/pages/owner/rechnungen.astro | grep -q '^0$'
wc -l components/website/src/pages/owner/rechnungen.astro
```

## Task 3 — Owner-Detail `owner/rechnungen/[id].astro` anlegen (green)

Ziel: Detailseite einer Rechnung mit allen §14-Pflichtangaben, Kleinunternehmer-Hinweis, Druckansicht und Status-Aktionsformularen, ohne clientseitiges JS.

Steps:

1. Neue Datei `components/website/src/pages/owner/rechnungen/[id].astro` anlegen: `requireOwner`-Guard wie in Task 2, `Astro.params.id` auslesen, bei fehlender oder fremder Rechnung auf `/owner/rechnungen` zurückleiten.
2. Rechnung inkl. Positionen über die p1-Lib laden. Alle §14-Pflichtangaben rendern: Name und Anschrift von Leistendem und Empfänger, Steuernummer oder USt-IdNr. des Leistenden, fortlaufende Rechnungsnummer, Rechnungsdatum, Leistungsdatum oder -zeitraum, Art und Umfang der Leistung (Positionen), Entgelt und Steuerbetrag bzw. Hinweis auf Steuerbefreiung.
3. Kleinunternehmer-Hinweis aufnehmen: `Der Rechnungssteller ist Kleinunternehmer gemäß § 19 Abs. 1 UStG. Es wird keine Umsatzsteuer ausgewiesen.` Beträge in EUR mit de-DE-Format, Daten mit de-DE-Datum.
4. Druckansicht nach dem Muster von `admin/billing/[id]/drucken.astro` umsetzen: `@media print` mit S/W-Overrides, `.no-print`-Werkzeugleiste (Druck-Schaltfläche mit `window.print()`, Zurück-Link), `@page`-Regel. Keine Stripe-Elemente übernehmen.
5. Status-Aktionsformulare als reine POST-Formulare ohne JS nach dem Muster von `owner/anfragen.astro` umsetzen: Formular `Als bezahlt markieren` an den Zahlungsstatus-Endpunkt, Formular `Korrigieren` an den Korrektur-Endpunkt (beide Endpunkte liefert das API-Partial; die `action`-URLs werden exakt auf dessen Routen gelegt). Nach erfolgreicher Aktion leitet der Endpunkt auf die Detailseite zurück.
6. Fremde `id` (andere Brand) verhält sich wie eine fehlende Rechnung (Redirect, keine Datenpreisgabe).

Akzeptanzkriterien:

- Alle §14-Pflichtangaben sind auf der Seite sichtbar, der Kleinunternehmer-Hinweis ist wörtlich enthalten.
- Die Druckansicht blendet die Werkzeugleiste aus und druckt S/W-lesbar.
- Beide Status-Aktionen sind POST-Formulare ohne JS.
- Die Datei bleibt unter 500 Zeilen (Budget 1000, Reserve eingehalten).
- Kein `any`, keine hardcodierten Brand-Domains im neuen Code.

Verify:

```bash
grep -c '<script' 'components/website/src/pages/owner/rechnungen/[id].astro' | grep -q '^0$'
grep -c '§ 19 Abs. 1 UStG' 'components/website/src/pages/owner/rechnungen/[id].astro'
grep -rn ': any\|<any>\|as any' components/website/src/pages/owner/rechnungen.astro 'components/website/src/pages/owner/rechnungen/[id].astro' | wc -l
wc -l 'components/website/src/pages/owner/rechnungen/[id].astro'
```

## Task 4 — Grün-Probe und Qualitäts-Gates (verify)

Ziel: Rot-Probe auf grün drehen und die mandatory Verifikation ausführen.

Steps:

1. BATS-Probe erneut ausführen:
   ```bash
   bats /tmp/p2-owner-pages-probe.bats
   ```
   Erwartung: grün, beide Dateien existieren und enthalten ihre Merkmale.
2. Mandatory Verify-Commands ausführen:
   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```

Akzeptanzkriterien:

- Die BATS-Probe ist grün.
- Alle drei Verify-Commands laufen erfolgreich durch.
- `task freshness:check` meldet keine S1–S4-Verstöße für die beiden neuen Dateien.
