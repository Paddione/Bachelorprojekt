---
title: "p2 — Node-Parität: Signatur-Fix und Index-Angleichung"
ticket_id: T900448
domains: [brain, node]
status: active
---

# p2 — Node-Parität: Signatur-Fix und Index-Angleichung

Files: `scripts/brain-mcp-node/index.mjs`, `scripts/brain-mcp-node/server.mjs` (target_files dieses Partials; disjunkt zu p1/p3). Die Referenz-Implementierungen `scripts/brain-index.py` und `scripts/brain-mcp-server.py` sind ausschließlich Lese-Kontext (D1 aus design.md) und werden weder geändert noch erweitert.

## S1-Budgets (Messung 2026-09-26, Branch feature/brain-eval-baseline-T900448)

Messbefehle (Pflichtquellen aus plan-quality-gates.md):

```bash
wc -l scripts/brain-mcp-node/index.mjs scripts/brain-mcp-node/server.mjs
for f in scripts/brain-mcp-node/index.mjs scripts/brain-mcp-node/server.mjs; do
  echo -n "$f baseline="; jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json
done
grep -A15 '  limits:' docs/code-quality/gates.yaml
bash scripts/plan-lint.sh residual_budget scripts/brain-mcp-node/index.mjs
bash scripts/plan-lint.sh residual_budget scripts/brain-mcp-node/server.mjs
```

Ergebnis:

| Datei | Ist (wc -l) | S1-Schwelle | Restbudget |
|---|---|---|---|
| `scripts/brain-mcp-node/index.mjs` | 412 | Limit `.mjs` 800, kein Baseline-Eintrag | Restbudget 388 |
| `scripts/brain-mcp-node/server.mjs` | 236 | Limit `.mjs` 800, kein Baseline-Eintrag | Restbudget 564 |

Beide Dateien liegen bei etwa der Hälfte ihres Limits (52 % / 30 %), weit unter der 80-%-Split-Schwelle; die geplanten Deltas (jeweils netto unter +20 Zeilen) passen bequem ins Budget (B1b greift nicht, kein Split nötig). Es entstehen keine neuen Dateien (S4 ohne Befund), keine Brand-Literale werden angefasst (S3 ohne Befund), CQ02- und Vitest-Pflicht greifen außerhalb von `components/website/src` nicht.

## Task 2.1: Crash-Hypothese per echtem Node-Aufruf belegen oder widerlegen (R1)

Kontext: `server.mjs` Zeile 143 ruft `index.search(parsed)` mit dem Argument-Objekt `{query, top_k, page_type, tags, status, source_kind, as_of}` auf; `index.mjs` Zeile 306 erwartet `search(query, topK, filters)`. Das Objekt landet im `query`-Parameter, `_tokenize` ruft `text.match` auf einem Objekt auf. Das Python-Gegenstück `index.search(**parsed)` ist korrekt (Keyword-Splat auf snake_case-Signatur). Dieser Task läuft vor jedem Fix und entscheidet R1 aus design.md.

1. Fixture-Wiki anlegen (flüchtig unter `/tmp`, keine Repo-Datei — Repo-Fixtures gehören zu p1):
   ```bash
   rm -rf /tmp/p2-wiki && mkdir -p /tmp/p2-wiki
   cat > /tmp/p2-wiki/probe.md <<'EOF'
   ---
   type: note
   tags: [test]
   status: active
   ---
   Probe alpha banana content.
   EOF
   cat > /tmp/p2-wiki/dated.md <<'EOF'
   ---
   type: note
   tags: [Alpha]
   status: active
   source_kind: runbook
   valid_from: 2025-01-01
   ---
   Dated banana content here.
   EOF
   ls /tmp/p2-wiki
   ```
   Assertion: Exit 0, zwei Dateien.
2. Server via stdio aufrufen:
   ```bash
   printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"banana","top_k":5}}}' | BRAIN_WIKI_DIR=/tmp/p2-wiki timeout 20 node scripts/brain-mcp-node/server.mjs > /tmp/p2-pre.json
   echo "node-exit=$?"
   cat /tmp/p2-pre.json
   ```
   Assertion: `node-exit=0` (der Prozess antwortet, es ist ein Tool-Fehler, kein Prozess-Absturz).
