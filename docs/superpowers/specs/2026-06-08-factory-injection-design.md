# Spec: Factory Injection (Notizen/Kontext + Assets)

**Datum:** 2026-06-08
**Branch:** `feature/factory-injection`
**Folge-Spec aus:** T000518 (Fabrikhalle Live-Floor) — die ausdrücklich vertagten Teile C (Notiz-/Kontext-Injektion) + D2 (Asset-Injektion in laufende Tickets).

## Zusammenfassung

Die `/dev-status`-Fabrikhalle (T000518) ist heute read-only. Diese Spec ergänzt die **Schreib-/Rückfluss-Seite**: ein Admin-Beobachter hinterlässt am Ticket **Notizen/Kontext** und **Assets**, die an der **nächsten Phasen-Grenze** in die laufende *oder* nächste Pipeline zurückfließen — ohne Mid-Run-Eingriff.

## Scope & Non-Goals

**In-scope:**
- **C** — Kontext-/Notiz-Injektion: verbindlicher Kontext-Block im Agent-Prompt der nächsten Phase.
- **D2** — Asset-Injektion: Datei wird an der Phasen-Grenze in den Worktree materialisiert, der Implement-Agent nutzt sie.

**Non-Goals:**
- Mid-Run-Interrupt eines laufenden Agents (bewusst verworfen — nicht sauber machbar).
- Direkte Plan-Datei-Mutation (`docs/superpowers/plans/*.md`) — Injektionen wirken als Kontext, der Agent entscheidet die Umsetzung.
- Nicht-Admin-Zugang (das gesamte `/dev-status` ist admin-gated).

## Architektur / Datenfluss

```
Detail-Panel "injizieren" ─┐
  POST /api/factory-floor/[extId]/inject (admin)   ┌─ ticket.sh get-injections --phase X --consume
ticket.sh inject ──────────┴─► tickets.ticket_injections ◄┘   (atomic UPDATE…consumed_at RETURNING)
                                  (consumed_at NULL = offen)            │
                                                                        ▼ pro Phasen-Grenze in pipeline.js
                                          context → Agent-Prompt-Block  │  asset → ${WORK_WT}/assets-inbox/<id>/
```

**Konsum-Modell (Kern-Entscheidung):** An der nächsten Phasen-Grenze, die ein laufender Lauf erreicht, liest die Pipeline die *unkonsumierten* Injektionen, faltet sie in den Phasen-Prompt bzw. materialisiert Assets, und markiert sie `consumed`. Läuft gerade nichts, greift der nächste Dispatch sie auf — *ein* Mechanismus deckt „laufende oder nächste Pipeline" ab. Phasen dauern Minuten → zeitnah genug.

## Datenmodell

### Neu: `tickets.ticket_injections` (idempotent in `initTicketsSchema()`, `website/src/lib/tickets-db.ts`)

| Spalte | Typ | Bedeutung |
|--------|-----|-----------|
| `id` | UUID PK DEFAULT gen_random_uuid() | |
| `ticket_id` | UUID FK → `tickets.tickets(id)` ON DELETE CASCADE | |
| `phase` | TEXT NULL CHECK IN (`scout`,`design`,`plan`,`implement`,`verify`,`deploy`) | Ziel-Phase; **NULL = nächste beliebige Grenze** |
| `kind` | TEXT CHECK IN (`context`,`note`,`asset`) | |
| `title` | TEXT NULL | |
| `content` | TEXT NULL | Notiz/Kontext-Text (App-Cap ~8 KB) |
| `target_files` | TEXT[] NULL | optionales Scoping auf Tasks/Dateien |
| `data_url` | TEXT NULL | Asset inline base64 (wie `ticket_attachments`) |
| `nc_path` | TEXT NULL | Asset extern (große Datei) |
| `filename` | TEXT NULL | Asset-Dateiname |
| `mime_type` | TEXT NULL | |
| `injected_by` | TEXT | `observer`/`admin`/CLI-Label |
| `injected_at` | TIMESTAMPTZ DEFAULT now() | |
| `consumed_at` | TIMESTAMPTZ NULL | **NULL = offen** |

CHECK: für `kind='asset'` muss `data_url IS NOT NULL OR nc_path IS NOT NULL`. Indizes: `(ticket_id, phase)` + partial `(ticket_id) WHERE consumed_at IS NULL`.

## CLI (`scripts/ticket.sh`)

- **`inject`** — `--id <ext> --kind context|note|asset [--phase <p>] [--title ..] [--content ..] [--target-files a,b] [--file <path>]`. Bei `--file`: base64 → `data_url`, MIME-Whitelist + Inline-Cap wie `ticket-attach.sh`. Validate-before-_pgpod (offline-safe für arg-Tests).
- **`get-injections`** — `--id <ext> [--phase <p>] [--consume] [--format json]`. Ohne `--consume`: nur SELECT (read-only, fürs Panel/Debug). Mit `--consume`: **atomar**
  ```sql
  UPDATE tickets.ticket_injections SET consumed_at=now()
  WHERE ticket_id=:uuid AND consumed_at IS NULL AND (phase = :phase OR phase IS NULL)
  RETURNING id, kind, title, content, target_files, data_url, nc_path, filename, mime_type, phase;
  ```

