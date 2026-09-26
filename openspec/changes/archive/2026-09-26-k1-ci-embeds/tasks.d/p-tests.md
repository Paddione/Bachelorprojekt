---
title: "p-tests — K1-Testabdeckung hermetisch plus Workflow-Statik"
ticket_id: T900449
domains: [embeddings, ci]
status: active
---

# p-tests — K1-Testabdeckung hermetisch plus Workflow-Statik

Target Files dieses Partials (disjunkt, keine weitere Datei wird hier geändert):
`tests/spec/plan-partials-embedding/build-chunks.bats` (erweitern),
`tests/spec/plan-partials-embedding/coverage-gate.bats` (erweitern),
`tests/spec/plan-partials-embedding/k1-embeds.bats` (neu, genau eine neue Datei).

Delta-Bezug: `specs/openspec-embedding.md` des Changes. Dieses Partial hängt
die p1-Lieferung ein (unified Chunker, Specs/Docs-Quellen, Migration,
Frische-Kriterium) und die p2-Lieferung (Workflow-YAML, Job-Manifest,
Akzeptanzstufen). `tests/spec/plan-partials-embedding/manifest-parser.bats`
und `size-gate.bats` bleiben unangetastet: `parsePartialManifest` und das
Größen-Gate ändern sich nicht. Alle BATS-Fälle sind hermetisch gegen Mocks;
echte DB und echter Cluster erscheinen nur hinter Guards oder als
dokumentierte manuelle Akzeptanz ohne CI-Anspruch.

<!-- vitest: kein neuer Test nötig, weil dieses Partial nur BATS-Dateien ändert und alle Assertions über plain Node plus Shell laufen. -->

## Budgets (B1a, gemessen 2026-09-26)

Messbefehle: `wc -l` pro Datei, `yq '.s1.limits'` auf
`docs/code-quality/gates.yaml` (kein `.bats`-Eintrag — Endung ist
S1-ungated), `jq -r '."S1:<pfad>".metric // "nicht-baselined"'` auf
`docs/code-quality/baseline.json` (alle drei nicht-baselined),
`bash scripts/plan-lint.sh residual_budget <pfad>` (leer für beide
Bestandsdateien), Intel-Subset
`bash scripts/plan-intel-filter.sh k1-ci-embeds <drei target_files>`
(keine `impact_files`, keine `symbols`, grep-basiert mit
Unvollständigkeitswarnung). `plan-lint` B1a prüft nur existierende Dateien
mit gated Endung — hier nicht anwendbar. Die Baseline wächst nicht.

| Datei | Ist | Schwelle |
| `tests/spec/plan-partials-embedding/build-chunks.bats` | 74 | — (S1-ungated), Zielgröße höchstens 170 Zeilen |
| `tests/spec/plan-partials-embedding/coverage-gate.bats` | 156 | — (S1-ungated), Zielgröße höchstens 240 Zeilen |
| `tests/spec/plan-partials-embedding/k1-embeds.bats` | 0 (neu) | — (S1-ungated), Zielgröße höchstens 340 Zeilen |

Zielgrößen sind Konvention mit Reserve (größte Bestands-BATS im Verzeichnis:
`coverage-gate.bats` mit 156; die neue Datei fasst zwölf Fälle plus Kopf),
kein Gate.

## Task 1: build-chunks.bats erweitern — Chunker-Delegation plus Failing-Step

Vier neue `@test`-Fälle ans Dateiende, Bestandsmuster wahren (Shebang und
`REPO`-Ableitung aus `BATS_TEST_DIRNAME` bestehen bereits, jeder Fall mit
Output-Verifikation über `$status` und `$output`):

