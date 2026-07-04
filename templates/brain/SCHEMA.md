---
type: note
tags: [schema, meta]
status: active
source:: brain-foundation (self)
---
# SCHEMA — Verfassung des brain-Wikis

Dieses Dokument ist die verbindliche Struktur- und Konventionsbeschreibung für das
`brain`-Repository (privates GitHub-Repo `Paddione/brain`, gemeinsames LLM-Wiki von
Patrick und Gekko, Karpathy-Pattern). Es wird einmalig via `scripts/brain-bootstrap.sh`
aus diesem Repo (Bachelorprojekt) geseedet — danach ist `brain` **SSOT für seinen
eigenen Inhalt** (D4). Änderungen an dieser Datei geschehen im `brain`-Repo selbst,
nicht hier.

## Verzeichnisstruktur

- `raw/` — Rohmaterial (Transkripte, Exporte, Notizen-Fragmente). Kein Frontmatter-Zwang.
- `wiki/` — Kompilierte, gelintete Wissensseiten. Flache Struktur, keine tiefen
  Unterordner — jede Seite ist über ihren Dateinamen (`slug.md`) direkt referenzierbar.
  MOC-Seiten (Maps of Content, `type: moc`) bündeln thematisch verwandte Seiten als Hub.
- `SCHEMA.md` — dieses Dokument.
- `index.md` — Einstiegs-Hub des gesamten Repos (`type: moc`).
- `log.md` — Änderungs-Journal (append-only Verlaufsnotizen).
- `scripts/` — Lint-Tooling (`lint-wikilinks.sh`, `lint-frontmatter.sh`), von der CI
  aufgerufen.
- `.github/workflows/ci.yml` — Qualitäts-Gate (Lint + Secret-Scan).

## Frontmatter-Pflichtfelder

Jede `.md`-Datei unter `wiki/` sowie die Hub-Seiten `index.md`, `log.md` und
`SCHEMA.md` tragen einen YAML-Frontmatter-Block mit mindestens den folgenden
Feldern — `raw/` und `README.md` sind vom Frontmatter-Lint ausgenommen:

| Feld | Erlaubte Werte | Bedeutung |
|---|---|---|
| `type` | `note \| moc \| entity \| decision \| runbook` | Seitenart |
| `tags` | nicht-leere Liste | Themen-Schlagworte |
| `status` | `draft \| active \| archived` | Reifegrad |

Optional: `source::`-Zeilen als typisierte Rückverweise auf externe Quellen
(SSOT-Regel „kompilieren, nicht verschieben" — siehe unten).

## Wikilinks

Interne Querverweise werden in doppelten eckigen Klammern geschrieben und enthalten
den Dateinamen ohne `.md`-Endung (z. B. `[[index-moc]]` verweist auf
`wiki/index-moc.md` oder eine gleichnamige Datei an beliebiger Stelle im Repo).
`scripts/lint-wikilinks.sh` prüft, dass jeder so geschriebene Verweis auf eine
tatsächlich existierende Seite zeigt.

Erlaubte Formen: `[[index-moc]]` (plain), `[[quality-goals|Anzeigetext]]`
(Alias) und `[[SCHEMA#wikilinks]]` (Anker) — `scripts/lint-wikilinks.sh`
prüft in allen drei Formen den Slug-Teil vor `|` bzw. `#`. Auch Links in
Code-Fences werden geprüft; Platzhalter-Beispiele daher als `[[<slug>]]`
mit spitzen Klammern notieren, diese Form matcht der Linter nicht.

## SSOT-Regel „kompilieren, nicht verschieben"

Quellinhalte (Code, Doku, Tickets) bleiben in ihrem Ursprungs-Repository. Wiki-Seiten
hier fassen zusammen und referenzieren über `source::`-Zeilen — sie sind keine Kopien.
Damit gibt es keinen Zwei-Orte-Drift auf Quellenebene; Drift zwischen Quelle und
kompilierter Wiki-Seite wird über einen späteren Merge-Hook-Ingest adressiert
(Folge-Change, siehe Ticket T001567 — out of scope für dieses Fundament).

## Workflows (Kurzüberblick — Details in Folge-Changes)

- **Ingest**: Rohmaterial landet in `raw/`, wird zu gelinteten `wiki/`-Seiten
  kompiliert (Folge-Change `brain-initial-ingest`, T001570).
- **Query**: Lesender Zugriff auf das Wiki (später via MCP-Server, Folge-Change).
- **Lint**: `scripts/lint-frontmatter.sh` und `scripts/lint-wikilinks.sh` laufen lokal
  und in CI (`.github/workflows/ci.yml`) auf jeden `push`/`pull_request`.

## Sprachkonvention

Prosa auf Deutsch, Fachbegriffe und Bezeichner auf Englisch (Slugs,
type-Werte, tags, Code). Etablierte englische Begriffe werden nicht
zwangsübersetzt.

## Slug-Konvention

Dateinamen unter `wiki/` sind der Slug: kebab-case (`a-z`, `0-9`, `-`),
englisch, sprechend, ohne Datumspräfix. Der Slug ist zugleich der
Wikilink-Zielname.

## Qualitätsziele

Struktur- und Organisationsziele (G-BRAIN01 bis G-BRAIN11) sind in
[[quality-goals]] definiert — Gates erzwingt die CI, Targets werden dort
mit kopierbaren Mess-Kommandos dokumentiert.

## Vertraulichkeit

Keine Credentials im Klartext (nur Verweise auf Vaultwarden/SealedSecrets), keine
personenbezogenen Daten Dritter ohne Einwilligung. Die CI führt einen Secret-Scan
(`gitleaks`) als Pflicht-Gate.
