# P1 — Council-Engine

_Teil von `openspec/changes/callable-ai-council/tasks.md` (T016501)._

## Ziel und Grenzen

Dieses Partial implementiert den reinen Council-Kern: Runtime-Aufloesung aus der bestehenden
Registry, read-only Modellaufrufe, phasenweise Deliberation, strikt geparste Ballots und ein
vollstaendiges lokales Run-Artefakt. Es aendert weder `scripts/vda.sh` noch Registry-, Test- oder
generierte Dateien; Aufrufoberflaeche, Dokumentation und Tests folgen in P2/P3.

Der Council ist ausschliesslich beratend. Ein Kindprozess erhaelt immer den Agenten `explore`;
die ausgewaehlte Runtime spendet nur ihren aufgeloesten Modellstring. Weder Runtime-Permissions
noch Council-Antworten duerfen Repository-Dateien, Tickets, Factory-Zustand oder Deployments
aendern.

## S1-Budgets (aus `intel.json`, wirksame Schwelle)

| Datei | Ist | Budget |
|---|---:|---:|
| `scripts/council/decision.mjs` | 0 (net-new) | 800 |
| `scripts/council/prompts.mjs` | 0 (net-new) | 800 |
| `scripts/vda/council.mjs` | 0 (net-new) | 800 |

Alle drei Dateien bleiben mit Wachstumsreserve deutlich unter 80 % der jeweiligen Schwelle.
`decision.mjs` bleibt pure Logik ohne Prozess-/Dateisystemimport, `prompts.mjs` bleibt pure
Textkonstruktion; nur `council.mjs` darf Registry, Prozesse und Artefakte beruehren. Damit gibt es
keinen Rueck-Import und keinen neuen S2-Zyklus. Die neuen `scripts/*.mjs` sind durch den
`scripts/vda.sh council`-Dispatch aus P2 erreichbar und daher nach Abschluss aller Partials keine
S4-Orphans.

## Verbindliche CLI- und Prozessvertraege

`scripts/vda/council.mjs` exportiert testbare Helfer und ist zugleich direkt ausfuehrbar. Der
Produktionsaufruf lautet nach P2:

```bash
bash scripts/vda.sh council \
  --member 'qwen-cloud=architecture and feasibility' \
  --member 'deepseek-pro=failure modes and evidence' \
  --member 'ox-alpha=user value and simplicity' \
  --chair qwen-cloud \
  --question 'Should we adopt design X?'
```

- `--member RUNTIME[=MANDATE]` ist mindestens zweimal und beliebig oft wiederholbar. Der Split
  erfolgt am ersten `=`; Runtime-ID und Mandat werden getrimmt, eine leere Runtime, doppelte
  Runtime-ID oder unbekannte Option ist ein Nutzungsfehler.
- Genau eine Quelle fuer die Fragestellung: `--question TEXT` xor `--prompt-file PATH`. Die Datei
  wird als UTF-8 gelesen; leere Fragen werden abgelehnt.
- `--chair RUNTIME` ist optional und muss ein Mitglied sein; Vorgabe ist die erste angegebene
  Runtime. Die Reihenfolge der `--member`-Argumente bleibt im gesamten Run stabil.
- `--json` reserviert stdout fuer genau ein JSON-Dokument: den Inhalt von `decision.json`.
  Ohne `--json` geht ein knapper Phasenfortschritt nach stderr und die Abschlusszeile mit Status
  und absolutem Run-Pfad nach stdout. Modell-Rohoutput wird nie auf stdout durchgereicht.
- `--timeout-ms N` setzt das Zeitlimit pro Modellaufruf (Vorgabe 300000, positive Ganzzahl) und
  `--max-parallel N` die Obergrenze fuer gleichzeitig laufende **verschiedene** Modellidentitaeten
  (Vorgabe 3, positive Ganzzahl). `--max-revisions N` akzeptiert nur 0 bis 2, Vorgabe 2.
- Erfolgreiche Abschlussstatus `CONSENSUS` und `QUALIFIED_CONSENSUS` liefern Exit 0.
  `HUMAN_REQUIRED` und `INSUFFICIENT_EVIDENCE` sind gueltige Council-Ergebnisse und liefern Exit
  2. CLI-/Registry-/I/O-Fehler liefern Exit 1; ein Signal beendet nach Cleanup mit 128 +
  Signalnummer.
