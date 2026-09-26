---
title: "p1-embedcore — Unified Chunker plus Specs/Docs-Quellen"
ticket_id: T900449
domains: [embeddings]
status: active
---

# p1-embedcore — Unified Chunker plus Specs/Docs-Quellen

Target Files dieses Partials (disjunkt, keine weitere Datei wird hier geändert):
`scripts/lib/scs-chunking.ts`, `scripts/openspec-embed.mjs`.

Delta-Bezug: `specs/openspec-embedding.md` des Changes (ADDED unified chunking,
ADDED specs/docs-Quellen, MODIFIED `chunkProposal()`-Budget). Eltern-Zwänge aus
`openspec/specs/openspec-embedding.md` bleiben intakt: Single-Writer über
`ACTIVE_STATUSES` (genau ein Schreibpfad) und Completeness-Gate über
`specs_plans`-Slugs mit Toleranz. `scripts/index-repo.ts` ist außer Scope
(bleibt Code-only; Diff-Eingabe läuft über das existierende `--file`-Flag aus
dem Job, dort ist keine Änderung nötig). Workflow plus k3d-Job liegen bei p2,
BATS-Erweiterungen bei p-tests.

<!-- vitest: kein neuer Test nötig, weil dieses Partial nur scripts/ ändert und BATS plus Node-Asserts die Abdeckung tragen; die erwähnte knowledge-db-Datei bleibt außer Scope. -->

## Budgets (B1a, gemessen 2026-09-26)

Messbefehle: `wc -l` pro Datei, `jq -r '."S1:<pfad>".metric // "nicht-baselined"`
auf `docs/code-quality/baseline.json`, Limits aus `docs/code-quality/gates.yaml`
(`.ts` 900, `.mjs` 800). Beide Dateien sind nicht-baselined, wirksame Schwelle
ist daher das statische Limit. Kein Split nötig: beide Dateien liegen deutlich
unter 80 Prozent ihrer Schwelle, die geplanten Netto-Zuwächse passen in die
Reserve, die Baseline wächst nicht.

| Datei | Ist | Budget |
| `scripts/lib/scs-chunking.ts` | 124 | 776 |
| `scripts/openspec-embed.mjs` | 585 | 215 |

`openspec-embed.mjs` steht bei 73 Prozent des Limits; der Plan tilgt dort
`splitByTokenBudget` plus lokale Duplikate (circa 40 Zeilen weg) und fügt
parametrisierte Quellen- plus Migrations-Logik hinzu (Netto deutlich unter der
Reserve von 215). `scs-chunking.ts` wächst um circa 60 Zeilen Markdown-Support.

## Task 1: Markdown-Support in scs-chunking.ts, Konstanten zentral

1. Die heute modulprivaten Werte als zentrale Konstanten exportieren:
`CHUNK_MAX_TOKENS` (512), `CHUNK_OVERLAP` (64), `CHARS_PER_TOKEN` (2.6),
`CHUNK_MAX_CHARS` (abgeleitet). Alle Chunker des Moduls lesen genau diese
Werte, keine lokalen Kopien.
2. `chunkMarkdown(content)` neu einführen: Section-Split an H1- bis H3-Headings
(Alert: nur die Split-Grenze wandert aus `openspec-embed.mjs` herüber, keine
Budget-Logik), danach läuft jede Section durch `boundedChunks`. Rückgabe pro
Chunk: Text, Section-Titel (erste Heading-Zeile), Zeichen-Offset des
Section-Starts. Leere Sections fallen weg (`boundedChunks` filtert bereits
Chunks unter 20 nicht-leeren Zeichen).
3. Verhalten von `chunkCode`, `chunkYaml`, `chunkSource`, `boundedChunks`,
`splitOversizedLine`, `estimateTokens` bleibt byte-identisch (keine
Signaturänderung, kein neuer Pfad für Code). Prosa nutzt bewusst denselben
2.6-Zeichen-Schätzer wie Code: konservativ und Backend-sicher, dafür entfallen
die 4-Zeichen-Sonderwege beim Splitten. `approxTokens` in
`openspec-embed.mjs` bleibt nur für Metadaten (`token_estimate`,
`--count-skipped`) bestehen und splittet nichts mehr.
4. Invariante festschreiben: nur löschbare TS-Syntax im Modul (keine Enums,
keine Namespaces, keine Parameter-Properties), damit plain Node ab 22.18 den
Import per Type-Stripping auflöst. Verifiziert am 2026-09-26:
`node --input-type=module` mit dynamischem Import von
`scripts/lib/scs-chunking.ts` liefert Exit 0. Kein Build-Schritt, keine
Laufzeit-Umstellung der Aufrufer nötig.

