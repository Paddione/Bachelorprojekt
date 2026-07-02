---
ticket_id: T001473
plan_ref: openspec/changes/openspec-merge-marker-drift/tasks.md
status: active
date: 2026-07-02
---

# openspec-merge Marker-Kollision + ADDED-Duplikat-Guard — Design

## Purpose

`scripts/openspec-merge.mjs` (`applyDelta()`) hat zwei Bugs, die dazu führen, dass
Delta-Merges gegen OpenSpec-SSOT-Dateien entweder still übersprungen werden oder
Requirement-Duplikate erzeugen — ohne dass CI oder der Aufrufer das bemerkt. Konkret
entdeckt bei der Nacharbeit von T001452 (OpenSpec Tracking Cleanup): dessen eigenes
Delta auf `openspec/specs/openspec-workflow.md` wurde nie angewendet, obwohl der
Change bereits als archiviert gilt.

## Root Cause

### Bug 1 — Marker-Kollision verhindert Re-Merge

```js
const marker = `<!-- merged from change delta ${deltaName} on ${today} -->`
if (content.includes(marker)) {
  process.stdout.write(`skip (already merged): ${deltaName}\n`)
  return 0
}
```

`deltaName` ist `basename(deltaPath)`. Nach der Parent-SSOT-Slug-Konvention (T001304)
heißen alle Delta-Spec-Dateien, die dasselbe SSOT-Ziel betreffen, identisch zum
SSOT-Dateinamen (z.B. immer `openspec-workflow.md`). Der Marker hängt somit nur von
Dateiname + Kalendertag ab — nicht vom Change oder vom Delta-Inhalt.

**Konkreter Schaden (2026-07-02, im Zuge von T001452):**
1. `openspec.sh archive openspec-auto-register` (T001389, `done`) merged sein ADDED-Delta
   ("Archive registriert neue Komponenten automatisch in config.yaml") in
   `openspec-workflow.md`, schreibt Marker `on 2026-07-02`.
2. T001452s eigenes Delta (REMOVE derselben Requirement + 4 neue ADDED) hat denselben
   `deltaName` und dasselbe Datum → Marker bereits vorhanden → `skip (already merged)`,
   ohne Fehler.

**Ergebnis:** `openspec-workflow.md` enthält weiterhin die veraltete Requirement über
`config.yaml`-Registrierung (obwohl `registerComponent()`/`checkConfigDrift()`/die
`OpenSpec-Komponenten`-Liste längst entfernt sind); die 4 neuen ADDED-Requirements aus
T001452 fehlen komplett.

### Bug 2 — Kein Duplikat-Guard bei ADDED

```js
if (item.op === 'ADDED') {
  const at = endOfRequirements(lines)
  lines.splice(at, 0, '', ...item.lines)
}
```

