# K5: OpenSpec (SSOT-Specs und Changes)

> Komponente des Brain-Architektur-Epics T002430.
> Stand: 2026-08-02, erhoben in T002435.

## Was K5 hält

Die Spezifikations-Wahrheit des Repos in zwei Ebenen:

- **SSOT-Specs** — `openspec/specs/*.md` (74 Dateien, flach, ein Slug pro Komponente/Feature). Endgültige, gemergte Wahrheit.
- **Changes** — `openspec/changes/<slug>/` (unarchiviert: 176 Verzeichnisse). Jedes enthält `proposal.md`, `specs/<parent-slug>.md` (Delta), `tasks.md` (+ optional `tasks.d/p*.md`-Partials), `.ticket`. Ein Change ist ein *in Arbeit befindliches* Delta gegen die SSOT.
- **Archiv** — `openspec/changes/archive/<datum>-<slug>/` (315 Verzeichnisse). Abgeschlossene Changes, deren Delta bereits in die SSOT gemergt wurde.

## Diagramm

```
┌────────────────────────────────────────────────────────────────────────┐
│ LEBENSZYKLUS: propose → apply → archive                                │
│                                                                          │
│  Auslöser (mehrfach redundant, alle rufen scripts/openspec.sh):        │
│    /opsx:propose <slug>   ─┐                                           │
│    task openspec:propose  ─┼─► cmd_propose()                           │
│    dev-flow-plan Phase A  ─┘   status: backlog → planning              │
│                                  scaffoldet: proposal.md, tasks.md,     │
│                                  specs/<target-spec>.md (TODO-Skelett), │
│                                  .ticket                                │
│                                       │                                 │
│                                       ▼                                 │
│    /opsx:apply <slug>     ─┐                                           │
│    task openspec:apply    ─┼─► cmd_apply()                             │
│    dev-flow-plan (Ende)   ─┘   status: planning → plan_staged          │
│                                  Guard: tasks.md muss existieren        │
│                                  Trigger: _embed_slug() (pgvector,      │
│                                  best-effort)                           │
│                                       │                                 │
│                       ┌───────────────┴────────────────┐               │
│                       ▼                                │               │
│              dev-flow-execute implementiert             │               │
│              (Implementierung + PR + Merge)              │               │
│              Ticket-Status → done                        │               │
│                       │                                │               │
│                       ▼                                │               │
│    /opsx:archive <slug>   ─┐                                           │
│    task openspec:archive  ─┼─► cmd_archive()                           │
│    dev-flow-execute       ─┘   GUARD (fail-closed): Ticket-Status       │
│    (Post-Merge-Schritt)         MUSS "done" sein, sonst `die`          │
│                                       │                                 │
│                                       ▼                                 │
│                          scripts/openspec-merge.mjs apply               │
│                          (Requirement-genaues ADDED/MODIFIED/           │
│                          REMOVED/RENAMED-Merge in openspec/specs/*.md)  │
│                                       │                                 │
│                                       ▼                                 │
│                     mv changes/<slug> → changes/archive/<datum>-<slug> │
│                     + _embed_slug() (Re-Index nach Merge)               │
└────────────────────────────────────────────────────────────────────────┘

  Kante K5 → K1 (Vektorspeicher, pgvector)
  ──────────────────────────────────────────
  .githooks/post-commit
    └─► .githooks/post-commit-embed
          └─► erkennt geänderte Slugs unter openspec/changes/<slug>/
              (git diff-tree HEAD, Filter auf Pfade mit tasks.md)
          └─► scripts/openspec-embed-local.sh <slug>
                └─► scripts/openspec-embed.mjs --slug <slug>
                      ├─ Modell: bge-m3 (wenn LLM_ENABLED=true),
                      │   sonst Fallback voyage-multilingual-2
                      ├─ Chunking: proposal.md + tasks.md + specs/*.md
                      │   (chunkProposal/chunkSections)
                      └─► INSERT in knowledge.collections +
                          knowledge.chunks (pgvector, shared-db)
                          Upsert-Semantik: DELETE bestehender Chunks
                          für den Slug vor Re-Insert (idempotent)
  Konsument: factory-mcp openspec_find_similar (Retrieval über K1)
  Sicherheitsnetz: die explizite dev-flow-plan-Schritt-C.4-Einbettung
  UND dieser post-commit-Hook laufen redundant — der Hook fängt
  Sessions ab, die vor C.4 abstürzen.

  Kante K5 → K4 (Brain-Wiki-Ingest)
  ──────────────────────────────────────────
  scripts/brain/ingest-sources.yaml
    Gruppe "ssot-specs" ──► liest openspec/specs/*.md (SSOT, NICHT
                              openspec/changes/) ──► scripts/brain-ingest.sh
                              ──► externes Repo Paddione/brain
  D.h.: K4 konsumiert nur den ARCHIVIERTEN, gemergten Zustand von K5.
  Ein Change, der lange unarchiviert bleibt, ist für K4 unsichtbar —
  das Wiki zeigt den alten SSOT-Stand weiter.

  Gate: task openspec:validate (fail-closed, CI-Pflicht)
  ──────────────────────────────────────────
  scripts/openspec.sh validate iteriert alle changes/<slug>/ (außer
  archive/) und prüft PRO Change:
    - specs/ Verzeichnis existiert und enthält mind. 1 .md
    - jede Datei hat "## ADDED|MODIFIED|REMOVED|RENAMED Requirements"
    - jede Datei hat mind. 1 "### Requirement: " (H3, nicht H2)
    - .ticket fehlt → nur WARN, kein FAIL
  Prüft NICHT: ob ADDED korrekt ist (vs. MODIFIED, wenn der Parent-Spec
  bereits existiert) — das fällt erst beim Archivieren auf (siehe unten).
```

