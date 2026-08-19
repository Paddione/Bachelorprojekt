---
title: Brain Knowledge Lifecycle — Offline Contract Tests
ticket_id: T012913
domains: [test, dev-tooling, brain]
status: draft
role: tests
depends_on: [p1, p2, p3, p4]
target_files:
  - tests/fixtures/brain/retrieval-eval.jsonl
  - tests/spec/brain-foundation/knowledge-lifecycle.bats
  - tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats
  - tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
  - components/website/src/data/test-inventory.json
---

# brain-knowledge-lifecycle — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Effektives Budget |
|---|---:|---:|
| `tests/fixtures/brain/retrieval-eval.jsonl` | 0 (neu) | nicht S1-limitiert laut Intel (`.jsonl`) |
| `tests/spec/brain-foundation/knowledge-lifecycle.bats` | 0 (neu) | nicht S1-limitiert laut Intel (`.bats`) |
| `tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats` | 378 | nicht S1-limitiert laut Intel (`.bats`) |
| `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats` | 0 (neu) | nicht S1-limitiert laut Intel (`.bats`) |
| `components/website/src/data/test-inventory.json` | 5594 | nicht S1-limitiert laut Intel (`.json`) |

Dieser abschließende Test-Partial beginnt erst, nachdem p1, p2, p3 und p4 ihre Implementierung
bereitstellen. Er ändert ausschließlich die fünf oben genannten Pfade. Alle Tests verwenden
temporäre Repo-/Wiki-/State-Verzeichnisse, lokale Fixtures, Stub-Executables und feste Zeitwerte;
Netzwerkzugriff, produktive Brain-Repositories und der echte GitHub-Endpunkt bleiben unberührt.
Das generierte Testinventar wird ausschließlich mit dem Repository-Task aktualisiert und nicht
manuell editiert. Keine Baseline- oder Ignore-Ausnahme wird angelegt.

## Tasks

### Task P5.1 — Rotphase für den vollständigen Lifecycle-Vertrag festhalten

- [ ] Vor Änderungen an den Testdateien die von den Implementierungs-Partials benannten
  Vertragsfilter gegen den Stand ohne die neuen Fälle ausführen und anschließend nach Anlage
  der Tests mindestens einen absichtlich noch nicht erfüllten Fall gegen die vorangehende
  Implementierung ausführen:

  ```bash
  bats tests/spec/brain-foundation/knowledge-lifecycle.bats --filter 'metadata|lifecycle audit|expertise'
  bats tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats --filter 'optional filters|as_of|provenance|exactly brain_search and brain_read'
  bats tests/spec/brain-k4-brain-wiki/retrieval-eval.bats --filter 'reproducible metrics'
  ```

  `expected: FAIL` — vor dem Change fehlen die Lifecycle-/Expertise-Bundles, die erweiterten
  Retrieval-Verträge und der Offline-Eval-Runner. Den roten Exitstatus im Ausführungsprotokoll
  festhalten; keine Assertion abschwächen, um die Rotphase zu umgehen.

### Task P5.2 — Deterministische Metadaten- und report-only Audit-Verträge testen

- [ ] `tests/spec/brain-foundation/knowledge-lifecycle.bats` mit Fixture-Buildern für ein
  temporäres Quell-Repo und Wiki anlegen. Für dieselbe Quelle zweimal Metadaten erzeugen und
  byte-identische Ausgabe sowie flache Felder `source_kind`, SHA-256-`source_revision`,
  `observed_at` und `valid_from` behaupten. Eine Legacy-Seite mit ausschließlich
  `type`/`tags`/`status` muss weiterhin lesbar sein und genau ein `metadata_unknown` erhalten,
  ohne erfundene Zeitangabe.
- [ ] Feste ISO-8601-Werte verwenden und die halboffene Grenze
  `valid_from <= as_of < valid_until` abdecken: `as_of == valid_from` ist gültig,
  `as_of == valid_until` nicht. Zusätzlich `invalid_interval`, unbekanntes
  `superseded_by`, geänderten lokalen SHA-256 als `stale_source` und Traversal als
  `source_unavailable` prüfen.
- [ ] Zwei Seiten mit demselben vollständigen `claim:: <key> = <value>`-Key, verschiedenen
  Werten und überlappenden Intervallen erzeugen. JSON muss `schema_version: 1`, denselben festen
  `as_of`-Wert, Summary und deterministisch nach `(code, slug, other_slug, claim_key)` sortierte
  Findings enthalten; nicht überlappende Claims und claim-ähnliche freie Prosa dürfen keinen
  Konflikt erzeugen. Text- und JSON-Ausgabe müssen dieselbe Finding-Anzahl melden.
