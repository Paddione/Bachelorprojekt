---
title: "routing-check-freetoken-t014552 — Implementation Plan"
ticket_id: T014552
domains: [scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# routing-check-freetoken-t014552 — Implementation Plan

_Ticket: T014552_

[SA-AUX] routing-check meldet jeden Tick veraltetes Backend gemma12-vision@:18235 als FEHLT

Automatisch gestaged aus dem System-Audit 2026-08-23 (Report:
tmp/claude-scratch/system-audit-multi-2026-08-23.md). Die Diagnose im Ticket ist die Vorgabe.

## File Structure

```
openspec/changes/routing-check-freetoken-t014552/tasks.md   — dieser Plan
tickets.provider_config                                     — Daten-Fix (DB, keine Repo-Datei)
scripts/llm/routing-check.sh                                — unverändert erwartet; nur anfassen, falls Schritt 2 einen Code-Anteil ergibt
```

## Befund (Evidence)

- wakeup.sh-Log je Factory-Tick (2026-08-23 10:11–10:36 Uhr): `[routing-check] FEHLT —
  'gemma12-vision' (http://127.0.0.1:18235) wird von keinem lokalen Backend serviert.` —
  dreimal pro Tick.
- SQL über `tickets.provider_config`: genau **drei aktivierte Zeilen**
  `model_id='gemma12-vision', base_url='http://127.0.0.1:18235'` (Duplikate) — daher die
  dreifache Meldung.
- Seit T012414/T014028/T014105 läuft der lokale Stack FreeToken-native (:1919,
  Alias `freetoken-local/active`); der llm-proxy (:18235) serviert `gemma12-vision`
  nicht mehr — `qwen38-220k` dagegen weiterhin (deshalb dort keine FEHLT-Meldung).
- `scripts/llm/routing-check.sh` funktioniert korrekt: es meldet echten Drift zwischen
  `provider_config` und den tatsächlich servierten Modell-IDs. Der Fix ist datenseitig.

## Task List

- [ ] **Konsumenten prüfen.** Bevor Zeilen deaktiviert werden: grep über `scripts/` und
      `.opencode/agent-models.jsonc`, ob irgendein Konsument noch aktiv
      `gemma12-vision@:18235` auflöst (Erwartung laut AGENTS.md: nein — seit T014105
      zeigen alle lokalen Agenten auf den FreeToken-Alias). Falls doch: Zeilen auf
      `http://127.0.0.1:1919` repointen statt deaktivieren.
- [ ] **Stale-Zeilen deaktivieren.** Ohne Konsumenten:

```sql
UPDATE tickets.provider_config
SET enabled = false
WHERE enabled = true
  AND model_id = 'gemma12-vision'
  AND base_url = 'http://127.0.0.1:18235';
-- expected: UPDATE 3
```

      Die drei Duplikate sind zugleich ein Hygiene-Befund: neue Einträge sollten
      dedupliziert werden, damit ein Tick nicht N Warnungen für denselben Drift wirft.

- [ ] **GREEN-Nachweis.** `bash scripts/llm/routing-check.sh` ausführen:
      keine FEHLT-Zeile für `gemma12-vision` mehr; Abschlusszeile
      `routing-check: alle lokalen Modell-IDs haben ein Backend.` (oder ausschließlich
      legitime, aktuelle Meldungen). Danach einen Factory-Tick beobachten: das Log muss
      ohne die gemma12-vision-Zeile bleiben.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Spec anlegen, die den Soll-Zustand prüft — sie muss
      gegen den aktuellen Drift rot sein:

```bash
# tests/spec/routing-check-freetoken.bats
@test "routing-check meldet kein veraltetes gemma12-vision@18235" {
  run bash scripts/llm/routing-check.sh
  [[ "${output}" != *"gemma12-vision"* ]]
}
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/routing-check-freetoken.bats
# expected: FAIL (rot — der provider_config-Drift ist noch nicht behoben)
```

- [ ] **Fix-Step (GREEN).** DB-Fix nach Vollzug der Task List; derselbe BATS-Lauf ist
      grün und der manuelle Lauf frei von der Meldung. Einträge, die sich bei der Recon
      als nicht zutreffend erweisen, werden im PR-Text begründet verworfen statt
      stillschweigend übergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