## Auslöser je Phase

| Phase | `/opsx:*`-Kommando | `task openspec:*`-Wrapper | dev-flow-Integration |
|-------|--------------------|-----------------------------|----------------------|
| propose | `/opsx:propose <slug>` (`.claude/commands/opsx/propose.md`) | `task openspec:propose -- <slug> --ticket <id>` | `dev-flow-plan` Phase A |
| apply | `/opsx:apply <slug>` | `task openspec:apply -- <slug>` | `dev-flow-plan`-Ende (Status → `plan_staged`) |
| archive | `/opsx:archive <slug>` | `task openspec:archive -- <slug>` | `dev-flow-execute` Post-Merge-Schritt |
| explore | `/opsx:explore` | — | Denkpartner vor `propose`, kein Artefakt |

Alle drei Wrapper (`/opsx:*`, `task openspec:*`, dev-flow-Skills) rufen letztlich dasselbe `scripts/openspec.sh` auf — es gibt keinen zweiten unabhängigen Implementierungspfad.

## Delta-Merge (`scripts/openspec-merge.mjs`)

Requirement-genauer Merge statt Roh-Anhängen: parst die SSOT in `### Requirement:`-Blöcke und wendet die Operation aus dem Delta an (`ADDED`/`MODIFIED`/`REMOVED`/`RENAMED`). Fail-closed bei:
- fehlendem Ziel-SSOT-Spec (außer `--create-new` gesetzt)
- `RENAMED` ohne `**Renamed-to:**`-Direktive
- unbearbeitetem Skeleton-Stub (`### Requirement: TODO`, `The system SHALL …`)

## Fail-closed-Gate: `task openspec:validate`

Filesystem-only, CI-Pflicht. Siehe Diagramm oben für die geprüften Bedingungen. **Bekannte Lücke:** ADDED-vs-MODIFIED-Korrektheit wird beim `validate` nicht geprüft — ein Delta, das fälschlich `ADDED` gegen einen bereits existierenden Parent-Spec deklariert, validiert grün und schlägt erst beim `archive`-Lauf (im `openspec-merge.mjs`) fehl, wenn der Ziel-Spec bereits existiert und `--create-new` fehlt. Diese Lücke betrifft konkret diesen Change: siehe „Zu beachten" unten.

## Delta-Spec-Namenskonvention (Fallstrick, T001304)

Delta-Dateien in `openspec/changes/<slug>/specs/` werden nach dem **Parent-SSOT-Slug** benannt, nicht nach dem Change-Slug. Für Sub-Features einer bestehenden Komponente: `openspec.sh propose <change-slug> --ticket T… --target-spec <parent-slug>`. Für eine wirklich neue Komponente: `openspec.sh archive <change-slug> --create-new`. Ohne `--create-new` schlägt `archive` fehl, wenn der Ziel-SSOT-Spec noch nicht existiert.

