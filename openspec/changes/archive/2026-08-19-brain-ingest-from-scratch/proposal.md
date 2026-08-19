# Proposal: brain-ingest-from-scratch

## Why

Die Brain-Wiki laesst sich derzeit nicht reproduzierbar neu aufbauen. Wer sie
stale-frei haben will, muss von Hand den State loeschen und `wiki/` leeren — ein
Ablauf, der nirgends steht, nicht geprueft wird und bei jedem Durchlauf anders
ausfallen kann.

Der gemessene Zustand am 2026-08-19 (Repo-Stand 73ca48ccc) zeigt, warum das zaehlt:

```bash
ls ~/brain/wiki/*.md | wc -l                                   # 250 Seiten, Stand 11.08.2026
bash scripts/brain-ingest-worklist.sh --root . \
  --manifest scripts/brain/ingest-sources.yaml | wc -l          # 167 Quellen
bash scripts/brain-ingest-prune.sh --brain-repo ~/brain         # 9 verwaiste Seiten
cat ~/.brain-ingest-state.json                                  # []  — Array statt Objekt
```

Der State ist unbrauchbar: `scripts/brain-ingest.sh:155-157` legt die Datei nur an,
wenn sie **fehlt**, repariert aber keinen falschen Typ. Auf einem Array schlaegt
`jq '.[$k].hash'` fehl, stderr ist unterdrueckt, und der `|| echo ""`-Zweig macht den
Fehlschlag von "noch nicht transformiert" ununterscheidbar. Damit ist auch die
Reverse-Map tot, auf der REQ-BRAIN-FOUNDATION-013 fuer Seiten ohne `source::`-Zeile
aufbaut.

## What

Ein Rebuild-Modus `--from-scratch` in `scripts/brain-ingest.sh` als neue Phase 1b,
zwischen Branch-Checkout im brain-Repo und der LLM-Transformation:

1. **Wiki-Reset** — geloescht wird jede Seite, deren `source::`-Zeile auf
   Bachelorprojekt zeigt. Das Kriterium steht bewusst in der Seite selbst und nicht
   im State, damit der Reset auch bei kaputtem State greift. `source:: self`, fehlende
   `source::`-Zeile und Fremdpraefixe bleiben unangetastet — dieselbe Invariante, die
   REQ-BRAIN-FOUNDATION-013 fuer den Prune festlegt.
2. **State-Reset** — die State-Datei wird auf `{}` gesetzt, unabhaengig von ihrem
   vorherigen Inhalt und Typ.
3. **Voll-Transform** — Phase 2 laeuft unveraendert. Da der State leer ist, entfaellt
   jeder Skip; das ist die Staleness-Garantie, ohne Sonderpfad in `process_page`.

Dazu die Typ-Reparatur der State-Initialisierung (Ticket T012903, blockiert dieses
Change): kuenftig wird nicht nur auf Existenz geprueft, sondern darauf, dass der Inhalt
ein JSON-Objekt ist.

Guards: `--from-scratch` zusammen mit `--pilot` bricht mit Exit 2 ab — die Kombination
loescht alles und baut nur N neu, das Ergebnis waere eine ausgeduennte Wiki statt eines
Piloten. Mit `--dry-run` listet Phase 1b nur und fasst nichts an.

Kein zusaetzliches Sicherheitsnetz: das Skript arbeitet ohnehin auf einem Feature-Branch
im brain-Repo und liefert per PR, geloeschte Seiten stehen also im Diff und sind ueber
git wiederherstellbar.

**Nicht enthalten:** der Rebuild-Lauf selbst (LLM-Transform aller Quellen plus PR gegen
`Paddione/brain`) ist Betrieb. Ebenso die Umstellung des Ingest-Loadouts auf Gemma 4 12B
QAT (Ticket T012905) und die x509-Stoerung des llm-proxy gegen `shared-db`.

_Ticket: T012902_