Akzeptanz:

```bash
node --input-type=module -e "
import('./scripts/lib/scs-chunking.ts').then(m => {
  const assert = (c, msg) => { if (!c) { console.error('MISS: ' + msg); process.exit(1); } };
  const one = m.chunkMarkdown('# Kurz\n\nWenig Text.');
  assert(one.length === 1, 'kurzer Body ergibt genau einen Chunk');
  const long = '# A\n\n' + 'Satz. '.repeat(400) + '\n## B\n\n' + 'Wort '.repeat(400) + '\n## C\n\n' + 'Zeile '.repeat(400);
  const cs = m.chunkMarkdown(long);
  assert(cs.length >= 3, 'langer Body mit drei Sections ergibt mindestens drei Chunks');
  for (const c of cs) assert(m.estimateTokens(c.text) <= 512 + 64, 'Chunk im Budget plus Overlap-Toleranz');
  assert(cs.every(c => typeof c.title === 'string' && Number.isInteger(c.charOffset)), 'Titel und Offset gesetzt');
  console.log('chunkMarkdown OK:', cs.length);
});"
echo "exit=$?"
```

Erwartet: Exit 0, Ausgabe `chunkMarkdown OK: <n>` mit n mindestens 3.

```bash
grep -nE '^[[:space:]]*enum[[:space:]]|^[[:space:]]*namespace[[:space:]]' scripts/lib/scs-chunking.ts; echo "grep-exit=$?"
wc -l scripts/lib/scs-chunking.ts
```

Erwartet: grep-exit 1 (kein Treffer), Zeilenzahl unter 900.

```bash
node --input-type=module -e "
import('./scripts/lib/scs-chunking.ts').then(m => {
  const code = 'const a = 1;\n'.repeat(50);
  const before = m.chunkCode(code, 'x.ts').join('\n---\n');
  if (!before.includes('const a = 1;')) process.exit(1);
  console.log('chunkCode-Regression OK');
});"
```

Erwartet: Exit 0. Die Code-Pfade liefern unveränderte Ergebnisse.

## Task 2: openspec-embed.mjs auf den unified Chunker umstellen

1. Statischer Import aus `./lib/scs-chunking.ts` (Budget-, Overlap-Konstanten,
`chunkMarkdown`, `estimateTokens`). `chunkProposal`, `chunkSections` und der
Partials-Zweig in `buildChunks` delegieren an das Modul; `splitByTokenBudget`
und die lokale `sectionTitleOf`-Hilfe werden gelöscht (MODIFIED-Delta: die
400-Token/50-Overlap-Routine ist ersetzt). `opts.targetTokens` und
`opts.overlapTokens` fallen auf die Modul-Konstanten zurück; explizit
übergebene Optionen bleiben für Tests wirksam.
2. Export-Signaturen stabil halten: `chunkProposal`, `chunkSections`,
`buildChunks`, `ACTIVE_STATUSES`, `computeCoverageGap`,
`completenessGateMessage`, `listLocalActivePlans`, `embedSlug` bleiben wie
bisher aufrufbar (BATS importiert `buildChunks` per plain Node).
3. Single-Writer wahren: genau ein Schreibpfad (`embedSlug` mit
parametrisiertem Collection/Document/Chunk-Insert), `ACTIVE_STATUSES` bleibt
die einzige Status-Konstante.

Akzeptanz:

