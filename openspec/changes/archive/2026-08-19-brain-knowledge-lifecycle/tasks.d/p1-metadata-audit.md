# P1 — Provenienz-Metadaten und report-only Lifecycle-Audit

Rolle: **impl**. Disjunkter Partial des Change `brain-knowledge-lifecycle` (T012913). Dieser
Partial implementiert ausschließlich den Metadatenvertrag und den deterministischen Offline-Audit
aus REQ-BRAIN-FOUNDATION-018/019. Die BATS-Fixtures und Gesamt-Verifikation liegen im
Tests-Partial; hier werden deren RED/GREEN-Kommandos als Abnahmekontrakt verwendet.

Reale Anker im Bestand:

- `scripts/brain-ingest.sh`: `determine_group()` ab Zeile 221 und
  `process_page()` ab Zeile 230. `process_page()` erhält bereits `src_path`, `chunk_file`,
  `chunk_slug` und `index`, berechnet aktuell aber `src_hash` aus dem Chunk und schreibt das
  LLM-Ergebnis direkt mit `echo "$transformed" > "$BRAIN_REPO/wiki/$chunk_slug.md`.
- Das Transform-Ergebnis trägt bereits eine `source::`-Zeile mit dem durch
  `BRAIN_SOURCE_PATH="$src_path"` gesetzten Bachelorprojekt-Pfad. Dieser Pfad bleibt die
  Audit-Verknüpfung zur lokalen Quelle; es wird kein zweites, abweichendes Pfadfeld erfunden.
- `templates/brain/SCHEMA.md` verlangt derzeit nur `type`, `tags`, `status` und beschreibt
  `source::` als optional. Der neue Vertrag ist für neu kompilierte Seiten verbindlich, bleibt
  für Legacy-Seiten aber lesend kompatibel.
- `intel.json` kennt für `scripts/brain-ingest.sh` genau die Signaturen
  `determine_group()` und `process_page()`; die beiden Python-Dateien sind net-new.

## File Structure

| Datei | Ist | Wirksames S1-Budget |
|---|---:|---:|
| `scripts/brain-page-metadata.py` | 0 (neu) | 800 |
| `scripts/brain-lifecycle-audit.py` | 0 (neu) | 800 |
| `scripts/brain-ingest.sh` | 576 | 224 |
| `templates/brain/SCHEMA.md` | 96 | kein S1-Limit für `.md` |

Beide Python-Dateien bleiben mit Wachstumsreserve deutlich unter 800 Zeilen; Zielgrößen sind
höchstens 220 bzw. 420 Zeilen. Der Ingest-Diff bleibt unter 45 Nettozeilen und damit innerhalb
des Budgets 224. Keine Baseline-Datei wird verändert. Der Metadaten-Filter ist über
`brain-ingest.sh`, der Audit über seinen dokumentierten CLI-Vertrag und die Tests erreichbar (S4).

---

## Task P1.1 — RED: ausführbaren Metadaten- und Auditvertrag festnageln

- [x] Vor Implementierung die vom Tests-Partial bereitgestellten fokussierten Fälle ausführen:

```bash
bats tests/spec/brain-knowledge-lifecycle.bats --filter 'metadata|lifecycle audit'
# expected: FAIL — beide Python-Entrypoints fehlen und brain-ingest.sh annotiert Seiten noch nicht.
```

