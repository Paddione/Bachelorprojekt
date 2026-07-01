---
title: "Agent-Push-Notifications für opencode/agy-Sessions"
ticket_id: T000991
domains: [infra, website, ops, security]
status: active
file_locks: []
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: Agent-Push-Notifications (T000991)

- [ ] Task 1: ntfy-Deployment + Schema-Registrierung (k3d/ntfy.yaml, environments/schema.yaml)
- [ ] Task 2: scripts/agent-push.sh — universeller Push-Hook (Event → Opt-in-Check → ntfy POST)
- [ ] Task 3: opencode-Session-Hooks (.opencode/hooks/session-start.sh + session-end.sh)
- [ ] Task 4: agy-Task-Lifecycle-Hook (.agy/hooks/task-event.sh)
- [ ] Task 5: website Opt-in lib + Settings-API + DB-Migration (agent-push-settings.ts + API-Route)
- [ ] Task 6: website UI AgentPushSettings.svelte — Toggle pro Quelle
- [ ] Task 7: Verifikation — task test:changed + task freshness:regenerate + task freshness:check

---

# Agent-Push-Notifications — Implementation Plan

Sendet opencode- und agy-Session-Events als HTTP-POST an einen self-hosted ntfy-Server, sodass Patrick
die Notifications auf seinem Android-Smartphone via ntfy-App erhält. Opt-in pro Quelle (opencode / agy),
default aus. DSGVO-konform: Topic-Auth, keine sensiblen Ticket-Inhalte im Body.

**Spec:** `docs/superpowers/specs/2026-06-20-agent-push-notifications.md`

---

## File Structure

```
k3d/ntfy.yaml                                          ← NEU: ntfy-Deployment + Service + IngressRoute
k3d/kustomization.yaml                                 ← ntfy.yaml in resources aufnehmen
scripts/agent-push.sh                                  ← NEU: universeller Push-Hook (Event → ntfy POST)
tests/unit/agent-push.bats                             ← NEU: BATS-Tests für agent-push.sh
.opencode/hooks/session-start.sh                       ← NEU: opencode-Session-Start-Hook
.opencode/hooks/session-end.sh                         ← NEU: opencode-Session-End-Hook
.agy/hooks/task-event.sh                               ← NEU: agy-Task-Lifecycle-Hook
environments/schema.yaml                               ← NTFY_*/AGENT_PUSH_*-Vars registrieren
website/src/lib/db.ts                                  ← agent_push_settings-Tabelle ergänzen
website/src/lib/agent-push-settings.ts                 ← NEU: Opt-in-Verwaltung (DB-Read/Write)
website/src/pages/api/admin/agent-push/settings.ts     ← NEU: Settings-API (GET/POST, admin-guarded)
website/src/components/admin/AgentPushSettings.svelte  ← NEU: UI-Toggle pro Quelle
```

---

## Task 1: ntfy-Deployment + Schema-Registrierung (infra)

**Ziel:** ntfy-Server im dev-Cluster deployen, Topics pro Quelle mit Access-Token-Auth absichern,
die neuen Env-Vars in `environments/schema.yaml` registrieren.

**Dateien:**
- `k3d/ntfy.yaml` — neu
- `k3d/kustomization.yaml` — `ntfy.yaml` in `resources:` aufnehmen
- `environments/schema.yaml` — Registrierung der NTFY-/AGENT_PUSH-Vars

**Implementierung:**

`k3d/ntfy.yaml` erstellt ein ntfy-Deployment (Image `binwiederhier/ntfy:latest`), einen ClusterIP-Service
auf Port 80 und eine Traefik IngressRoute `ntfy.${DEV_DOMAIN}`. ntfy läuft mit `command: serve` und dem
Flag `--base-url=https://ntfy.${DEV_DOMAIN}` (envsubst beim Apply). Die Access-Tokens pro Topic liegen
als Kubernetes-Secret `ntfy-tokens` (Werte `NTFY_TOKEN_OPEncode` / `NTFY_TOKEN_AGY` aus
`environments/.secrets/<env>.yaml`, per `env:seal` als SealedSecret committed). Die ntfy-Server-Config
(`server.yml` als ConfigMap) verbietet anonymes Publish auf `bachelorprojekt-*`-Topics — Publish erfordert
einen gültigen Access-Token für diese Topic-Prefixe (auth-required).