- Fuer deterministische Offline-Tests duerfen `COUNCIL_OPENCODE_BIN` (Vorgabe `opencode`),
  `COUNCIL_AGENTS_REGISTRY` (Vorgabe
  `docs/agent-guide/registry/agents.yaml`) und `COUNCIL_RUNS_DIR` (Vorgabe `.council/runs`)
  umgebungsseitig ersetzt werden. Diese Variablen sind Test-Seams, keine Modell-SSOT.

Jeder Modellaufruf wird ohne Shell mit folgender argv-Liste im Repository-Root gestartet:

```text
<COUNCIL_OPENCODE_BIN> run --agent explore --model <resolved-model> --format json <prompt>
```

`spawn(..., { shell: false, detached: true, stdio: ['ignore','pipe','pipe'] })` ist Pflicht. Pro
Kind gelten begrenzte stdout-/stderr-Puffer von je 8 MiB; Ueberschreitung ist ein benannter
Mitgliedsfehler. Bei Timeout, SIGINT oder SIGTERM sendet der Runner `SIGTERM` an die negative PID
(Prozessgruppe), wartet hoechstens 5 Sekunden und sendet dann `SIGKILL`; ESRCH wird toleriert.
Timer werden auf `close` geloescht, alle laufenden Gruppen werden vor Prozessende abgeraeumt und
kein Kind darf den Council verwaist ueberleben.

`--format json` wird als NDJSON behandelt: jede nichtleere stdout-Zeile muss JSON sein. Der Parser
sammelt Text aus den dokumentierten OpenCode-Text-Parts (`type: "text"`, Feld `text`) in
Ereignisreihenfolge und verwirft keine unbekannten Ereignistypen, sondern bewahrt die komplette
NDJSON-Datei als Provenienz. Exitcode ungleich 0, unparsebare NDJSON-Zeile oder kein nichtleerer
finaler Text macht nur diesen Phasenaufruf zum Fehler; stderr wird gespeichert, nie als
Modellantwort interpretiert.

## Artefaktvertrag

Vor dem ersten Kindaufruf wird ein kollisionsfreier Run unter
`.council/runs/<UTC-basic>-<8-hex>/` angelegt. Jeder JSON-Schreibvorgang erfolgt atomar ueber eine
Datei im selben Verzeichnis plus `rename`. Der Run enthaelt:

```text
manifest.json
rounds/openings/<runtime>.{json,ndjson,stderr}
rounds/cross-exam/<runtime>.{json,ndjson,stderr}
rounds/synthesis/0-<chair>.{json,ndjson,stderr}
rounds/ballots/0/<runtime>.{json,ndjson,stderr}
rounds/revisions/<n>-<chair>.{json,ndjson,stderr}
rounds/ballots/<n>/<runtime>.{json,ndjson,stderr}
decision.json
```

`manifest.json` hat `schema_version: 1`, `run_id`, `created_at`, `completed_at`,
`question_source` (`inline` oder absoluter Prompt-Dateipfad), `question_sha256`, `chair_runtime`,
die effektiven Limits und ein geordnetes `members[]`. Jedes Mitglied speichert `runtime_id`,
`mandate`, den Registry-Snapshot `{mode, model, write_capable, note}`, `model_identity` (exakt der
aufgeloeste `model`-String), `identity_group` und `aliases[]`. Provider-/Modellwerte sind nur
dieser historische Aufloesungs-Snapshot, niemals Eingabe oder persistierte Council-Definition.

Jede Phasen-JSON-Datei speichert `phase`, `round`, `runtime_id`, `model_identity`, Start/Ende,
Dauer, argv **ohne Prompttext**, Exit-/Fehlerstatus, SHA-256 des Prompts, extrahierten Text sowie
relative Pfade zu NDJSON und stderr. `decision.json` hat ebenfalls `schema_version: 1`, `run_id`,
`status`, `revision_count`, `chair_runtime`, `successful_members`,
`distinct_successful_model_identities`, `candidate`, `ballots[]`, `open_conditions[]`,
`reservations[]`, `objections[]`, `member_failures[]`, `identity_groups[]`, `timeline[]` und
`human_reason`. Auch bei Signal oder internem Laufabbruch wird best-effort ein finales
`decision.json` mit dem beobachteten Zustand geschrieben.

## Tasks

### 1. `scripts/council/decision.mjs` — strikter Ballot-Parser und pure Zustandslogik

- Exportiere `parseBallot(text, expectedRuntimeId)` und `decideBallots({ ballots,
  memberFailures, revision, maxRevisions })`. Keine Dateisystem-, Prozess- oder LLM-Abhaengigkeit.