- [x] Die Tests müssen mindestens diese beobachtbaren Verträge prüfen:
  1. Der Metadaten-Filter liest Markdown von stdin und schreibt Markdown auf stdout; Aufruf:
     `python3 scripts/brain-page-metadata.py --source <absolute-source> --source-kind openspec --observed-at 2026-08-19T12:00:00Z --valid-from 2026-08-19`.
  2. Ausgabe enthält im **bestehenden ersten Frontmatter-Block** exakt je eine flache Zeile
     `source_kind`, `source_revision`, `observed_at`, `valid_from`; vorhandene
     `type`/`tags`/`status` und der Body bleiben erhalten. Zweiter identischer Lauf ist
     byte-identisch.
  3. `source_revision` ist der lowercase SHA-256 der vollständigen Quelldatei-Bytes, nicht des
     Chunks und nicht LLM-generiert. Ungültige ISO-Werte, unbekannte `source_kind`-Werte,
     fehlende Quelle und fehlendes Frontmatter enden mit Exit 2 und ohne Teilausgabe.
  4. `python3 scripts/brain-lifecycle-audit.py --brain-repo <fixture> --source-root <fixture>
     --format text` und `--format json` melden ungültige Intervalle, fehlende
     `superseded_by`-Ziele, stale Quellhashes und überlappende unterschiedliche Claims; Legacy-
     Seiten fehlen nicht aus dem Lauf, sondern erhalten `metadata_unknown`.
  5. Vor und nach beiden Audit-Formaten stimmen SHA-256-Inventare des Fixture-Wikis exakt
     überein. Befundfreie Fixtures liefern Exit 0, Findings Exit 1, Usage-/Parsefehler Exit 2.

## Task P1.2 — `scripts/brain-page-metadata.py`: reiner, deterministischer Frontmatter-Filter

- [x] Neue ausführbare Standardbibliothek-CLI mit `argparse` anlegen. Pflichtargumente sind
  `--source`, `--source-kind`, `--observed-at`, `--valid-from`; optional sind `--valid-until`
  und `--superseded-by`. Kontrollierte `source_kind`-Werte:
  `openspec`, `runbook`, `adr`, `gotcha`, `agent-guide`, `core-doc`, `health-goal`,
  `diagram`, `github-reviewed`.
- [x] Pure Helfer mit konkreten Signaturen implementieren:
  `sha256_file(path: Path) -> str`, `parse_timestamp(value: str) -> datetime`,
  `parse_frontmatter(markdown: str) -> tuple[list[str], str]` und
  `apply_metadata(markdown: str, metadata: dict[str, str]) -> str`.
  `parse_timestamp` akzeptiert ISO-8601 mit `Z` oder explizitem Offset; `valid_from` und
  `valid_until` akzeptieren zusätzlich `YYYY-MM-DD`. Wenn beide Grenzen vorhanden sind, gilt
  `valid_from < valid_until`; ein leeres oder umgekehrtes Intervall ist Exit 2.
- [x] `apply_metadata()` arbeitet zeilenbasiert nur im ersten `---`-Block, entfernt dort
  vorhandene Lifecycle-Schlüssel und fügt die Schlüssel in stabiler Reihenfolge direkt nach
  `status` ein: `source_kind`, `source_revision`, `observed_at`, `valid_from`, optional
  `valid_until`, optional `superseded_by`. Werte werden als JSON-kompatible doppelt quotierte
  YAML-Scalars ausgegeben; dadurch können `:` und `#` keine YAML-Struktur erzeugen.
- [x] Der Filter berechnet `source_revision = sha256_file(Path(args.source))`, übernimmt nie
  eine Revision vom LLM oder CLI, bewahrt den finalen Newline-Zustand und gibt bei Fehlern nur
  eine einzeilige Diagnose auf stderr aus. Keine Datei wird direkt geöffnet oder überschrieben;
  stdin/stdout erlauben dem Ingest ein atomisches Tempfile+`mv`.

## Task P1.3 — `scripts/brain-ingest.sh`: Metadaten deterministisch nach der LLM-Ausgabe setzen

- [x] Neben den bestehenden Script-Konstanten `METADATA_SCRIPT="$HERE/brain-page-metadata.py"`
  definieren und mit den vorhandenen `[ -f ... ]`-Preflights fail-closed prüfen.