1. Delegations-Nachweis per Grep: `grep -c 'splitByTokenBudget'` auf
`scripts/openspec-embed.mjs` liefert `0` (Routine aus p1 Task 2 entfernt),
`grep -c 'scs-chunking'` auf dieselbe Datei liefert mindestens 1 (statischer
Modul-Import). Assert auf den exakten Zähler `0` im ersten, auf
`[ "$status" -eq 0 ]` im zweiten Schritt.
2. `chunkSections` teilt im Modul-Budget: per `node --input-type=module`
kurzer Body (`# T` plus wenig Text) ergibt genau einen Chunk, langer Body
(`# T` plus sechshundertmal `Satz. `) ergibt mehr als einen Chunk. Zweiter
Assert: derselbe lange Body mit expliziten Optionen (`targetTokens: 50`,
`overlapTokens: 5`) ergibt strikt mehr Chunks als der Default-Lauf
(Options-Passthrough aus p1 Task 2 bleibt für Tests wirksam).
3. `buildChunks`-Chunks tragen Modul-Budget: für Proposal-, Tasks- und
Partials-Eingabe (Muster des ersten Bestandsfalls) gilt pro Chunk
`estimateTokens(text) <= 512 + 64`, importiert aus
`scripts/lib/scs-chunking.ts`; dazu `fileType` `proposal` und `partial`
jeweils vorhanden. Das belegt den Partials-Zweig über dem unified Chunker.
4. Code-Pfad-Regression: `chunkCode` aus `scs-chunking.ts` über fünfzigmal
`const a = 1;` enthält weiter den Substring (p1-Task-1-Muster als BATS-Fall).
Kein neuer Pfad für Code.

Failing-Step (rot vor, grün nach p1-Implementierung):

```bash
cp scripts/openspec-embed.mjs /tmp/p-tests-keep-embed.mjs
cp scripts/lib/scs-chunking.ts /tmp/p-tests-keep-chunk.ts
git show origin/main:scripts/openspec-embed.mjs > scripts/openspec-embed.mjs
git show origin/main:scripts/lib/scs-chunking.ts > scripts/lib/scs-chunking.ts
bats tests/spec/plan-partials-embedding/build-chunks.bats; echo "rot-exit=$?"
# expected: FAIL — ohne die p1-Umstellung fehlen chunkMarkdown und der
# scs-chunking-Import, splitByTokenBudget existiert noch, die vier neuen
# Fälle laufen rot (die Bestandsfälle bleiben grün).
cp /tmp/p-tests-keep-embed.mjs scripts/openspec-embed.mjs
cp /tmp/p-tests-keep-chunk.ts scripts/lib/scs-chunking.ts
bats tests/spec/plan-partials-embedding/build-chunks.bats; echo "gruen-exit=$?"
```

Akzeptanz:

```bash
bats tests/spec/plan-partials-embedding/build-chunks.bats
echo "bats-exit=$?"
wc -l tests/spec/plan-partials-embedding/build-chunks.bats
```

Erwartet: Exit 0, alle Bestands- plus alle vier Neufälle grün, höchstens
170 Zeilen.

## Task 2: coverage-gate.bats erweitern — Single-Writer plus Gate-Intakt

Drei neue `@test`-Fälle ans Dateiende, gleiches Bestandsmuster:

1. Single-Writer-Zähler: `grep -c 'INSERT INTO knowledge.chunks'` auf
`scripts/openspec-embed.mjs` liefert exakt `1` (ein parametrisierter
Schreibpfad für `embedSlug` und `embedFile` aus p1 Task 3), `grep -c
'const ACTIVE_STATUSES'` liefert exakt `1` (keine zweite Status-Quelle).
2. Gate-Default-Toleranz intakt: per `node --input-type=module` gilt
`completenessGateMessage(gap) === completenessGateMessage(gap, 0.10)` für
einen WARN-Fall (`computeCoverageGap(['a','b','c'], ['a'])`) und einen
OK-Fall (volle Abdeckung); zusätzlich startet die WARN-Meldung mit
`WARN: completeness gate` und nennt den fehlenden Slug (p1-Task-3-Muster).
3. Schreibpfad-Erreichbarkeit ohne DB: Minimal-Change unter `$TMP`
(`proposal.md`, `tasks.md` je mit Frontmatter `ticket_id`/`status`, Muster
des Bestands-Setups), dann `OPENSPEC_EMBED_REPO="$TMP" node
scripts/openspec-embed.mjs --slug <name> --dry-run` — Exit 0, Output
enthält `dry-run` (p1-Task-2-Muster als BATS-Fall, keine DB nötig).

