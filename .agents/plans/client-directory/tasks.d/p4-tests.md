## Partial p4-tests — Tests für T901026 (client-directory)

Scope (exklusiv): genau zwei neue Dateien, keine Implementierung:

- `tests/spec/client-directory.bats` — BATS-Guards, Stilvorlage
  `tests/spec/notify-reminders.bats` (grep-Guards mit Zeilenfolge-Assertionen,
  Test-IDs `T901026-1..5` für `scripts/build-test-inventory.sh`).
- `components/website/src/lib/__tests__/clients.test.ts` — Vitest-Suite für die
  puren Helfer aus `components/website/src/lib/clients.ts`, Stilvorlage
  `components/website/src/lib/__tests__/appointment-requests.test.ts`
  (pure Module, keine DB, keine Mocks nötig) und
  `components/website/src/lib/__tests__/owner-guard.test.ts`.

Abhängigkeit: Die Implementierungs-Partials liefern `clients.ts`, die
Owner-Routen (`pages/owner/kunden.astro`, `pages/owner/kunden/[id].astro`) und
die API-Handler (`pages/api/owner/kunden/[id]/{korrigieren,export,loeschen,
zusammenfuehren}.ts`). Dieses Partial definiert die Test-Verträge; die
Rot-Phase läuft gegen den noch nicht implementierten Stand, die Grün-Phase
nach Merge der Implementierungs-Partials. Vorgeschlagene Export-Namen aus
`clients.ts` (`normalizeClientEmail`, `buildClientHistory`,
`suggestDuplicateGroups`) sind der Vertrag mit dem Lib-Partial — bei
abweichender Benennung dort übernimmt die Test-Implementierung die dortigen
Namen, die vier Verhaltensblöcke bleiben bestehen.

### S1-Budget-Notizen

- `tests/spec/client-directory.bats` ist neu. Die Extension `.bats` steht nicht
  in `s1.limits` von `docs/code-quality/gates.yaml`, es greift daher kein
  S1-Limit. Zielgröße analog zur Stilvorlage (55 Zeilen): deutlich unter
  150 Zeilen halten.
- `components/website/src/lib/__tests__/clients.test.ts` ist neu und
  nicht-baselined (`jq`-Lookup liefert `nicht-baselined`). Wirksame Schwelle
  ist das statische `.ts`-Limit 900 aus `gates.yaml`, Ist 0, damit Budget 900.
  Zielgröße unter 250 Zeilen, also mit großer Wachstumsreserve unter dem Limit.
  Kein Split nötig.
- CQ02: Ist-Zählung `any` in `components/website/src` ist 0 (Limit 200). Beide
  neuen Dateien führen keine `any`-Typen ein; alle neuen Exporte sind typisiert.

### Task 1: BATS-Guards `tests/spec/client-directory.bats` anlegen (rot)

Datei neu anlegen mit fünf Guards im Stil der Vorlage (shebang
`#!/usr/bin/env bats`, Pfad-Konstanten per `BATS_TEST_DIRNAME`, ein
`@test`-Block pro Case mit sprechender Fehlermeldung und Exit 1):

- `T901026-1` Owner-Guard auf allen Kunden-Routen: Schleife über alle sechs
  Routen-Dateien (`pages/owner/kunden.astro`, `pages/owner/kunden/[id].astro`,
  `pages/api/owner/kunden/[id]/korrigieren.ts`, `export.ts`, `loeschen.ts`,
  `zusammenfuehren.ts`); jede Datei muss den Owner-Guard referenzieren
  (`owner-guard`-Import oder `requireOwner`/`isOwnerSession`). Fehlt die
  Referenz in einer Datei, schlägt der Case fehl (fail-closed).
- `T901026-2` E-Mail-Gruppierung: `clients.ts` gruppiert Kunden anhand der
  normalisierten E-Mail (`normalizeClientEmail` vorhanden und im
  Gruppierungs-Pfad aufgerufen; Zeilenfolge-Assertion wie in der Vorlage).
- `T901026-3` kein stiller Merge: `zusammenfuehren.ts` verlangt eine explizite
  Bestätigung (Confirm-Parameter mit Quell- und Ziel-ID) und der
  Confirm-Guard steht per Zeilennummer vor dem Merge-Aufruf; kein
  Auto-Merge-Pfad ohne diese Bestätigung.
- `T901026-4` Export-CSV-Format: `export.ts` setzt den CSV-Content-Type
  (`text/csv`) und schreibt eine Kopfzeile mit den festgelegten Spalten
  (Name, E-Mail, Verlauf-Einträge); Assertion auf Header-Konstante plus
  Content-Type.
- `T901026-5` Lösch-Steuerfristen-Hinweis: `loeschen.ts` enthält den Hinweis
  auf gesetzliche Aufbewahrungs-/Steuerfristen und blockiert oder warnt beim
  Löschen innerhalb der Frist (Assertion auf Hinweis-Textschlüssel und auf den
  Fristen-Guard vor dem Lösch-Aufruf).

