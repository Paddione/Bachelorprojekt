---
title: "adr006-sdlc-topologie — Implementation Plan"
ticket_id: T002623
domains: [docs, architecture]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# adr006-sdlc-topologie — Implementation Plan

_Ticket: T002623 (Epic/ADR) · ADR-006 · Kinder: E1 T002624 (gemergt), E2–E6 T002625–T002629_

Ziel: Das ADR/Architektur-Dokument (ADR-006) ist auf den gemessenen Ist-Stand gezogen — die
vier Assets (Import-Graph post-E1, `tickets`-Schema-Analyse, fleet-Last-Beschreibung,
VRAM-Messwerte) sind im ADR verankert, beantwortete „Offene Punkte" sind abgehakt, und die
Epic-Spec `sdlc-isolation` ist als Delta des Changes validiert. Der Nachweis läuft über einen
BATS-Guard, der vor der ADR-Synchronisierung rot ist (Task 1) und danach grün (Task 3).

## File Structure

```
NEU
  openspec/changes/adr006-sdlc-topologie/proposal.md          Epic-Proposal (im Plan-Commit)
  openspec/changes/adr006-sdlc-topologie/design.md            ADR/Architektur-Dokument (im Plan-Commit)
  openspec/changes/adr006-sdlc-topologie/specs/sdlc-isolation.md  Delta auf SSOT-Parent sdlc-isolation
  openspec/changes/adr006-sdlc-topologie/.ticket              T002623 (im Plan-Commit)
  tests/spec/sdlc-isolation/adr006-topologie.bats             RED→GREEN-Guard (Task 1)

GEÄNDERT
  docs/adr/ADR-006-sdlc-isolation-dev-host.md                 Ist-Stand um gemessene Assets ergänzen
```

## Task 1 — BATS-Guard schreiben (RED)

Der Guard gehört nach `tests/spec/sdlc-isolation/adr006-topologie.bats` — dasselbe
Verzeichnis wie der E1-Guard (`build-target-split.bats`), eine Datei pro Vorgang.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/adr006-topologie.bats
# expected: FAIL (rot — die gemessenen Asset-Abschnitte fehlen im ADR noch, Task 2 ergänzt sie)
```

Datei `tests/spec/sdlc-isolation/adr006-topologie.bats` mit folgendem Inhalt anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/sdlc-isolation/adr006-topologie.bats
# SSOT: openspec/changes/adr006-sdlc-topologie/specs/sdlc-isolation.md
# T002623: Nachweis, dass das ADR/Architektur-Dokument den gemessenen Ist-Stand trägt.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  ADR_FILE="$REPO_ROOT/docs/adr/ADR-006-sdlc-isolation-dev-host.md"
  EPIC_SPEC="$REPO_ROOT/openspec/changes/adr006-sdlc-topologie/specs/sdlc-isolation.md"
}

# Struktur-Anker: ADR existiert mit Entscheidung und Etappen.
@test "T002623: ADR-006 existiert mit Entscheidung und Etappen" {
  [ -f "$ADR_FILE" ] || { echo "MISSING ADR: $ADR_FILE"; return 1; }
  grep -qE '^## Entscheidung' "$ADR_FILE" || { echo "MISSING Abschnitt '## Entscheidung'"; return 1; }
  grep -qE '^### Etappen' "$ADR_FILE" || { echo "MISSING Abschnitt '### Etappen'"; return 1; }
}

# Positiv-Anker gegen vakuose Guards: Der neue Asset-Abschnitt fehlt bis Task 2.
@test "T002623: ADR enthaelt Abschnitt 'Gemessene Assets'" {
  grep -qE '^### Gemessene Assets' "$ADR_FILE" \
    || { echo "MISSING Abschnitt '### Gemessene Assets' in $ADR_FILE — Task 2 ausfuehren"; return 1; }
}

# Asset A1: Import-Graph post-E1 (17 geteilte Module, nur Infrastruktur).
@test "T002623: ADR traegt die Import-Graph-Messung (17 geteilte Module)" {
  grep -qE '17 \(5,8 ?%\)' "$ADR_FILE" \
    || { echo "MISSING Import-Graph-Messwert (17 geteilte Module) in $ADR_FILE"; return 1; }
}

# Asset A2: tickets-Schema — keine FK-Kante nach public/bachelorprojekt.
@test "T002623: ADR traegt die Schema-Analyse (keine FK-Kante nach public.*)" {
  grep -qE 'Keine FK-Kante nach `?public' "$ADR_FILE" \
    || { echo "MISSING Schema-Befund (keine FK-Kante nach public.*) in $ADR_FILE"; return 1; }
}

# Asset A4: VRAM-Messwerte der Kandidatenmodelle.
@test "T002623: ADR traegt die VRAM-Messwerte (gpt-oss-20b Q8_0)" {
  grep -qE '11,5–12,1 GB' "$ADR_FILE" \
    || { echo "MISSING VRAM-Messwert (gpt-oss-20b Q8_0 11,5–12,1 GB) in $ADR_FILE"; return 1; }
}

