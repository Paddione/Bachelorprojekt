---
title: "p4-form-journey — Besucher-Journey Anfrageformular"
ticket_id: T901024
slug: appointment-requests
domains: [website, massage-frontend]
status: partial
---

# appointment-requests — Implementation Plan

Partial `p4-form-journey` (Besucher-Journey Anfrageformular) zu T901024.
Scope: genau zwei Dateien,
keine weiteren Dateien einplanen oder ändern. Alle Texte sind Entwürfe; Stellen mit
offenem Owner-Input werden im UI sichtbar als Platzhalter gekennzeichnet.

<!-- vitest: kein neuer Test nötig, weil dieses Partial nur zwei UI-Dateien ändert und die committed Abdeckung im Sibling-Partial (BATS-Spec tests/spec/appointment-requests.bats) liegt; rot→grün läuft über eine temporäre, nicht committete Probe unter /tmp. -->

## File Structure

| Datei | Ist | Budget |
| `components/website/src/components/ContactHub.svelte` | 318 | 782 |
| `components/website/src/pages/kontakt.astro` | 148 | 852 |

S1-Notizen (verifiziert per `wc -l`, Baseline-Lookup, `gates.yaml`):

- `components/website/src/components/ContactHub.svelte` Ist 318, Status
  nicht-baselined, wirksame Schwelle `.svelte`-Limit 1100 (Budget 782).
  Geplantes Wachstum ca. 200–300 Zeilen (vier Journey-Schritte in einer Datei)
  landet bei ca. 520–620 von 1100, deutlich unter 80 % der Schwelle —
  kein Split nötig.
- `components/website/src/pages/kontakt.astro` Ist 148, Status nicht-baselined,
  wirksame Schwelle `.astro`-Limit 1000 (Budget 852). Geplantes Wachstum ca.
  30–60 Zeilen (Props-Verdrahtung, Slot-Übernahme aus Query) landet bei ca.
  180–210 von 1000 — kein Split nötig.

Budget-Regel für die Ausführung: Netto-Wachstum in beiden Dateien zusammen unter
400 Zeilen halten; keine Baseline-/Ignore-Ausnahme einplanen.

## Kontext (Einarbeitung, gelesen)

- `intel.json` des Plan-Ordners (Impact-Dateien, S1-Budgets).
- `plan-quality-gates.md` (kanonisch): S1-Ratchet, S3-Hostnamenverbot,
  CQ02-`any`-Verbot, Verify-Kommandos.
- `ContactHub.svelte` (Ist 318): Modus-Tabs Termin/Nachricht/Rückruf, rendert
  `BookingForm`/`ContactForm`, Sidebar mit Direkt-Kontakt. Die neue Journey wird
  ein vierter Modus-Pfad innerhalb dieser Datei; `BookingForm.svelte` und
  `ContactForm.svelte` bleiben unverändert.
- `kontakt.astro` (Ist 148): liest `?mode=`, `?service=`, `?date=`, `?start=`,
  `?end=` und reicht sie als Props an `ContactHub` weiter; Slot-Preview-Block
  existiert bereits als Muster.
- `api/calendar/slots.ts`: `GET /api/calendar/slots?from=YYYY-MM-DD&durationMin=N`
  liefert verfügbare Slots als JSON; Fehlertext deutsch. Nur lesend nutzen,
  keine Änderung.
- `content/massage/leistungen.json` (Katalog, nur lesend nutzen): `ruecken-30`
  (30 Min), `ganzkoerper-60` (60 Min, Highlight), `ganzkoerper-90` (90 Min),
  alle Preise aktuell Platzhalter.
- T901021 `docs/website/massage-content-design/README.md` §2–3: Content-Entwürfe
  (Anfrage → Bestätigung durch Inhaberin, Mindestvorlauf, Hausbesuche nur
  bekannte Kunden, Zahlung vor Ort), Zustände `offen` → `bestätigt`/`abgelehnt`.

## Task 1 — Rot→Grün-Probe anlegen (Failing-Test-Step)

Schreibe eine temporäre, nicht zu committende BATS-Probe nach
`/tmp/p4-journey-probe.bats`, die die Journey-Marker in beiden Target-Dateien
per `grep` assertiert (Service-Keys `ruecken-30`, `ganzkoerper-60`,
`ganzkoerper-90`; Slot-Abruf gegen `/api/calendar/slots`; Vortag-Hinweis;
`Idempotency-Key`; Token-Hinweis; kein Hausbesuch-Strang).

Steps:

