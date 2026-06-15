---
title: Grilling-Sessions an Tickets senden — skill-weite Fähigkeit
status: draft
ticket_id: T000739
plan_ref: docs/superpowers/plans/2026-06-15-grilling-to-ticket.md
domains: [db, website, ops]
---

# Grilling → Ticket: skill-weite Fähigkeit

## Problem / Intent

Eine "Grilling-Session" (strukturiertes Frage-Antwort-Interview — Coaching-Fragebogen,
Deep-Grilling vor dem Planen, Klärungsrunde, Incident-Befragung) erzeugt heute Wissen,
das nur **punktuell** an Tickets landet:

- `dev-flow-plan` (Schritt −3) erzeugt aus einem Deep-Grilling ein **neues** Ticket
  (Anforderungen/Assets in die `description`).
- `feature-intake` (GekkoMode / Planungsbüro-Klärung) schreibt Grilling-Antworten als
  **Ticket-Kommentar**.

Der gerade in Ausführung befindliche **T000737** baut den *kanonischen Speicher*:
eine `grilling_answers` **JSONB**-Spalte auf `tickets.tickets`, befüllt über das
`GrillingAnswersPanel` (Svelte) per `PATCH /api/admin/tickets/{id}`, Fragebogen
`coaching-sessions-v1` (6 Sektionen, 23 Fragen), Form `{ qid: { questionId: answer } }`.

**Ziel:** Die Fähigkeit, eine Grilling-Session **an ein bestehendes Ticket zu senden**,
für **alle** Skills verfügbar machen — anschlussfähig an genau diese `grilling_answers`-Spalte,
sodass per Skill eingereichte Grillings später im Ticket-UI-Panel (T000737) erscheinen.

## Gewählter Ansatz (User-Entscheidung)

**Geteilte Fähigkeit + gezielte Verdrahtung** (DRY, kein Block in jedem SKILL.md):

1. **EIN wiederverwendbarer Helper** — neues `ticket.sh grill` Subcommand.
2. **EINE geteilte Referenz** — `.claude/skills/references/grilling-to-ticket.md`.
3. **Pointer im Schicht-Kontrakt** — kurzer Cross-Cutting-Abschnitt in
   `.claude/skills/OVERVIEW.md`, den jeder Skill-Autor sieht.
4. **Konkrete Verdrahtung** dort, wo Grilling wirklich passiert:
   `dev-flow-plan`, `feature-intake`, `dev-flow-execute`, `operations-management`,
   `dev-flow-batch`.

## Transport / Mechanismus (technisch geklärt)

- Die PATCH-API ist **admin-SSO-gated** (`isAdmin(session)`) → aus einem Terminal-Skill
  **nicht** ohne Session-Cookie bedienbar. Der etablierte headless-Weg, wie Skills heute
  Tickets schreiben, ist `kubectl exec … psql` über `ticket.sh` (`_pgpod`/`_exec_sql`).
- Daher: `ticket.sh grill` schreibt **direkt** in die `grilling_answers` JSONB-Spalte via psql.
- **Idempotenter Selbstschutz:** der Helper führt zuerst
  `ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB` aus →
  funktioniert **unabhängig vom Merge-Zeitpunkt von T000737**, bleibt aber form-identisch
  (gleiche Spalte, gleiche `{ qid: { questionId: answer } }`-Struktur) → forward-kompatibel
  mit dem Panel.

## `ticket.sh grill` — Schnittstelle

```
ticket.sh grill --id <external_id>
                [--questionnaire <qid>]      # default: coaching-sessions-v1
                ( --json '<json>'            # {"q1":"...","q2":"..."}  (Antworten dieses Fragebogens)
                | --answers-file <pfad.json> # gleiche Form, aus Datei
                | --answer <qid>=<text> ...  # wiederholbar, ad-hoc Q/A
                )
                [--no-comment]               # Timeline-Kommentar unterdrücken
                [--brand <mentolder|korczewski>]
```

**Semantik:**
- **Per-Frage-Merge** (akkumulierend, wie das Auto-Save des Panels): bestehende Antworten
  bleiben erhalten, gleiche `questionId` wird überschrieben. SQL-Kern:
  ```sql
  UPDATE tickets.tickets
     SET grilling_answers =
         COALESCE(grilling_answers, '{}'::jsonb)
         || jsonb_build_object(
              :'qid',
              COALESCE(grilling_answers -> :'qid', '{}'::jsonb) || :'answers'::jsonb
            )
   WHERE external_id = :'ext_id';
  ```
- **Universelle Sichtbarkeit:** zusätzlich (sofern nicht `--no-comment`) ein
  Timeline-Kommentar (`ticket.ticket_comments`, author `grilling`) mit einer lesbaren
  Q/A-Zusammenfassung — so ist die Session **immer** im Ticket sichtbar, auch wenn das Panel
  einen ad-hoc-Fragebogen (noch) nicht rendern kann (siehe Limitation).
