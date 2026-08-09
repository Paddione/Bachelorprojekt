---
ticket_id: T002807
plan_ref: null
status: active
date: 2026-08-09
---

# plan-lint: W3/B1a/B1b duerfen nur Tabellen-/Listeneintraege als Dateiliste lesen, keine Prosa

**Ticket:** T002807
**Datum:** 2026-08-09
**Domains:** test

## Problem

`scripts/plan-lint.sh` bestimmt, welche Dateien "im Plan gelistet" sind, indem es
**jeden Backtick-Pfad-Token mit Quellcode-Endung** aus einem Textbereich extrahiert —
nicht nur Tabellenzeilen oder Listenpunkte. Zwei Regeln sind betroffen:

- **W3** (Zeile 399-436): extrahiert aus `FS_SECTION` (dem gesamten Text zwischen
  `## File Structure` und der naechsten `##`-Ueberschrift) jeden Backtick-Pfad und
  verlangt fuer jeden eine Task-Referenz.
- **B1a/B1b** (Zeile 344-383): extrahiert aus `PLAN_PROSE` (dem **gesamten Dokument**,
  Codefences entfernt) jeden Backtick-Pfad mit Quellcode-Endung und prueft dessen
  Restbudget.

Beide Regeln unterscheiden nicht zwischen einem **strukturellen Eintrag** (Tabellenzeile,
Listenpunkt — "diese Datei ist Teil des Plans") und einer **Prosa-Erwaehnung**
("diese Datei dient hier nur als Beleg/Beispiel"). Ein Satz wie

    Positiv-Kontrolle: `scripts/agent-lock.sh` gibt unter demselben Aufruf 265 zurueck,
    der Messpfad funktioniert also.

wird dadurch identisch behandelt wie eine echte Tabellenzeile `| \`scripts/agent-lock.sh\` | ... |`.

Verifiziert am 2026-08-09 mit zwei Minimal-Plaenen (siehe Ticket-Historie):

- W3 meldete `scripts/agent-lock.sh` als "listed in File Structure but no task
  references it", obwohl die Datei nur in einem Fliesstext-Satz stand.
- B1a/B1b meldete fuer `website/src/components/inbox/InboxApp.svelte` (eine reale,
  gebaselinete Datei mit Restbudget 0), erwaehnt nur als Fliesstext-Beleg, eine
  `B1b: residual budget 0 <= 0`-Warnung. Traeg eine Prosa-Erwaehnung zufaellig das
  Label-Muster `` `path` ... Budget N `` (Zeile 364), waere dies sogar ein **B1a
  HARD FAIL** (Exit 1) — nicht nur eine Warnung.

**Folge:** Autoren lernen, konkrete Datei-Belege in Prosa zu **vermeiden**, um die
Warnung loszuwerden — das Gegenteil der im Repo geforderten "konkrete, nachpruefbare
Angaben" (vgl. "leere Antwort ist kein Urteil"-Konvention, die genau solche Belege
verlangt).

## Ursache

Beide Regeln extrahieren Pfad-Tokens per `grep -oE` ueber den **gesamten** Text ihres
Scans (FS_SECTION bzw. PLAN_PROSE), ohne nach Zeilenform zu unterscheiden. Jede Zeile
mit einem Backtick-Pfad zaehlt gleich — ob Tabellenzeile, Listenpunkt oder freier Satz.

## Entscheidung

Beide Regeln werden auf denselben, neuen Filter umgestellt: ein Pfad-Token zaehlt nur,
wenn er auf einer **strukturellen Zeile** steht — einer Tabellenzeile (beginnt nach
optionalem Leerraum mit `|`) oder einem Listenpunkt (beginnt nach optionalem Leerraum
mit `-` oder `*`, ggf. gefolgt von `**Modify/Create/Delete:**`-Markup). Eine freie
Prosa-Zeile (kein `|`/`-`/`*` am Zeilenanfang) liefert keine Kandidaten mehr — auch
wenn sie Backtick-Pfade enthaelt.