## Pipeline-Konsum (`scripts/factory/pipeline.js`)

Neuer best-effort Helper `consumeInjections(phase)` (analog zu `phaseEvent`, `try/catch`, wirft NIE), aufgerufen **direkt nach** jedem `phaseEvent(phase,'entered')`:
1. `ticket.sh get-injections --id <id> --phase <phase> --consume --format json`.
2. `context`/`note` → ein String-Block, der dem/den Agent-Prompt(s) der Phase vorangestellt wird: *„OPERATOR INJECTED CONTEXT — verbindlich berücksichtigen: …"*. Bei `target_files` im Implement-Loop nur den passenden Tasks beigeben.
3. `asset` → `data_url` dekodieren → `${WORK_WT}/assets-inbox/<ticket-id>/<filename>` schreiben; Pfade im Prompt nennen.
4. Eine Breadcrumb/Telemetrie `phaseEvent(phase,'note','consumed N injection(s)')` → im Detail-Panel sichtbar.

Best-effort: jeder Fehler wird geschluckt, die Pipeline läuft weiter. `assets-inbox/` kommt in `.gitignore` (injizierte Assets landen nie versehentlich im Commit; der Agent kopiert sie bewusst an ihren Zielort, falls gewünscht).

> Hinweis Phasen-Abdeckung: REUSE-Läufe (Factory-aus-dev-flow) durchlaufen Plan(reuse)→Implement→Verify→Deploy; frische Läufe zusätzlich Scout/Design. Der generische Aufruf an *jeder* Grenze deckt beide Pfade ab. NULL-Phase-Injektionen werden an der jeweils nächsten Grenze konsumiert.

## Asset-Materialisierung

Whitelist-MIME + Inline-Cap (10 MB) wie `ticket-attach.sh`. Datei landet in `${WORK_WT}/assets-inbox/<ticket-id>/` — **nicht** im Commit. Der Implement-Agent liest sie als normale Datei (kein DB-Roundtrip).

## Schreib-API + UI

- **`POST /api/factory-floor/[extId]/inject`** — admin-gated (`getSession`+`isAdmin`, Muster wie `website/src/pages/api/admin/tickets/[id].ts`). Body `{ phase?, kind, title?, content?, targetFiles?, file?: { filename, mimeType, dataUrl } }` → INSERT in `ticket_injections`. Content-Cap serverseitig.
- **Detail-Panel** (`website/src/components/FactoryFloor.svelte`): aufklappbarer „Injizieren"-Bereich — Textarea + `kind`-Select + optionale Ziel-Phase + optionaler Datei-Upload (→ data_url). Darunter Liste der Injektionen mit Status **⏳ offen** vs **✓ konsumiert @ Phase**.

## Read-side-Erweiterung

`getTicketDetail` (`website/src/lib/factory-floor.ts`) lädt zusätzlich `injections` (offene + zuletzt konsumierte, LIMIT N). Panel rendert sie als eigene Sektion getrennt von Breadcrumbs/Phasen-Timeline.

## Fehlerbehandlung & Sicherheit

- Admin-only (Schreib-Endpoint + UI hinter `isAdmin`).
- Content-Größen-Cap (App-seitig ~8 KB Text; Asset 10 MB inline).
- `data_url`/MIME-Validierung serverseitig + in der CLI.
- Atomare Consume-Semantik (UPDATE…RETURNING) → kein Doppel-Apply, auch bei parallelen Boundaries.
- Block+Retry einer Phase sieht nur noch *neue* (unkonsumierte) Injektionen.
- Leere Injektionsliste = no-op (kein Prompt-Müll).
- Telemetrie/Konsum best-effort: dürfen Pipeline/dev-flow nie crashen.

## Tests

- **Vitest + pg-mem:** Injection-DAL (insert/list), Consume-Atomarität (zweiter Consume liefert leer), Phase- vs NULL-Targeting, `getTicketDetail` liefert injections, API-Admin-Gate (401 ohne Session).
- **BATS (FA-SF-49+, freie Nummer via `ls tests/local/` prüfen):** `ticket.sh inject`/`get-injections` arg-validation + `--consume` markiert (offline-safe, validate-before-_pgpod).
- **pipeline.js Contract (FA-SF-20-Stil):** `consumeInjections` wird an jeder Phasen-Grenze aufgerufen, ist best-effort (try/catch), schreibt nach `assets-inbox`; `node --check` grün.
- **Playwright-Smoke:** Inject-Form im Detail-Panel rendert + POST-Pfad.

## Offene Punkte für die Plan-Phase

- Genaue Aufruf-Stellen je `phaseEvent(...,'entered')` in `pipeline.js` (REUSE- und Fresh-Pfad) ankern an Strings, nicht Zeilen.
- Prompt-Faltung: globaler Kontext-Block je Phase vs task-spezifisch im Implement-Loop (`target_files`).
- `.gitignore`-Eintrag `assets-inbox/`.
- S1-Line-Ratchet für `pipeline.js`/`ticket.sh` beachten (knapp halten).
- Freie FA-SF-Nummer (FA-SF-48 ist durch T000518 belegt).