In `k3d/kustomization.yaml` die Zeile `- ntfy.yaml` im `resources:`-Block ergänzen (alphabetisch
passend einsortieren, S4-Orphan-Gate).

In `environments/schema.yaml` folgende Vars registrieren (damit `env:validate` + `env:generate` sie
kennen und `talk-hpb-setup.sh` keine Platzhalter stehen lässt): `NTFY_BASE_URL`,
`NTFY_TOKEN_OPEncode`, `NTFY_TOKEN_AGY`, `AGENT_PUSH_API` (Website-API-Base für den Opt-in-Check),
`AGENT_PUSH_TOKEN` (Bearer-Token für den Hook→API-Check) und `AGENT_PUSH_LINK_BASE` (Basis für den
Ticket-Link im Notification-Body).

**Akzeptanzkriterium:**
- `DEV_DOMAIN=dev.example.test kubectl kustomize k3d/ >/dev/null && echo OK` → `OK`
- `task env:validate ENV=dev` kennt alle neuen Vars (kein "unregistered variable"-Fehler)

---

## Task 2: scripts/agent-push.sh — universeller Push-Hook (ops)

**Ziel:** Ein Bash-Script, das einen Event-Typ + Payload + Quelle entgegennimmt, den Opt-in-Status
pro Quelle über die Website-API prüft (fail-closed) und bei Freigabe einen HTTP-POST an ntfy sendet.
Retry 3x mit Backoff, Fallback-Log bei endgültigem Misserfolg.

**Dateien:**
- `tests/unit/agent-push.bats` — neu (zuerst schreiben, Test schlägt fehl)
- `scripts/agent-push.sh` — neu

**Implementierung:**

Zuerst den Test schreiben und das Scheitern bestätigen, dann das Script implementieren.

`tests/unit/agent-push.bats` testet gegen einen Mock-ntfy (Stub-Script auf einer lokalen
`NTFY_BASE_URL`) und einen Mock-Opt-in-Endpoint:
- `test_opt_in_disabled_skips_send`: Opt-in für Quelle `opencode` aus → kein POST an ntfy (fail-closed)
- `test_opt_in_api_unreachable_skips_send`: Opt-in-API nicht erreichbar → kein POST (fail-closed, DSGVO)
- `test_retry_then_give_up_logs`: ntfy antwortet 3x 500 → Script gibt auf, schreibt Fallback-Log
- `test_happy_path_posts_to_topic`: Opt-in an + ntfy 200 → POST an korrektes Topic mit Token
- `test_body_no_sensitive_content`: Notification-Body enthält nur Event-Typ + Ticket-ID + Link,
  niemals den rohen Payload-Volltext

### Schritt 1: Test schreiben und Scheitern bestätigen

```bash
bats tests/unit/agent-push.bats
```
Expected: FAIL — `scripts/agent-push.sh` existiert nicht / `command not found`.

### Schritt 2: scripts/agent-push.sh implementieren

