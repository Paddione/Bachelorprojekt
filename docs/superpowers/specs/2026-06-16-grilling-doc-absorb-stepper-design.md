---
title: "Grilling-Doc-Absorption + Frage-für-Frage-Stepper + Dismiss"
date: 2026-06-16
status: draft
domains: [website]
ticket_id: T000893
plan_ref: null
---

# Grilling-Doc-Absorption, Frage-für-Frage-Stepper & Dismiss

## Problem / Ziel

Tickets können heute strukturierte Grilling-Antworten halten (`grilling_answers` JSONB,
gefüttert via `scripts/ticket.sh grill`), aber:

1. Es gibt keinen Weg, ein bestehendes **Grilling-Dokument** (Fragen + ggf. Teil-Antworten)
   in ein Ticket zu **absorbieren** — Fragetexte sind hartcodiert (`coaching-sessions-v1`).
2. Das `GrillingAnswersPanel` zeigt **alle** Fragen gleichzeitig — es fehlt ein
   **Frage-für-Frage**-Modus.
3. Eine einzelne Frage lässt sich nicht **verwerfen (dismiss)**.

Dieses Feature schließt alle drei Lücken: ticket-eigene (absorbierte) Fragebögen, ein
sequentieller Stepper im Ticket-Detail und persistentes Verwerfen einzelner Fragen.

## Geklärte Entscheidungen

- **Doc-Semantik = gemischt:** Ein Grilling-Doc enthält Fragen *und* ggf. Teil-Antworten.
  Beim Import werden Fragen **aufgeteilt**: beantwortete → Antwort wird ins Ticket geschrieben
  und gilt damit als beantwortet; unbeantwortete → kommen in die Frage-für-Frage-Schleife.
- **Abfrage-Ort = Admin-Cockpit (Ticket-Detail):** Neuer Stepper neben dem bestehenden Panel,
  nicht als Ersatz.
- **Dismiss = persistent:** In der DB markiert; verworfene Fragen erscheinen nicht wieder
  und zählen nicht als „offen".
- **Format-Toleranz (leeway):** Der Parser ist bewusst vergebend — kein starres Schema.

## Architektur-Überblick

```
Grilling-Doc (Markdown, tolerant)
  │  scripts/ticket.sh grill --id <ext-id> --grilling-doc <pfad>
  ▼
parseGrillingDoc()  ──►  { questionnaireId, title, questions:[{id,prompt,section?,answer?}] }
  │  split: answered vs. unanswered
  ▼
DB tickets.tickets
  ├── grilling_answers JSONB   (bestehend)  { qn: { qId: antwort } }     ← beantwortete
  └── grilling_meta   JSONB    (NEU)        { qn: { title, questions:[…], dismissed:[…] } }
                                              ↑ Definitionen        ↑ verworfen
  ▼
[id].astro liest grillingAnswers + grillingMeta
  ├── GrillingAnswersPanel.svelte  (bestehend: alle Fragen)
  └── GrillingStepper.svelte       (NEU: eine Frage pro Screen, Verwerfen)
        │  Antwort/ Dismiss
        ▼
      PATCH /api/admin/tickets/[id]  { grillingAnswers?, grillingMeta? }
```

## Datenmodell

Eine **neue** JSONB-Spalte `grilling_meta` auf `tickets.tickets`, idempotent angelegt
(gleiches `ADD COLUMN IF NOT EXISTS`-Muster wie `grilling_answers` in `tickets-db.ts`):

```jsonc
grilling_meta = {
  "<fragebogen-id>": {
    "title": "Coaching Follow-up",          // optional, aus Doc-Frontmatter
    "questions": [                           // absorbierte Definitionen
      { "id": "q1", "prompt": "Wie oft …?", "section": "optional" },
      …
    ],
    "dismissed": ["q3", "q7"]                // persistent verworfene Frage-IDs
  }
}
```

- `grilling_answers` (bestehend) bleibt die alleinige Quelle der **Antworten**;
  „beantwortet" = nicht-leerer Wert in `grilling_answers[qn][qId]` (kein separates Flag).
- `grilling_meta[qn].questions` liefert Fragetexte für **absorbierte** Fragebögen.
  Für `coaching-sessions-v1` bleibt die hartcodierte Registry (`grilling.ts`) die Quelle;
  `grilling_meta` ergänzt/überschreibt nicht, sondern wird als zusätzliche Quelle gemischt.
