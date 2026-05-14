---
title: Triadisches KI-Coaching — Session-Wizard
status: draft
created: 2026-05-14
domains: [website, db]
related_pr: null
---

# Triadisches KI-Coaching — Session-Wizard Spec

## Zweck

Gekko (Coach) soll das "Triadische KI-Coaching"-Verfahren (10 Mega-Prompts, 4 Phasen) direkt auf der Plattform durchführen können. Ein geführter 10-Schritt-Wizard im Admin-Bereich leitet durch die Phasen, generiert pro Schritt einen KI-Vorschlag via Anthropic API, und speichert ein vollständiges Sitzungsprotokoll. Zunächst admin-only; Klienten-Ansicht ist als späteres Feature vorgesehen.

## Quelle

Basis ist das Dokument `uploads/coaching-mit-ki.PDF` ("Triadisches KI-Coaching", Geißler). Die 10 Mega-Prompts sind in 4 Phasen gegliedert:

| Phase | Schritte | Themen |
|---|---|---|
| 1 — Problem & Ziel | 1–3 | Erstanamnese, Schlüsselaffekt, Zielformulierung |
| 2 — Analyse | 4–6 | Teufelskreislauf, Ressourcenanalyse, Komplementärkräfte |
| 3 — Lösung | 7–8 | Lösungsentwicklung/Bildarbeit, Erfolgsimagination |
| 4 — Umsetzung | 9–10 | Goldstücks-Aktivität, Transfersicherung |

## Nicht-Ziele

- Kein direkter Klienten-Zugang in dieser Phase — alles läuft durch den Coach.
- Keine Echtzeit-Synchronisation Coach ↔ Klient.
- Keine automatische Veröffentlichung von KI-Antworten in andere Surfaces (Brett, Fragebogen etc.) — das bleibt dem bestehenden Publish-Pfad vorbehalten.
- Kein Ersatz für die bestehende Meetings/Besprechungs-Infrastruktur.

## Datenmodell

Zwei neue Tabellen im `coaching`-Schema:

### `coaching.sessions`

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
brand         text NOT NULL                    -- 'mentolder' | 'korczewski'
client_id     uuid REFERENCES customers(id)     -- NULL = Vorbereitungsrunde
mode          text NOT NULL DEFAULT 'live'     -- 'live' | 'prep'
title         text NOT NULL                    -- z.B. "Session Max M. – 14.05."
status        text NOT NULL DEFAULT 'active'   -- 'active' | 'completed' | 'abandoned'
created_by    text NOT NULL                    -- Keycloak-Username
created_at    timestamptz NOT NULL DEFAULT now()
completed_at  timestamptz
```

### `coaching.session_steps`

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
session_id    uuid NOT NULL REFERENCES coaching.sessions(id) ON DELETE CASCADE
step_number   int NOT NULL                     -- 1–10 (0 = Abschlussbericht)
step_name     text NOT NULL                    -- "Erstanamnese", "Schlüsselaffekt", …
phase         text NOT NULL                    -- 'problem_ziel' | 'analyse' | 'loesung' | 'umsetzung'
coach_inputs  jsonb NOT NULL DEFAULT '{}'      -- Freitextfelder des Coaches
ai_prompt     text                             -- generierter Prompt (Transparenz)
ai_response   text                             -- KI-Antwort
coach_notes   text                             -- Notiz des Coaches neben KI-Antwort
status        text NOT NULL DEFAULT 'pending'  -- 'pending' | 'generated' | 'accepted' | 'skipped'
generated_at  timestamptz
UNIQUE (session_id, step_number)
```

`step_number = 0` reserviert für den automatisch generierten Abschlussbericht.

## Architektur

```
/admin/coaching/sessions           ← Liste aller Sessions
/admin/coaching/sessions/new       ← Neue Session anlegen (Klient + Titel)
/admin/coaching/sessions/[id]      ← Wizard (SessionWizard.svelte, client:load)

API:
POST   /api/admin/coaching/sessions
GET    /api/admin/coaching/sessions/[id]
PATCH  /api/admin/coaching/sessions/[id]/steps/[n]
POST   /api/admin/coaching/sessions/[id]/steps/[n]/generate
POST   /api/admin/coaching/sessions/[id]/complete

Lib:
website/src/lib/coaching-session-db.ts      ← DB-Funktionen
website/src/lib/coaching-session-prompts.ts ← 10 Schritt-Prompts
```

## UI-Komponente: SessionWizard

Svelte 5 Komponente unter `website/src/components/admin/coaching/SessionWizard.svelte`.

### Fortschrittsbalken

10 Segmente, nach Phase eingefärbt:
- Blau: Schritte 1–3 (Problem & Ziel)
- Orange: Schritte 4–6 (Analyse)
- Grün: Schritte 7–8 (Lösung)
- Lila: Schritte 9–10 (Umsetzung)

Abgeschlossene Schritte (status = `accepted` | `skipped`) zeigen ein Häkchen. Aktueller Schritt ist hervorgehoben.

### Schritt-Zustandsmaschine

```
pending → [KI befragen] → generated → [Akzeptieren] → accepted (→ nächster Schritt)
                                    ↘ [Verwerfen & neu] → pending
```

Der Coach kann außerdem jeden Schritt überspringen (`skipped`) — z.B. wenn der Klient spontan ein Thema abschließt.

### Pro Schritt sichtbar