3. Fehlerantwort asserten:
   ```bash
   node -e "const fs=require('fs');const ms=fs.readFileSync('/tmp/p2-pre.json','utf8').trim().split('\n').map(l=>JSON.parse(l));const r=ms.find(m=>m.id===2);if(!r||!r.error||r.error.code!==-32603||!/text\.match is not a function/.test(r.error.message)){console.error('KEIN-CRASH-BEFUND: '+JSON.stringify(r));process.exit(1)}console.log('crash-belegt: '+r.error.message)"
   echo "assert-exit=$?"
   ```
   Assertion: `assert-exit=0` → Crash-Hypothese belegt, R1 geschlossen, weiter mit Task 2.2. Liefert id 2 stattdessen ein `result` mit Treffern, ist die Hypothese widerlegt: stoppen, Befund sichtbar machen und erst nach Klärung fortfahren.

## Task 2.2: Signatur-Fix in server.mjs auf search(query, topK, filters)

1. In `handleTool` (`server.mjs` Zeile 143) den Fehlaufruf ersetzen:
   ```js
   const results = index.search(parsed.query, parsed.top_k, {
     pageType: parsed.page_type,
     tags: parsed.tags,
     status: parsed.status,
     sourceKind: parsed.source_kind,
     asOf: parsed.as_of,
   });
   ```
   Unbelegte Filter bleiben `undefined` und werden von `_matches` ignoriert (Spiegel des Python-`None`). Keine andere Zeile in `server.mjs` ändern.
2. Akzeptanz (Fixture aus Task 2.1):
   ```bash
   printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"banana","top_k":5}}}' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"banana","top_k":1}}}' '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"x","top_k":"bad"}}}' | BRAIN_WIKI_DIR=/tmp/p2-wiki timeout 20 node scripts/brain-mcp-node/server.mjs > /tmp/p2-post.json
   echo "node-exit=$?"
   node -e "const fs=require('fs');const ms=fs.readFileSync('/tmp/p2-post.json','utf8').trim().split('\n').map(l=>JSON.parse(l));const byId=i=>ms.find(m=>m.id===i);const r2=JSON.parse(byId(2).result.content[0].text);if(!Array.isArray(r2.results)||r2.results.length<1)throw new Error('id2 leer');const r3=JSON.parse(byId(3).result.content[0].text);if(r3.results.length>1)throw new Error('top_k verletzt');const e4=byId(4).error;if(!e4||e4.code!==-32602)throw new Error('kein -32602');console.log('search-ok: '+r2.results.length+' treffer, top_k-ok, argfehler-ok')"
   echo "assert-exit=$?"
   ```
   Assertion: beide Exits 0; id 2 liefert Treffer ohne `error`, id 3 höchstens einen Treffer, id 4 den Code -32602 (ArgumentError-Pfad intakt). Exakte Slug-Werte werden hier noch nicht assertiert (erst nach Task 2.3).

## Task 2.3: index.mjs angleichen — Slug-Key, Tags-Case, asOf-Leerfilter, Diff-Rest

Drei Divergenzen sind per Node-gegen-Python-Lauf auf der Task-2.1-Fixture belegt (Stand 2026-09-26): Slug-Keys sind volle Pfade statt Stämme, Tags matchen case-insensitiv, und Seiten mit `valid_from` fehlen in ungefilterter Suche.