Akzeptanz:

```bash
bats tests/spec/plan-partials-embedding/coverage-gate.bats
echo "bats-exit=$?"
wc -l tests/spec/plan-partials-embedding/coverage-gate.bats
```

Erwartet: Exit 0, alle Bestands- plus alle drei Neufälle grün, höchstens
240 Zeilen.

## Task 3: k1-embeds.bats neu — Quellen, Idempotenz, Migration gegen Mocks

Neue Datei mit Kopf nach BATS-Konvention: Shebang `#!/usr/bin/env bats`,
Kommentar mit SSOT (`openspec/specs/openspec-embedding.md`), Change-Slug
`k1-ci-embeds` und Ticket, `REPO`-Ableitung aus `BATS_TEST_DIRNAME` im
`setup()`-Block wie die Bestandsdateien. Sechs `@test`-Fälle, alle gegen
gemockte `query`/`embed`-Abhängigkeiten nach p1-Muster, keine echte DB:

1. CLI-Flags: `node scripts/openspec-embed.mjs --help` piped durch `grep -E
-- '--path|--source|--all-specs|--all-docs|--migrate-changes'` — Exit 0,
alle fünf Flags genannt (p1 Task 3 plus Task 4).
2. `embedFile` Specs-Pfad: Mock-Gerüst aus p1 Task 3 wörtlich übernehmen
(`query`-Recorder, `embed`-Stub, `log`-Noop),
`relPath: 'openspec/specs/demo.md'`, `source: 'specs_ssot'`. Asserts:
Collection-Anlage nennt `specs_ssot`, ein `DELETE FROM
knowledge.documents` trägt den Pfad in den Params, mindestens ein `INSERT
INTO knowledge.chunks` folgt. Output-Verifikation auf `embedFile OK`.
3. `embedFile` Docs-Pfad plus Metadaten: `relPath: 'docs/adr/demo.md'`,
`source: 'docs'`. Asserts: Params enthalten Pfad, Source und einen
64-stelligen Hex-Hash (`file_hash`), Chunk-Params enthalten
`section_title`, `char_offset` und `file_type` `md_section`.
4. Unbekannte Source schreibt nichts: `embedFile` mit frei erfundenem
Source-Namen loggt eine Warnzeile und erzeugt null `INSERT`-Statements
(Recorder zählt null Treffer, `[ "$status" -eq 0 ]` bleibt).
5. `migrateChanges` Hash-Skip: Mock-Gerüst aus p1 Task 4 wörtlich übernehmen
(`hashStore`, `recordEmbed`-Recorder, Slugs `a` und `b`). Erster Lauf
bettet zwei Slugs ein, zweiter Lauf ohne Änderung null (resumable,
duplikatfrei per Delete+Insert). Output-Verifikation auf `migrate OK`.
6. Quellen-Globs: `grep -c 'openspec/specs/\*.md'`, `grep -c
'docs/adr/\*.md'`, `grep -c 'docs/runbooks/\*.md'` und `grep -c
'SOURCE_DEFS'` auf `scripts/openspec-embed.mjs` liefern je mindestens 1
(flache Globs aus p1 Task 3, kein rekursiver Docs-Glob).

Akzeptanz:

```bash
bats tests/spec/plan-partials-embedding/k1-embeds.bats
echo "bats-exit=$?"
wc -l tests/spec/plan-partials-embedding/k1-embeds.bats
```

Erwartet nach Task 3: Exit 0 für die sechs Fälle. Die Datei wächst in
Task 4 weiter, Endstand höchstens 340 Zeilen.

## Task 4: k1-embeds.bats ergänzen — Statik, Frische-Spot, manuelle Akzeptanz