- [ ] Vor jedem Audit SHA-256-Inventare aller Wiki-Dateien erfassen und sie nach Text- sowie
  JSON-Lauf exakt vergleichen. Exit 0 ohne Findings, Exit 1 mit Findings und Exit 2 bei Usage
  beziehungsweise strukturell ungültiger Seite prüfen. Damit ist report-only einschließlich
  „kein Ändern, Löschen, Archivieren oder Überschreiben“ als Verhalten statt nur als Meldung
  abgesichert.

### Task P5.3 — Review-gated Expertise, Redaction und Allowlist offline absichern

- [ ] Im selben Foundation-Bundle ein temporäres `gh`-Stub vor `PATH` setzen. Es akzeptiert nur
  die vier erlaubten repo-/PR-gebundenen `gh api`-Formen für Pull, Files, Reviews und Comments,
  protokolliert jeden Aufruf und liefert feste lokale JSON-Antworten. Der Test muss exakt diese
  vier Aufrufe, den SHA-Abgleich und das Fehlen von Suche, `gh pr list`, Organisations- oder
  Autoren-Crawl behaupten; ein unerwarteter Aufruf lässt den Stub fehlschlagen.
- [ ] Fetch-Fixtures mit E-Mail, Token, Bearer/JWT, URL-Userinfo, Private-Key-Block und
  schlüsselwortbasierter Credential-Zuweisung verwenden. Behaupten, dass der externe State nur
  minimierte Rollen und unveränderliche IDs/URLs/Revision enthält, jedes Geheimnis durch den
  typisierten Marker ersetzt ist, ein Textfeld über 20 KiB und die Gesamtevidenz über 2 MiB
  deterministisch gekürzt werden und die Redaction-/Trunkierungszähler stimmen. State-Modus
  `0700`, temporäre/ausgegebene Dateien `0600`, keine Rohantwort oder Teil-Datei nach Fehlern
  sowie Ablehnung eines State-Pfads im Repo prüfen.
- [ ] Den vollständigen `fetch -> stage -> approve`-Pfad testen: `stage` bleibt außerhalb des
  Repos, trägt `status: staged`, konkrete Evidence-IDs und nach erneutem Redactor keine
  Residual-Secrets. Vor Approval darf `brain-ingest-worklist.sh --root <temp-root>` weder fetched
  noch staged ausgeben. Ein fehlendes/falsches Approval-File und ein residualer Fund müssen ohne
  Zielartefakt fehlschlagen.
- [ ] Mit dem exakten Satz
  `APPROVE Paddione/Bachelorprojekt#123@0123456789abcdef0123456789abcdef01234567 review-gated-brain-ingest`
  freigeben. Danach ausschließlich das deterministische approved-Dokument unter
  `docs/brain-expertise/approved/` erwarten und dessen `github-reviewed`-Provenienz,
  vollständige SHA, PR-/Evidence-IDs und Aufnahme als Manifest-Gruppe `github-reviewed`
  prüfen. Byte-identische Wiederholung ist erfolgreich; abweichender Inhalt am selben Schlüssel
  bricht ab und verändert das bestehende Dokument nicht.

### Task P5.4 — MCP-Kompatibilität, exakt zwei Tools und gefilterte Zeitreise testen

- [ ] `tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats` bevorzugt erweitern, statt ein
  zweites MCP-Bundle anzulegen. Das bestehende unfiltrierte Fixture vor der Erweiterung einmal
  mit nur `query` und `top_k` erfassen und dieselbe Treffermenge, Score-Reihenfolge und
  Begrenzung nach der Shared-Index-Extraktion behaupten; `brain_read` muss weiterhin komplettes
  Frontmatter, Body und Pfad liefern.
- [ ] `tools/list` strukturell prüfen: genau zwei Einträge und als sortierte Namen exakt
  `brain_read` und `brain_search`. Im `brain_search`-Schema bleibt `query` das einzige
  Pflichtfeld; `top_k` sowie die optionalen Felder `type`, `tags`, `status`, `source_kind` und
  `as_of` besitzen die vereinbarten Typen. Kein drittes Index-, Filter- oder Freshness-Tool ist
  zulässig.
- [ ] Lokale Wiki-Seiten mit verschiedenen Typen, Tags, Status, Quellenarten und festen
  Gültigkeitsintervallen anlegen. Jeden Filter einzeln und anschließend konjunktiv testen;
  `tags` verlangt alle angeforderten Werte. Mit `as_of` an beiden Intervallgrenzen prüfen, dass
  bekannte ungültige Seiten vor BM25 ausgeschlossen werden, Legacy-Seiten gemäß
  Kompatibilitätspolitik enthalten bleiben und `freshness: unknown` erhalten.