- **Validierung vor `_pgpod`** (wie FA-SF-35/50): fehlt `--id` oder eine Antwort-Quelle →
  deterministischer Exit 2 ohne Cluster-Zugriff.
- Exit 1, wenn `external_id` kein Ticket trifft.

## Architektur / File Map

| Aktion | Datei | Verantwortung |
|--------|-------|---------------|
| Create | `scripts/lib/ticket-grill.sh` | `cmd_grill()` — Arg-Parse, Antwort-Quellen→JSON, idempotentes ADD COLUMN, per-Frage-Merge-UPDATE, optionaler Kommentar |
| Modify | `scripts/ticket.sh` | **ZEILENNEUTRAL** (Baseline 793, Budget 0): `source .../lib/ticket-grill.sh` + Dispatch `grill) cmd_grill "$@" ;;` + `grill` in der `Commands:`-Zeile; die +2 Netto-Zeilen durch 2 Collapses anderswo ausgleichen (Muster wie `ticket-links.sh`-Source @165) |
| Create | `.claude/skills/references/grilling-to-ticket.md` | Kanonische How-to: wann grillen, `ticket.sh grill`-Aufruf, strukturiert vs. ad-hoc, Forward-Compat mit T000737-Panel, Limitation |
| Modify | `.claude/skills/OVERVIEW.md` | Cross-Cutting-Abschnitt "Grilling → Ticket" mit Verweis auf die Referenz |
| Modify | `.claude/skills/dev-flow-plan/SKILL.md` | Schritt −3: nach Grilling-Ticket-Erstellung optional `ticket.sh grill` zum Persistieren der strukturierten Q/A |
| Modify | `.claude/skills/feature-intake/SKILL.md` | GekkoMode/Klärung: zusätzlich zur Kommentar-Ablage `ticket.sh grill` (strukturiert) |
| Modify | `.claude/skills/dev-flow-execute/SKILL.md` | Bei Blockade/Ambiguität mitten in der Umsetzung: Nutzer grillen → an Ticket anhängen |
| Modify | `.claude/skills/operations-management/SKILL.md` | Ticket-Triage/Incident-Befragung → an Ticket anhängen |
| Modify | `.claude/skills/dev-flow-batch/SKILL.md` | Batch-Klärung über mehrere Tickets |
| Create/Modify | `tests/unit/*` (BATS) | Offline-sichere Tests für `cmd_grill`: Arg-Validierung (Exit 2 ohne Cluster), JSON-Aufbau aus `--answer`/`--json`, Merge-SQL-Form |

## Tests

- BATS-Unit-Tests für `cmd_grill` **offline-sicher** (Validierung VOR `_pgpod`, wie die
  bestehenden ticket.sh-Validierungstests): fehlende `--id`/Antwort-Quelle → Exit 2;
  `--answer q1=foo --answer q2=bar` ergibt korrektes `{"q1":"foo","q2":"bar"}`;
  Merge-SQL enthält `ADD COLUMN IF NOT EXISTS` + per-Frage-`||`-Merge.
- Test-Inventar nach Test-Änderungen regenerieren (`task test:inventory`) und committen.
- In `task test:all` (test:factory / unit) einhängen, falls neue bats-Datei.

## Quality-Gates (Vorab-Notiz für den Plan)

- **S1:** `scripts/ticket.sh` Baseline **793, Budget 0** → Änderungen **müssen zeilenneutral**
  sein (Lib-Extraktion + 2 Collapses). `scripts/lib/ticket-grill.sh` neu → unter Limit halten
  (~80–120 Zeilen). SKILL.md/Referenz-Edits: knapp halten, Baselines je Datei prüfen.
- **S2:** `ticket-grill.sh` ist ein eigenständiges Bash-Lib (keine Import-Zyklen).
- **S3:** **keine** Brand-Domain-Literale im Code (Brand kommt via `--brand`/`BRAND`-Env).
- **S4:** neue Skripte/Tests referenzieren (Dispatch + test:all-Einhängung), nicht verwaisen.

## Forward-Compat & bewusste Limitation

- Skill-Grillings mit `coaching-sessions-v1` rendern nach T000737-Merge **direkt** im
  `GrillingAnswersPanel`.
- **Ad-hoc-Fragebögen** (nicht in `website/src/lib/tickets/grilling.ts` registriert) werden
  in `grilling_answers` **gespeichert**, aber vom Panel (das nur bekannte `QUESTIONNAIRES`
  rendert) **nicht** angezeigt — daher der **Timeline-Kommentar** als universelle Sichtbarkeit.
  Späteres Enhancement (eigenes Ticket): generischer Panel-Renderer für unbekannte
  Fragebögen. **Kein Blocker** für diese Arbeit.

## Out of Scope

- Änderungen am T000737-Panel/-API (läuft parallel in `feature/ticket-grilling-qa-panel`).
- Ein generischer Panel-Renderer für ad-hoc-Fragebögen (Folge-Ticket).
- Brand-Fan-out der DB-Migration (die Spalte legt T000737 an; `grill` selbst ist idempotent).