Rot-Schritt (Failing-Test-Step): direkt nach dem Anlegen ausführen:

```bash
bats tests/spec/client-directory.bats
```

Solange die Implementierungs-Partials fehlen, schlagen die Guards fehl,
expected: FAIL. Nach deren Merge muss derselbe Befehl grün sein.

Akzeptanzkriterien:

- Die Datei existiert unter `tests/spec/client-directory.bats` und ist per
  `bats` ausführbar.
- Alle fünf Cases tragen die IDs `T901026-1` bis `T901026-5` im
  `@test`-Namen, damit das Test-Inventar sie erfasst.
- Jeder Case meldet bei Fehlschlag die betroffene Datei und den fehlenden
  Baustein und kehrt mit Exit 1 zurück.
- Keine Case-Logik hängt von Netzwerk, DB oder Secrets ab (reine
  Datei-Grep-Guards).

### Task 2: Vitest-Suite `clients.test.ts` anlegen (rot→grün)

Datei `components/website/src/lib/__tests__/clients.test.ts` neu anlegen.
Importiert die puren Helfer aus `../clients` (Spezifizierer mit oder ohne
`.js`-Suffix passend zu den Geschwister-Suiten wählen). Vier Blöcke:

- E-Mail-Normalisierung: `normalizeClientEmail` trimmt Whitespace, senkt auf
  Kleinschreibung und behandelt leere/fehlende Eingaben definiert (leerer
  String oder definierter Fehler, kein Crash). Fälle: gemischte Großschreibung,
  führende/folgende Leerzeichen, bereits normalisierte Adresse (Idempotenz).
- Historien-Aufbau: `buildClientHistory` führt Termin- und Anfrage-Zeilen zu
  einer chronologisch sortierten Historie zusammen; Fälle: unsortierte Eingabe
  wird sortiert, leere Eingabe ergibt leere Historie, Einträge tragen Typ,
  Zeitstempel und Referenz.
- Dubletten-Heuristik: `suggestDuplicateGroups` gruppiert nur bei exakt
  gleicher normalisierter E-Mail als Kandidaten; Fälle: gleiche Adresse mit
  anderer Schreibweise wird erkannt, ähnliche aber verschiedene Adressen
  werden nicht gruppiert, die Funktion merged nie selbst (reine
  Kandidatenliste, kein Seiteneffekt).
- Keine Gesundheitsfelder: Assertion, dass Kunden-Datensatz und
  Historien-Einträge keine gesundheitsbezogenen Schlüssel enthalten (explizite
  Negativ-Liste der verbotenen Schlüssel prüfen, nicht nur Typ-Snapshot).

Es kommen ausschließlich `example.test`-Adressen und fiktive Namen in
Fixtures vor; keine echten Personen- oder Produktivdaten. Keine `any`-Typen,
keine Mocks für DB oder Netzwerk (pure Funktionen mit Zeilen als Argumenten,
wie in der Stilvorlage).

Rot-Schritt: direkt nach dem Anlegen ausführen:

```bash
(cd components/website && pnpm vitest run src/lib/__tests__/clients.test.ts)
```

Solange `../clients` fehlt, schlägt der Lauf fehl, expected: FAIL. Nach Merge
des Lib-Partials muss derselbe Befehl grün sein.

Akzeptanzkriterien:

- Die Datei existiert unter
  `components/website/src/lib/__tests__/clients.test.ts` und läuft mit dem
  obigen Befehl.
- Alle vier Verhaltensblöcke sind als eigene `describe`-Blöcke vorhanden, mit
  Positiv- und Negativfällen (insbesondere: kein stiller Merge, keine
  Gesundheitsfelder).
- Der CQ02-Prüfbefehl meldet weiterhin 0 `any`-Verwendungen:

```bash
bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"
```

### Task 3: Test-Inventar und Verify

Steps in dieser Reihenfolge:

```bash
bats tests/spec/client-directory.bats
(cd components/website && pnpm vitest run src/lib/__tests__/clients.test.ts)
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

Erläuterung: erst beide neuen Suiten gezielt grün fahren, dann
`task test:inventory` (neue BATS-IDs erfassen;
`components/website/src/data/test-inventory.json` wird mitcommittet, sonst
failt CI), danach die drei mandatory Verify-Commands `task test:changed`,
`task freshness:regenerate`, `task freshness:check`. Der Orchestrator behält
diese drei Commands im finalen Verify-Task des assemblierten Plans.

Akzeptanzkriterien:

- Beide gezielten Testläufe sind grün.
- `test-inventory.json` enthält die IDs `T901026-1` bis `T901026-5`.
- `task freshness:check` (S1–S4-Ratchet plus Baseline-Assertion) ist grün;
  `docs/code-quality/baseline.json` ist unverändert (keine neuen Keys).
- Ausschließlich die zwei Scope-Dateien plus das regenerierte
  `test-inventory.json` sind geändert.