**Bei diesem Change beobachtet:** Das ursprünglich von `/opsx:propose` erzeugte Skelett legte die Delta-Datei unter `specs/brain-k5-openspec/spec.md` an (verschachteltes Verzeichnis) statt flach unter `specs/brain-k5-openspec.md`, wie es `scripts/openspec.sh`s `cmd_validate`/`cmd_archive` erwarten (`dir/specs/*.md`, keine Unterverzeichnisse). Wäre das unkorrigiert geblieben, hätte `task openspec:validate` bereits mit `FAIL: … specs/ has no capability .md` fehlgeschlagen — ein Fall, in dem der `/opsx:*`-Pfad und der `scripts/openspec.sh`-Pfad strukturell auseinanderlaufen können, obwohl beide denselben CLI-Namen tragen.

## Rückstau-Erhebung (gemessen, T002435, 2026-08-02)

| Kennzahl | Wert | Methode |
|----------|------|---------|
| Unarchivierte Change-Verzeichnisse (`openspec/changes/*/`, ohne `archive/`) | **176** (177 direkt vor PR-Erstellung, nach einem zwischenzeitlichen Merge — die Zahl ist live und schwankt mit jedem Merge/Archivierungslauf; die Verhältnis-Analyse unten basiert auf der 176er-Momentaufnahme) | `find openspec/changes -maxdepth 1 -mindepth 1 -type d ! -name archive \| wc -l` |
| Bereits archivierte Change-Verzeichnisse | 315 | `find openspec/changes/archive -maxdepth 1 -mindepth 1 -type d \| wc -l` |
| SSOT-Specs (`openspec/specs/*.md`) | 74 | `find openspec/specs -maxdepth 1 -name '*.md' \| wc -l` |
| Unarchivierte Changes MIT `.ticket`-Link | 135 von 176 | Dateisystem-Scan |
| Unarchivierte Changes OHNE `.ticket`-Link | 41 von 176 | Dateisystem-Scan — Ticket-Status für diese 41 nicht prüfbar |
| Verlinkte Tickets mit Status `done` | 124 | DB-Query `tickets.tickets` (mentolder) |
| Verlinkte Tickets mit Status `archived` | 10 | DB-Query — Ticket selbst ist geschlossen/archiviert, der Change liegt trotzdem noch unter `changes/` |
| Verlinkte Tickets mit Status `plan_staged` | 1 | Dieses Ticket (T002435) — legitim in Arbeit |

**Befund:** Von den 135 Changes mit nachvollziehbarem Ticket-Link sind **134 (99 %) bereits `done` oder `archived`** und damit laut `scripts/openspec.sh archive`s eigenem Guard (Zeile 225: Archivierung erfordert Ticket-Status `done`) sofort archivierbar — sie liegen nur nicht dort. Der Rückstau ist damit fast vollständig ein Vollzugs-Rückstau, kein Arbeits-Rückstau: die zugrunde liegenden Änderungen sind längst gemergt, der `archive`-Schritt (der den Delta-Merge in die SSOT auslöst) wurde nur nicht ausgeführt. Für die 41 Changes ohne `.ticket`-Datei ist der Merge-Status **unklar** — ohne Ticket-Referenz lässt sich ihr Abschluss aus dem Repo allein nicht feststellen.

**Konsequenz für K5→K4:** Da K4 (Brain-Wiki) nur die SSOT unter `openspec/specs/` einliest (Gruppe `ssot-specs`), nicht die `changes/`-Verzeichnisse, spiegelt das Wiki den Stand von potenziell 134 bereits gemergten, aber nicht archivierten Änderungen NICHT wider. Die Kante K5→K1 (Embedding) bleibt davon unberührt — sie embedded Changes unabhängig vom Archivierungsstatus, solange `tasks.md` existiert.

Der frühere Wert aus der Erhebung vom 2026-07-28 ("über 40 Verzeichnisse") war die initiale Beobachtung derselben Kennzahl; sie ist seither auf 176 gewachsen — der Rückstau hat sich nicht abgebaut, sondern vervierfacht.