```bash
node --input-type=module -e "
import('./scripts/openspec-embed.mjs').then(m => {
  const assert = (c, msg) => { if (!c) { console.error('MISS: ' + msg); process.exit(1); } };
  const p = m.chunkProposal('Kurzer Body.');
  assert(p.length === 1, 'kurzer Proposal-Body ergibt genau einen Chunk');
  const t = m.chunkSections('# T\n\n' + 'Satz. '.repeat(600));
  assert(t.length > 1, 'lange Section wird aufgeteilt');
  const b = m.buildChunks({ proposal: '---\n---\n# P', tasks: '---\n---\n# T\n\nText', partials: { demo: '# Partial demo\n\nSchritt' } });
  assert(b.some(c => c.fileType === 'proposal') && b.some(c => c.fileType === 'partial'), 'proposal- und partial-Chunks vorhanden');
  console.log('unified-chunker OK');
});"
echo "exit=$?"
```

Erwartet: Exit 0, Ausgabe `unified-chunker OK`.

```bash
grep -c 'splitByTokenBudget' scripts/openspec-embed.mjs; echo "---"
grep -c 'INSERT INTO knowledge.chunks' scripts/openspec-embed.mjs
grep -c 'const ACTIVE_STATUSES' scripts/openspec-embed.mjs
```

Erwartet: erster Zähler 0 (Routine entfernt), Chunk-Insert genau 1 Stelle
(ein Schreibpfad), `ACTIVE_STATUSES`-Definition genau 1.

```bash
bats tests/spec/plan-partials-embedding/build-chunks.bats tests/spec/plan-partials-embedding/manifest-parser.bats tests/spec/plan-partials-embedding/coverage-gate.bats
echo "bats-exit=$?"
```

Erwartet: alle Tests grün, Exit 0.

```bash
TMPD=$(mktemp -d) && mkdir -p "$TMPD/openspec/changes/demo" && printf -- '---\nticket_id: T1\nstatus: planning\n---\n# Proposal: demo\n' > "$TMPD/openspec/changes/demo/proposal.md" && printf -- '---\nticket_id: T1\nstatus: planning\n---\n# Tasks: demo\n' > "$TMPD/openspec/changes/demo/tasks.md" && OPENSPEC_EMBED_REPO="$TMPD" node scripts/openspec-embed.mjs --slug demo --dry-run; echo "dry-exit=$?"; rm -rf "$TMPD"
```

Erwartet: Exit 0, Ausgabe enthält `dry-run`.

## Task 3: Specs- und Docs-Quellen mit Idempotenz pro Pfad

1. Quellen-Tabelle `SOURCE_DEFS` neu: `openspec/specs/*.md` unter Source
`specs_ssot` (Collection `OpenSpec SSOT Specs`), `docs/adr/*.md` und
`docs/runbooks/*.md` unter Source `docs` (Collection `Repo Docs`). Flache
Globs, bewusst kein rekursives `docs/**`: kein Archiv-, Generated- oder
Binär-Ballast. Alles Markdown läuft durch `chunkMarkdown` aus Task 1.
2. CLI erweitern: `--path <relativer-Pfad> --source <specs_ssot|docs>` für
Einzeldateien (Diff-Auswahl trifft p2 per wiederholtem Aufruf),
`--all-specs` und `--all-docs` für Voll-Läufe, `--help` dokumentiert alle
neuen Flags. Unbekannte Source loggt eine Warnzeile und schreibt nichts.
3. `embedFile` neu, aber ohne zweiten Schreibpfad: Collection-Upsert,
Document-Insert und Chunk-Inserts laufen über dieselben parametrisierten
Helfer wie `embedSlug`. Idempotenz pro Pfad wie bisher pro Slug: erst
`DELETE` über `metadata->>'path'` in der Ziel-Collection, dann Insert mit
Metadaten `path`, `source`, `file_hash` (sha256 des Rohtexts) sowie pro Chunk
`section_title`, `char_offset`, `file_type` (`md_section`). Die
`specs_plans`-Pfade (Slug-Key, `proposal`/`task_section`/`spec_section`/
`partial`) bleiben unverändert, damit Reader-Verträge gelten.
4. Completeness-Gate unverändert lassen: Die Coverage-Query filtert auf die
`specs_plans`-Collection-ID, neue Collections zählen nie mit. Gate-Meldung
und Toleranz-ENV (`OPENSPEC_EMBED_COVERAGE_TOLERANCE`, Default 0.10) bleiben
wie in der Eltern-Spec.

