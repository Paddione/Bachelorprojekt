---
title: p2-owner-pages Partial-Plan
ticket_id: T901026
domains: [plan-authoring, factory]
status: staged
---

# p2-owner-pages — Partial-Plan (T901026)

Owner-Seiten des Kundenverzeichnisses (Slug `client-directory`): Liste und Detail,
serverseitig gerendert ohne JavaScript, nach dem Muster von `owner/anfragen.astro`.

## File Structure

| Datei | Änderung |
|---|---|
| `components/website/src/pages/owner/kunden.astro` | neu: Owner-Liste aller Kunden mit Suche |
| `components/website/src/pages/owner/kunden/[id].astro` | neu: Kundendetail mit Historie und Aktionen |

Ausschließlich diese zwei Dateien werden angelegt. Kein anderes Target-File wird
angefasst. Logik-, API- und Test-Dateien gehören den Partial-Plänen p1, p3 und p4.

## Voraussetzungen (p1-Lib)

Dieser Partial setzt den gemergten p1-Stand voraus: Tabelle aus der
Clients-Migration plus `components/website/src/lib/clients.ts`. Vor
Implementierungsbeginn prüft Task 1, dass das Lib-Modul diese Exporte bereitstellt:

- `listClients(brand, query)` — brand-gefilterte Kundenliste, `query` filtert über
  Name und E-Mail (leerer Query liefert alle Kunden der Brand).
- `getClientById(brand, id)` — genau ein Kunde der Brand oder `null` (Fail-closed
  bei brandfremder ID, kein Cross-Brand-Leak über ID-Enumeration).
- `getClientAppointments(brand, id)` — Terminhistorie mit States, neueste zuerst.
- `findDuplicateCandidates(brand, id)` — Dubletten-Vorschläge zur manuellen Prüfung.
- Typen `Client`, `ClientAppointment`, `DuplicateCandidate`.

Weichen die p1-Exportnamen ab, werden in Task 2 und Task 3 ausschließlich die
Importzeilen auf die tatsächlichen p1-Namen abgebildet; die Seitenstruktur bleibt
unverändert.

## S1-Budget-Notizen

Quelle: `docs/code-quality/gates.yaml` (`.astro: 1000`), Baseline per `jq` geprüft.

- `components/website/src/pages/owner/kunden.astro` — Ist 0, nicht-baselined,
  wirksame Schwelle 1000 (Budget 1000). Zielgröße unter 250 Zeilen, damit über
  75 Prozent Reserve bleiben.
- `components/website/src/pages/owner/kunden/[id].astro` — Ist 0, nicht-baselined,
  wirksame Schwelle 1000 (Budget 1000). Zielgröße unter 350 Zeilen, damit über
  65 Prozent Reserve bleiben.

Beide Dateien bleiben damit deutlich unter 80 Prozent ihrer wirksamen Schwelle;
kein Split und keine Extraktion nötig.

Weitere Gates: keine Import-Zyklen (Seiten importieren nur aus `lib`, kein
Rück-Import), keine hardcodierten Hostnamen (S3), keine neuen `any`-Typen
(CQ02, Ist-Zählung 0 bei Limit 200).

<!-- vitest: kein neuer Test nötig, weil beide Dateien reine Astro-Seiten ohne eigene Logik sind; die Logik liegt in der p1-Lib und ist dort per Vitest abgedeckt, die Seiten werden per BATS-Spec verifiziert. -->

## Task 1 — Rot-Lauf und p1-Vertrag prüfen

Steps:

1. Prüfen, dass die p1-Lib-Exporte aus dem Abschnitt Voraussetzungen existieren:
   `node -e "import('./components/website/src/lib/clients.ts')"` ist kein
   Runner-Nachweis, daher zählt der BATS-Lauf in Schritt 2 als Failing-Test-Step.
2. Rot-Lauf der Client-Directory-Spec, Filter auf die Owner-Seiten:
   `bats tests/spec/client-directory.bats --filter "owner kunden"` —
   expected: FAIL, solange die zwei Seiten fehlen (Datei-Abhängigkeit: die Spec
   stellt der Test-Partial bereit; fehlt sie, ist der Lauf ebenfalls rot).
3. `requireOwner`- und `ownerBusiness`-Muster aus `owner/anfragen.astro` und
   `lib/owner-guard.ts` als Vorlage festhalten (Session-Guard mit Redirect auf
   die Login-URL, Brand aus der Owner-Session).

Akzeptanzkriterien:

- Der BATS-Lauf ist rot und nennt die fehlenden Owner-Kundenseiten als Ursache.
- Die p1-Exporte sind verifiziert oder die abweichenden Importnamen dokumentiert.