- [x] Einmal pro Lauf nach der Argumentvalidierung
  `OBSERVED_AT="${BRAIN_OBSERVED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"` setzen und mit dem
  Python-Parser validieren. `BRAIN_OBSERVED_AT` ist der reproduzierbare Test-/Replay-Override;
  alle Chunks desselben Laufs erhalten denselben Wert. `valid_from` ist dessen UTC-Datum.
- [x] `source_kind_for_group()` neben der realen Funktion `determine_group()` ergänzen und die
  Manifestgruppen explizit abbilden: `ssot-specs→openspec`, `runbooks→runbook`, `adr→adr`,
  `gotchas-footguns→gotcha`, `agent-guide-maps→agent-guide`, `core-docs→core-doc`,
  `health-goals→health-goal`, `diagrams→diagram`, `github-reviewed→github-reviewed`.
  Unbekannte Gruppen brechen die Seite ab, statt still `core-doc` zu behaupten.
- [x] In der realen Funktion `process_page()` `src_file="$REPO_ROOT/$src_path"` verwenden und
  nach der vorhandenen Frontmatter-Prüfung das LLM-Ergebnis durch den Filter leiten:
  stdin ist `transformed`, Quelle ist `src_file`, `source-kind` stammt aus dem Mapping,
  Beobachtung und Gültigkeitsstart aus `OBSERVED_AT`. Erst erfolgreiche Filterausgabe in ein
  `mktemp` im Zielverzeichnis schreiben und atomisch nach
  `$BRAIN_REPO/wiki/$chunk_slug.md` verschieben; Filterfehler erhöhen wie LLM-Fehler `FAILED`
  und hinterlassen keine teilweise geschriebene Seite.
- [x] Die bestehende State-Idempotenz bleibt unverändert chunk-basiert. Bei unverändertem Chunk
  wird nicht allein wegen einer neuen Uhrzeit neu geschrieben; bei einer echten Quelländerung
  wird die Revision aus der **vollständigen** Quelle neu berechnet.

## Task P1.4 — `scripts/brain-lifecycle-audit.py`: read-only Text/JSON-Audit

- [x] Neue ausführbare Standardbibliothek-CLI anlegen:
  `--brain-repo <path>` (Pflicht), `--source-root <path>` (Default aktuelles Repo),
  `--format text|json` (Default `text`) und optional `--as-of <ISO-8601>`. Audit-Scope ist
  sortiert `wiki/*.md`; keine rekursive freie
  Dateisuche und keinerlei Schreiboperation.
- [x] Pure Datenstruktur `PageRecord` als `@dataclass(frozen=True)` und Helfer mit Signaturen
  `load_page(path: Path) -> PageRecord`, `interval_overlaps(a: PageRecord, b: PageRecord) -> bool`,
  `collect_findings(pages: list[PageRecord], source_root: Path, as_of: datetime) -> list[dict]`
  implementieren. Frontmatter wird mit einem kleinen Flat-Scalar-Parser gelesen: Strings,
  einfache `[a, b]`-Listen und fehlende Felder; verschachteltes YAML wird als Parsefehler
  gemeldet, nicht geraten.
- [x] Lifecycle-Felder mit derselben ISO-Logik wie der Metadaten-Filter normalisieren. Intervalle
  sind halboffen `valid_from <= as_of < valid_until`; fehlendes `valid_until` bedeutet offen.
  `valid_until <= valid_from` erzeugt `invalid_interval`. Fehlende Lifecycle-Pflichtfelder auf
  Legacy-Seiten erzeugen genau einen `metadata_unknown`-Finding und keine erfundene Zeit.
- [x] `superseded_by` gegen die Menge vorhandener Slugs prüfen. Ein unbekanntes Ziel erzeugt
  `missing_superseded_target` mit `slug` und `target`.
- [x] Den vorhandenen Body-Anker `source:: Bachelorprojekt <relative-path>` strikt parsen. Nur
  Pfade unter dem per `Path.resolve()` kanonisierten `source_root` sind hashbar; Traversal,
  fehlende Quellen oder ein vom aktuellen SHA-256 abweichendes `source_revision` erzeugen
  `source_unavailable` beziehungsweise `stale_source` mit `slug`, `source_path`,
  `recorded_revision`, `current_revision`. Externe/GitHub-Quellen werden nicht als lokale Datei
  interpretiert.