## Silent-Failure-Pfade

| Pfad | Datei | Was passiert | Sichtbarkeit |
|------|-------|--------------|---------------|
| `post-commit-embed` ohne Embedding-Backend | `.githooks/post-commit-embed:52-54` | `openspec-embed-local.sh` schlägt fehl → Hook loggt `WARN` und fährt fort (`\|\| true`-Charakter über die Warnung) | `echo … WARN` auf stderr, Commit selbst schlägt NICHT fehl |
| `openspec-embed.mjs` ohne `SESSIONS_DATABASE_URL`/Backend | `scripts/openspec-embed.mjs` | best-effort: loggt Fehler, `exit 0` | Nur im Log sichtbar, kein Fehlersignal nach außen |
| `task openspec:validate` grün trotz falschem ADDED/MODIFIED | `scripts/openspec.sh:_validate_delta_file` | Struktur wird geprüft, Operation-Korrektheit nicht | Fällt erst bei `archive` auf (`openspec-merge.mjs` `fail()`), also erst nach dem PR-Merge |
| Change ohne `.ticket` | `scripts/openspec.sh:281` | nur `WARN`, `archive` bleibt für diesen Change unmöglich (Guard bei Zeile 222 greift nicht, aber es gibt keinen Ticket-Status zu prüfen) | stderr-WARN in `validate`-Output |
| CI-Umgebung | `.githooks/post-commit-embed:23-25` | Hook skippt komplett in CI (`CI` env gesetzt) — Embedding erfolgt dort NICHT über den Hook | Kein Log, stiller No-Op — verlässt sich auf den expliziten `_embed_slug()`-Aufruf in `apply`/`archive` |

## Defekt-Referenz (T002430)

| Defekt | Betrifft K5? | Befund |
|--------|-------------|--------|
| D1: Tracking-Pipeline ins Nichts | ❌ | Nicht K5-spezifisch |
| D2: `ticket_plans` leer | ⚠️ indirekt | K5-Changes selbst leben als Branch-Dateien (`openspec/changes/`), nicht in `ticket_plans` — dieselbe Konzeption: Pläne sind Dateien, nicht DB-Zeilen |
| D3: Brain-Ingest nur Pilot | ✅ | Bestätigt hier zusätzlich: K4 liest nur archivierte K5-SSOT — 134 gemergte, unarchivierte Changes fehlen im Wiki zusätzlich zum in D3 beschriebenen Pilot-Umfang |
| D4–D9 | ❌ | Nicht K5-spezifisch (MCP/Browser/llama.cpp-Themen) |
| **Neu identifiziert (diese Erhebung)** | — | **Archivierungs-Rückstau:** 134 von 176 unarchivierten Changes sind bereits `done`/`archived` auf Ticket-Ebene, aber nie via `openspec archive` abgeschlossen — SSOT und Realität laufen auseinander, ohne dass D1–D9 dies erfasst hätten |

## Verbleibende Risiken

1. **Kein automatischer Archivierungs-Trigger nach Merge.** `dev-flow-execute` sieht einen Post-Merge-Archivierungsschritt vor, aber der Rückstau von 134 abschlussbereiten Changes zeigt, dass dieser Schritt in der Praxis oft ausgelassen oder übersprungen wird (z. B. bei Batches, manuellen Merges, Factory-Pfaden außerhalb von `dev-flow-execute`).
2. **ADDED/MODIFIED-Fehler werden spät sichtbar.** Das `validate`-Gate prüft Struktur, nicht Operation-Korrektheit gegen die tatsächliche SSOT — ein Delta kann grün validieren und trotzdem erst beim `archive`-Lauf (nach dem Merge) fehlschlagen.
3. **41 Changes ohne Ticket-Link sind aus dem Repo allein nicht auf Abschlussstatus prüfbar.**

## Änderungshistorie

| Datum | Ticket | Änderung |
|-------|--------|----------|
| 2026-07-28 | T002430 | Epic erhebt K5 initial: "über 40 Verzeichnisse" unarchiviert |
| 2026-08-02 | T002435 | Dieses Dokument: Diagramm, Lebenszyklus-Auslöser, K5→K1/K5→K4-Kanten, Rückstau-Nachmessung (176, davon 134 abschlussbereit) |