- [ ] Treffer müssen vorhandene Provenienz-/Gültigkeitsfelder unverändert zurückgeben und die
  Frischewerte `current`, `stale`, `future`, `unknown` deterministisch aus dem festen `as_of`
  ableiten. Ungültige `top_k`-, Filter- und `as_of`-Typen müssen JSON-RPC-Fehler statt interner
  Exceptions erzeugen.

### Task P5.5 — Versioniertes Evalset und reproduzierbare Offline-Metriken prüfen

- [ ] `tests/fixtures/brain/retrieval-eval.jsonl` als `schema_version: 1`-Evalset mit festen
  Queries, erwarteten relevanten Slugs und mindestens einem Fall mit Metadatenfiltern anlegen.
  Die Fälle decken einen Treffer auf Rang 1, einen späteren relevanten Rang, keinen relevanten
  Treffer und mindestens einen stale/zeitlich ungültigen Treffer ab, sodass Recall@k, MRR und
  stale-result rate unabhängig voneinander verifiziert werden können.
- [ ] `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats` mit einem vollständig lokalen Wiki-
  Fixture anlegen. Den Runner zweimal mit identischem Wiki, Evalset, festem `--as-of` und `k`
  ausführen; normalisierte Textausgaben und JSON-Ausgaben müssen jeweils byte-identisch sein.
  JSON muss die versionierte Eingabe, Fallzahl, `k`, Recall@k, MRR und stale-result rate mit den
  aus der Fixture exakt berechneten Werten enthalten.
- [ ] Durch ein leeres Stub-Verzeichnis vor `PATH` beziehungsweise explizite Netzwerk-Stubs
  sicherstellen, dass der Runner weder `gh`, `curl` noch `wget` benötigt. Beweisen, dass MCP und
  Eval denselben `scripts/brain-index.py` laden, indem ein identisches gefiltertes Query in beiden
  Pfaden dieselben sortierten Slugs liefert. Ungültiges JSONL, unbekannte Filter und fehlende
  erwartete Slugs müssen mit stabiler Diagnose und Non-zero-Exit enden.
- [ ] Beobachtenden Baseline-Vertrag prüfen: Text und JSON berichten Metriken, aber kein
  Schwellenwert, kein pass/fail aufgrund der Metrikhöhe und keine Netzwerk- oder Wiki-Mutation.
  Nur strukturell/inhaltlich ungültige Eingabe darf den Lauf fehlschlagen.

### Task P5.6 — Grünphase und fokussierte Offline-Abnahme

- [ ] Alle neuen und erweiterten Bundles vollständig ausführen:

  ```bash
  bats tests/spec/brain-foundation/knowledge-lifecycle.bats
  bats tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats
  bats tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
  ```

  Erwartet: alle Metadaten-, Audit-, Expertise-, MCP- und Eval-Verträge sind grün; die Tests
  laufen ohne Netzwerk und hinterlassen keine Dateien außerhalb ihrer temporären Verzeichnisse.

- [ ] Das Testinventar über den autoritativen Generator aktualisieren und das erzeugte
  `components/website/src/data/test-inventory.json` mitcommitten:

  ```bash
  task test:inventory
  git diff --exit-code -- components/website/src/data/test-inventory.json
  ```

  Der zweite Befehl wird nach dem Commit beziehungsweise nach einer unmittelbar wiederholten
  Inventar-Regeneration ausgeführt und belegt deterministische Ausgabe; die JSON-Datei nicht per
  Hand korrigieren.

### Task P5.7 — Finale Change-Gates (muss als letzter Task laufen)

- [ ] Den kompletten Change nach allen abhängigen Partials mit den verbindlichen Gates prüfen:

  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

- [ ] Danach `task test:inventory` einmal wiederholen und `git diff --exit-code --
  components/website/src/data/test-inventory.json` ausführen. Bestätigen, dass keine neue
  Baseline-/Ignore-Ausnahme entstand, alle fünf exklusiven Zielpfade vollständig im Change sind
  und die vier Implementierungs-Partials keine zusätzlichen Testdateien angelegt haben.

## Scope-Grenzen

- Keine Änderung an Implementierung, Taskfiles, Manifesten, Policies, Specs oder Brain-Seiten.
- Keine Live-GitHub-Abfragen, kein produktives Publishing und kein Zugriff auf private Repos.
- Keine automatische Qualitäts-Schwelle für Retrieval; die erste Baseline bleibt report-only.
- Keine semantische/LLM-basierte Konflikterkennung; getestet werden ausschließlich explizite
  `claim::`-Kanten.