1. Schritttitel + Phasenbezeichnung
2. Eingabefelder (schritt-spezifisch, aus `STEP_DEFINITIONS`)
3. Button „KI befragen →" (disabled solange Pflichtfelder leer)
4. KI-Antwort-Box (erscheint nach Generierung, readonly)
5. Notizfeld des Coaches (immer editierbar)
6. Aktions-Buttons: „← Zurück" | „Verwerfen & neu" | „Akzeptieren →"

### Session-Abschluss

Nach Schritt 10 erscheint ein „Session abschließen"-Button. Der `/complete`-Endpunkt:
1. Setzt `sessions.status = 'completed'`, `completed_at = now()`
2. Ruft Anthropic API mit allen 10 Schritten auf → generiert Markdown-Zusammenfassung
3. Speichert Bericht als `session_steps`-Eintrag mit `step_number = 0`
4. Gibt die Session-ID zurück → UI leitet auf `/admin/coaching/sessions/[id]` (Detailansicht mit Export-Button)

## KI-Integration

### Modell

`claude-haiku-4-5-20251001` als Default. Über `COACHING_SESSION_MODEL` in der Umgebungsvariablen überschreibbar.

### Prompt-Struktur (Datei: `coaching-session-prompts.ts`)

Jeder der 10 Schritte hat einen eigenen System-Prompt und eine Menge benannter Eingabefelder (`STEP_DEFINITIONS`). Beispiel Schritt 1:

```typescript
{
  stepNumber: 1,
  stepName: 'Erstanamnese',
  phase: 'problem_ziel',
  inputs: [
    { key: 'anlass', label: 'Anlass der Session', required: true },
    { key: 'vorerfahrung', label: 'Vorerfahrung mit Coaching', required: false },
    { key: 'situation', label: 'Aktuelle Situation', required: true },
  ],
  systemPrompt: `Du bist ein erfahrener Coaching-Assistent (Triadisches KI-Coaching nach Geißler).
Deine Aufgabe: basierend auf den Coach-Eingaben eine präzise Gesprächsintervention
vorschlagen. Auf Deutsch. Maximal 250 Wörter. Kein wörtliches Buchzitat.`,
  userTemplate: `Anlass: {anlass}\nVorerfahrung: {vorerfahrung}\nAktuelle Situation: {situation}`,
}
```

Die Coach-Eingaben werden **serverseitig** in den Prompt interpoliert. Der Client überträgt nur die Rohwerte. Der fertige Prompt wird in `session_steps.ai_prompt` gespeichert.

### Fehlerbehandlung

- Schlägt die Anthropic-Anfrage fehl: Schritt bleibt auf `pending`, Coach sieht Toast-Fehlermeldung, kann erneut versuchen oder überspringen.
- `ANTHROPIC_API_KEY` nicht gesetzt: `/generate`-Endpoint gibt 503 zurück, UI zeigt Hinweis.

## Abschlussbericht

Endpunkt `POST /api/admin/coaching/sessions/[id]/complete` ruft Anthropic ein zweites Mal auf:

```
System: Du bist ein Coaching-Protokollant. Erstelle aus den 10 Schritten einer
        Coaching-Session eine strukturierte Zusammenfassung auf Deutsch.
        Abschnitte: Ausgangslage, Analyse, Lösungsansatz, Vereinbarte Schritte, Bewertung.

User:   [alle 10 Schritte mit Coach-Eingaben + KI-Antworten + Coach-Notizen]
```

Export: Der Coach kann den Bericht als Markdown herunterladen. PDF-Export ist Folgearbeit.

## Navigation

`AdminLayout.astro` erhält eine neue Navigationsgruppe **„Coaching"** (unterhalb von „Wissen"):

```typescript
{
  label: 'Coaching',
  items: [
    { href: '/admin/coaching/sessions',     label: 'Sessions',      icon: 'clipboard' },
    { href: '/admin/coaching/sessions/new', label: 'Neue Session',  icon: 'plus' },
  ],
}
```

## Sessions-Liste

`/admin/coaching/sessions` zeigt eine Tabelle: Titel, Klient (oder „Vorbereitung"), Datum, Status, Link zur Session. Leer-Zustand mit CTA „Erste Session starten →".

## Klienten-Ansicht (späteres Feature)

Nicht in diesem Prototyp. Vorgesehen: ein separates Read-only-View unter `/portal/coaching/sessions/[id]`, das der Coach per Toggle freischaltet. Technisch: ein `shared_with_client`-Flag auf `coaching.sessions`.

## Test-Strategie

- **Unit:** `coaching-session-prompts.ts` — alle 10 Schritt-Definitionen vollständig (keys, labels, required-Felder vorhanden)
- **Integration:** Session anlegen → Schritt 1 generieren → Schritt akzeptieren → Session abschließen → Bericht vorhanden
- **Privacy:** `/generate`-Endpoint wirft 403 ohne Admin-Session
- **Fehlerfall:** Anthropic-Key fehlt → 503, kein 500

## Offene Punkte

- PDF-Export des Abschlussberichts: Folgearbeit (puppeteer oder browser-print).
- Klienten-Ansicht: separates Feature-Ticket nach Prototyp-Abnahme.
- Welche der 10 Schritt-Eingabefelder sind `required`? Im Prototyp mindestens ein Pflichtfeld pro Schritt — finale Liste im Implementierungsplan.
