---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-15
---

# mishap-auto-chore-plan — Design Spec

## Warum

Der `mishap-tracker` bündelt Ausführungs-Mishaps heute nur zu einem `type=task`-Ticket
(`attention_mode=ai_ready`, `status=triage`). Dieses Ticket bleibt liegen, bis eine
menschliche/`ticket-ops`-Session es manuell in einen Plan überführt (`dev-flow-plan`) und
merged. Für die Mehrzahl der Bundles — nicht-kritische `suspicious`/`drift`/`degraded`-Mix
ohne `broken`/`security`-Eintrag — ist das unnötiger Umweg: die Beschreibung im Ticket
enthält bereits alles, was ein Chore-Fix braucht.

Ziel: den Leerlauf zwischen "Mishap erkannt" und "Fix gemerged" eliminieren, indem der
mishap-tracker für nicht-kritische Bundles selbst einen echten OpenSpec-Chore-Plan erzeugt,
staged (`plan_staged`) und die Software-Factory (`pipeline.js`) ihn automatisch aufgreift
und implementiert — ohne menschliches Eingreifen.

## Was

### Scope-Entscheidung (Exploration + Brainstorming, siehe Conversation)

Die Factory-Queue (`scripts/factory/queue.sh`) pickt strukturell nur
`type='feature' AND status='backlog' AND readiness.lastenheft_locked=true` auf.
`type='task'`-Tickets (= alle Mishap-Bundles) erreichen die automatisierte Pipeline nie,
auch nicht mit `status=plan_staged`. `dev-flow-chore` (der bestehende plan-lose Chore-Pfad)
ist als Live-Session gebaut, nicht als Autopilot-Ziel verdrahtet.

**Entscheidung:** Die Factory-Pipeline wird erweitert, `type='task' AND status='plan_staged'`
zusätzlich zu konsumieren — trifft die Anfrage ("staged für die Factory") wörtlich, statt sie
zu umgehen (verworfene Alternative: mishap-tracker triggert `dev-flow-chore` direkt/headless).

### 1. Gating — nur nicht-kritische Bundles

`classifyBundle` (Go, `scripts/ticket-mcp/go/internal/tools/mishap.go:66-103`) berechnet
bereits `severity=major` wenn ein `broken`/`security`-Eintrag im Bundle ist, sonst `minor`.
Dieses Feld landet unverändert im Ticket. **Kein Go-Code-Change nötig** — der mishap-tracker
liest nach Bundle-Ticket-Erstellung `ticket.sh get --id <ext-id>` und prüft `severity`:
- `severity=major` (enthält `broken`/`security`) → wie heute: Ticket bleibt für manuelle
  Triage liegen, kein Auto-Plan.
- `severity≠major` (nur `degraded`/`suspicious`/`drift`/`process`) → Auto-Plan-Flow (unten).

### 2. Plan-Autoring — im mishap-tracker selbst, kein neuer Daemon

Direkt im Anschluss an `report_mishap`/`flush_mishap_buffer` (mishap-tracker Step 2/3):
1. `bash scripts/openspec.sh propose mishap-<ext-id-slug> --ticket <ext-id>` — headless,
   seedet den plan-lint-konformen `tasks.md`-Skeleton (kein Brainstorming nötig, analog zum
   bestehenden `openspec propose`-Einsatz aus `dev-flow-plan` Schritt A.5).
2. Ein frischer Subagent (Muster: `dev-flow-plan` Schritt 3.7, provisioniert nach
   `subagent-provisioning`) bekommt den vollen Bundle-Ticket-Text als Kontext und schreibt
   `openspec/changes/<slug>/tasks.md` — **echter** Fix-Task pro Mishap-Eintrag, mit einem
   echten Failing-Test-Step (`expected: FAIL` + realer `bats`/`vitest`-Aufruf gegen eine
   existierende Testdatei), plus der drei mandatory Verify-Commands (`task test:changed`,
   `task freshness:regenerate`, `task freshness:check`).
3. `bash scripts/plan-lint.sh openspec/changes/<slug>/tasks.md` — hartes Gate, iterieren bis
   PASS (wie im Feature-Pfad).
