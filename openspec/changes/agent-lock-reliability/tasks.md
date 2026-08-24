---
title: "agent-lock-reliability — Implementation Plan"
ticket_id: T015918
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: T015918
parent_feature: null
depends_on_plans: []
---

# agent-lock-reliability — Implementation Plan

_Ticket: T015918_ · Batch-Anker für die Kinder **T015822** (Gruppe A) und **T015823**
(Gruppe B). EIN Change, EIN Branch (`feature/batch-agent-lock-reliability-T015918`), EIN Plan;
die Kinder schließen EINZELN über ihre eigenen PRs — der Parent wird nicht selbst
executed, er trägt nur den FACTORY-PLAN-REF.

## File Structure

Bestehende Dateien (S1-Budget gegen die wirksame Schwelle; keine der Dateien ist
gebaselined, wirksame Schwelle = `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`):

| Datei | Ist-Zeilen | Restbudget |
|---|---|---|
| `scripts/agent-lock.sh` | 774 | budget 26 |
| `scripts/agent-lock-identity.sh` | 88 | budget 712 |
| `scripts/agent-lock-activity.sh` | 138 | budget 662 |
| `scripts/hooks/worktree-write-guard.sh` | 229 | budget 571 |
| `scripts/worktree-create.sh` | 593 | budget 207 |

Neue Dateien (unter dem Limit anlegen, Wachstumsreserve lassen):

| Datei | Zweck |
|---|---|
| `tests/spec/active-sessions-hub/liveness-heartbeat-renewal.bats` | Gruppe A: Self-Renewal |
| `tests/spec/active-sessions-hub/reap-live-session-guard.bats` | Gruppe A: Zwei-Signal-Reap |
| `tests/spec/active-sessions-hub/write-guard-claim-less-worktree.bats` | Gruppe B: Pfad 2.5 |
| `tests/spec/active-sessions-hub/activity-unclaimed-worktrees.bats` | Gruppe B: Sichtbarkeit |
| `tests/spec/active-sessions-hub/worktree-create-auto-claim.bats` | Gruppe B: Auto-Claim |

Budgetstrategie: `scripts/agent-lock.sh` hat mit budget 26 praktisch keinen Spielraum —
alle neue Logik aus Gruppe A wächst in die Fragmente `agent-lock-identity.sh` (budget 712)
und `agent-lock-activity.sh` (budget 662); in `agent-lock.sh` dürfen nur Aufrufzeilen
entstehen. Falls eine Änderung dort doch größer wird: extract in ein Fragment statt
Zeilen zusammenschieben.

Delta-Spec: `specs/active-sessions-hub.md` (Parent-SSOT-Slug, benannt nach
`openspec/specs/active-sessions-hub.md`).

## Gruppe A — Liveness/Reap-Zuverlässigkeit [T015822]

### A1 — Heartbeat-Renewal bei Self-Kontaktpunkten

- [ ] **RED:** Neuer Test `tests/spec/active-sessions-hub/liveness-heartbeat-renewal.bats`
      (Prüfmodus OUTPUT-VERIFIKATION, isolierter `AGENT_LOCK_DIR` per mktemp, ambient
      `CLAUDE_CODE_SESSION_ID` unsetten wie `agent-lock-branch-reap-T002785.bats`):
      eigener Lock mit um 1 h zurückgesetztem `heartbeat_at`; `check branch <b>` als
      Owner meldet held UND erneuert `heartbeat_at` (< 60 s), `created_at` unverändert;
      fremder liveer Session-Aufruf erneuert NICHT; Renewal < TTL überlebt `reap`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/liveness-heartbeat-renewal.bats
# expected: FAIL (red — renewal existiert noch nicht)
```

- [ ] **GREEN:** In `cmd_check` (mine-Zweig) und `cmd_refresh`: nach positivem
      `_lock_is_mine` den Lock mit frischem `heartbeat_at` neu schreiben (`CREATED` aus
      bestehender Datei übernehmen — Muster steht in `cmd_refresh`). Im pre-commit-Self-
      Claim (`_self_claim_main_checkout`) passiert das Renewal implizit über `_write_lock`;
      sicherstellen, dass `created_at` erhalten bleibt. Fremd-Renewal bleibt blockiert,
      weil beide Pfade hinter `_lock_is_mine` liegen.

### A2 — Zwei-Signal-Regel für heartbeat-ttl-Reap unverifizierbarer SIDs

- [ ] **RED:** Neuer Test `tests/spec/active-sessions-hub/reap-live-session-guard.bats`:
      non-numerischer Owner-SID, existierender Worktree auf passendem Branch,
      `heartbeat_at` > TTL zurückgesetzt — Git-Aktivität im Worktree neuer als der
      Heartbeat (Testdatei committen bzw. `git -C "$wt" commit --allow-empty` als
      Aktivitätsanker) → Lock ÜBERLEBT `reap`. Gegenprobe ohne Git-Aktivität und ohne
      Prozess → Lock wird mit `heartbeat-ttl` geerntet. Numerischer toter SID → weiterhin
      Ein-Signal-Reap. Positiv-Anker je Fall (Lock da/weg + `.reap.log`-Eintrag).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/reap-live-session-guard.bats
# expected: FAIL (red — lebende Worktree-Aktivität schützt noch nicht)
```

- [ ] **GREEN:** Neuer Helper `_worktree_git_active_since <wt> <epoch>` in
      `agent-lock-activity.sh` (mtime von `HEAD`, `index`, `MERGE_HEAD` unter dem
      Worktree-Git-Dir vs. Epoch). In `_reapable` die beiden heartbeat-ttl-Zweige für
      non-numerische SIDs um die Bedingung ergänzen: reap erst wenn KEIN aktiver Prozess
      UND KEINE Git-Aktivität seit Heartbeat. Numerische SIDs unverändert.