- `dismissed` funktioniert **uniform** für hartcodierte *und* absorbierte Fragebögen.

**Warum eine kombinierte `grilling_meta`-Spalte statt zweier Spalten:** minimiert
Schema-Churn und die S4/S1-Gate-Fläche; Definitionen + Dismiss-Status gehören beide zum
„Meta"-Zustand eines Fragebogens und werden gemeinsam gelesen/geschrieben.

## Grilling-Doc-Format (tolerant)

**Kanonische (empfohlene) Form:**

```markdown
---
questionnaire: gekko-coaching-followup
title: Coaching Follow-up
---

## Wie oft willst du dich treffen?
Antwort: Alle zwei Wochen.

## Welche Themen sind dir am wichtigsten?

## Bevorzugst du Video oder Präsenz? {#format-pref}
Antwort: Video.
```

**Toleranz-Regeln (leeway) — der Parser akzeptiert Varianten:**

- **Frage-Marker:** `##`/`###`-Überschriften, nummerierte Listen (`1.`, `1)`, `q1.`),
  oder fettgedruckte Zeilen, die mit `?` enden (`**… ?**`). Erkannt wird die jeweils
  konsistent im Dokument verwendete Konvention; gemischte Marker sind erlaubt.
- **Frage-ID:** explizit via `{#id}`-Suffix oder führendem `qN:`/`qN.`-Token; sonst
  auto-vergeben `q1..qN` in Dokumentreihenfolge.
- **Antwort-Marker:** `Antwort:` / `A:` (case-insensitive), Blockquote `> …`, eingerückter
  Block, oder der erste Folge-Absatz nach der Frage. Mehrzeilige Antworten werden
  zusammengeführt.
- **Leer/Platzhalter = unbeantwortet:** leere, reine Whitespace- oder Platzhalter-Werte
  (`—`, `-`, `tbd`, `(offen)`, `n/a`) werden als *keine Antwort* gewertet.
- **Frontmatter optional:** fehlt `questionnaire`, wird die id aus dem Dateinamen abgeleitet
  (`<basename>`), `title` defaultet auf den Dateinamen.

Ziel der Toleranz: ein von Hand oder von Gekko/Agent geschriebenes Doc soll „einfach
funktionieren", ohne dass der Autor ein exaktes Schema treffen muss.

## Import-Verhalten (Split)

`parseGrillingDoc(content)` → strukturierte Fragenliste. `cmd_grill` mit `--grilling-doc`:

1. **Definitionen schreiben:** alle Fragen (id, prompt, section) → `grilling_meta[qn].questions`
   (idempotent gemergt; gleiche id wird aktualisiert).
2. **Split nach Antwort-Vorhandensein:**
   - **beantwortet** → Antwort → `grilling_answers[qn][qId]` (idempotenter Merge wie heute;
     gilt fortan als beantwortet, erscheint **nicht** im offenen Stepper-Queue).
   - **unbeantwortet** → nur Definition; landet im offenen Stepper-Queue.
3. **Timeline-Kommentar** (bestehende Mechanik, via `--no-comment` abschaltbar):
   Zusammenfassung „N Fragen absorbiert (M beantwortet, K offen)".

`--grilling-doc` ist eine zusätzliche Antwort-Quelle neben den bestehenden
`--json` / `--answers-file` / `--answer`; die Argument-Validierung (genau eine Quelle)
wird entsprechend erweitert.

## UI: GrillingStepper.svelte (neu)

Im Ticket-Detail (`[id].astro`) neben dem bestehenden `GrillingAnswersPanel`:

- **Modus-Toggle:** „Schritt-für-Schritt ⇄ Alle anzeigen".
- **Ein-Frage-Screen:** Prompt, Antwort-`<textarea>` mit Auto-Save (800ms Debounce, gleiche
  PATCH-Mechanik wie heute), `Zurück` / `Weiter`, **`Verwerfen`**.
- **Queue-Reihenfolge:** offene (unbeantwortete, nicht-verworfene) Fragen zuerst; bereits
  beantwortete/verworfene über „Alle anzeigen" bzw. Navigation erreichbar.
