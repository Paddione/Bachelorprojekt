---
title: "mishap-t002354 — Implementation Plan"
ticket_id: T002354
domains: [plan-authoring, factory-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002354 — Implementation Plan

_Ticket: T002354_

## File Structure

```
scripts/devflow-post-merge-deploy.sh    (geaendert) — "Kein Deploy nötig" statt "Bitte manuell deployen"
scripts/factory/watchdog.sh             (geaendert) — Watchdog-Kommentare deduplizieren
scripts/factory/wakeup.sh               (geaendert) — LLM-Proxy-Preflight vor Dispatch
scripts/factory/dispatcher-bridge.sh    (geaendert) — Preflight-Ergebnis beachten (optional)
AGENTS.md                               (geaendert) — Plan-Konvention: SSOT nicht direkt editieren
tests/spec/mishap-t002354.bats          (neu)      — Tests für Preflight + Comment-Dedup
```

## Tasks

### Mishap 1: Plan-Konvention dokumentieren

> **Befund bestätigt.** Die Plan-Phase editierte die SSOT direkt UND schrieb ein
> Delta — der archive-Merge fand das Requirement doppelt. Fix: Keine Code-Änderung,
> nur klare Regel in AGENTS.md.

- [ ] **AGENTS.md ergänzen.** Unter dem OpenSpec-Abschnitt einen Satz hinzufügen:
  "Die Plan-Phase editiert NIEMALS die SSOT (`openspec/specs/*.md`) — nur Delta-
  Dateien in `openspec/changes/<slug>/specs/` werden geschrieben. Das Mergen ist
  Aufgabe des archive-Schritts."
- [ ] **Verification.** `grep -r "openspec/specs/" openspec/changes/` zeigt keine
  SSOT-Edits im Plan-Kontext (kein Task-Auftrag, der direkt in SSOT schreibt).

### Mishap 1—Nebenbefund: devflow-post-merge-deploy.sh

> **Befund.** Für Changes ohne Deploy-Trigger (reine Specs/Tests/Scripts) gab das
> Skript "Bitte manuell deployen" aus, obwohl kein Deploy nötig war.

- [ ] **devflow-post-merge-deploy.sh anpassen.** Nach dem `DEPLOY_*`-Check (Zeile
   24-28) die Ausgabe unterscheiden: Wenn kein Deploy-Trigger erkannt wurde, prüfen
   ob die geänderten Dateien überhaupt deploy-relevant sind (Specs, Tests, Scripts).
   Für nicht-deploybare Änderungen "Kein Deploy nötig (reine Specs/Tests/Scripts)"
   ausgeben statt "Bitte manuell deployen".
   ```bash
   # Vorschlag (nach dem DEPLOY_* = false Check):
   # Skripte/Specs/Tests allein brauchen keinen Deploy
   if echo "$CHANGED" | grep -qEv '^(website/|brett/|docs/|k3d/|prod)'; then
     echo "ℹ Kein Deploy nötig — reine Specs/Tests/Scripts/Tooling-Änderungen."
     exit 0
   fi
   ```
- [ ] **Verification.** `bash scripts/devflow-post-merge-deploy.sh T002354` auf
  diesem Branch (der nur Spec/Script-Änderungen enthält) gibt "Kein Deploy nötig"
  aus, nicht "Bitte manuell deployen".

### Mishap 2—T002361/T002389 Recon verifizieren

> **Befund.** Die Kernschleife (unbegrenzter Livelock durch Dry-Run-First-Guard +
> Watchdog) ist durch T002361 (Attempt-Zähler + unfactory) und T002389 (INFRA/MODEL-
> Distinktion) geschlossen. Die Recon muss prüfen, ob die Guards wie spezifiziert
> greifen.

- [x] **Code-Review watchdog.sh** (erledigt via Recon oben). Der Counter zählt
  aufeinanderfolgende stale Runden, `unfactory` setzt `blocked + needs_human +
  factory_excluded=true` nach FACTORY_MAX_ATTEMPTS=3.
- [x] **Code-Review guards.sh** (erledigt via Recon oben). `guard_dryrun_ok` delegiert
  an `dryrun-check`, ist korrekt gated durch `factory_excluded`.
- [x] **Fazit.** Die Kernschleife ist terminiert. Kein weiterer Code-Eingriff für
  den Livelock selbst nötig.

### Mishap 2—Preflight-Guard für LLM-Proxy

> **Lücke.** `wakeup.sh` prüft nur Docker/K8s-Sandbox, nicht die LLM-Proxy-
> Erreichbarkeit. Ein toter Proxy startet trotzdem Sessions.

- [ ] **Preflight-Funktion in wakeup.sh.** Vor dem ersten Dispatch (vor der
  `while true`-Tick-Schleife, etwa nach dem sandbox preflight in Zeile 160):
  ```bash
  # LLM-Proxy-Preflight: ANTHROPIC_BASE_URL reachable?
  if [[ -n "${ANTHROPIC_BASE_URL:-}" ]]; then
    if ! curl -sf --max-time 5 "${ANTHROPIC_BASE_URL}/health" >/dev/null 2>&1 \
         && ! curl -sf --max-time 5 "${ANTHROPIC_BASE_URL}/v1/models" >/dev/null 2>&1; then
      echo "wakeup.sh: ANTHROPIC_BASE_URL unreachable (${ANTHROPIC_BASE_URL}) — skipping tick" >&2
      AGENT_MSG_LABEL=factory bash "${REPO}/scripts/agent-msg.sh" post \
        "factory-tick: skipped — LLM-Proxy unreachable" 2>/dev/null || true
      exit 0
    fi
    echo "wakeup.sh: LLM-Proxy reachable at ${ANTHROPIC_BASE_URL}" >&2
  fi
  ```
  Der Preflight ist **best-effort**: Fehler (curl nicht installiert, Timeout) führen
  zum Tick-Abbruch. Das ist fail-closed: ein Proxy, der nicht antwortet, ist kein
  Grund, Sessions zu starten. `ANTHROPIC_BASE_URL` unset = kein Preflight (Annahme:
  echter Anthropic-API-Key, Erreichbarkeit nicht prüfbar).
- [ ] **Verification.** `ANTHROPIC_BASE_URL=http://localhost:1 bash scripts/factory/wakeup.sh`
  in einer Umgebung ohne lokalen Service auf Port 1 bricht den Tick ab (exit 0 mit
  Meldung). `ANTHROPIC_BASE_URL="" bash scripts/factory/wakeup.sh` läuft normal.

### Mishap 2—Watchdog-Kommentare deduplizieren

> **Lücke.** Der Watchdog schreibt pro Runde einen Kommentar. Sieben identische
> Kommentare an T002282 waren das sichtbarste Signal — aber keiner las sie.

- [ ] **watchdog.sh: letzten Kommentar speichern.** Vor dem `ticket.sh add-comment`
  (Zeile 171) den aktuellen Kommentar-Body mit dem gespeicherten letzten Kommentar
  vergleichen. Speicherort: `tickets.factory_control` key
  `watchdog_last_comment:<ext_id>` (brand = `<brand>`).
  ```bash
  # Vor add-comment (nach Zeile 167):
  last_comment="$(factory_psql -v key="watchdog_last_comment:${ext_id}" -v brand="$BRAND" <<'SQL' || true
  SELECT value FROM tickets.factory_control WHERE key = :'key' AND brand = :'brand';
  SQL
  )"
  if [[ "$reset_msg" == "$last_comment" ]]; then
    # Nur Kommentar-Attempt-Zähler aktualisieren falls vorhanden
    echo "watchdog: skipping duplicate comment for $ext_id (body unchanged)" >&2
  else
    # Vorhandenen Kommentar schreiben UND den letzten speichern
    factory_psql -v key="watchdog_last_comment:${ext_id}" -v brand="$BRAND" -v value="$reset_msg" <<'SQL' >/dev/null
  INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
  VALUES (:'key', :'brand', :'value', 'watchdog', now())
  ON CONFLICT (key, brand) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  SQL
    fi
  ```
  **Wichtig:** Der Watchdog-Kommentar enthält bereits den Attempt-Zähler
  `[MODEL 2/3]`, daher unterscheiden sich die Bodies bei steigendem Zähler
  automatisch. Die Deduplizierung greift nur, wenn der Text exakt gleich ist
  (z.B. bei INFRA-Fehlern ohne Zähleränderung, oder wenn der Zähler sein Maximum
  erreicht hat und nicht mehr steigt).
- [ ] **Verification.** `git diff` zeigt nur die geplanten Änderungen an
  `scripts/factory/watchdog.sh`. Die Änderung ist klein genug für ein manuelles
  Review — kein Test für die Dedup-Logik (Integrationstest bräuchte DB-Zugriff).

## Verify (RED → GREEN)

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