```bash
#!/usr/bin/env bash
# scripts/agent-push.sh — universeller Push-Hook für opencode/agy-Session-Events. [T000991]
#
# Usage: agent-push.sh <source> <event-type> <ticket-or-session-id> [summary]
#   source: opencode | agy
#
# Flow: Opt-in-Check (GET AGENT_PUSH_API, fail-closed) → HTTP-POST an ntfy → Retry 3x → Fallback-Log.
# DSGVO: Body enthält NUR Event-Typ + ID + Link, niemals den rohen Payload/Volltext.
set -euo pipefail

SOURCE="${1:?usage: agent-push.sh <source> <event> <id> [summary]}"
EVENT="${2:?missing event}"
REF_ID="${3:?missing id}"
SUMMARY="${4:-}"

LOGFILE="${AGENT_PUSH_LOG:-/var/log/agent-push.log}"
NTFY_BASE="${NTFY_BASE_URL:?NTFY_BASE_URL not set}"
TOPIC="bachelorprojekt-${SOURCE}"
TOKEN_VAR="NTFY_TOKEN_$(echo "$SOURCE" | tr '[:lower:]' '[:upper:]')"
TOKEN="${!TOKEN_VAR:?token for $SOURCE not set}"

# Opt-in-Check (fail-closed): API entscheidet pro Quelle, default aus
OPT_IN=$(curl -fsS -m 3 -H "Authorization: Bearer ${AGENT_PUSH_TOKEN}" \
  "${AGENT_PUSH_API:-}/api/admin/agent-push/settings?source=${SOURCE}" 2>/dev/null || echo '{"enabled":false}')
ENABLED=$(echo "$OPT_IN" | python3 -c "import json,sys;print(json.load(sys.stdin).get('enabled',False))" 2>/dev/null || echo "False")
if [ "$ENABLED" != "True" ]; then
  echo "$(date -Is) SKIP source=${SOURCE} event=${EVENT} id=${REF_ID} (opt-out)" >>"$LOGFILE" 2>/dev/null || true
  exit 0
fi

# DSGVO-sicherer Body: nur Event-Typ + ID + Link, kein Payload-Volltext
TITLE="[${SOURCE}] ${EVENT}"
BODY="${REF_ID}${SUMMARY:+ — ${SUMMARY}}"
[ -n "${AGENT_PUSH_LINK_BASE:-}" ] && BODY="${BODY}\n${AGENT_PUSH_LINK_BASE}/${REF_ID}"

post() {
  curl -fsS -m 5 -H "Authorization: Bearer ${TOKEN}" \
    -H "Title: ${TITLE}" -d "${BODY}" "${NTFY_BASE}/${TOPIC}"
}

for attempt in 1 2 3; do
  if post; then exit 0; fi
  sleep $((attempt * attempt))
done

echo "$(date -Is) GIVEUP source=${SOURCE} event=${EVENT} id=${REF_ID}" >>"$LOGFILE" 2>/dev/null || true
exit 0
```

**Akzeptanzkriterium:**
- `bats tests/unit/agent-push.bats` grün
- `bash -n scripts/agent-push.sh` ohne Syntaxfehler
- Opt-in aus → kein ntfy-POST (fail-closed verifiziert durch den Test)
- Body enthält keinen Payload-Volltext (DSGVO-Test grün)

---

## Task 3: opencode-Session-Hooks (ops)

**Ziel:** opencode-Session-Events (`session.started`, `session.completed`, `session.failed`,
`pr.opened`, `review.requested`) triggern `scripts/agent-push.sh`. `mishap.detected` wird vom
Mishap-Tracker-Flow angestoßen (separater Aufruf an der Mishap-Anlege-Stelle, nicht Teil dieser Hooks).

**Dateien:**
- `.opencode/hooks/session-start.sh` — neu
- `.opencode/hooks/session-end.sh` — neu

**Implementierung:**

opencode unterstützt Session-Lifecycle-Hooks im Verzeichnis `.opencode/hooks/`. Die Hooks erhalten
die Session-ID als Umgebungsvariable bzw. Argument. Jeder Hook ruft
`scripts/agent-push.sh opencode <event> <session-id> "<kurz-summary>"` auf. Der Aufruf ist
fehler-tolerant (`|| true`), damit ein fehlgeschlagener Push nie die opencode-Session blockiert.

`.opencode/hooks/session-start.sh`:
```bash
#!/usr/bin/env bash
# opencode session-start hook → agent-push. [T000991]
bash "$(dirname "$0")/../../scripts/agent-push.sh" opencode session.started \
  "${OPENCODE_SESSION_ID:-$1}" "Session gestartet" || true
```