# Epic-Spec: Delta auf sdlc-isolation existiert mit Requirements.
@test "T002623: Epic-Spec sdlc-isolation existiert mit Requirements" {
  [ -f "$EPIC_SPEC" ] || { echo "MISSING Epic-Spec: $EPIC_SPEC"; return 1; }
  grep -qE '^### Requirement: ' "$EPIC_SPEC" \
    || { echo "MISSING Requirements in $EPIC_SPEC"; return 1; }
}
```

Der Guard ist jetzt **rot**: Die Tests „Abschnitt Gemessene Assets", „Import-Graph-Messung",
„Schema-Analyse" und „VRAM-Messwerte" schlagen fehl, weil das ADR diese Inhalte noch nicht
trägt. Der Struktur-Anker und die Epic-Spec-Assertion sind grün (Positiv-Anker gegen einen
vakuos bestehenden Test).

## Task 2 — ADR-006 um die gemessenen Assets ergänzen (GREEN)

`docs/adr/ADR-006-sdlc-isolation-dev-host.md` in drei chirurgischen Edits synchronisieren.
Inhalte stammen aus `openspec/changes/adr006-sdlc-topologie/design.md` (Abschnitt „Gemessene
Assets" — A1–A4). Die Edit-Blöcke sind exakt vorgegeben; vor dem Commit `git diff` prüfen.

### Edit 2a — Neuer Abschnitt „Gemessene Assets"

Direkt nach der Umsetzungsstand-Tabelle (nach der Zeile `| **E6** | Modell-Registry + Training
Grounds | offen | hängt an PR #3745 (T002587) |`) und vor der Zeile
`### Abweichungen zwischen Zielbild und Cluster-Realität` einfügen:

```markdown
### Gemessene Assets (2026-08-04, T002623)

Die im Planungsprozess offenen Maße sind erhoben:

1. **Import-Verflechtung (post-E1).** Von 295 `lib`-Modulen liegen 37 unter `lib/sdlc/`; von beiden
   Flächen benutzt werden nur noch **17 (5,8 %)** — ausschließlich Infrastruktur (`auth`, `db-pool`,
   `logger`, `identity`, `website-db`, `audit-log`, `rate-limit`, `logging/error-log-store`,
   `llm-models-probe`, `provider-config`, `ki-catalog`, `knowledge-db`, `messaging-db`,
   `native-billing`, `questionnaire-db`, `questionnaire-display`, `systemtest/feature-flag`). Die
   vor E1 gemessenen fachlichen Überschneidungen (`provider-config`, `ki-catalog` im Coaching) sind
   mit dem Umzug verschwunden; die Flächen sind fachlich entkoppelt.
2. **`tickets`-Schema (Datenhoheit).** 24 Tabellen, ~36.000 Zeilen (2.010 Tickets). Alle 15
   FK-Kanten sind intern (13 × auf `tickets.tickets`, 2 × auf `tickets.tags`); alle drei Views
   referenzieren nur `tickets.*`. **Keine FK-Kante nach `public.*`/`bachelorprojekt.*`** — das
   Schema ist kopplungsseitig autark, eine Voll-Migration nach lokal-primär (E3) ist nicht durch
   Schema-Kanten blockiert. Die verbleibende Querkopplung ist geteilter Anwendungscode
   (`website-db`, `auth`), keine DB-Kante.
3. **VRAM-Kandidatenmessung.** gpt-oss-20b Q8_0: 11,5–12,1 GB (gemessen 158–166 tok/s bei 105.472
   Kontext); Devstral-Small-2 24B IQ4_XS: 12,78 GB; Gemma-4-12B Q4_K_XL: ~8–9 GB (q8_0-KV bis
   262.144 Kontext). Ein einzelnes 20B/24B-Modell belegt ~12 GB — Training und Inferenz passen
   nicht gleichzeitig in 16 GB; die GPU-Arbitrierung (E5) ist damit Pflicht, nicht Kür.
```

### Edit 2b — „Offene Punkte": beantwortete Fragen abhaken

Im Abschnitt `## Offene Punkte` die beiden Bullets ersetzen:

```markdown
- **Import-Verflechtung**: Wie stark teilen SDLC- und Geschäftscode `website/src/lib/`? Der
  gemessene Import-Graph bestimmt den tatsächlichen Umzugsaufwand in E1.
```

wird zu:

```markdown
- ~~**Import-Verflechtung**~~ **beantwortet (2026-08-04):** Post-E1 teilen nur noch 17 `lib`-Module
  (5,8 %), ausschließlich Infrastruktur — die Flächen sind fachlich entkoppelt (s. „Gemessene
  Assets").
```

```markdown
- **Ticket-Historie**: Vollständige Migration des `tickets`-Schemas oder Schnitt zu einem Stichtag
  mit read-only Archiv in Prod? Entscheidung in E3, abhängig von den FK-Kanten nach `public.*`.
```

wird zu:

```markdown
- **Ticket-Historie** (Entscheidung in E3): Vollständige Migration oder Stichtags-Schnitt — jetzt
  ohne Integritätszwang, denn die gemessenen FK-Kanten sind ausschließlich intern (s. „Gemessene
  Assets"). Die Frage reduziert sich auf Datenhaltungspolitik; entschieden wird in E3 (T002626).
```

### Edit 2c — GPU-Arbitrierung mit Messwerten stützen

Im Abschnitt `## Entscheidung`, Absatz **GPU-Arbitrierung — Training hat Vorrang**, nach dem
Satz „Die 16 GB VRAM tragen Training und Inferenz nicht gleichzeitig." den Satz ergänzen:

```markdown
Die Messung bestätigt das: gpt-oss-20b (Q8_0) belegt 11,5–12,1 GB, Devstral-24B (IQ4_XS) 12,78 GB —
ein einzelnes Modell lässt kein gleichzeitiges Training zu (s. „Gemessene Assets").
```

## Task 3 — Guard erneut ausführen (GREEN)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/adr006-topologie.bats
# expected: GREEN (alle sechs Tests bestanden)
```

Danach die Change-Struktur validieren:

```bash
bash scripts/openspec.sh validate
# expected: openspec validate: OK
```

## Task 4 — Abschließende Verifikation

```bash
bash scripts/plan-lint.sh openspec/changes/adr006-sdlc-topologie/tasks.md
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu `task test:inventory`, weil in Task 1 eine neue Testdatei entstanden ist, und die
generierten Artefakte mitcommitten.
