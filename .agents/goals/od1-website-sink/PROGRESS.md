# Progress: OD-1 Website-Sink einfrieren

Prozent: 100 % (Seams + Fassade + Gate belegt; 1 toter Rest als Issue erfasst)

## Erledigt

### Seams (W2-A)
- `SessionResolver`/`DbSessionResolver` + `AdminPolicy`/`DefaultAdminPolicy`
  extrahiert, per-request Cache, Signaturen identisch; Seams
  `getSessionWithResolver` (auth.ts:406-411) und `clearSessionCache`.
- Commit `c8728c687`, Verifikation `tsc` exit 0 + `auth.test.ts` 33/33
  (4 neue Fail-closed-Tests).

### Call-Site-Migration (MIG, Single-Wave)
- `components/website/src/lib/ports/` (neu, 6 Module): `index`, `session`,
  `policy`, `content`, `coaching`, `brands` — additive Re-Exports der
  Seams/Helfer, keine Verhaltensänderung.
- **9 von 10** Prod-Import-Sites umgestellt (nur Import-Pfad):
  `ingest-book.mts`, `batch-ingest-dir.mts` (inkl. dynamische Importe),
  `classify-book.mts`, `ingest-json.mts`, `build-route-manifest.mjs` (2).
- Commit `c3c2bcec2`, Push `dd3cffc8b..c3c2bcec2`.

### Gate (verbindlich ab jetzt)
- `tests/py/spec/website_sink/test_boundary_no_new_imports.py`:
  literaler Import-Scan der 6 Prod-Caller, `ALLOWLIST` **leer**, `lib/ports`
  als dokumentierte Ausnahme. Fail-closed in **beide** Richtungen: neuer
  Direkt-Import schlägt fehl **und** ein verschwindender Rest erzwingt
  Aufräumen des `STOP_REMAINDER`.
- RED-Beleg: leere Allowlist + Probe → `AssertionError`
  (`found={'scripts/coaching/merge-books.mts': [11]}`), danach GREEN
  `2 passed in 0.02s`.
- Zweiter Test verhindert stillen Rückbau: alle 5 migrierten Dateien müssen
  `lib/ports` referenzieren.

### Verifikation
- `pnpm --dir components/website exec tsc --noEmit` → exit 0.
- Gate-Lauf `bash scripts/pytest-run.sh tests/py -q -rf` →
  **5076 passed, 246 skipped, 6 failed** in 363 s; die 6 sind
  KNOWN-ENV-RED (`bge_role_routes`, `gemma_kv_quant`,
  `gemma_loadout_autorestart_queue`, `opencode_routes_via_proxy`,
  agent-bench `test_loadouts`, `test_commit_signing`-Quota) — **0 neue
  Fehler** gegenüber Baseline.

## Nach-Merge-Befund (ehrlich, inkl. eigenem Fehler)
- CI auf `c3c2bcec2` war **rot**: „Spec shard 2" scheiterte an
  `test_test_inventory_coverage` — die neue Spec-Datei fehlte in
  `components/website/src/data/test-inventory.json`. Ursache: Ich hatte die
  vom Testlauf regenerierte Inventory-Datei als „Side-Effect" verworfen; sie
  ist aber ein **committetes** Artefakt und muss bei jeder neuen Testdatei
  mit. („Spec + Guards" war nur der Aggregator über die Shards.)
- Behoben auf `main` durch den Freshness-Bot-PR **#7231**
  (`e1d5bd7bc`, regenerierte Inventory inkl. `website_sink`-Eintrag);
  lokal verifiziert: `git diff origin/main -- …/test-inventory.json` leer und
  `pytest test_test_inventory_coverage.py tests/py/spec/website_sink/`
  → 10 passed.
- Lehre für Nachfolger: generierte Artefakte nicht pauschal verwerfen —
  `test:inventory` prüft Deckungsgleichheit mit dem Builder-Ergebnis.
- Endstand: `main` = `f0e00b7ff`; CI per `gh run list --commit` geprüft:
  `e1d5bd7bc` 8/8 success (inkl. CI, CodeQL, Build & Deploy Website) und
  `eb9302cba` 7/7 success. `f0e00b7ff` ist der Bot-PR #7235 (nur
  generierte Artefakte, kein Code).

## Rest aufgelöst (#7233, Eigner-Entscheid 2026-11-06)
- Befund: `scripts/coaching/merge-books.mts:11` importierte
  `lib/coaching-merge.ts`, das es nicht gibt (mit der Books-Infrastruktur in
  #849 entfernt, Skript blieb als Orphan zurück; kein Ersatzmodul exportiert
  die 4 Symbole) → **Issue #7233**.
- Aufgelöst in `eb9302cba`: Orphan-Skript gelöscht (105 Zeilen toter Code),
  `STOP_REMAINDER` auf `{}` geleert, `merge-books.mts` aus `CALLERS` entfernt.
- Gate-Härtung statt Lücke: mit zwei leeren Maps wäre der Scanner bei einem
  Regex-Regress still vakuum-grün geworden. Deshalb pinnt der neue dritte
  Test `test_detector_flags_direct_import` den Detektor (statisch + dynamisch
  = Verstoß, `lib/ports` und `//`-Kommentar = kein Verstoß).
- Belege: RED-Probe (temporärer Direkt-Import in `ingest-json.mts`)
  → `1 failed, 2 passed`, `found={'scripts/coaching/ingest-json.mts': [51]}`,
  Datei danach sha256-identisch restauriert; GREEN
  `pytest tests/py/spec/website_sink/` → **3 passed**;
  `test_test_inventory_coverage.py` → 8 passed;
  `node scripts/code-quality/validate.mjs` + `check.mjs`
  → „0 blocking / no new or worsened violations".

## Mess-Methodik (wichtig für Nachfolger)
- `get_architecture(boundaries)` zeigt `llm→website` weiter mit **74** —
  das ist **kein** Migrationserfolg-Maß: die Zahl ist komponentenweites
  Kanten-Fan-out inkl. Test-Helper-Rauschen
  (`components.website.src.lib.graph-utils.test.node` dominiert) und bleibt
  konstant, weil `lib/ports` selbst unter `components/website/src` liegt.
  Verbindliches Maß ist der literale Boundary-Test oben, nicht die
  Komponenten-Kante.
- Serielles `pytest tests/py` wirkt wie ein Hänger (>840 s bei 52 %) —
  immer `scripts/pytest-run.sh` (parallel, ~363 s) nutzen.

## Nächste Schritte
- Keine. (Optional: #7233 schließen und `STOP_REMAINDER` leeren.)

## F3-Follow-up gemergt (2026-11-06)
- PR #7237 (`docs/f3-auth-cache-plan` → `main`) MERGED 23:13 UTC, Merge-SHA `fb9538204` (Head `fd1c6e980`); Required Checks SUCCESS (Unit+Quality Gates, Security Scan, Vitest, Conventional Commits, Spec+Guards).
- Gates 33/33 + 105/105 + `astro check` clean (Phase-Gate PASS); Referenz: `.agents/goals/od1-website-sink/VERIFY-f3-2026-11-06.md`.
- Plan-Record in Git-Historie (`fb9538204`); Branch/Worktree nach Merge entfernt.