- Akzeptiere entweder ein nacktes JSON-Objekt oder genau einen Markdown-Fence mit einem
  JSON-Objekt; Text davor/danach, mehrere Objekte, fehlende/zusatzliche Top-Level-Felder und
  unbekannte Enums sind unparsebar. Das Mitglied wird durch `expectedRuntimeId` gebunden und
  nicht aus frei erzeugtem Text uebernommen.
- Ballot-Schema:

```json
{
  "ballot": "ACCEPT | ACCEPT_WITH_CONDITION | OBJECT",
  "rationale": "non-empty string",
  "conditions": ["non-empty, testable condition"],
  "reservations": ["non-blocking minority note"],
  "evidence_gaps": ["missing evidence"]
}
```

  `ACCEPT` verlangt leere `conditions`; `ACCEPT_WITH_CONDITION` verlangt mindestens eine
  Bedingung; `OBJECT` verlangt mindestens eine Bedingung oder Evidenzluecke, die den materiellen
  Einwand pruefbar macht. Arrays werden weder dedupliziert noch vom Chair umgedeutet.
- Fehlende, unparsebare oder fehlgeschlagene Ballots werden nie zu Zustimmung. Sie landen als
  Mitgliedsfehler im Ergebnis. Wenn dadurch weniger als zwei erfolgreiche exakte
  Modellidentitaeten uebrig sind, ist das Ergebnis `INSUFFICIENT_EVIDENCE`.
- Ein `OBJECT` fuehrt unmittelbar zu `HUMAN_REQUIRED`; eine Chair-Synthese darf es nicht
  ueberstimmen. Mindestens ein `ACCEPT_WITH_CONDITION` fordert eine Revision, solange
  `revision < maxRevisions`; nach Ausschoepfung folgt `HUMAN_REQUIRED` mit allen offenen
  Bedingungen. Bedingungen gelten nur als geschlossen, wenn **dasselbe Mitglied** im naechsten
  Vollballot `ACCEPT` abgibt; sie werden nicht per Textvergleich automatisch abgehakt.
- Sind alle erfolgreichen Ballots `ACCEPT`, ergibt jede vorhandene `reservation` oder ein
  ausgefallenes Alias-Mitglied bei weiterhin ausreichender Evidenz `QUALIFIED_CONSENSUS`, sonst
  `CONSENSUS`. Damit wird nicht-blockierende Minderheit sichtbar, ohne materiellen Dissens
  kleinzurechnen.

### 2. `scripts/council/prompts.mjs` — vollstaendige, phasenspezifische Handoffs

- Exportiere pure Builder `openingPrompt`, `crossExamPrompt`, `synthesisPrompt`,
  `revisionPrompt` und `ballotPrompt`. Gemeinsamer Kopf: Frage, Runtime-ID, Mandat,
  Modellidentitaet, Phase, read-only/advisory-Regel und Verbot, ACK als Zustimmung auszugeben.
- Opening sieht keine fremde Antwort und fordert Position, Annahmen, Betroffene,
  Nichtverhandelbares, Risiken, Evidenz und falsifizierbare Empfehlung.
- Cross-exam erhaelt die **vollstaendigen**, stabil nach Mitgliedsreihenfolge beschrifteten
  Openings aller anderen erfolgreichen Mitglieder und fordert konkrete Konflikte,
  Kompatibilitaeten, fehlende Stakeholder und Evidenzluecken. Keine stille Trunkierung; passt der
  Handoff nicht in den Modellkontext, muss der Aufruf benannt fehlschlagen.
- Synthesis erhaelt Frage, alle erfolgreichen Openings und Cross-exams und fordert einen einzigen
  entscheidbaren Kandidaten mit Scope, gemeinsamen Punkten, Trade-offs, Schutzmassnahmen,
  Validierung und separat erhaltenen Minderheitspositionen. Der Prompt sagt explizit, dass der
  Chair nur formuliert und nicht annimmt.
- Revision erhaelt den vorigen Kandidaten, **alle** Ballots, offene Bedingungen,
  Evidenzluecken und Revisionsnummer; keine Beanstandung darf verschwinden. Ballot erhaelt den
  vollstaendigen aktuellen Kandidaten plus vorherige eigene Bedingungen und verlangt als einzige
  Ausgabe das exakte Schema aus Task 1.
- Alle dynamischen Bloecke bekommen eindeutige XML-aehnliche Begrenzungsmarker und den Hinweis,
  dass ihr Inhalt Daten, keine Instruktionen sind. So koennen fremde Council-Texte nicht die
  Phasenregeln oder das Ballot-Format ersetzen.