- [x] Claims ausschließlich aus vollständigen Body-Zeilen der Form
  `claim:: <key> = <value>` lesen; Whitespace normalisieren, Schlüssel/Wert dürfen nicht leer
  sein. Für denselben Schlüssel und unterschiedliche Werte entsteht
  `conflicting_claim` nur bei überlappenden Gültigkeitsintervallen; Finding enthält den Key und
  beide sortierten Slugs/Werte. Keine semantische Auswertung freier Prosa.
- [x] Findings deterministisch nach `(code, slug, other_slug, claim_key)` sortieren. JSON ist ein
  Objekt `{schema_version: 1, as_of: ..., summary: {...}, findings: [...]}` mit sortierten Keys;
  Text enthält dieselbe Anzahl und stabile Ein-Zeilen-Befunde. Exit 0 = keine Findings,
  Exit 1 = Findings, Exit 2 = Usage oder nicht lesbare/strukturell ungültige Seite.

## Task P1.5 — `templates/brain/SCHEMA.md`: rückwärtskompatiblen Vertrag dokumentieren

- [x] Unter „Frontmatter-Pflichtfelder“ ergänzen: neu kompilierte Seiten tragen die flachen
  Felder `source_kind`, `source_revision`, `observed_at`, `valid_from` sowie optional
  `valid_until`, `superseded_by`; Legacy-Seiten mit nur `type`/`tags`/`status` bleiben gültig
  und werden als unbekannte Lifecycle-Metadaten gemeldet.
- [x] Kontrollierte `source_kind`-Werte, SHA-256-Revision der ursprünglichen Quelle, ISO-8601-
  Formate und das halboffene Intervall `valid_from <= as_of < valid_until` dokumentieren.
  `source:: Bachelorprojekt <path>` bleibt der maschinenlesbare lokale Quellpfad.
- [x] Unter einer kurzen Sektion „Claims und Lifecycle-Audit“ die exakte Syntax
  `claim:: <key> = <value>`, die rein syntaktische Konfliktprüfung und report-only Semantik
  festhalten: Audit verändert, archiviert, löscht oder überschreibt keine Wiki-Seite.

## Task P1.6 — GREEN und lokale Abnahme

- [x] Syntax und CLI-Hilfe prüfen:

```bash
python3 -m py_compile scripts/brain-page-metadata.py scripts/brain-lifecycle-audit.py
bash -n scripts/brain-ingest.sh
python3 scripts/brain-page-metadata.py --help
python3 scripts/brain-lifecycle-audit.py --help
```

- [x] Den fokussierten Vertrag erneut ausführen:

```bash
bats tests/spec/brain-knowledge-lifecycle.bats --filter 'metadata|lifecycle audit'
# expected: PASS
```

- [x] S4 und Report-only-Verhalten zusätzlich prüfen: `rg -n 'brain-page-metadata.py|brain-lifecycle-audit.py' scripts/brain-ingest.sh tests/spec/brain-knowledge-lifecycle.bats`
  liefert für beide Entrypoints Treffer; der BATS-Test vergleicht die Hash-Inventare vor/nach
  Text- und JSON-Audit.

## Scope-Grenzen

- Keine Retrieval-Filter, Ranking- oder MCP-Änderungen.
- Keine GitHub-Fetch-/Approve-Pipeline und keine Manifest-Allowlist dieses Partials.
- Keine automatische Konsolidierung, Mutation, Löschung oder Archivierung durch den Audit.
- Keine freie-Prosa- oder LLM-basierte Widerspruchserkennung und keine Graphdatenbank.
- Keine Änderungen an Tests, Manifesten, Baselines oder anderen Dateien in diesem Partial.