Begruendung fuer den gemeinsamen Fix (statt nur W3): beide Regeln haben denselben
Root-Cause (Zeilenform wird nicht geprueft), und B1a/B1b ist die schaerfere Auspraegung
(potenzieller Hard-Fail). Ein Fix, der nur W3 behebt, liesse den B1a/B1b-Fall offen und
das Ticket muesste ein zweites Mal aufgemacht werden fuer denselben Defekt.

**Umfang bewusst begrenzt:** kein neues Markup-Idiom (z.B. ein
`<!-- kein Aenderungsziel -->`-Kommentar) — die Zeilenform-Pruefung loest das Problem an
der Wurzel, ohne dass Autoren ein neues Muster lernen muessen. Bestehende Plan-Formate
(Bullet-Liste `- Modify: \`path\``, Tabelle `| \`path\` | ... |`) bleiben unveraendert
funktionsfaehig — beide Formen sind bereits "strukturelle Zeilen" nach der neuen
Definition.

## Implementierung (Skizze)

Eine neue Hilfsfunktion `_structural_file_tokens <text>` in `scripts/plan-lint.sh`:

```bash
_structural_file_tokens() {
  # Nur Zeilen, die wie eine Tabellenzeile oder ein Listenpunkt aussehen, liefern
  # Pfad-Kandidaten — eine freie Prosa-Zeile mit demselben Backtick-Pfad liefert keine.
  grep -E '^[[:space:]]*([|]|[-*])' <<<"$1" \
    | grep -oE '`[A-Za-z0-9_./-]+\.(sh|bash|ts|tsx|js|jsx|mjs|mts|cjs|py|svelte|astro|java|php|css)`' \
    | tr -d '`' | sort -u
}
```

- **W3** (Zeile 436): `done < <(_structural_file_tokens "$FS_SECTION")` statt der
  direkten `grep -oE ... <<<"$FS_SECTION"`-Pipeline.
- **B1a/B1b** (Zeile 383): `done < <(_structural_file_tokens "$PLAN_PROSE")` statt der
  direkten `grep -oE ... <<<"$PLAN_PROSE"`-Pipeline. Die BUDGET-Wert-Extraktion selbst
  (Zeilen 360-366, "claimed") bleibt unveraendert — sie sucht bereits gezielt nach der
  Tabellenzeilen- bzw. Label-Form und ist nicht die Quelle des Bugs; nur die Liste der
  zu pruefenden DATEIEN (welche Pfade ueberhaupt einen Budget-Check durchlaufen) wird
  eingeschraenkt.

## Tests

- Bereits committiert (RED, vor diesem Plan geschrieben):
  `tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats` — Positiv-Anker (echter
  Tabelleneintrag `scripts/example.sh` loest W3 weiterhin aus) + Negativ-Aussage
  (Prosa-Erwaehnung von `scripts/agent-lock.sh` loest NICHTS aus).
- Neu: ein analoger Test fuer B1b in `tests/spec/dev-flow-plan/` mit derselben
  Positiv-/Negativ-Struktur (echte Tabellenzeile mit Restbudget <=0 loest B1b aus;
  dieselbe Datei nur als Prosa-Beleg ausserhalb der Tabelle loest nichts aus).
- Regressionslauf der bestehenden Fixtures in `tests/unit/plan-lint.bats` und
  `tests/unit/fixtures/plan-lint/*` — alle nutzen ausschliesslich Tabellen- oder
  Bullet-Form fuer File-Structure-Eintraege (verifiziert per Durchsicht am 2026-08-09),
  bleiben also unveraendert gruen.

## Out of Scope

- Kein neues Markup-Idiom fuer "expliziter Nicht-Aenderungsziel-Hinweis".
- Keine Aenderung an der FS_SECTION-Grenzziehung (`## File Structure` bis naechste
  `##`) — nur an der Pfad-Extraktion INNERHALB des Scans.
- Keine Aenderung an der Budget-Werte-Extraktion (Tabellenzeilen-Regex / Label-Regex),
  nur an der Liste der ueberhaupt gepruueften Dateien.