1. Slug-Key auf `path.stem`-Semantik (`index.mjs` Zeile 178): `const stem = filePath.replace(/\.md$/i, "")` ersetzen durch Basename-minus-Suffix (`basename` aus `node:path` importieren). Die Kollisionssemantik (gleicher Stamm in zwei Verzeichnissen, sortiert-letzter gewinnt) entsteht dadurch von selbst wie in Python; `mtimes` bleibt auf vollen Pfaden geschlüsselt wie dort.
2. Tags-Match case-sensitiv (`index.mjs` Zeilen 286–291): die `toLowerCase`-Normalisierung beider Seiten entfernen, exakter Subset-Vergleich als Spiegel von `set(tags).issubset(set(page["tags"]))` in Python.
3. asOf-Leerfilter (`index.mjs` Zeilen 292–294 und 312–323): `_matches` behandelt `asOf: null` (kein `as_of`-Filter gesetzt) heute als gesetzten Filter und stuft `valid_from`-Seiten als `future` ein — Python überspringt bei `None`. Guard auf `undefined` und `null` erweitern, Spiegel des Python-`is not None`.
4. Diff-Rest sweepen: gleiche Fixture, gleiche Queries gegen beide Indizes fahren und jede weitere Divergenz fixen oder mit Messbeleg und Einzeiler-Begründung als Code-Kommentar an der Stelle dokumentieren. Kandidaten aus dem Hand-Diff (Referenz nur lesend):
   - `_tokenize`: JS-`\w` ist ASCII-only, Python-`\w` matcht Unicode (Umlaute) — Probe mit Umlaut-Seite, bei Befund Unicode-Muster angleichen.
   - `parseDateTime`: die Node-Bindestrich-Prüfung akzeptiert naive Datetimes (`2026-06-01T10:00:00`), Python wirft — Probe über `as_of`, bei Befund Offset-Erkennung angleichen.
   - Dateiendung: Node indexiert `.MD` groß, Python-`rglob("*.md")` nicht — Probe mit Groß-Datei, bei Befund case-sensitiv angleichen.
   - Score-Rundung: Python-Bankers gegen `Math.round`-Half-up — Differenzen über 0.0001 müssen gefixt werden, darunter als Float-Toleranzgrund für p3 dokumentieren.
   - `scalar`/Frontmatter-Kanten (Quote-Stripping, `\r\n`, leere Keys): per Probe belegen oder als ungetriggerte Kante mit Grund dokumentieren.
5. Akzeptanz — Paritäts-Sweep Node-gegen-Python (Queries: ungefiltert, `tags` klein und groß, `type`, `as_of` in und außerhalb der Gültigkeit):
   ```bash
   node --input-type=module -e "import('./scripts/brain-mcp-node/index.mjs').then(m=>{const ix=new m.BrainIndex('/tmp/p2-wiki');const q=[['banana',5,{}],['banana',5,{tags:['test']}],['banana',5,{tags:['TEST']}],['banana',5,{pageType:'note'}],['banana',5,{asOf:'2026-09-26'}],['banana',5,{asOf:'2020-01-01'}]];console.log(JSON.stringify(q.map(a=>ix.search(...a).map(r=>({slug:r.slug,score:r.score})))))});" > /tmp/p2-node.json
   echo "node-exit=$?"
   python3 -c "import importlib.util,json;spec=importlib.util.spec_from_file_location('bi','scripts/brain-index.py');bi=importlib.util.module_from_spec(spec);spec.loader.exec_module(bi);ix=bi.BrainIndex('/tmp/p2-wiki');cases=[dict(),dict(tags=['test']),dict(tags=['TEST']),dict(page_type='note'),dict(as_of='2026-09-26'),dict(as_of='2020-01-01')];print(json.dumps([[{'slug':r['slug'],'score':r['score']} for r in ix.search('banana',5,**kw)] for kw in cases]))" > /tmp/p2-py.json
   echo "py-exit=$?"
   node -e "const fs=require('fs');const n=JSON.parse(fs.readFileSync('/tmp/p2-node.json','utf8'));const p=JSON.parse(fs.readFileSync('/tmp/p2-py.json','utf8'));if(n.length!==p.length||n.length===0)throw new Error('leerer sweep');n.forEach((rs,i)=>{const ps=p[i];if(rs.length!==ps.length)throw new Error('trefferzahl query '+i+': '+rs.length+' vs '+ps.length);rs.forEach((r,j)=>{if(r.slug!==ps[j].slug)throw new Error('slug query '+i+': '+r.slug+' vs '+ps[j].slug);if(Math.abs(r.score-ps[j].score)>0.0001)throw new Error('score query '+i+' '+r.slug+': '+r.score+' vs '+ps[j].score)})});if(!n[0].every(r=>!/\\//.test(r.slug)))throw new Error('keine stem-slugs');if(!n[0].some(r=>r.slug==='dated'))throw new Error('dated fehlt ungefiltert');if(n[2].length!==0)throw new Error('TEST matcht');console.log('parity-ok: '+n.length+' queries, slugs identisch, scores <=0.0001')"
   echo "assert-exit=$?"
   ```
   Assertion: alle drei Exits 0; Slugs sind Stämme ohne Pfad, `dated` ist ungefiltert enthalten, `TEST` matcht nicht, Scores weichen höchstens 0.0001 ab.

