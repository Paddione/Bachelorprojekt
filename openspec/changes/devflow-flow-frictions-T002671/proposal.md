# Proposal: devflow-flow-frictions-T002671

## Why

T002671 is a Mishap-Sammelticket mit **sechs** unabhängigen Befunden aus der T002628-Ausführung.
Vor jeder Lösung wurde zuerst trianigert, welche Befunde heute (2026-08-09) noch bestehen:

| # | Befund | Status | Verbleib |
|---|--------|--------|----------|
| 1 | deepseek-flash-Subagent lieferte zweimal leeres Ergebnis | Modell-/Provider-Reliability, kein Skript-Bug | **nicht in diesem Plan** — bereits durch Wechsel auf deepseek-pro gemildert; kein reproduzierbarer Skript-Fehler zum Testen |
| 2 | Planner ließ Worktree/Lock nach Plan-Commit hängen | Duplikat | **nicht in diesem Plan** — der main-checkout-Teil ist mit T002809 bereits gemergt (`reclaim-main-checkout`, Commit `548d527ea`, PR #3966); die verbleibende Klasse "Fremdprozess entfernt aktiv geclaimten Worktree" ist bereits als eigenes, höher priorisiertes Ticket T002896 erfasst (`triage`, `priority=hoch`, `severity=major`) |
| 3 | SID-Drift unter opencode blockiert eigene Status-Writes | **besteht noch** — verifiziert | **in diesem Plan** |
| 4 | commit-msg-Hook lehnt Scope `openspec` ab | Kein Bug | **nicht in diesem Plan** — die Hook-Fehlermeldung nennt bereits den korrekten Ersatz-Scope (`docs(plans):` statt `docs(openspec):`, siehe T002328-Konsolidierung); verifiziert mit `bash scripts/validate-commit-msg.sh message` gegen beide Varianten |
| 5 | `devflow-ci-watch.sh` hing nach Merge im Poll-Loop | **besteht noch** — verifiziert | **in diesem Plan** |
| 6 | Archive-Commit auf gelöschte Branch gepusht | Bereits behoben | **nicht in diesem Plan** — die dokumentierte Prozedur in `.claude/skills/references/plan-archive-steps.md` (Fix T002256) zweigt den Archiv-Branch bereits von `origin/main` statt vom (nach `--delete-branch`-Merge gelöschten) Fix-Branch ab und cherry-pickt den Archiv-Commit dorthin |

### Befund 3 — Root Cause (verifiziert)

`scripts/agent-lock-identity.sh` und die identische Kopie am Kopf von `scripts/agent-lock.sh`
prüfen für die stabile Session-Identität nur `CLAUDE_CODE_SESSION_ID` und `CLAUDE_SESSION_ID`
(`_AGENT_LOCK_SID_ENVS`). opencode exportiert aber tatsächlich `OPENCODE_SESSION_ID` — belegt
durch `.opencode/hooks/session-start.sh` / `session-end.sh`, die genau diese Variable als
Session-Identität lesen (`"${OPENCODE_SESSION_ID:-$1}"`). Da `OPENCODE_SESSION_ID` in der
Allowlist fehlt, fällt jede opencode-Session auf den per-Bash-Call volatilen Unix-SID-Fallback
zurück (dokumentiert in `_my_sid` als "Quelle des Drift-Bugs", T001268/T002381) — genau die
Drift, die den Status-Write-Guard in `scripts/vda/ticket/_ticket-core.sh` einen fremden Lock
sehen ließ und `TICKET_LOCK_OVERRIDE=1` nötig machte. `_detect_tool` erkennt opencode aus
demselben Grund gar nicht (Ergebnis `unknown` statt `opencode`).
Reproduziert per Kommando-Output (kein Source-Grep):
```
env -i OPENCODE_SESSION_ID="oc-session-42" bash -c \
  "source scripts/agent-lock-identity.sh; _my_sid; _detect_tool"
# → volatile per-Call-Unix-SID statt 'oc-session-42'; 'unknown' statt 'opencode'
```

### Befund 5 — Root Cause (verifiziert)

`scripts/devflow-ci-watch.sh` prüft vor dem Poll-Loop nur zwei Preflights
(`mergeStateStatus=DIRTY`, `mergeable=CONFLICTING`) — beide betreffen ausschließlich den
Zustand VOR CI-Start. Es gibt **keinen** Preflight für `state=MERGED`. Der erste Schritt in der
`while true`-Schleife ist der blockierende Aufruf `gh pr checks --watch --interval 15` (Zeile
60) — bricht dieser für eine bereits gemergte/geschlossene PR nicht sauber ab, hängt das
gesamte Skript dort, unabhängig vom `MAX_CI_ATTEMPTS`-Limit weiter unten (das Limit greift erst
NACH einem zurückkehrenden `gh`-Aufruf). Reproduziert mit einem Fake-`gh` auf `PATH`, der jeden
Aufruf protokolliert: für `state=MERGED` erreicht das ungefixte Skript den `checks --watch`-Call
trotzdem.

## What

1. `scripts/agent-lock-identity.sh`: `OPENCODE_SESSION_ID` zur `_AGENT_LOCK_SID_ENVS`-Allowlist
   hinzufügen; `_detect_tool` einen expliziten `opencode`-Zweig geben (geprüft VOR dem
   generischen `_sid_env`-Zweig, sonst würde eine opencode-Session weiterhin als `claude`
   fehlklassifiziert, weil `_sid_env` jetzt auch für `OPENCODE_SESSION_ID` wahr wird).
2. `scripts/agent-lock.sh`: dieselbe Änderung an der Kopf-Kopie von `_AGENT_LOCK_SID_ENVS`
   spiegeln (beide Listen müssen synchron bleiben — die Kopf-Definitionen werden zur Laufzeit
   zwar durch den späteren `source agent-lock-identity.sh`-Loader überschrieben, aber die
   Diagnose-Warnung im Kopf-Code bliebe sonst falsch und beide Listen drifteten erneut
   auseinander).
3. `scripts/devflow-ci-watch.sh`: nach den bestehenden DIRTY/CONFLICTING-Preflights (vor der
   `while true`-Schleife) einen `state=MERGED`-Check einfügen, der bei Treffer sofort
   `assert-phase-chain` ausführt und `exit 0` liefert — ohne den blockierenden
   `checks --watch`-Call je zu erreichen.

_Ticket: T002671_