### A3 — Fragment-Hygiene

- [ ] `scripts/agent-lock.sh` nach A1/A2 prüfen: Wuchs > budget 26 → extract des neuen
      Codes in `agent-lock-activity.sh` bzw. `agent-lock-identity.sh`, Aufrufzeile bleibt.
- [ ] `bash -n` über alle geänderten Skripte.

### A4 — Gruppe-A-Verifikation [T015822]

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/liveness-heartbeat-renewal.bats
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/reap-live-session-guard.bats
# hier ist Rot unzulaessig — beide Suiten muessen gruen laufen
```

Plus Regression der Bestands-Suiten
Plus Regression der Bestands-Suiten (alle muessen gruen laufen):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-branch-reap-T002785.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-claim-persist.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats
```

## Gruppe B — Claim-Durchsetzung & Worktree-Sichtbarkeit [T015823]

### B1 — Write-Guard-Pfad 2.5: claim-lose Schreibversuche in Repo-Worktrees ablehnen

- [ ] **RED:** Neuer Test `tests/spec/active-sessions-hub/write-guard-claim-less-worktree.bats`:
      Hook-Skript mit JSON-Stdin (Tool-Eingabe) direkt aufrufen — Session ohne jeden
      Claim, Ziel innerhalb eines echten `git worktree list`-Worktrees → Exit ungleich 0,
      Meldung nennt Worktree-Pfad und den `claim branch … --worktree <path>`-Remedy;
      eigener gültiger Claim → erlaubt; Ziel im Main-Checkout ohne Claim → weiterhin
      erlaubt; `WORKTREE_GUARD_BYPASS=1` → erlaubt. Positiv-Anker zuerst (eigener-Claim-
      Fall muss ohne Implementierung durchlaufen), dann Negativ-Fälle.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/write-guard-claim-less-worktree.bats
# expected: FAIL (red — Pfad 2.5 existiert nicht, claim-los wird erlaubt)
```

- [ ] **GREEN:** In `scripts/hooks/worktree-write-guard.sh` zwischen Schritt 2 (eigener
      Claim) und Schritt 3 (fremder Claim) neuen Schritt einziehen: Ziel liegt innerhalb
      eines verlinkten Worktrees (`git worktree list --porcelain`, Prefix-Match wie
      `_cwd_inside_worktree`), Session hält keinen Claim, der den Pfad deckt, und kein
      fremder liveer Claim deckt ihn → deny mit Worktree-Pfad + Claim-Remedy. Bypass
      `WORKTREE_GUARD_BYPASS=1` greift unverändert zuerst.

### B2 — activity meldet unclaimed worktrees

- [ ] **RED:** Neuer Test `tests/spec/active-sessions-hub/activity-unclaimed-worktrees.bats`:
      Prozess mit cwd in einem Worktree ohne liveen Claim → Ausgabe enthält Sektion
      `--- unclaimed worktrees ---` und nennt den Pfad; gleicher Worktree mit liveem
      Claim → Sektion nennt ihn nicht; Exit bleibt 0.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/activity-unclaimed-worktrees.bats
# expected: FAIL (red — Sektion fehlt)
```

- [ ] **GREEN:** `cmd_activity` in `agent-lock-activity.sh` um dritte Sektion erweitern:
      Worktree-Roots aus `git worktree list --porcelain` sammeln (Code existiert dort
      bereits), je Root prüfen `_worktree_is_live_claimed` und Prozess-/Aktivitätstreffer;
      Treffer ohne Claim unter `--- unclaimed worktrees ---` ausgeben. Read-only, Exit 0.

### B3 — worktree-create claimed den Branch automatisch

- [ ] **RED:** Neuer Test `tests/spec/active-sessions-hub/worktree-create-auto-claim.bats`
      (isoliertes Bare-Repo + Clone als Fixture, damit der Test keinen echten Branch im
      Haupt-Repo anlegt): Nach erfolgreichem `worktree-create.sh` existiert
      `branch__<slug>.json` mit absolutem Worktree-Pfad und Label `auto: worktree-create`.
      Fehlerfall: `AGENT_LOCK_DIR` unter einer regulären Datei → Skript bricht mit
      Diagnose ab, kein claim-loser Worktree bleibt zurück.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/worktree-create-auto-claim.bats
# expected: FAIL (red — Auto-Claim fehlt)
```

- [ ] **GREEN:** Am Erfolgsende von `scripts/worktree-create.sh` (vor der Abschluss-
      Ausgabe): `agent-lock.sh claim branch <branch> --worktree <abs-pfad> --label
      "auto: worktree-create"` ausführen; Exit-Code 4 (Persistenzfehler) propagieren und
      laut abbrechen. Existiert bereits ein liveer Claim desselben Owners → refresh statt
      Doppel-Claim (cmd_claim ist idempotent für eigene SIDs).

### B4 — Gruppe-B-Verifikation [T015823]

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/write-guard-claim-less-worktree.bats
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/activity-unclaimed-worktrees.bats
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/worktree-create-auto-claim.bats
```

Plus Regression der angrenzenden Guards:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-collision-false-positives.bats
tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect.bats
```

## Finale Verifikation (beide Gruppen)

- [ ] Alle fünf neuen BATS-Dateien grün; Bestands-Suiten aus A4/B4 grün.
- [ ] Test-Inventar regenerieren und mitcommitten (CI failt sonst):
      `task test:inventory`
- [ ] Drei mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Kinder-PRs getrennt schneiden: Gruppe A → PR mit `[T015822]`, Gruppe B → PR mit
      `[T015823]`; der Parent T015918 wird nicht executed und erhält keinen eigenen PR.