- **Zähler:** „Frage 3/23 · 5 beantwortet · 2 verworfen".
- **Verwerfen** → PATCH ergänzt `grilling_meta[qn].dismissed`; Frage verlässt den offenen
  Queue. Wiederholbares Un-dismiss optional über „Alle anzeigen" (YAGNI v1: nur dismiss,
  Rücknahme über das volle Panel durch erneutes Beantworten).

**Fragebogen-Quelle für den Stepper:** Fragenliste = hartcodierte Registry (`grilling.ts`)
**∪** `grilling_meta[qn].questions` (absorbierte). Status pro Frage:
`answered` (nicht-leer in answers) | `dismissed` (in meta.dismissed) | `open` (sonst).

## Pure Logik in grilling.ts

Reine, DB-freie, testbare Funktionen (kein Import-Zyklus, S2-konform):

- `parseGrillingDoc(content: string): { questionnaireId, title, questions: ParsedQuestion[] }`
- `splitAnswered(questions): { answered, unanswered }`
- `resolveQuestions(qnId, registry, meta): Question[]` — Registry ∪ absorbierte Defs
- `questionStatus(qId, answers, meta): 'answered' | 'dismissed' | 'open'`
- `grillingProgress(qnId, answers, meta): { total, answered, dismissed, open }`

Die Svelte-Komponenten bleiben dünn (S1) und konsumieren diese Funktionen.

## API-Änderungen

- `PATCH /api/admin/tickets/[id]`: Whitelist um **`grillingMeta`** erweitern (für Dismiss
  und ggf. UI-seitige Definitions-Updates) — analog zur bestehenden `grillingAnswers`-Zeile.
- Lesepfad: `admin.ts` SELECT um `t.grilling_meta AS "grillingMeta"` ergänzen;
  `TicketDetail`-Type um `grillingMeta: GrillingMeta | null`.
- `tickets-db.ts`: `ADD COLUMN IF NOT EXISTS grilling_meta JSONB`.

## Komponenten-Grenzen (Isolation)

| Einheit | Zweck | Abhängigkeiten |
|---|---|---|
| `grilling.ts` (erweitert) | Parser + Merge + Status (pure) | keine (DB-frei) |
| `ticket-grill.sh` (erweitert) | CLI-Absorb `--grilling-doc` | psql, `grilling.ts`-Format-Kontrakt |
| `GrillingStepper.svelte` (neu) | Ein-Frage-Modus + Dismiss | `grilling.ts`, PATCH-API |
| PATCH-API + `admin.ts` | `grillingMeta` lesen/schreiben | DB |

## Tests

- **bats** (`tests/unit/ticket-grill.bats` erweitern): `--grilling-doc` Arg-Validierung,
  Parser-Toleranz (Marker-Varianten, Platzhalter=unbeantwortet), Split-Korrektheit,
  Merge-SQL für `grilling_meta`.
- **Vitest** (neu, `grilling.ts`): `parseGrillingDoc` (Format-Varianten), `splitAnswered`,
  `questionStatus`, `grillingProgress`, `resolveQuestions` (Registry ∪ absorbiert).
- **Vitest/Komponente** (`GrillingStepper`): Navigation, Auto-Save-Payload, Dismiss-PATCH,
  Queue-Reihenfolge (offen zuerst, verworfene ausgeblendet).
- Nach Test-Änderungen: `task test:inventory` regenerieren + committen.

## Nicht-Ziele (YAGNI v1)

- UI-Upload eines Docs im Browser (Absorb läuft CLI-first).
- Un-dismiss als dedizierter Button (Rücknahme über „Alle anzeigen" + erneutes Beantworten).
- Sektionsbasierte Navigation im Stepper (flacher Queue genügt; `section` nur als Label).
- Versionierung absorbierter Fragebögen.

## Risiken / Gotchas

- **S1-Ratchet auf `scripts/ticket.sh`:** Absorb-Logik in `scripts/lib/ticket-grill.sh`
  (eigene lib) halten, nicht in `ticket.sh` selbst — Baseline-Budget dort ist eng.
- **Parser-Toleranz vs. Determinismus:** Toleranz darf nicht zu stillem Fehl-Parsen führen;
  der Timeline-Kommentar zeigt „N absorbiert (M/K)" als Sichtprüfung für den Importeur.
- **Keine Brand-Domain-Literale** in Code-Snippets (S3); Helper als pure Module (S2).
