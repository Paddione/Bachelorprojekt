## MODIFIED Requirements

### Requirement: Scout-Quality-Check
<!-- bats: factory-scout-quality.bats -->

The system SHALL evaluate the quality of a Scout-Phase output in two stages:

**Stage 1 (Pre-Gate):** BEFORE invoking `scout.sh`, the system SHALL check the spec content length. If `spec_content` (title + description combined) has fewer than 300 characters, the system SHALL return SCOUT_WEAK with `spec_too_short` immediately, without running the deterministic scout.

**Stage 2 (Post-Gate):** AFTER `scout.sh` completes, the system SHALL check for non-empty `touched_files`, a `spec_content` mit mindestens 300 Zeichen und einem gesetzten `plan_path`. Bei Verletzung eines dieser Kriterien gibt `evaluateScoutQuality` `weak: true` mit dem jeweiligen Reason zurück; bei Erfüllung aller Kriterien `weak: false` und `reasons: []`.

#### Scenario: Pre-Gate fängt zu kurze Spec vor scout.sh-Aufruf *(BATS)*
- **GIVEN** `spec_content` hat weniger als 300 Zeichen
- **WHEN** der Scout-Phase-Quality-Check läuft
- **THEN** der Check gibt SCOUT_WEAK mit `spec_too_short` zurück, OHNE `scout.sh` aufzurufen

#### Scenario: Pre-Gate bei ausreichender Spec -> scout.sh wird ausgeführt *(BATS)*
- **GIVEN** `spec_content` hat mindestens 300 Zeichen
- **WHEN** der Scout-Phase-Quality-Check läuft
- **THEN** der Check lässt `scout.sh` ausführen und wendet Stage 2 (Post-Gate) an

#### Scenario: Leere touched_files -> weak mit touched_files_empty *(BATS)*
- **GIVEN** `touched_files: []`, `spec_content` mit 400 Zeichen, `plan_path: 'p.md'`
- **WHEN** `evaluateScoutQuality({...})` aufgerufen wird
- **THEN** Ausgabe enthält `"weak":true` und `touched_files_empty`

#### Scenario: Spec unter 300 Zeichen -> weak mit spec_too_short *(BATS)*
- **GIVEN** `touched_files: ['a.ts']`, `spec_content: 'short'`, `plan_path: 'p.md'`
- **WHEN** `evaluateScoutQuality({...})` aufgerufen wird
- **THEN** Ausgabe enthält `"weak":true` und `spec_too_short`

#### Scenario: Fehlender plan_path -> weak mit no_plan_path *(BATS)*
- **GIVEN** `touched_files: ['a.ts']`, `spec_content` mit 400 Zeichen, `plan_path: null`
- **WHEN** `evaluateScoutQuality({...})` aufgerufen wird
- **THEN** Ausgabe enthält `"weak":true` und `no_plan_path`

#### Scenario: Vollständige Scout-Ausgabe -> weak:false, reasons:[] *(BATS)*
- **GIVEN** `touched_files: ['a.ts','b.ts']`, `spec_content` mit ≥400 Zeichen, `plan_path: 'docs/plan.md'`
- **WHEN** `evaluateScoutQuality({...})` aufgerufen wird
- **THEN** Ausgabe enthält `"weak":false` und `"reasons":[]`

---

## ADDED Requirements

### Requirement: Scout-Keyword-Extraktion mit N-Gramm-Unterstützung

The system SHALL extract search keywords from the ticket title using bigram (2-word) and trigram (3-word) combinations in addition to single words, to improve file discovery precision. Bigrams SHALL be generated from consecutive word pairs; trigrams from consecutive triples. The system SHALL also split camelCase identifiers into individual words and use filename-stem matching (match against file basenames without extensions).

#### Scenario: Bigrams aus Titel generiert *(BATS)*
- **GIVEN** Titel `"Add OIDC Client Secret Rotation"`
- **WHEN** die Keyword-Extraktion läuft
- **THEN** die extrahierten Keywords enthalten `"oidc-client"`, `"client-secret"`, `"secret-rotation"` als Bigramme

