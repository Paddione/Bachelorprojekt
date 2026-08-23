# Design: spec-atlas

## Goals

- Requirement-granulare Sicht auf die SSOT ohne Änderung an Spec-Dateien,
  Validator oder Merge-Tool.
- Provenance und In-Flight-Sichtbarkeit aus bereits existierenden, mechanisch
  lesbaren Quellen rekonstruieren (keine neue Pflicht-Datenpflege).

## Non-Goals

- Kein Split von Monolith-Specs (`software-factory.md` & Co.) — A1 deferred;
  der Atlas liefert dessen Migrationskarte.
- Keine Website-/JSON-Ausgabe in diesem Change.
- Keine automatische Gruppierungserkennung (Requirement-Namen haben keine
  Präfix-Konvention; Clustering wäre LLM-Arbeit, kein deterministisches Tooling).

## Decisions

### D1 — Generierte View statt SSOT-Restrukturierung

Die contract-flat-Struktur ist Preis für Diff-Fähigkeit, Merge-Determinismus und
Greppability. Drei Tools setzen sie voraus (Validator erzwingt Purpose/
Requirements-H2; Merge-Tool fügt ADDED vor dem nächsten H2 ein; component-map
keyt auf Slug-Ebene). Der Atlas respektiert das: View-Metadaten statt Struktur-
Änderung. Gruppierungs-H2s innerhalb der Requirements-Sektion wurden verworfen,
weil `openspec-merge.mjs:endOfRequirements` dort künftig alle ADDED-Requirements
vor der ersten Gruppe platzieren würde — stille Fehlplatzierung ohne Fehler.

### D2 — Parser-Grammatik geteilt, nicht geforkt

Der Atlas liest Delta-Dateien (Archive + aktiv) mit derselben Sektion-/Heading-
Grammatik wie `scripts/openspec-merge.mjs`. Da `parseDelta(text)` dort bereits
exportiert ist und der CLI-Einstieg über `import.meta.url` abgesichert ist,
importiert `openspec-atlas-lib.mjs` die Funktion direkt — Drift zwischen beiden
Parse-Varianten ist damit konstruktiv ausgeschlossen. Der Paritätstest sichert
zusätzliche ab, dass die Import-Beziehung bestehen bleibt (kein stiller lokaler
Re-Import einer Kopie), und deckt alle vier Ops inklusive RENAMED ab.

### D3 — Artefakt-Pfad docs/spec-atlas.md, Frische über freshness:regenerate

Markdown im Repo (grep-/LLM-freundlich, PR-Diff-sichtbar), erzeugt von einem
Taskfile-Task analog `openspec:status-map` und in `freshness:regenerate`
eingehängt. Damit greift der existierende Freshness-Check (Phase 0 regeneriert,
Diff-Check erkennt Drift) ohne neues Gate. Kein Wall-Clock-Timestamp ins Artefakt
(Determinismus-Anforderung des Freshness-Kommentars in Taskfile.yml).

### D4 — Curated Config statt Heuristik

Gruppierung als einfache YAML/Config neben dem Generator (Slug → Gruppen-Namen,
optional Requirement-Name → Gruppe). Initial kuratiert für die Top-10-Specs;
alles andere fällt in `ungrouped`. Wartungskosten ≈ 0 für unberührte Requirements.

### D5 — Provenance = letztes Ticket je Requirement, aus dem Archiv gescannt

786 Archiveinträge liefern `.ticket` + Delta-Spec; Scan ergibt je Requirement-Namen
die chronologische Touch-Liste. Nur der letzte Eintrag geht ins Artefakt (Größe!),
plus Flag ob ADDED oder MODIFIED. Active Changes liefern zusätzlich In-Flight-
Warnungen. Archivierte Changes vor Einführung der `.ticket`-Pflicht tragen keine
Ticket-ID — diese Scans liefern schlicht keinen Provenance-Eintrag (fail-open,
kein Fehler).

## Trade-offs

- Artefakt-Größe vs Vollständigkeit: nur Last-Touch + Counts, keine Volltexte.
- Scan-Laufzeit: ~930 Verzeichnisse × kleine Dateien, im Sekundenbereich —
  akzeptabel für ein Freshness-Regenerate (aktuell ~9 s Gesamt).