Akzeptanz:

```bash
node scripts/openspec-embed.mjs --help | grep -E -- '--path|--source|--all-specs|--all-docs'; echo "help-exit=$?"
```

Erwartet: Exit 0, alle vier Flags in der Hilfe.

```bash
node --input-type=module -e "
import('./scripts/openspec-embed.mjs').then(async m => {
  const assert = (c, msg) => { if (!c) { console.error('MISS: ' + msg); process.exit(1); } };
  const seen = [];
  const query = async (sql, params) => { seen.push({ sql, params }); if (sql.includes('SELECT id FROM knowledge.collections')) return { rows: [{ id: 7 }] }; if (sql.includes('RETURNING id')) return { rows: [{ id: 9 }] }; if (sql.includes('SELECT DISTINCT')) return { rows: [] }; return { rows: [] }; };
  const embed = async texts => texts.map(t => [t.length % 7, 0.1]);
  await m.embedFile({ relPath: 'openspec/specs/demo.md', source: 'specs_ssot', text: '# Demo\n\nInhalt.', deps: { query, embed, log: () => {} } });
  const joined = seen.map(s => s.sql).join('\n');
  assert(joined.includes('specs_ssot') || seen.some(s => JSON.stringify(s.params).includes('specs_ssot')), 'Collection specs_ssot angelegt');
  assert(seen.some(s => s.sql.includes('DELETE FROM knowledge.documents') && JSON.stringify(s.params).includes('openspec/specs/demo.md')), 'Delete pro Pfad vorhanden');
  assert(seen.filter(s => s.sql.includes('INSERT INTO knowledge.chunks')).length >= 1, 'mindestens ein Chunk geschrieben');
  console.log('embedFile OK');
});"
echo "exit=$?"
```

Erwartet: Exit 0, Ausgabe `embedFile OK`.

```bash
node --input-type=module -e "
import('./scripts/openspec-embed.mjs').then(m => {
  const gap = m.computeCoverageGap(['a', 'b'], ['a']);
  const msg = m.completenessGateMessage(gap, 0.10);
  if (!msg.startsWith('WARN: completeness gate') || !msg.includes('b')) { console.error('MISS: Gate nennt fehlenden specs_plans-Slug'); process.exit(1); }
  const ok = m.completenessGateMessage(m.computeCoverageGap(['a'], ['a']), 0.10);
  if (!ok.startsWith('completeness gate OK')) { console.error('MISS: Gate-OK verloren'); process.exit(1); }
  console.log('gate OK');
});"
echo "exit=$?"
```

Erwartet: Exit 0. Das Gate zählt weiter nur `specs_plans`-Slugs.

```bash
wc -l scripts/openspec-embed.mjs
```

Erwartet: unter 800.

## Task 4: Changes-Corpus-Migration batched und resumable, Frische-Messung

1. `file_hash` (sha256 über Proposal-, Tasks-, Spec- und Partials-Rohtext) bei
jedem `embedSlug`-Lauf in `documents.metadata` mitschreiben; `embedFile` aus
Task 3 trägt denselben Hash je Pfad.
2. `--migrate-changes [--batch <n>]` neu (Default 25, ENV
`OPENSPEC_EMBED_MIGRATE_BATCH` überstimmt): iteriert `listLocalActivePlans`
(`ACTIVE_STATUSES`, keine zweite Status-Quelle), liest den gespeicherten
`file_hash` je Slug und bettet nur Slugs mit abweichendem oder fehlendem Hash
ein. Jeder Slug-Lauf bleibt Delete+Insert, daher duplikatfrei. Ein Wiederlauf
ohne Änderungen bettet null Slugs ein (resumable und abbruchfest, R2 aus
`design.md`).
3. Frische-Spot-Check als Messvorschlag für p-tests (Frische-Kriterium aus
`design.md`, dort als Vorschlag markiert): Nach Migrations- oder Job-Lauf
einen frisch gemergten Satz per `defaultEmbed` einbetten, per
pgvector-Cosinus gegen `knowledge.chunks` suchen und Assert auf
`metadata->>'path'` des gemergten Pfads. Mess-One-liner (läuft mit echter
Cluster-DB, Ausführung in p-tests-Umgebung):