1. Probe-Datei unter `/tmp/p4-journey-probe.bats` anlegen (alles in ```-Fences,
   keine Repo-Datei anlegen).
2. Ausführen: `bats /tmp/p4-journey-probe.bats` — expected: FAIL (Marker fehlen
   vor der Implementierung).

Akzeptanzkriterien:

- Die Probe läuft mit dem `bats`-Runner und meldet vor der Änderung
  fehlgeschlagene Assertions.
- Die Probe referenziert ausschließlich die zwei Target-Dateien.

## Task 2 — ContactHub.svelte: Schritt 1 Service-Auswahl

Erweitere `components/website/src/components/ContactHub.svelte` um einen
Journey-Modus `anfrage` mit Schritt-Navigation (1 Service, 2 Slot, 3 Daten,
4 Fertig). Schritt 1 zeigt die drei Katalog-Services als auswählbare Karten
(Radio-Gruppe in `fieldset`/`legend`, Tastatur: Pfeiltasten + Tab nativ,
Touch-Targets mindestens 44 px).

Steps:

1. Neue Props `journeyServices` (Array mit `key`, `name`, `durationMin`,
   `priceLabel`) und `journeyEnabled` (Default `false`, Bestand unverändert).
2. Schritt-1-Markup: Karten für `ruecken-30`, `ganzkoerper-60` (Highlight-Badge
   „Beliebt“ als Entwurf), `ganzkoerper-90`; Preis-Label aus Prop, Platzhalter
   sichtbar (Entwurf: „Preis folgt“).
3. Auswahl in State halten, `initialServiceKey`-Prop als Vorauswahl übernehmen,
   `durationMin` der Wahl an Schritt 2 weitergeben.
4. Fortschrittsanzeige (`ol` mit `aria-current="step"`), mobil einspaltig.

Akzeptanzkriterien:

- Ohne `journeyEnabled` rendert die Komponente exakt wie bisher (kein
  Regressions-Risiko für andere Brands).
- Alle drei Service-Keys sind wählbar, Vorauswahl per `initialServiceKey`
  funktioniert, Highlight-Service ist markiert.
- Preise sind als Platzhalter erkennbar, kein erfundener Euro-Betrag.
- Bedienung per Tastatur und auf 360 px Breite ohne Horizontal-Scroll.

Verify:

- `bats /tmp/p4-journey-probe.bats` (Schritt-1-Assertions werden grün).
- Manuell: Seite mit Journey-Props rendern, nur Tastatur nutzen.

## Task 3 — ContactHub.svelte: Schritt 2 Slot-Auswahl mit Vortag-Regel

Schritt 2 lädt Slots aus `GET /api/calendar/slots?from=<Datum>&durationMin=<Dauer>`
(relativer Pfad, keine Hostnamen nach S3) und filtert clientseitig alle
Gleich-Tag-Slots heraus. Die Vortag-Regel ist als sichtbarer Hinweis-Text
(Entwurf) direkt über der Slot-Liste platziert.

Steps:

1. `fetch('/api/calendar/slots?...')` mit `durationMin` aus Schritt 1; `from`
   ab Folgetag (nie heute); Lade-, Leer- und Fehlerzustände mit deutschen
   Entwurfstexten.
2. Clientseitiger Filter: Slots mit Datum gleich heute werden nie angezeigt,
   auch wenn die API sie liefern würde (Defense in Depth, dokumentiert im
   Code-Kommentar in einer Zeile).
3. Vortag-Hinweis als Entwurfstext, z. B. sinngemäß „Anfragen sind bis zum
   Vortag möglich — heute ist kein Slot mehr buchbar.“ (finaler Wortlaut offen
   für Owner-Input, als Platzhalter markiert).
4. Slot-Auswahl als Radio-Gruppe; `initialDate`/`initialStart`/`initialEnd`
   als Vorauswahl übernehmen, wenn sie in der geladenen Liste enthalten sind.
5. Zurück-Navigation zu Schritt 1 behält die Service-Wahl.

Akzeptanzkriterien:

- Gleich-Tag-Slots sind in keinem Fall auswählbar (API-`from` ab Folgetag
  plus Client-Filter).
- Vortag-Regel ist ohne Scrollen oder Klick sichtbar, sobald Schritt 2 offen ist.
- Lade-/Leer-/Fehlerzustände sind lesbar und per Screenreader erreichbar
  (`aria-live="polite"`, `role="status"`).
- Kein Hausbesuch-Pfad: kein Adressfeld, keine Hausbesuch-Option im UI.

Verify:

- `bats /tmp/p4-journey-probe.bats` (Schritt-2-Assertions werden grün).
- Manuell: Netzwerkantwort mit heutigem Slot simulieren, Filter prüfen.

## Task 4 — ContactHub.svelte: Schritt 3 Daten + Schritt 4 Absenden/Bestätigung

Schritt 3 fragt minimale Kontaktdaten ab (Name, E-Mail oder Telefon, optionale
Nachricht) plus Pflicht-Checkbox zum AGB-/Datenschutz-Hinweis (Entwurfstexte,
Links auf `/datenschutz`; AGB-Kurztext inline mit Platzhalter-Kennzeichnung, da
Owner-Input offen). Absenden per `POST` mit `Idempotency-Key`-Header
(`crypto.randomUUID()` pro Formular-Instanz, Button bis Antwort deaktiviert,
Doppelklick-sicher). Schritt 4 ist die Bestätigungsansicht mit Token-Hinweis
(Entwurf: Link aufbewahren für Umbuchung/Storno).

Steps:

1. Formularfelder mit `label`, `autocomplete`, nativer Validierung
   (`required`, `type="email"`, `minlength`); Fehlermeldungen per
   `aria-describedby`.
2. Pflicht-Checkbox „AGB-/Datenschutz-Hinweis gelesen“ (Entwurfstext, Link
   `/datenschutz`); ohne Haken kein Absenden.
3. Submit-Handler: genau ein `fetch`-POST, `Idempotency-Key: <UUID>`-Header,
   Button während Request `disabled` mit Lade-Text; Fehlertext bei
   Serverfehler, Formulardaten bleiben erhalten.
4. Bestätigungsansicht: Erfolgsmeldung (Entwurf), Token-Link aus der
   Antwort als kopierbarer Hinweis („Link aufbewahren“), `aria-live="assertive"`
   und Fokus auf die Überschrift setzen.
5. Typisierung ohne `any` (CQ02); keine `as any`-Notfälle einplanen.

Akzeptanzkriterien:

- Doppelklick/Doppel-Enter löst genau einen POST mit genau einem
  `Idempotency-Key` aus.
- Ohne Checkbox-Haken ist Absenden blockiert (nativ + Handler-Guard).
- Bestätigung zeigt den Token-Hinweis und ist per Tastatur erreichbar
  (Fokus-Management, kein Fokus-Verlust).
- AGB-/Datenschutz-Texte sind als Entwürfe erkennbar, offene Stellen als
  Platzhalter markiert; kein Hausbesuch-Strang.

Verify:

- `bats /tmp/p4-journey-probe.bats` (alle ContactHub-Assertions grün).
- `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`.

## Task 5 — kontakt.astro: Journey-Verdrahtung

Erweitere `components/website/src/pages/kontakt.astro` so, dass die Journey mit
Massage-Katalog gespeist wird: statische Service-Liste (Keys, Namen, Dauer,
Preis-Platzhalter aus `content/massage/leistungen.json`, lesend übernommen),
Weitergabe von `?service=`/`?date=`/`?start=`/`?end=` an die neuen Props,
Journey nur für den Massage-Brand aktivieren (andere Brands unverändert).

Steps:

1. Service-Array im Frontmatter definieren (Werte aus dem Katalog, Preise als
   Platzhalter-Label, kein Euro-Betrag erfinden).
2. `journeyEnabled` und `journeyServices` an `ContactHub` übergeben; Brand-
   Bedingung analog zur bestehenden `isKore`-Weiche formulieren.
3. Query-Vorauswahl (`service`, `date`, `start`, `end`) an die Journey-Props
   durchreichen; ungültige Werte fallen auf leere Vorauswahl zurück.
4. Hero/Sidebar/SEO-Blöcke unverändert lassen.

Akzeptanzkriterien:

- Massage-Brand: Journey-Modus aktiv, Bestand-Modi weiter erreichbar.
- Andere Brands: kein sichtbarer Unterschied zu vorher.
- Ungültige Query-Werte brechen die Seite nicht (leere Vorauswahl, kein Fehler).

Verify:

- `bats /tmp/p4-journey-probe.bats` vollständig grün.
- Seite mit und ohne Query-Parameter rendern, beide Brands prüfen.

## Task 6 — Finale Verifikation

Führe die drei mandatory Verify-Kommandos aus und bestätige S1/CQ02-Stände.

Steps:

1. `task test:changed`
2. `task freshness:regenerate`
3. `task freshness:check`
4. S1-Nachweis: `wc -l` beider Dateien gegen Budgets (782 / 852) prüfen,
   `bats /tmp/p4-journey-probe.bats` grün bestätigen.

Akzeptanzkriterien:

- Alle drei Kommandos laufen fehlerfrei durch.
- Beide Dateien bleiben unter ihrer wirksamen Schwelle (1100 / 1000).
- Die `/tmp`-Probe wird nicht committet (Throwaway-Artefakt).