#### Scenario: Trigrams aus Titel generiert *(BATS)*
- **GIVEN** Titel `"Fix OIDC Client Secret Rotation Bug"`
- **WHEN** die Keyword-Extraktion läuft
- **THEN** die extrahierten Keywords enthalten `"oidc-client-secret"` als Trigramm (wenn ≥3 Wörter)

#### Scenario: N-Gramm-Patterns auf 20 begrenzt *(BATS)*
- **GIVEN** ein sehr langer Titel mit vielen möglichen N-Grammen
- **WHEN** die Keyword-Extraktion läuft
- **THEN** maximal 20 N-Gramm-Patterns werden generiert (ältere verworfen)

#### Scenario: CamelCase-Wörter werden in Bestandteile zerlegt *(BATS)*
- **GIVEN** Titel enthält `"OIDCClientConfigSecret"`
- **WHEN** die Keyword-Extraktion läuft
- **THEN** die extrahierten Keywords enthalten `"OIDC"`, `"Client"`, `"Config"`, `"Secret"` als Einzelwörter

### Requirement: LLM-Fallback-Schwellenwertabsenkung

The system SHALL invoke the LLM fallback (`scout-llm-fallback.sh`) when deterministic discovery finds fewer than 2 files (instead of the previous threshold of 4). The LLM prompt SHALL include the already-discovered paths and intermediate grep results so DeepSeek can build on existing findings rather than starting from zero context.

#### Scenario: LLM-Fallback bei nur 1 deterministischem Treffer *(BATS)*
- **GIVEN** deterministic scout findet genau 1 Datei
- **WHEN** SCOUT_LLM_MIN_FILES=2 (default)
- **THEN** der LLM-Fallback wird aufgerufen, um zusätzliche Dateien vorzuschlagen

#### Scenario: LLM-Fallback bei 2+ Treffern nicht aufgerufen *(BATS)*
- **GIVEN** deterministic scout findet 2 oder mehr Dateien
- **WHEN** SCOUT_LLM_MIN_FILES=2 (default)
- **THEN** der LLM-Fallback wird NICHT aufgerufen

#### Scenario: LLM-Prompt enthält deterministische Zwischenergebnisse *(BATS)*
- **GIVEN** deterministic scout hat 1 Datei (`src/auth/oidc-client.ts`) gefunden
- **WHEN** der LLM-Fallback-Prompt generiert wird
- **THEN** der Prompt enthält die bereits gefundenen Pfade als Kontext

### Requirement: Scout-Drift-Feedback-Loop

The system SHALL read historical drift scores and SHALL adjust scout.sh behavior when drift exceeds a threshold. The drift score SHALL be a running average of the last 3 post-merge drift measurements. If drift > 0.5, the system SHALL expand search scope (relax grep from fixed-string `-F` to regex `-E`, include broader file types). If drift > 0.7, the system SHALL apply a 1.5× multiplier to the discovered file count before complexity classification.

#### Scenario: Niedriger Drift -> keine Anpassung *(BATS)*
- **GIVEN** historischer Drift ist 0.2 (unter Threshold 0.5)
- **WHEN** `scout.sh` die Drift-Daten einliest
- **THEN** kein erweiterter Suchmodus; Standardverhalten

#### Scenario: Mäßiger Drift (0.5–0.7) -> erweiterte Suche *(BATS)*
- **GIVEN** historischer Drift ist 0.6 (über Threshold 0.5)
- **WHEN** `scout.sh` die Drift-Daten einliest
- **THEN** grep verwendet regex `-E` anstatt fixed-string `-F`; zusätzliche Dateitypen werden durchsucht

#### Scenario: Hoher Drift (>0.7) -> erweiterte Suche + File-Count-Multiplikator *(BATS)*
- **GIVEN** historischer Drift ist 0.8 (über Threshold 0.7)
- **WHEN** `scout.sh` die Drift-Daten einliest und die Komplexität klassifiziert
- **THEN** grep verwendet erweiterte Suche; der File-Count wird mit 1.5× multipliziert vor der Komplexitätsbestimmung

#### Scenario: Keine Drift-Daten -> Standardverhalten *(BATS)*
- **GIVEN** kein historischer Drift (neues Ticket oder erste Scout-Ausführung)
- **WHEN** `scout.sh` nach Drift-Daten sucht
- **THEN** Default-Drift=0; kein erweiterter Suchmodus