`.opencode/hooks/session-end.sh` mappt den Exit-Status auf `session.completed` / `session.failed`:
```bash
#!/usr/bin/env bash
# opencode session-end hook → agent-push. [T000991]
EVENT="session.completed"
[ "${OPENCODE_EXIT_CODE:-0}" != "0" ] && EVENT="session.failed"
bash "$(dirname "$0")/../../scripts/agent-push.sh" opencode "$EVENT" \
  "${OPENCODE_SESSION_ID:-$1}" || true
```

`pr.opened` und `review.requested` werden nicht über Session-Hooks ausgelöst, sondern an der Stelle
eingehängt, wo der PR erstellt bzw. Review angefordert wird (PR-Create- bzw. Review-Request-Flow) —
dort jeweils ein `agent-push.sh opencode pr.opened <pr-id>`-Aufruf mit `|| true`.

**Akzeptanzkriterium:**
- Beide Hooks ausführbar (`chmod +x`), `bash -n` grün
- Ein Hook-Aufruf mit leerer `NTFY_BASE_URL` bricht nicht die Session (exit 0 durch `|| true`)

---

## Task 4: agy-Task-Lifecycle-Hook (ops)

**Ziel:** agy-Task-Events (`task.assigned`, `task.completed`, `task.blocked`, `task.failed`)
triggern `scripts/agent-push.sh agy`.

**Dateien:**
- `.agy/hooks/task-event.sh` — neu

**Implementierung:**

agy-Task-Lifecycle-Hook im Verzeichnis `.agy/hooks/`. Der Hook erhält Event-Typ und Task-ID als
Argumente und ruft `scripts/agent-push.sh agy <event> <task-id> "<summary>"` mit `|| true` auf.

```bash
#!/usr/bin/env bash
# agy task-event hook → agent-push. [T000991]
EVENT="${1:?missing event}"
TASK_ID="${2:?missing task-id}"
SUMMARY="${3:-}"
bash "$(dirname "$0")/../../scripts/agent-push.sh" agy "$EVENT" "$TASK_ID" "$SUMMARY" || true
```

**Akzeptanzkriterium:**
- `bash -n .agy/hooks/task-event.sh` grün, ausführbar
- Aufruf ohne gesetzte `NTFY_BASE_URL` bricht agy nicht (exit 0 via `|| true`)

---

## Task 5: website Opt-in lib + Settings-API + DB-Tabelle (website, security)

**Ziel:** Opt-in pro Quelle (opencode/agy) in der Website-eigenen Postgres speichern und über eine
admin-guarded API lesen/schreiben. `agent-push.sh` fragt diese API als Opt-in-Quelle ab (fail-closed).

**Dateien:**
- `website/src/lib/db.ts` — `agent_push_settings`-Tabelle (Create-if-not-exists) ergänzen
- `website/src/lib/agent-push-settings.ts` — neu
- `website/src/pages/api/admin/agent-push/settings.ts` — neu

**Implementierung:**

DB-Tabelle (Website-eigene Postgres, nicht die shared ticket-DB):
```sql
CREATE TABLE IF NOT EXISTS agent_push_settings (
  source      TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO agent_push_settings (source, enabled) VALUES ('opencode', false), ('agy', false)
  ON CONFLICT (source) DO NOTHING;
```
In `website/src/lib/db.ts` wird diese Tabelle beim Startup mit angelegt (analog der bestehenden
ensure-Tabellen-Logik).

`website/src/lib/agent-push-settings.ts` exportiert:
- `getEnabled(source: 'opencode' | 'agy'): Promise<boolean>`
- `getAll(): Promise<{opencode: boolean; agy: boolean}>`
- `setEnabled(source: 'opencode' | 'agy', enabled: boolean): Promise<void>`

