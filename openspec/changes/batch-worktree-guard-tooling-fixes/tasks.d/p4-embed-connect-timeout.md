# P4 — embed-connect-timeout

Rolle: **impl** (Skript-Fix). Disjunkter Partial des Changes `batch-worktree-guard-tooling-fixes`
(T003988). Dieser Partial liefert ausschließlich den Connect-Timeout + die Timeout-Diagnose in
`scripts/openspec-embed.mjs` — der BATS-Guard mit Rot-Grün-Beweis entsteht in Partial p6
(`tests/spec/batch-worktree-guard-tooling-fixes/embed-connect-timeout.bats`); hier steht der
Rot-Phase-Step, der diesen Test ausführt.

Vertrag (SSOT `openspec/specs/batch-openspec-embed-fixes.md` → Requirement „Port-Kollision
nicht-fatal mit klarer Meldung"; Design D5): bei belegtem DB-Port meldet das Skript die
Kollision als Ursache, hängt nicht, und der Hook-Fehlerpfad (`.githooks/post-commit-embed`,
3×-Retry mit 5 s Delay, endet WARN/nicht-fatal) greift. Kein Change am Embed-Backend, kein
Change am Hook.

Verifizierter Befund (Explorer + Quelltext, pg 8.22 / pg-pool in `node_modules`):

- `scripts/openspec-embed.mjs:375` — `new pg.Pool({ connectionString: conn })` OHNE
  `connectionTimeoutMillis` (pg-Default 0 = unbegrenzt). Der Connect-Hang bei belegtem
  15432-Forward (TCP akzeptiert, PostgreSQL-Handshake kommt nie) blockiert den
  post-commit-Hook unbegrenzt.
- Die bestehende Kollisions-Diagnose (Z. 376–386 im Pool-`error`-Handler, Z. 531–538 im
  `main()`-Catch) prüft nur `err.code === 'ECONNREFUSED' || 'ECONNRESET'` — das ist reine
  Diagnose, kein Timeout. Zusätzlich verifiziert: **ein Connect-Timeout trägt KEINEN `code`** —
  pg-pool wrapped ihn als `Error('Connection terminated due to connection timeout', { cause })`,
  der pg-Client erzeugt `Error('timeout expired')`. Ein Code-only-Check würde den
  Timeout-Fall also verfehlen; die Klassifikation MUSS die Message abdecken.
- Verifiziert (pg-pool `index.js`): Pool-`error`-Events feuern nur für **Idle**-Client-Fehler
  (`makeIdleListener`), NICHT für Connect-Fehler. Die CLI-relevante Diagnose läuft über den
  Reject der ersten `query()` (Z. 391) in den `main()`-Catch (Z. 531–538) — dort ist die
  Timeout-Attribuierung das tragende Stück; der Pool-`error`-Handler wird nur konsistent
  erweitert (Idle-Abbruch-Mitte des Embeds).
- pg 8.22 `client.js`: der Client-Timeout (`_connectionTimeoutMillis`) wird erst in
  `_handleReadyForQuery` gecleart (Z. 372) — er deckt die GESAMTE Connect-Phase inkl.
  PostgreSQL-Handshake ab. Genau dieser Fall ist der 15432-Hänger.
- Muster für die Konfigurierbarkeit: `embedFetchTimeoutMs` (Z. 254,
  `OPENSPEC_EMBED_FETCH_TIMEOUT_MS`, Default 60 s, T002913) — dasselbe Muster für den
  DB-Connect (Default 10 s laut D5; per Env justierbar, damit der BATS-Guard mit 1 s läuft).

---

## File `scripts/openspec-embed.mjs`

| Datei | Ist | Budget |
|---|---|---|
| `scripts/openspec-embed.mjs` | 544 | 256 |

- Sprache: Node ESM · Ist **544** · Baseline: **nicht-baselined** → wirksame Schwelle =
  Limit 800 aus `docs/code-quality/gates.yaml` (`s1.limits .mjs`) → **Budget 256**.
  (Messung: `wc -l` und `jq -r '."S1:scripts/openspec-embed.mjs".metric // "nicht-baselined"'
  docs/code-quality/baseline.json` am 2026-08-14, Stand `main@c145272c9`.) Änderung netto
  ~+10 Zeilen → ~554, weit unter 80 % der Schwelle → kein Split nötig, keine Baseline-Ausnahme.
- Keine neuen Dateien, keine neuen Importe (`pg` ist bereits geladen, Z. ~20), kein
  Orphan-Risiko (S4).

### Task P4.1 — Rot-Phase: BATS-Guard aus p6 läuft rot (unpatched)

Der Guard `tests/spec/batch-worktree-guard-tooling-fixes/embed-connect-timeout.bats` wird von
Partial p6 geliefert und existiert vor der Implementierung (Batch-Reihenfolge „Pro Partial:
Rot-Phase, dann Implementierung", tasks.md Task 1–5). Er führt das Skript gegen einen
stummen TCP-Listener (Black-Hole: akzeptiert, antwortet nie) mit
`SESSIONS_DATABASE_URL=postgres://nouser:nopass@127.0.0.1:<port>/nosuchdb`,
`OPENSPEC_EMBED_DB_CONNECT_TIMEOUT_MS=1000`, `--slug batch-worktree-guard-tooling-fixes`
(der Change hat proposal.md + tasks.d → Chunks werden gebaut, der DB-Connect ist der
Hangpunkt, das Embed-Backend wird nie erreicht) unter `timeout 15s` aus und misst die Zeit.
Auf dem unpatched Skript hängt der Connect (kein Timeout gesetzt) → `timeout` tötet mit
Exit 124 → der Test schlägt fehl.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/batch-worktree-guard-tooling-fixes*
```

**expected: FAIL** — der Test misst am unpatched Verhalten (Exit 124, ≥ 15 s), das der Fix
beheben muss (Positiv-Anker: Exit 0 + Zeitmessung, T002356-M1). Kein Source-Grep, reine
Output-Verifikation (T002448-M4).

Aufwand: ≤ 0,5 h.

### Task P4.2 — Implementierung: connectionTimeoutMillis + Timeout-Diagnose

`scripts/openspec-embed.mjs`, vier Eingriffe (alle um Z. 254/375/379/534):

1. **Konfigurierbarer Connect-Timeout** (Muster wie `embedFetchTimeoutMs`, Z. 254):
   ```js
   const dbConnectTimeoutMs = () =>
     Number(process.env.OPENSPEC_EMBED_DB_CONNECT_TIMEOUT_MS ?? 10_000); // Default 10s (D5)
   ```
2. **Z. 375:** `pool = new pg.Pool({ connectionString: conn, connectionTimeoutMillis: dbConnectTimeoutMs() });`
   — setzt BOTH pg-Client- und pg-pool-Timeout (beide lesen dieselbe Option; der pg-Client
   deckt die Handshake-Phase bis `readyForQuery`, pg-pool wrapped den Fehler).
3. **Klassifikator** (vor `let pool = null;` ablegen):
   ```js
   function isConnectFailure(err) {
     const code = err?.code ?? '';
     return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT'
       || /timeout/i.test(err?.message ?? ''); // pg-pool: 'Connection terminated due to connection timeout'; pg: 'timeout expired'
   }
   ```
   Kommentar dokumentiert, warum die Message nötig ist (Code-only verfehlt den Timeout,
   verifiziert an pg 8.22/pg-pool).
4. **Diagnose an beiden Stellen** auf den Klassifikator umstellen und die Meldung so erweitern,
   dass sie den konkreten Fehlerzustand nennt (SSOT-Requirement „Falsche Ursache korrigieren"):
   - Pool-`error`-Handler (Z. 379–386): Bedingung `isConnectFailure(err)`; Ausgabe nennt Port,
     Fehlerzustand (`err.code ?? err.message` — bei Timeout also die pg-Message) und die
     Port-Kollision als vermutliche Ursache (Stichwort `Port-Kollision` bleibt erhalten).
   - `main()`-Catch (Z. 534): Bedingung `isConnectFailure(err)`; bei Timeout zusätzlich die
     verstrichene Frist nennen („Connect-Timeout nach <ms> ms") plus denselben
     Port-Kollisions-Hinweis. Danach unverändert `best-effort failure (exit 0)` — nicht-fatal
     (SSOT) — und der Hook-Retry-Pfad (3×/5 s, WARN) greift ohne weitere Änderung.
   - ECONNREFUSED/ECONNRESET-Fälle (Sofort-Abbruch) behalten ihren bestehenden Meldungstext.

Netto ~+10 Zeilen. Kein Change an `.githooks/post-commit-embed`, an
`scripts/openspec-embed-local.sh` oder am Backend.

Aufwand: ≤ 1,5 h.

### Task P4.3 — Grün-Phase: Guard läuft grün, Verhalten manuell belegt

1. BATS-Guard erneut ausführen — jetzt erwartet PASS:
   ```bash
   tests/unit/lib/bats-core/bin/bats -r tests/spec/batch-worktree-guard-tooling-fixes*
   ```
   Grün-Bedingungen (die der Test prüft): Exit 0 (nicht-fatal), Elapsed < 8 s bei
   `OPENSPEC_EMBED_DB_CONNECT_TIMEOUT_MS=1000` (Positiv-Anker), stderr-Ausgabe nennt
   `Port-Kollision` und den Timeout (semantischer Substring ohne Zeilenanker, T002716).
2. Stichprobe mit Default-Wert: denselben Lauf OHNE
   `OPENSPEC_EMBED_DB_CONNECT_TIMEOUT_MS` (Default 10 s) — Skript endet innerhalb von
   ≤ 15 s mit Exit 0 und derselben Meldung (belegt D5-Default; kein `code`, nur Message —
   Klassifikator schlägt an).
3. `wc -l scripts/openspec-embed.mjs` — Budget belegt: ≤ ~555, Limit 800, keine
   Baseline-Änderung (Datei nicht baselined; Baseline darf nicht wachsen).

Aufwand: ≤ 0,5 h.