## Task 2.4: End-to-end-Verifikation des reparierten Servers (Implementierung only)

Kein dauerhafter Test — die Parity-BATS schreibt p3; dieser Task verifiziert nur die Implementierung aus Task 2.2 und 2.3 über den stdio-Pfad.

1. Vollaufruf mit Suche, Filter, Read-by-Stem, Alt-Key und Fehlereingabe:
   ```bash
   cat > /tmp/p2-req.txt <<'EOF'
   {"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"banana","top_k":5}}}
   {"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"banana","top_k":5,"type":"note","tags":["test"],"status":"active","as_of":"2026-09-26"}}}
   {"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"brain_read","arguments":{"slug":"probe"}}}
   {"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"brain_read","arguments":{"slug":"/tmp/p2-wiki/probe"}}}
   {"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"brain_search","arguments":{"query":"x","top_k":"bad"}}}
   EOF
   BRAIN_WIKI_DIR=/tmp/p2-wiki timeout 20 node scripts/brain-mcp-node/server.mjs < /tmp/p2-req.txt > /tmp/p2-e2e.json
   echo "node-exit=$?"
   node -e "const fs=require('fs');const assert=require('assert');const ms=fs.readFileSync('/tmp/p2-e2e.json','utf8').trim().split('\n').map(l=>JSON.parse(l));const byId=i=>ms.find(m=>m.id===i);const s10=JSON.parse(byId(10).result.content[0].text).results.map(r=>r.slug);assert.deepStrictEqual(s10.slice().sort(),['dated','probe']);const s11=JSON.parse(byId(11).result.content[0].text).results.map(r=>r.slug);assert.deepStrictEqual(s11,['probe']);const p12=JSON.parse(byId(12).result.content[0].text);assert.strictEqual(p12.frontmatter.type,'note');assert.match(p12.body,/banana/);assert.strictEqual(byId(13).error.code,-32000);assert.strictEqual(byId(14).error.code,-32602);console.log('e2e-ok: suche+filter+read+altkey+argfehler')"
   echo "assert-exit=$?"
   ```
   Assertion: beide Exits 0; id 10 liefert `dated` und `probe`, id 11 nur `probe` (konjunktive Filter), id 12 liest per Stamm, id 13 meldet -32000 (Pfad-Key der alten Form ist unbekannt), id 14 meldet -32602.
2. Determinismus zweier Läufe:
   ```bash
   BRAIN_WIKI_DIR=/tmp/p2-wiki timeout 20 node scripts/brain-mcp-node/server.mjs < /tmp/p2-req.txt > /tmp/p2-e2e-a.json
   BRAIN_WIKI_DIR=/tmp/p2-wiki timeout 20 node scripts/brain-mcp-node/server.mjs < /tmp/p2-req.txt > /tmp/p2-e2e-b.json
   cmp /tmp/p2-e2e-a.json /tmp/p2-e2e-b.json
   echo "cmp-exit=$?"
   ```
   Assertion: `cmp-exit=0` (byte-identische Antworten bei aufeinanderfolgenden Läufen).

## Akzeptanzkriterien

- Task 2.1 hat die Crash-Hypothese belegt (id-2-Antwort Code -32603 mit `text.match`-Meldung) und damit R1 geschlossen — oder bei Widerlegung gestoppt statt weitergebaut.
- `brain_search` über den Node-Server liefert Treffer, ehrt `top_k` und meldet fehlerhafte Argumente mit -32602; `brain_read` liest per Stamm-Slug und meldet Pfad-Keys als unbekannt.
- Slug-Keys sind Stämme, Tags matchen exakt, `valid_from`-Seiten erscheinen ohne Filter; jede weitere Diff-Divergenz ist gefixt oder mit Messbeleg begründet.
- Der Paritäts-Sweep meldet gleiche Slugs in gleicher Reihenfolge und Scores innerhalb 0.0001; zwei Server-Läufe sind byte-identisch.
- Keine andere Datei wurde angefasst (Python-Referenzen nur lesend, Fixtures gehören zu p1, dauerhafte Tests und Verify-Gates zu p3 bzw. zum Index).