API-Route `website/src/pages/api/admin/agent-push/settings.ts` (Admin-Guard wie `factory-control.ts`:
`getSession` + `isAdmin` aus `website/src/lib/auth.ts`, `export const prerender = false`,
`locals.requestLogger.error` für Fehler):
- `GET` → `{opencode: boolean, agy: boolean}`
- `POST` body `{source: 'opencode'|'agy', enabled: boolean}` → setzt den Flag, gibt neuen Stand zurück
- Auth-Pfade: Admin-Session (fürs UI) UND `Authorization: Bearer ${AGENT_PUSH_TOKEN}` (für den Hook).
  Der Token wird gegen `AGENT_PUSH_TOKEN` aus den Cluster-Secrets geprüft (konstanter Vergleich).

**Akzeptanzkriterium:**
- `npm --prefix website run typecheck` grün
- GET ohne Admin/Token → 401; GET mit Token → 200 + JSON
- POST setzt den Flag, anschließendes GET reflektiert ihn
- Default: beide Quellen `false` (Opt-in default aus)

---

## Task 6: website UI AgentPushSettings.svelte (website)

**Ziel:** Admin-UI mit zwei Toggles (opencode / agy), default aus, persisted via Settings-API.

**Dateien:**
- `website/src/components/admin/AgentPushSettings.svelte` — neu

**Implementierung:**

Svelte 5 (runes): lädt beim Mount `GET /api/admin/agent-push/settings`, rendert zwei Toggle-Switches.
Bei Änderung `POST` mit `{source, enabled}`. Status-Feedback (gespeichert / Fehler). Keine sensiblen
Daten im UI über das Topic hinaus. Stil orientiert sich an bestehenden Admin-Komponenten und der
Admin-Section-Styling- Konvention der Website.

**Akzeptanzkriterium:**
- `npm --prefix website run typecheck` grün
- Toggle-Wechsel triggert POST, UI zeigt neuen Stand nach Reload
- Default-Render: beide Toggles aus

---

## Task 7: Verifikation — vollständiges CI-Äquivalent

**Dateien:** keine neuen

**Implementierung:**

```bash
# 1. BATS-Unit-Tests für den Push-Hook
bats tests/unit/agent-push.bats

# 2. Syntax-Checks aller neuen Shell-Scripts
bash -n scripts/agent-push.sh .opencode/hooks/session-start.sh \
  .opencode/hooks/session-end.sh .agy/hooks/task-event.sh

# 3. Kustomize-Dry-Run (neues ntfy-Manifest)
DEV_DOMAIN=dev.example.test kubectl kustomize k3d/ >/dev/null && echo "kustomize OK"

# 4. Env-Validierung (neue Vars registriert)
task env:validate ENV=dev

# 5. Website-Typecheck + Unit-Tests
npm --prefix website run typecheck
npm --prefix website run test:unit

# 6. Targeted Tests für geänderte Domains
task test:changed

# 7. Freshness-Artifakte regenerieren
task freshness:regenerate

# 8. Freshness + Quality-Ratchet (CI-Äquivalent — S1–S4 + baseline)
task freshness:check
```

**Akzeptanzkriterium:**
- Alle Befehle grün; `task test:changed` deckt BATS- + Website-Unit-Tests ab
- `task freshness:regenerate` aktualisiert test-inventory + generierte Artefakte (committen)
- `task freshness:check` bestätigt keine S1-/S2-/S3-/S4-Regressionen
- Neue `k3d/ntfy.yaml` ist in `k3d/kustomization.yaml` referenziert (kein S4-Orphan)
- Keine Brand-Domain-Literale in Manifesten (S3)

---

## Implementierungsreihenfolge

1. Task 1 (ntfy-Deployment + Schema) — Infra-Voraussetzung
2. Task 2 (agent-push.sh + Tests) — nach Task 1 (braucht NTFY_BASE_URL)
3. Tasks 3 + 4 (opencode-/agy-Hooks) — nach Task 2 (parallel ausführbar)
4. Task 5 (Opt-in lib + API + DB) — nach Task 1 (braucht AGENT_PUSH_*-Vars); parallel zu Tasks 3+4
5. Task 6 (UI) — nach Task 5
6. Task 7 (Verifikation) — abschließend