4. `ticket.sh stage-plan --id <ext-id> --branch chore/<slug> --plan openspec/changes/<slug>/tasks.md`
   — setzt `status=plan_staged`, schreibt den `FACTORY-PLAN-REF`-Kommentar, markiert
   Scout/Design/Plan-Phase-Events als `done` (bestehendes Verhalten von `stage-plan.sh`,
   unverändert).
5. Commit + Push des `chore/<slug>`-Branches.

Kein Worktree/kein separater `dev-flow-plan`-Aufruf nötig — der mishap-tracker läuft bereits
in einer Live-Session mit Schreibzugriff; die Artefakte werden direkt auf dem aktuellen
Checkout erzeugt und auf den neuen Branch committed (git-crypt-safe via bestehendes
`worktree-create.sh`-Muster, falls die aktuelle Session bereits in einem Worktree läuft, sonst
direkter Branch-Checkout).

### 3. Factory-Pipeline — 4 mechanische Änderungen

Kein Schema-Change, kein Go-Change. Betroffene Dateien:

- **`scripts/factory/queue.sh`**: WHERE-Klausel um
  `OR (type='task' AND status='plan_staged')` erweitern (Zeile ~12-23). Task-Tickets
  brauchen kein `lastenheft_locked` (das ist Feature-spezifisch — der Plan ist bereits über
  `stage-plan.sh` verifiziert/staged).
- **`scripts/factory/slots.sh`**: `status IN ('backlog','triage')` (Zeile ~27) um
  `'plan_staged'` erweitern, sonst kann ein von `queue.sh` gefundenes Task-Ticket keinen
  Pipeline-Slot claimen.
- **`scripts/factory/pipeline.js`**: Deploy-HARD-GUARD-Regex `^(feature|fix)/`
  (Zeile ~671-672) → `^(feature|fix|chore)/`. PR-Titel-Generierung (Zeile ~684) auf
  `chore(${slug})` umstellen, wenn Ticket-`type=task` (statt hartkodiert `feat(${slug})`).
- **`scripts/factory/dispatcher-bridge.sh`**: Slug-Extraktion (Zeile ~43) generalisieren von
  `sed 's/^feature\///'` auf ein Präfix-agnostisches `${branch#*/}`, damit `chore/<slug>`
  nicht mit Slash im Worktree-Pfad landet.
- **`scripts/factory/conflict-check.sh`**: bereits `type IN ('feature','task')` (Zeile ~121)
  — kein Change nötig.
- `auto-enqueue.sh`/`enqueue.sh` werden für Task-Tickets **nicht** durchlaufen (die
  hartkodierte `UPDATE ... SET type='feature'` in `enqueue.sh:17` würde den Typ sonst
  überschreiben) — `queue.sh` liest `plan_staged` direkt, kein Umweg über `backlog`.

### Out of scope

- Keine Änderung an `dev-flow-chore` selbst.
- Keine Änderung an der Klassifikations-/Severity-Logik in `mishap.go`.
- Kein Auto-Plan für `severity=major`-Bundles (bleiben manuell).
- Kein Rollback-/Undo-Mechanismus für fehlgeschlagene Auto-Pläne — ein `plan-lint`-Fail
  bricht den mishap-tracker-Lauf mit Fehlermeldung ab (wie ein normaler Feature-Plan-Fail),
  das Bundle-Ticket bleibt `status=triage` (kein `stage-plan`-Aufruf erfolgt).

## Akzeptanzkriterien

1. Ein Mishap-Bundle ohne `broken`/`security`-Eintrag erzeugt automatisch einen
   plan-lint-validen `tasks.md` und ein Ticket mit `status=plan_staged` + `chore/<slug>`-Branch.
2. Ein Mishap-Bundle MIT `broken`/`security`-Eintrag verhält sich exakt wie heute (kein
   Auto-Plan, `status=triage`).
3. `queue.sh` liefert ein `type=task, status=plan_staged`-Ticket als Kandidat.
4. `slots.sh` kann einen Slot für ein solches Ticket claimen.
5. `pipeline.js` durchläuft für ein `chore/<slug>`-Branch-Ticket den Deploy-Guard ohne Block
   und öffnet einen PR mit `chore(...)`-Titel.
6. `dispatcher-bridge.sh` extrahiert aus `chore/<slug>` korrekt `<slug>` (kein Slash-Leak).
