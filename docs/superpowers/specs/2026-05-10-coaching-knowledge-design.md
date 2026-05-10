---
title: Coaching-Wissens-Pipeline (Geißler & Co.)
status: draft
created: 2026-05-10
domains: [website, db]
related_pr: null
---

# Coaching-Wissens-Pipeline — Spec

## Zweck

Gekko soll Coaching-Bücher (Erstes: *Geißler — KI-Coaching*) als Quelle in die Plattform einspeisen können, daraus Snippets kuratieren und über einen einheitlichen Publish-Pfad in die vier existierenden Klienten-Surfaces (Questionnaire, Brett, Chatroom, Assistant) bringen. Eine KI-Pipeline schlägt während der Ingestion vor, welche Buchstellen welcher Surface entsprechen könnten — Gekko triagiert.

Erwartete Bibliotheksgröße: 5–10 Bücher in den ersten 6 Monaten. Cross-Source-Cluster (z.B. Thema „Reflexion" über drei Bücher) ist von Tag eins gefordert.

## Nicht-Ziele

- Klient bekommt das Rohmaterial des Buches nie zu sehen. Buchvolltexte sind ausschließlich in `/admin`-Routen sichtbar (Gekko-Rolle).
- Keine automatische Veröffentlichung von KI-Drafts an Klienten — jeder Klienten-sichtbare Inhalt wird von Gekko explizit publiziert.
- Keine eigene Modell-Hosting-Infrastruktur für das Drafting; wir verwenden den existierenden Anthropic-API-Pfad (Detail in der Implementierung).

## Architektur

```
Buch (PDF/EPUB)
    → Ingest-Pipeline (chunk + embed + auto-classify)
        → Knowledge Collection (pgvector, existiert)
        → Drafts-Tabelle (neu: KI-Vorschläge mit Source-Pointer)
        → Snippets-Tabelle (neu: Gekkos manuelle Highlights)
            → Publish-Cascade (Snippet/Draft → Template-Editor)
                → Questionnaire-Item   (existiert: /portal/fragebogen)
                → Brett-Preset         (existiert: brett.${PROD_DOMAIN})
                → Chatroom-Übung       (existiert: /portal/raum)
                → Assistant-Knowledge  (existiert: AssistantChat RAG)
```

Wiederverwendet werden die existierende pgvector-Knowledge-Collection-Infrastruktur (PR #799f776e), `KnowledgeSourceModal.svelte`, und alle vier Klienten-Surfaces. Neu gebaut wird ausschließlich der Editorial-Layer für Gekko und der Publish-Editor.

## Komponenten

### 1. Ingest-Pipeline

Eingabe: PDF oder EPUB unter `coaching-sources/<book-id>/` (gitignored, gehört zum Volume des Pods).

Schritte:
1. Text-Extraktion (EPUB direkt, PDF über pdftotext oder vergleichbar)
2. Chunking (semantisch, ca. 400–800 Tokens pro Chunk, mit Buchseiten- und Absatz-Anchor)
3. Embedding gegen das existierende Knowledge-Collection-Modell
4. Auto-Klassifikation jedes Chunks in eine Template-Art:
   - `reflection` — eine Frage oder Selbstprüfung
   - `dialog_pattern` — ein Coach-Klient-Dialog-Muster
   - `exercise` — eine strukturierte Übung mit Schritten
   - `theory` — Hintergrund/Konzept (geht direkt in Assistant-Knowledge)
   - `case_example` — Fallbeispiel (Gekko-only-Referenz)
5. Pro klassifiziertem Chunk wird ein Draft-Vorschlag erzeugt (außer `theory`, das direkt in die Knowledge-Collection wandert).

Klassifikation nutzt LLM (Anthropic) mit strikt schemarisch erzwungenem Output (JSON). Halluzinations-Schutz: jeder Draft enthält den Original-Chunk (verbatim) als verpflichtendes Feld, das in der Drafts-Inbox neben dem Vorschlag angezeigt wird.

### 2. Drafts-Inbox  (`/admin/knowledge/drafts`)

Liste aller offenen Drafts pro Buch, gruppiert nach Template-Art. Detail-View ist zwei-spaltig: links Original-Buchstelle, rechts KI-Vorschlag. Akzeptieren erzeugt einen Snippet (mit dem editierbaren Vorschlag als Ausgangspunkt) oder veröffentlicht direkt (Skip-Snippet-Modus). Ablehnen markiert den Chunk als „nicht relevant", er taucht nicht wieder auf.

Acceptance-Rate pro Buch und Kapitel ist sichtbar. Fällt sie unter 30%, erscheint eine Warnung („Klassifikator versagt für Kapitel X — lieber im Themen-Browser arbeiten").

### 3. Themen-Browser  (`/admin/knowledge/books/[id]`)

Buch als Lesefläche mit Auto-Cluster (durch Embedding-Cluster-Algorithmus auf den Chunks). Cluster sind Vorschläge, Gekko kann manuelle Cluster anlegen und Snippets verschieben. Manuelles Highlighting: Text markieren → „Snippet anlegen" → Tags + freie Notiz → speichern. Ein manuell erzeugter Snippet ist ununterscheidbar von einem aus einem akzeptierten Draft hervorgegangenen Snippet.

Cross-Source-Cluster: Themen sind nicht buch-lokal. Ein Cluster „Reflexion" enthält Snippets aus allen Büchern der Bibliothek.

### 4. Publish-Cascade  (`/admin/knowledge/snippets/[id]/publish`)

Aus jedem Snippet kann ein Template für eine der vier Klienten-Surfaces erzeugt werden. Editor-UI ist einheitlich, aber die unteren Felder ändern sich pro Surface:

- **Questionnaire-Item:** Titel, Frage, Folgefrage, Antwort-Typ
- **Brett-Preset:** Figuren-Setup, Ausgangs-Konstellation, Anleitung-Text
- **Chatroom-Übung:** Phasen-Skript (Einstieg, Vertiefung, Abschluss), Coach-Hinweise
- **Assistant-Knowledge:** Eintrag mit Tags, der ins RAG-Index der Assistant-Collection wandert

Jedes Template speichert beim Veröffentlichen den Source-Pointer (book-id, page, chunk-id) ab. Der Pointer wird in der Klienten-UI als Quellenhinweis dargestellt (siehe Sektion „Quellen-Sichtbarkeit").

Templates sind versioniert. Edit erzeugt v2; Klient sieht beim Bearbeiten der Zuweisung die Snapshot-Version.

### 5. Session-Prep  (`/admin/knowledge/session-prep`)

Eingabe: Klient + Thema + Termin. Ausgabe: ranked Liste mit Mix aus Snippets (= noch zu publishen) und Templates (= sofort zuweisbar). Ranking via Cosine-Suche auf Embedding + Tag-Match-Boost. Direktaktionen: „Publish…" (geht in Publish-Cascade) oder „An Klient zuweisen" (geht in den jeweiligen Surface-Workflow).

### 6. In-Session-RAG (Assistant)

Bestehender `AssistantChat` wird so erweitert, dass er bei Bedarf aus Templates mit `target_surface = assistant_knowledge` zitiert. Ausgabe an den Klienten enthält paraphrasierten Inhalt + sichtbare Quellenangabe in der Form `Quelle: Geißler, KI-Coaching, S. 47`. Wörtliches Zitat über 280 Zeichen ist im Klienten-Output blockiert (zitatrechtliche Schwelle).

## Datenmodell (Skizze)

Neue Tabellen im `bachelorprojekt`-Schema:

```
books
  id, title, author, source_path, ingested_at, license_note

book_chunks
  id, book_id, page, paragraph_anchor, text, embedding (vector)

drafts
  id, book_id, chunk_id, template_kind, suggested_payload (jsonb),
  status (open|accepted|rejected), reviewed_by, reviewed_at

snippets
  id, book_id, chunk_id (nullable for manual), title, body,
  tags (text[]), cluster_id, created_by, created_from_draft (nullable)

snippet_clusters
  id, name, kind (auto|manual), parent_id (nullable for hierarchy)

templates
  id, snippet_id, target_surface, version, payload (jsonb),
  source_pointer (jsonb: {book_id, page, chunk_id}),
  status (draft|published|archived)

template_assignments
  id, template_id, template_version, client_id, assigned_at,
  surface_specific_id (questionnaire_id | brett_room_id | chatroom_id | null)
```

`surface_specific_id` zeigt zurück in die existierenden Tabellen der jeweiligen Surface — keine Datenduplikation, nur ein Pointer.

## Quellen-Sichtbarkeit & Urheberrecht

Drei Zonen:

1. **Buch-Volltext** — nur sichtbar in Drafts-Inbox + Themen-Browser, beide unter `/admin/*` und auth-geschützt auf Gekko-Rolle.
2. **Zitate in publizierten Templates** — max. 280 Zeichen wörtlich pro Template. Quellenangabe ist Pflichtfeld am Template, dem Klienten immer sichtbar (Zitatrecht §51 UrhG).
3. **Assistant-RAG-Antworten** — paraphrasiert vom LLM, Quellenangabe immer sichtbar, kein wörtliches Zitat über Schwelle.

`coaching-sources/` und die `book_chunks`-Tabelle sind vom Cloud-Backup ausgeschlossen oder verschlüsselt — Detail klärt die Implementierung. Im Repo gitignored.

## Fehlerfälle

| Risiko | Mitigation |
|---|---|
| KI-Draft inhaltlich daneben | Side-by-side-Anzeige strukturell erzwungen; Acceptance-Rate sichtbar; Warn-Pop unter 30% |
| Klient sieht ungeprüften Snippet | Strikte Trennung Snippet (admin-only) vs. Template (publish-state) |
| Urheberrechtsverletzung | 280-Zeichen-Zitatschwelle in Klienten-API-Antworten erzwungen + Pflicht-Quellenangabe |
| Template-Edit nach Klienten-Zuweisung | Versionierung; Klient sieht Snapshot-Version |
| Buch leakt in Backup | `coaching-sources/` und `book_chunks` aus Cloud-Backup ausgeschlossen oder verschlüsselt |
| Embedding-Modell-Wechsel | Reembedding-Job in der bestehenden Knowledge-Infra |
| Cross-Source-Cluster verwirrt Gekko | Cluster zeigen Anzahl Snippets pro Buch separat |

## Test-Strategie

- **Unit:** Klassifikator gegen ein Gold-Set von 50 Hand-gelabelten Chunks (≥75% Übereinstimmung als Schwelle für Akzeptanz)
- **Integration:** Ingest-Pipeline auf einem öffentlich zugänglichen Public-Domain-Coaching-Text → erwartete Anzahl Drafts; Publish → Template in Bibliothek; Assign → Test-Klient sieht es
- **E2E (Playwright):** Drafts-Inbox-Flow vollständig, Themen-Browser-Highlight-Flow, Session-Prep-Suche
- **Eval-Loop für Gekko:** nach jedem Buch-Ingest Pflicht-Review von 20 Drafts; Acceptance-Rate als Dashboard-Metrik
- **Privacy-Audit (CI):** automatischer Check, dass `book_chunks.text` nicht in `/api/portal/*`-Antworten leakt (mit Public-Domain-Test-Buch)
- **Zitat-Schwelle:** Unit-Test, der jedes Klienten-Surface-Output gegen die 280-Zeichen-Regel prüft

## Phasen-Plan (für Implementations-Plan)

1. **Phase 1 — Ingest + Themen-Browser + Snippets** (ohne AI-Drafting): Buch hochladen → chunken + embedden → manuell highlighten + taggen. Ergibt sofort einen funktionierenden Recherche-Werkzeug für Gekko.
2. **Phase 2 — Publish-Cascade**: Snippet → Template-Editor → Veröffentlichung in eine der vier Surfaces. Erste Klienten-Wirkung.
3. **Phase 3 — Drafts-Inbox + Auto-Klassifikation**: AI-Drafting mit Halluzinations-Bremse. Höchstes Risiko, deshalb zuletzt — Phase 1+2 sind ohne Drafting voll nutzbar.
4. **Phase 4 — Session-Prep**: Klient+Thema-Suche über den nun reichen Korpus. Sinnvoll erst, wenn der Korpus nicht trivial leer ist.
5. **Phase 5 — In-Session-RAG**: Assistant zitiert aus der Knowledge-Collection mit sichtbaren Quellen.

Phasen 1 und 2 zusammen liefern den Kernwert (Gekko nutzt es für sich, Klienten bekommen erste Templates). Phase 3 macht das Skalieren effizienter, ist aber kein Blocker für Wert.

## Offene Punkte für die Implementations-Phase

- Welche LLM-Variante für die Auto-Klassifikation (Cost vs. Qualität): Anthropic Haiku 4.5 als Default, da bereits in der MCP-Stack hinterlegt.
- Backup-Strategie für `book_chunks` im Detail.
- Embedding-Modell-Auswahl: bei Cross-Source-Cluster-Qualität später evaluieren, ggf. wechseln.

## Referenz

- Existierende Knowledge-Infrastruktur: PR #799f776e (`feat(knowledge): pgvector foundation + admin UI`)
- Memory: `project_mentolder_website.md`, `feedback_visual_companion_brand.md`
- Visual companion mocks (mentolder-Theme): `.superpowers/brainstorm/3978888-1778382235/content/architecture.html`, `components.html`
