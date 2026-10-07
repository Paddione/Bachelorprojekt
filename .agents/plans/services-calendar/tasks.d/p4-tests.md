---
title: p4-tests — services-calendar
ticket_id: T901023
domains: [website, test]
status: draft
---

# p4-tests — services-calendar Test Guards

Partial-ID `p4`, Rolle `tests`, `depends_on: [p1, p2, p3]`.
Letztes Partial: trägt den STRUCT2-Failing-Test-Step.
Kein finaler Verify-Task in diesem Partial (gehört dem Orchestrator-Index).

Extend-Check (gelesen, kein Target): Die nächstliegenden bestehenden
Vitest-Dateien (`email-booking.test.ts`, `owner-guard.test.ts`,
`business-memberships.test.ts` in `components/website/src/lib/__tests__/`)
decken E-Mail-Helper, Auth-Guard und Memberships ab — keine deckt
Settings-Validierung oder Verfügbarkeit/claimSlot/Snapshot ab. Darum sind
beide Vitest-Dateien unten als neue Dateien geplant (kein VITEST_EXTEND).
BATS-Vorlage (gelesen, kein Target): `tests/spec/website-interfaces.bats`
ist die engste Vorlage (grep-basierte API-Guards, darunter booking.ts).

## File Structure

| path | Ist | Budget |
| `tests/spec/services-calendar.bats` | 0 (neu) | n/a (kein S1-Limit) |
| `components/website/src/lib/__tests__/business-settings.test.ts` | 0 (neu) | 900 |
| `components/website/src/lib/__tests__/booking-availability.test.ts` | 0 (neu) | 900 |

S1 im Detail (B1a, wirksame Schwelle aus `gates.yaml` + Baseline-Lookup):

- `tests/spec/services-calendar.bats` Ist 0 new · Schwelle kein S1-Limit
  (`.bats` hat keinen Limit-Eintrag, Datei nicht-baselined) → Budget n/a
- `components/website/src/lib/__tests__/business-settings.test.ts` Ist 0 new
  · Schwelle 900 (`.ts`-Limit, nicht-baselined) → Budget 900
- `components/website/src/lib/__tests__/booking-availability.test.ts` Ist 0
  new · Schwelle 900 (`.ts`-Limit, nicht-baselined) → Budget 900

Alle drei Dateien sind neu anzulegen und bleiben mit deutlicher Reserve
unter ihrer wirksamen Schwelle; kein Split nötig. Keine `any`-Typen in
neuem Testcode (CQ02: Zähler nicht erhöhen). Keine Hostnamen-Literale in
Testcode oder Guards (S3: Brand über Fixture-Variable auflösen).

## Task 1: BATS Spec-Guards anlegen

Lege `tests/spec/services-calendar.bats` neu an, im Stil der Vorlage
(grep-basierte `@test`-Blöcke gegen reale Implementierungsdateien aus
p1–p3). Jeder Block prüft genau einen der sieben Fälle:

1. Gleich-Tages-Anfrage wird abgewiesen (Vortags-Vorlauf Europe/Berlin:
   Guard verweist auf die Vorlauf-Prüfung im Buchungspfad, Fehler 409/422).
2. Vortags-Anfrage bleibt zulässig (Negativ-Kontrolle zu Fall 1: Vorlauf
   exakt ein Kalendertag wird nicht abgewiesen).
3. Europe/Berlin-DST-Grenze: Guard deckt den Stundenwechsel ab (ein Fall
   im März-Wechsel, ein Fall im Oktober-Wechsel; lokale Datumsableitung,
   keine UTC-Vermischung).
4. Überlappung wird serverseitig abgewiesen: Guard prüft, dass der
   Booking-POST `claimSlot` (atomares DELETE…RETURNING auf
   `slot_whitelist`) aufruft und bei belegtem Slot 409 liefert (Vertrag aus
   intel.json `api_contracts`, heute ruft der POST `claimSlot` nie auf).
5. Puffer/Feiertag-Fall: Guard prüft, dass die Slot-Berechnung Puffer und
   Feiertage aus dem Settings-JSON berücksichtigt (Quelle: intel.json
   `site_settings`-Blob, Erweiterung wie `vacation_periods`).
6. Unauthentifizierter Zugriff auf Owner-Endpunkte wird abgewiesen
   (Guard verweist auf den `requireOwner`-Check der Owner-Routen aus p2).
7. Fremde Brand wird abgewiesen (Guard verweist auf die Brand-Scope-Prüfung
   der Owner-Endpunkte: Session-Brand ungleich Pfad-Brand führt zur
   Ablehnung).

