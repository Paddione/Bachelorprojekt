---
title: Provider-Slot-Leak und Test-Nebenwirkungen beheben
ticket_id: T002281
domains: [factory, infra, test]
status: plan_staged
---

# provider-slot-leak — Implementation Plan

Vier Befunde aus dem Gemma-Cutover (T002277). Drei teilen dieselbe Fehlerklasse: eine
Bedingung prüft einen Stellvertreter statt den tatsächlichen Zustand. Root-Cause-Analyse
und Entscheidungen: `openspec/changes/provider-slot-leak/design.md`.

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/factory/auto-triage.sh` | 351 | 149 |
| `scripts/factory/route-provider.sh` | 114 | 386 |

Ohne S1-Gate (Dateityp nicht gegated, seit T002265 als leeres Budget gemeldet):
`tests/unit/check-commit-vs-diff.bats`, `tests/spec/software-factory.bats`,
`tests/spec/local-llm-proxy.bats`, `Taskfile.llm.yml`.

Neu: `scripts/factory/reap-provider-slots.sh`,
`scripts/migrations/2026-07-27-provider-health-integrity.sql`.

## Task 1 — RED-Nachweis (bereits erbracht, hier zur Reproduktion)

Die acht Guards sind geschrieben und schlagen fehl. Vor jeder Codeänderung reproduzieren:

```bash
bats --filter "T002281" tests/spec/software-factory.bats tests/spec/local-llm-proxy.bats
# expected: FAIL — alle 8 rot (auto-triage-Release, Reaper, Migration,
# pipeline.js-Kommentar, cd-Absicherung, provider-config-Schreibzugriff,
# install-service Port-Check, install-service Zustandsprüfung)
```

## Task 2 — Migration: `claimed_at`, Müllbereinigung, CHECK

Neue Datei `scripts/migrations/2026-07-27-provider-health-integrity.sql`, idempotent,
Header mit beiden Brand-Kommandos wie in `2026-07-27-llm-proxy-gemma-backend.sql`.

Inhalt:
1. `ALTER TABLE tickets.provider_health ADD COLUMN IF NOT EXISTS claimed_at timestamptz` —
   Grundlage des TTL-Reapers. Kommentar: NULL bedeutet „kein aktiver Claim".
2. `DELETE` der Zeilen, deren `provider` einen Backslash, Tab oder Whitespace enthält.
   Vorher deren `active_agents` prüfen; die bekannten zwei stehen auf 0 und sind folgenlos.
3. `ADD CONSTRAINT provider_health_provider_clean CHECK (provider !~ '[\\\\[:space:]]')` —
   die Klasse zuhalten, unabhängig vom Schreibpfad. `IF NOT EXISTS`-Äquivalent über
   `DO $$ … pg_constraint …`, damit der zweite Lauf durchgeht.
4. Reset der geleakten Zähler auf 0 (`deepseek`, `lmstudio`, `ternary-bonsai-27b`), damit
   `deepseek` als Fallback wieder erreichbar ist — mit Kommentar, dass dies die Altlast
   räumt und der Reaper aus Task 3 die Wiederkehr verhindert.

Anwenden auf **beide** Brands, Idempotenz durch zweiten Lauf belegen.

## Task 3 — Slot-Freigabe: Aufrufer und Reaper

**3a — `scripts/factory/auto-triage.sh`** (Budget 149): `slotId` und `ctx` aus der
`route-provider`-Antwort auslesen und wie in `scout-llm-fallback.sh:55-68` per
`trap release_slot EXIT` freigeben. `release-slot.sh` nimmt `<provider> [success] [ctx]`;
`ctx` mitgeben, sonst bleibt `reserved_tokens` stehen.

**3b — `scripts/factory/reap-provider-slots.sh`** (neu): gibt Claims frei, deren
`claimed_at` älter als die TTL ist. TTL über `PROVIDER_SLOT_TTL_MIN` (Default **30**)
konfigurierbar. Der Wert ist bewusst konservativ: zu kurz gewählt würde er Slots laufender
Anfragen freigeben und die Concurrency-Begrenzung faktisch aufheben. Skript setzt
`active_agents = GREATEST(0, active_agents - 1)` und `claimed_at = NULL` für abgelaufene
Zeilen und meldet, wie viele es waren.

**3c — `scripts/factory/route-provider.sh`** (Budget 386): der Claim setzt zusätzlich
`claimed_at = now()`; `release-slot.sh` setzt es auf NULL zurück. Außerdem den falschen
Kommentar in Zeile 4 korrigieren — `pipeline.js` enthält weder `slotId` noch
`provider_health`, die Behauptung hat beim Debuggen aktiv in die Irre geführt.

## Task 4 — Test-Isolation

**4a — `tests/unit/check-commit-vs-diff.bats`:** jedes `cd "$TMP/repo"` bekommt einen
Fehlerpfad (`|| return 1`). Ohne ihn läuft ein fehlgeschlagenes `cd` weiter und legt
`openspec/changes/x/` im Repo-Root an; bats setzt in `@test`-Blöcken kein `set -e`.

**4b — `tests/spec/software-factory.bats`:** der `FA-SF-70`-Test darf
`provider-config.sh set` nicht mehr gegen die produktive Tabelle fahren. Er prüft die
Argument-Validierung, nicht den Schreibpfad — also auf einen Modus umstellen, der vor dem
DB-Zugriff endet. Bereits vorhandene Müllzeile `x|opus|1|anthropic|m` in derselben Migration
aus Task 2 entfernen.

## Task 5 — `install-service` prüft den echten Zustand

`Taskfile.llm.yml`, Target `proxy:install-service`:

1. **Vor** `systemctl enable --now`: `curl -fsS --max-time 2 http://127.0.0.1:$PORT/health`.
   Antwortet der Port, obwohl das PID-File nichts hergibt, den Belegenden über den Port
   ermitteln (`ss -lptn "sport = :$PORT"`) und beenden — nicht dem PID-File vertrauen.
2. **Nach** `enable --now`: verifizieren, dass die Unit `active (running)` erreicht, statt
   nur die Erfolgsmeldung zu drucken. Bleibt sie in `activating`/`auto-restart`, den
   Journal-Auszug ausgeben und mit Exit-Code enden.

## Task 6 — Verifikation

```bash
bats --filter "T002281" tests/spec/software-factory.bats tests/spec/local-llm-proxy.bats
bats tests/unit/check-commit-vs-diff.bats
bash scripts/factory/route-provider.sh factory-plan opus
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich manuell, weil es keinen Offline-Test dafür gibt:

- Migration zweimal auf beide Brands anwenden (Idempotenz).
- `provider_health` prüfen: keine Zeile mit Backslash/Whitespace im `provider`, `deepseek`
  wieder unter `max_concurrent`.
- `task llm:proxy:uninstall-service && task llm:proxy:start && task llm:proxy:install-service`
  — der Port-Check muss die `nohup`-Instanz erkennen und beenden, die Unit danach
  `active (running)` erreichen.