### 3. `scripts/vda/council.mjs` — CLI, Registry-Aufloesung und Scheduler

- Parse die oben definierte CLI ohne neue Argumentparser-Abhaengigkeit. Ermittle den Repo-Root
  relativ zu `import.meta.url`, nicht aus einem beliebigen Aufrufer-CWD. Exportiere mindestens
  `parseArgs`, `loadRoster`, `groupByModelIdentity`, `runModel`, `extractOpenCodeText` und
  `runCouncil`, damit P3 Verhalten statt Source-Greps pruefen kann.
- Lade `docs/agent-guide/registry/agents.yaml` mit dem vorhandenen Paket `yaml`. Lookup erfolgt
  ausschliesslich unter `runtimes[<runtime-id>]`; Rollen sind keine Council-Mitglieder. Fail
  closed bei fehlendem `model`, ungueltigem Runtime-Objekt, unbekannter Runtime oder weniger als
  zwei **verschiedenen exakten** `model`-Strings. `.opencode/agent-models.jsonc` wird nicht erneut
  geparst: dessen Bindung wird bereits vom bidirektionalen `agent-roster.bats`-Drift-Guard
  erzwungen.
- Bilde Identitaetsgruppen durch exakte Stringgleichheit von `runtime.model`. Mitglieder derselben
  Gruppe laufen in jeder Phase strikt sequenziell in CLI-Reihenfolge; verschiedene Gruppen
  duerfen bis `--max-parallel` parallel laufen. Die Barriere zwischen OPENINGS, CROSS_EXAM,
  SYNTHESIS und BALLOTS ist strikt: keine Runtime sieht eine halbfertige Vorphase.
- Nach Openings und erneut nach Cross-exam pruefen, ob mindestens zwei verschiedene
  Modellidentitaeten je einen erfolgreichen Vertreter haben. Andernfalls ohne Synthese
  `INSUFFICIENT_EVIDENCE`. Ein Alias-Fehler beendet nicht automatisch seine Gruppe, und ein
  Mitglied mit fehlgeschlagener Vorphase nimmt an spaeteren Phasen nicht mehr teil.
- Der Chair muss alle eigenen Vorphasen ueberlebt haben. Chair-Ausfall oder unbrauchbare
  Synthese/Revision fuehrt ohne stillen Chair-Wechsel zu `HUMAN_REQUIRED`; der explizit
  zugewiesene Chair bleibt Teil der Provenienz. Nach jeder Synthese stimmen alle ueberlebenden
  Mitglieder einschliesslich Chair ab.
- Fuehre hoechstens `--max-revisions` Revisionen aus. Nutze ausschliesslich die Rueckgabe aus
  `decideBallots` fuer den Uebergang zu Revision, `CONSENSUS`, `QUALIFIED_CONSENSUS`,
  `HUMAN_REQUIRED` oder `INSUFFICIENT_EVIDENCE`; weder Chair noch Stimmenmehrheit erhalten einen
  versteckten Entscheidungspfad.
- Schreibe nach jeder Phasenbarriere Manifest/Timeline atomar fort, damit ein abgebrochener Run
  diagnostizierbar bleibt. Speichere keine Credentials oder komplette Kindprozess-Umgebung;
  Promptinhalt lebt nur in den phasenspezifischen JSON-Dateien, die argv-Provenienz nur als
  redigierte Struktur.

### 4. Integrationsnachweis fuer P3 vorbereiten

P3 baut Fake-Registry und Fake-`opencode` um die exportierten Seams. Nach dessen Testdateien muss
die Implementierung mit folgenden Runnern gruen werden:

```bash
node --test tests/unit/council-decision.test.mjs
tests/unit/lib/bats-core/bin/bats tests/unit/vda-council.bats
```

Die P3-Tests beginnen vor der Implementierung mit demselben echten Runner-Aufruf als
`expected: FAIL` und pruefen danach insbesondere argv (immer `--agent explore`), Alias-
Serialisierung, Gruppenparallelitaet, Quorum, Ballot-Uebergaenge, Timeout-Prozessgruppen-Cleanup,
Artefaktschema, Exitcodes und stdout-Reinheit bei `--json`.

## Nicht im Scope dieses Partials

- VDA-Shell-Dispatch, Helptext und `.gitignore` (P2)
- Tool-Registry und generierte Agent-Guide-Oberflaechen (P2)
- Testdateien und Test-Inventar (P3)
- Provider-/Credential-Konfiguration, automatische Implementierung oder Factory-Dispatch