Akzeptanz: `bats tests/spec/services-calendar.bats` meldet alle sieben
Fälle grün, sobald p1–p3 umgesetzt sind.

## Task 2: Vitest Settings-Validierung anlegen

Lege `components/website/src/lib/__tests__/business-settings.test.ts` neu
an (vitest, `describe`/`it`/`expect`). Die Suite testet die
Settings-JSON-Validierung aus p3 (Öffnungszeiten, Puffer, Feiertage im
`site_settings`-Blob):

- Gültige Öffnungszeiten (Wochentag-Intervalle, mehrere Intervalle pro Tag)
  werden akzeptiert.
- Ungültige Intervalle (Ende vor Beginn, leere Intervalle, unbekannte
  Wochentage) werden zurückgewiesen.
- Pufferwerte (Minuten vor/nach Termin, jeweils nicht-negativ, Obergrenze
  plausibel) werden validiert; negative oder absurde Werte fallen durch.
- Feiertagsliste (ISO-Datumsstrings, Duplikate, ungültige Daten) wird
  validiert; ungültige Einträge werden zurückgewiesen.
- Unbekannte JSON-Schlüssel im Settings-Blob werden strikt abgewiesen
  (kein stilles Durchwinken falscher Feldnamen).

Akzeptanz: Suite läuft grün gegen die p3-Validierung; jeder Fall nutzt
typisierte Fixtures ohne `any`.

## Task 3: Vitest Verfügbarkeit/claimSlot/Snapshot anlegen

Lege `components/website/src/lib/__tests__/booking-availability.test.ts`
neu an (vitest). Die Suite testet Vorlauf, `claimSlot` und den
Preis/Dauer-Snapshot aus p1/p3:

- Vorlauf: Gleich-Tages-Anfrage abgelehnt, Vortags-Anfrage erlaubt
  (Europe/Berlin, DST-sicher an beiden Wechsel-Wochenenden).
- `claimSlot`: erster Claim gewinnt, zweiter Claim desselben Slots
  scheitert ( Rivalität abgebildet über zwei Aufrufe gegen denselben
  `slot_whitelist`-Eintrag); Freigabe nach Storno erlaubt erneuten Claim.
- Snapshot: Preis und Dauer werden am Termin festgeschrieben;
  Katalog-Änderung danach berührt den Bestand nicht.
- Mentolder-Regression: Die bestehende Verfügbarkeits-Logik der
  Mentolder-Pfade verhält sich nach dem Shared-Timezone-Fix unverändert
  (gleiche Slots für gleiche Eingaben wie vor dem Fix; der Fix betrifft
  nur die Zeitzonen-Ableitung Europe/Berlin).

Akzeptanz: Suite läuft grün gegen p1/p3; die Regressionsfälle schlagen
bei jeder Verhaltensänderung der Bestandspfade an.

## Task 4: Rot→grün-Nachweis führen

Führe die neuen Tests zuerst gegen den Stand OHNE p1–p3-Umsetzung aus:
expected: FAIL — mindestens die Guards für Vorlauf, `claimSlot` und die
Owner-Routen sowie die Vitest-Suites müssen rot sein, weil die
Implementierung noch fehlt. Danach gegen den Stand MIT p1–p3: alles grün.
Beide Läufe mit echten Testrunner-Aufrufen:

```bash
bats tests/spec/services-calendar.bats
(cd components/website && pnpm vitest run src/lib/__tests__/business-settings.test.ts src/lib/__tests__/booking-availability.test.ts)
```

Akzeptanz: Rot-Lauf dokumentiert (Fail-Liste im Task-Log), Grün-Lauf nach
p1–p3 ohne Ausfälle. Dieser Task ist der STRUCT2-Failing-Test-Step und
bleibt vom finalen Verify-Trio des Orchestrators getrennt.

## Task 5: Test-Inventar regenerieren und mitcommitten

Nach Abschluss der Tasks 1–4 das Test-Inventar regenerieren und die
generierte Datei mitcommitten. Hinweis: Die Inventardatei
`components/website/src/data/test-inventory.json` ist KEIN Target dieses
Partials, sondern ein Regenerierungs-Nebeneffekt:

```bash
task test:inventory
git add components/website/src/data/test-inventory.json
git commit -m "test(services-calendar): inventory for new suites [T901023]"
```

Akzeptanz: `git status` zeigt keine ungenerierten Testdateien mehr an;
der CI-Inventar-Check findet alle neuen Suites im Inventar.