Im Gegensatz zu `MODIFIED`/`REMOVED`/`RENAMED` (die `hit` aus `findBlocks()` prüfen und
bei fehlendem Treffer `fail()`en) prüft `ADDED` nie, ob bereits eine Requirement mit
demselben Namen existiert. Ergebnis in `openspec-workflow.md`: 9 exakte
Requirement-Duplikate (z.B. "plan-frontmatter-hook ist idempotent für vollständige
Frontmatter-Blöcke" bei zwei verschiedenen Zeilen).

Ein Scan über alle 55 `openspec/specs/*.md` zeigt dasselbe Muster in 11 weiteren
Dateien (66 Duplikat-Paare gesamt) — das ist **nicht** Teil dieses Fixes (siehe
Non-Goals), sondern als Folge-Ticket T001476 erfasst.

## Goals

- `applyDelta()` erkennt zwei unterschiedliche Deltas gegen dieselbe SSOT-Datei
  zuverlässig als getrennte Merges, unabhängig von Dateiname und Kalendertag.
- `applyDelta()` verweigert (fail-closed, wie MODIFIED/REMOVED/RENAMED) einen ADDED-Block,
  dessen Requirement-Name bereits in der SSOT-Datei existiert.
- `openspec/specs/openspec-workflow.md` ist bereinigt: keine Duplikate mehr, das
  T001452-Delta ist tatsächlich angewendet (REMOVE der Config-Registrierungs-Requirement,
  4 neue ADDED-Requirements vorhanden).
- `task test:openspec`, `task test:all`, `task freshness:check` sind grün.

## Non-Goals

- Keine Bereinigung der 11 weiteren Spec-Dateien mit Requirement-Duplikaten
  (astro-type-check.md, auth-sso.md, backup-pipeline.md, ci-cd.md, grilling-flow.md,
  llm-local-dev.md, loc-budget.md, mediaviewer.md, monitoring-alerts.md,
  newsletter-system.md, software-factory.md) — separates Ticket **T001476**.
- Kein rückwirkendes Neuschreiben bestehender Datum-basierter Marker im Repo-Bestand
  (`on 2026-07-01` etc.) — die bleiben als abgeschlossen markiert, nur neue Merges
  nutzen den neuen Marker-Mechanismus.
- Keine Änderung an `scripts/openspec.sh` (kein neuer CLI-Parameter nötig).

## Vorentscheidungen (Brainstorming)

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | Marker auf Content-Hash des Delta-Texts umstellen (`sha1(delta).slice(0,12)`), Datum entfällt | Kollisionsfrei per Konstruktion, keine CLI-Schnittstellenänderung, kein Risiko eines vergessenen Parameters |
| E2 | ADDED bekommt denselben Duplikat-Guard wie MODIFIED: `fail()` wenn `hit` bereits existiert | Fail-closed statt stillem Duplikat — Konsistenz mit den anderen drei Operationen |
| E3 | Cleanup von `openspec-workflow.md` über das gefixte Tool selbst (`node openspec-merge.mjs apply <archiviertes-T001452-Delta> openspec-workflow.md`), nicht manuell per Edit | Praxis-Nachweis für den Fix; das archivierte Delta unter `openspec/changes/archive/2026-07-02-openspec-tracking-cleanup/specs/openspec-workflow.md` ist unverändert vorhanden |
| E4 | Die 9 Requirement-Duplikate in `openspec-workflow.md`, die NICHT aus dem fehlenden T001452-Merge stammen (ältere Altlast), werden in diesem Fix ebenfalls manuell bereinigt (nicht ins Folge-Ticket verschoben) | Datei ist ohnehin Gegenstand dieses Fixes; die anderen 11 Dateien bleiben separat (T001476) |
| E5 | Kein rückwirkendes Ändern alter Marker | Vermeidet unnötigen Diff-Lärm in Dateien, die korrekt gemerged wurden |

## Architektur / Änderungspunkte

### 1. `scripts/openspec-merge.mjs`
- **Marker (Bug 1):** `today`-Parameter aus der Marker-Berechnung entfernen (bleibt als
  Funktionsparameter für Rückwärtskompatibilität/Signatur, wird aber nicht mehr für den
  Marker verwendet — oder Parameter ganz entfernen, falls keine anderen Aufrufer ihn
  brauchen; `main()` prüfen). Neuer Marker:
  ```js
  import { createHash } from 'node:crypto'
  // ...
  const deltaHash = createHash('sha1').update(delta).digest('hex').slice(0, 12)
  const marker = `<!-- merged from change delta ${deltaName} (${deltaHash}) -->`
  ```
- **ADDED-Guard (Bug 2):**
  ```js
  if (item.op === 'ADDED') {
    if (hit) fail(`${deltaName}: ADDED target '${item.name}' already exists in ${basename(ssotPath)} — use MODIFIED or rename`)
    const at = endOfRequirements(lines)
    lines.splice(at, 0, '', ...item.lines)
  }
  ```

### 2. `scripts/openspec-merge.test.ts`
- Neuer Testfall: zwei unterschiedliche Deltas mit identischem `basename` (simuliert
  Parent-Slug-Konvention) gegen dieselbe SSOT-Fixture gemerged am "selben Tag" (Datum
  spielt jetzt keine Rolle mehr) → beide Inhalte landen in der Datei, kein Skip.
- Neuer Testfall: ADDED-Delta mit einem Requirement-Namen, der in der SSOT-Fixture
  bereits existiert → `applyDelta()` wirft / `process.exit(1)` (bestehendes Testmuster
  für MODIFIED/REMOVED-Fehlerfälle als Vorlage nutzen).
- Bestehender Marker-Test (falls vorhanden) an neues Format anpassen.

### 3. `openspec/specs/openspec-workflow.md` (einmalige Bereinigung)
- Schritt 1: `node scripts/openspec-merge.mjs apply openspec/changes/archive/2026-07-02-openspec-tracking-cleanup/specs/openspec-workflow.md openspec/specs/openspec-workflow.md`
  wendet REMOVE ("Archive registriert neue Komponenten automatisch in config.yaml") und
  die 4 ADDED-Requirements aus T001452 an.
- Schritt 2: manuelle Bereinigung der 9 vorbestehenden Duplikat-Paare (per `grep -n
  '^### Requirement:'` Zeilenpaare identifizieren, inhaltlich vergleichen, jeweils die
  aktuellere/vollständigere Fassung behalten, die andere löschen).

### 4. Scan-Dokumentation
- Ergebnis-Tabelle (11 Dateien, 56 Paare) landet in der PR-Beschreibung mit Verweis auf
  Folge-Ticket **T001476** — keine Code-Änderung an diesen Dateien in diesem Fix.

## Fehlerbehandlung

- ADDED-Duplikat-Guard: harter Fehler (`process.exit(1)`), keine stille Degradierung.
  Fehlermeldung nennt den Requirement-Namen und die Zieldatei, verweist auf MODIFIED
  als Alternative.
- Marker-Kollision kann durch den Hash-Wechsel nicht mehr lautlos auftreten: zwei
  Deltas mit unterschiedlichem Inhalt erzeugen unterschiedliche Hashes → beide werden
  angewendet. Zwei Deltas mit *identischem* Inhalt (Byte für Byte) erzeugen denselben
  Hash → zweiter Merge wird korrekt als idempotent übersprungen (kein Bug, das ist das
  gewünschte Verhalten).

## Testing

- `task test:openspec` (vitest) — inkl. der zwei neuen Testfälle.
- `bash scripts/openspec.sh validate` — muss nach der Bereinigung von
  `openspec-workflow.md` grün sein (keine doppelten Requirement-Namen mehr, valide
  Struktur).
- `task test:changed`, `task freshness:regenerate`, `task freshness:check` im finalen
  Verifikations-Task.