Sechs weitere `@test`-Fälle an dieselbe neue Datei anhängen (Endstand zwölf
Fälle), plus ein dokumentiertes manuelles Protokoll ohne CI-Anspruch:

1. Workflow-YAML valide: `yq eval '.' .github/workflows/k1-embed.yml` mit
Guard `[ -n "$(command -v yq)" ] || skip 'yq fehlt'` — Exit 0, Output
`yaml OK` per Echo-Assert.
2. Job-YAML valide: `yq eval '.' k3d/k1-embed-job.yaml` mit demselben
yq-Guard.
3. Workflow-Nachweise aus p2 Task 3: `fetch-depth: 2`, `FLEET_KUBECONFIG`
und die Manifest-Referenz `k3d/k1-embed-job.yaml` je mindestens 1 Treffer
(letzterer ist der S4-Nachweis); Negativ-Greps auf DB-Credential-Namen und
auf `setup-node`/`npm` liefern null Treffer (keine DB-Credentials, kein
lokales Embedden auf Runnern).
4. Job-Nachweise aus p2 Task 2: `restartPolicy: OnFailure`,
`ttlSecondsAfterFinished: 3600`, `activeDeadlineSeconds: 5400`,
`automountServiceAccountToken: false` und der Digest-Pin
`node:22-alpine@sha256:` je mindestens 1 Treffer; Brand-Domain-Negativ-Grep
nach p2-Muster liefert null Treffer (Muster aus p2 Task 2 wörtlich
übernehmen, keine neuen Literale).
5. Client-Dry-Run Stufe 1 aus p2 Task 4: `sed`-Substitution mit fiktiven
Werten plus `kubectl apply --dry-run=client -f -` mit Guard `[ -n
"$(command -v kubectl)" ] || skip 'kubectl fehlt'` — erwartet
`client-dry-run OK` ohne Cluster.
6. Frische-Spot-Check aus p1 Task 4 mit Verfügbarkeits-Guard: `[ -n
"${SESSIONS_DATABASE_URL:-}" ] || skip 'keine DB-URL'` plus
Erreichbarkeits-Probe (Kurzeit-Connect, bei Fehler `skip` statt Fail).
Sonst Sonden-Satz per `defaultEmbed` einbetten, pgvector-Cosinus-Query
gegen `knowledge.chunks` über die drei Prosa-Sources, Assert auf
`metadata`-Pfad oder -Slug des Sonden-Inhalts. Dokumentiert im Fallkopf:
CI skippt diesen Fall, er läuft dort, wo eine erreichbare DB existiert.

Manuelle Akzeptanz (kein `@test`, kein CI-Anspruch): Stufen 2 bis 4 aus p2
Task 4 als abzuhakendes Protokoll im Dateikopf-Kommentar der neuen BATS —
Server-Dry-Run gegen den Fleet-Kontext, Cluster-Probelauf mit genau einer
Specs-Datei (`sha-exit=0`, `probe OK`, danach Job plus ConfigMap löschen),
Produktivlauf per Merge oder `workflow_dispatch` mit Voll-Reindex zuerst.

Nach allen Test-Änderungen das Inventar regenerieren und mitcommitten:

```bash
task test:inventory
git status --short components/website/src/data/test-inventory.json
```

Akzeptanz:

```bash
bats tests/spec/plan-partials-embedding/k1-embeds.bats
echo "bats-exit=$?"
bats tests/spec/plan-partials-embedding/build-chunks.bats tests/spec/plan-partials-embedding/coverage-gate.bats tests/spec/plan-partials-embedding/k1-embeds.bats
echo "alle-exit=$?"
wc -l tests/spec/plan-partials-embedding/k1-embeds.bats
```

Erwartet: Exit 0 in beiden Läufen (ohne Tools oder DB laufen die
Guard-Fälle als Skip, nie als Fail; mit Tools und DB sind alle zwölf Fälle
grün), neue Datei höchstens 340 Zeilen.