## Task 2 — `owner/kunden.astro` (Liste mit Suche)

Steps:

1. Frontmatter nach `anfragen.astro`-Muster: `requireOwner` mit Cookie-Header,
   Redirect auf `getLoginUrl` ohne Owner-Session, Brand via
   `ownerBusiness(session)`, Fallback auf `process.env.BRAND`.
2. Such-Query aus `Astro.url.searchParams.get('q')` lesen (GET-Formular, kein
   JavaScript), trimmen, an `listClients(brand, query)` übergeben.
3. Liste rendern: Name, E-Mail, Telefon, Link auf `/owner/kunden/[id]`;
   Leerzustand mit eigenem Listeneintrag analog „Noch keine Anfragen vorhanden."
   inklusive Hinweis bei aktiver Suche ohne Treffer.
4. Suchformular (GET, Eingabefeld `q`, Submit-Button), Sitzungszeile
   („Angemeldet als …"), Rück-Navigation nach `/owner`, Inline-Styles im
   bestehenden Owner-Stil. Keine `<script>`-Tags, keine Event-Handler.

Akzeptanzkriterien:

- Ohne Owner-Session erfolgt ein Redirect auf die Login-URL.
- Die Liste zeigt ausschließlich Kunden der eigenen Brand (strikte
  Owner-Isolation, kein brandübergreifender Query-Parameter).
- Suche filtert über Name und E-Mail; leere Suche listet alle Kunden der Brand.
- Die Seite enthält kein JavaScript.

## Task 3 — `owner/kunden/[id].astro` (Detail)

Steps:

1. Frontmatter: `requireOwner` mit Redirect wie in Task 2, `id` aus
   `Astro.params` parsen (ungültige ID führt auf 404), Kunde via
   `getClientById(brand, id)` laden; `null` führt auf 404 (Fail-closed, keine
   Unterscheidung zwischen „fremd" und „nicht vorhanden").
2. Kontaktdaten-Sektion: Name, E-Mail, Telefon, Notizen, Erstellungsdatum.
3. Terminhistorie-Sektion: Einträge aus `getClientAppointments(brand, id)` mit
   Datum, Service und State; Leerzustand mit eigenem Hinweis.
4. Dubletten-Sektion: Vorschläge aus `findDuplicateCandidates(brand, id)` zur
   manuellen Prüfung, jeder Vorschlag mit Link auf dessen Detailseite und
   Begründung (z. B. gleiche E-Mail); Leerzustand mit eigenem Hinweis.
5. Aktions-Formulare als plain POST ohne JavaScript gegen die p3-Endpunkte:
   Korrektur-Formular (`/api/owner/kunden/[id]/korrigieren`), Zusammenführen
   mit Ziel-ID (`/api/owner/kunden/[id]/zusammenfuehren`), Export
   (`/api/owner/kunden/[id]/export`), Löschen mit Bestätigungsfeld
   (`/api/owner/kunden/[id]/loeschen`). Die Formulare sind deklarativ und bleiben
   wirkungslos, bis p3 die Endpunkte liefert.
6. Sitzungszeile, Rück-Navigation nach `/owner/kunden` und `/owner`,
   Inline-Styles im bestehenden Owner-Stil. Keine `<script>`-Tags.

Akzeptanzkriterien:

- Brandfremde oder ungültige IDs ergeben 404 ohne Daten-Leak.
- Kontaktdaten, Terminhistorie mit States und Dubletten-Vorschläge sind sichtbar.
- Alle vier Aktions-Formulare posten an die p3-Routen.
- Die Seite enthält kein JavaScript.

## Task 4 — Grün-Lauf und Gate-Verifikation

Steps:

1. `bats tests/spec/client-directory.bats --filter "owner kunden"` — Lauf ist
   grün (Rot→Grün-Nachweis zu Task 1).
2. `task test:changed` — gezielte Tests für geänderte Domains.
3. `task freshness:regenerate` — generierte Artefakte aktualisieren.
4. `task freshness:check` — CI-Äquivalent inklusive S1–S4-Ratchet.
5. CQ02-Nachweis:
   `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`.
6. S1-Nachweis: `wc -l` beider neuer Dateien liegt je unter 80 Prozent des
   1000-Zeilen-Limits; `grep -n "<script" ` auf beiden Dateien liefert keine
   Treffer.

Akzeptanzkriterien:

- BATS-Filterlauf grün, alle drei Mandatory-Commands erfolgreich.
- `any`-Zählung nicht gestiegen, S1-Budgets eingehalten, kein JavaScript in den
  neuen Seiten.