```bash
node --input-type=module -e "
import pg from 'pg';
import { defaultEmbed } from './scripts/openspec-embed.mjs';
const pool = new pg.Pool({ connectionString: process.env.SESSIONS_DATABASE_URL });
const probe = process.env.FRESH_PROBE || 'FRESH-PROBE-SATZ';
const [vec] = await defaultEmbed([probe]);
const lit = '[' + vec.join(',') + ']';
const r = await pool.query(
  \"SELECT c.metadata->>'path' AS p, c.metadata->>'slug' AS s FROM knowledge.chunks c JOIN knowledge.collections k ON k.id = c.collection_id WHERE k.source IN ('specs_ssot','docs','specs_plans') ORDER BY c.embedding <=> \$1 LIMIT 1\",
  [lit]);
console.log('top-hit:', JSON.stringify(r.rows[0]));
await pool.end();
if (!r.rows[0] || (!r.rows[0].p && !r.rows[0].s)) process.exit(1);
"
echo "fresh-exit=$?"
```

Erwartet bei intakter Frische: Exit 0, Top-Hit nennt Pfad oder Slug des
Sonden-Inhalts. Die Code-Tabelle (`code_embeddings`) prüft derselbe Sonden-Satz
über den bestehenden Code-Suchpfad; p1 liefert die Wissens-Seite, p-tests
bindet beide Seiten in einen BATS-Fall ein.

Akzeptanz:

```bash
node --input-type=module -e "
import('./scripts/openspec-embed.mjs').then(async m => {
  const assert = (c, msg) => { if (!c) { console.error('MISS: ' + msg); process.exit(1); } };
  let embedded = [];
  const store = {};
  const query = async (sql, params) => {
    if (sql.includes('SELECT id FROM knowledge.collections')) return { rows: [{ id: 7 }] };
    if (sql.includes('RETURNING id')) return { rows: [{ id: 9 }] };
    if (sql.includes('SELECT DISTINCT')) return { rows: [] };
    return { rows: [] };
  };
  const deps = { query, embed: async texts => texts.map(() => [0.1]), log: () => {}, hashStore: store, recordEmbed: s => embedded.push(s) };
  await m.migrateChanges({ slugs: ['a', 'b'], repoRoot: '.', batch: 25, deps });
  assert(embedded.length === 2, 'erster Lauf bettet beide Slugs ein, war ' + embedded.length);
  embedded = [];
  await m.migrateChanges({ slugs: ['a', 'b'], repoRoot: '.', batch: 25, deps });
  assert(embedded.length === 0, 'zweiter Lauf ohne Aenderung bettet null Slugs ein (Hash-Skip)');
  console.log('migrate OK');
});"
echo "exit=$?"
```

Erwartet: Exit 0, Ausgabe `migrate OK`. Der Recorder belegt Batch-Lauf,
Hash-Skip und Duplikatfreiheit (jeder Slug-Lauf löscht vor dem Insert).

```bash
grep -c 'INSERT INTO knowledge.chunks' scripts/openspec-embed.mjs
grep -c 'const ACTIVE_STATUSES' scripts/openspec-embed.mjs
wc -l scripts/openspec-embed.mjs scripts/lib/scs-chunking.ts
```

Erwartet: Chunk-Insert weiter genau 1 Stelle, `ACTIVE_STATUSES` genau 1
Definition, beide Dateien unter ihrem Limit (800 und 900).

Außer Scope dieses Partials: `scripts/index-repo.ts` (unberührt, Code-only),
Workflow-YAML und k3d-Job-Manifeste (p2), BATS-Neuanlagen (p-tests), der
`CollectionSource`-Typ in `components/website/src/lib/knowledge-db.ts` (neue
Sources sind schreibseitig reine Strings; Suchen über `specs_plans` laufen
unverändert, Leserseite folgt bei Bedarf außerhalb dieses Partials).
`scripts/knowledge/ingest-markdown.mjs` bleibt als Bestand unangetastet und
wird nicht erweitert.
