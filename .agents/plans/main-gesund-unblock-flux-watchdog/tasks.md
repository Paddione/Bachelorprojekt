---
title: main-gesund-unblock-flux-watchdog
domains: [infra, test, security]
status: active
goal: main-gesund-unblock-flux-watchdog
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# main-gesund-unblock-flux-watchdog — Implementation Plan

Spec: `.agents/goals/main-gesund-unblock-flux-watchdog/GOAL.md` (Modell B: Plan traegt Goal).
Base: `origin/main`, Branch `fix/main-gesund-unblock-flux-watchdog`.
Repo-Profil (`repo.yaml`): `main`, scopes aus `commitlint.config.cjs`,
keine Tickets, Task-Runner `taskfile`, generierte Artefakte `true`.
Pfad: `fix` (Bug-Triage #7066/#7062/#7059/#7058 plus Flux-Install #7057 und Watchdog-Inventur #7050).
Prior-Art: ADR-016 (devmesh eigenes Flux, `task devmesh:deploy` nur Break-Glass),
ADR-017 (korczewski `suspend: true`), ADR-008 (devmesh-Topologie), ADR-011 (Pocket ID als IdP).
Preflight: kein Fix auf `origin/main` enthalten (`git log origin/main --grep` ohne Treffer fuer die 6 Issues).

## File Structure

- `k3d/pocket-id-client-seed.yaml` (bestehend, Seed-Skript mit greedy id-Parse)
- `tests/py/spec/test_pocket_id_client_seed.py` (bestehend, Regressionstest wird erweitert)
- `flux/clusters/fleet/ks-korczewski.yaml` (bestehend, `suspend: false` -> `true`)
- `flux/clusters/fleet/ks-jobs-korczewski.yaml` (bestehend, `suspend: false` -> `true`)
- S4-Waisen (4 Dateien, Fix durch Referenz oder Allowlist mit Begruendung, keine Baseline-Umgehung)
- `flux/clusters/devmesh/` (bestehend, Ziel von `task devmesh:flux:install`)
- Watchdog-Bericht (nur Issue #7050 auswerten, kein Codeeinbau in diesem Plan)

## Task 1 — RED: failing Test fuer Seed v2.18 plus S4-Reproducer

- [ ] `tests/py/spec/test_pocket_id_client_seed.py` erweitern: `test_pocket_id_create_id_v218`
      mit v2.18-Create-Response als Fixture (`credentials.secrets[]` plus `createdSecret` inline,
      Client-ID steht vorn, Secret-UUID hinten). Test parst mit der gleichen Logik wie das
      Seed-Skript und behauptet, dass die Client-ID (nicht die Secret-UUID) zurueckkommt.
- [ ] S4-Reproducer sichern: `task quality:check` auf `origin/main` zeigt die 4 S4-Waisen
      aus #7062 (Beleg im Plan-Commit als Text, kein Screenshot noetig).
- [ ] `python3 -m pytest tests/py/spec/test_pocket_id_client_seed.py::test_pocket_id_create_id_v218 -q` — expected: FAIL
      (greedy `sed`-Parse liefert die Secret-UUID, Test erwartet die Client-ID).

Permitted files: `tests/py/spec/test_pocket_id_client_seed.py`

## Task 2 — GREEN: Seed-Parse auf ersten Treffer umstellen

- [ ] `k3d/pocket-id-client-seed.yaml` im create-Zweig: greedy `sed -E 's/.*"id":"([^"]+)".*/\1/'`
      ersetzen durch ersten Treffer (Top-Level-Client-ID steht vorn), zum Beispiel per
      `grep -o '"id":"[^"]*"' | head -1` plus `sed`-Extraktion. Kein anderes Verhalten aendern.
- [ ] `python3 -m pytest tests/py/spec/test_pocket_id_client_seed.py -q` — expected: PASS.
- [ ] Guards: keine neuen Brand-Domain-Literale, keine Secret-Werte in Logs.

Permitted files: `k3d/pocket-id-client-seed.yaml`, `tests/py/spec/test_pocket_id_client_seed.py`

## Task 3 — Freeze und S4: suspend true plus Waisen klaeren

- [ ] `flux/clusters/fleet/ks-korczewski.yaml` und `ks-jobs-korczewski.yaml`:
      `suspend: false` auf `suspend: true` setzen (Freeze-Doktrin aus AGENTS.md und ADR-017,
      Entscheidung 3a aus setgoal). Kommentare bleiben unveraendert, keine Namespace-Skalierung.
- [ ] 4 S4-Waisen aus #7062 einzeln klaeren: je Datei entweder echte Referenz in einer
      konfigurierten Quelle (`Taskfile`, CI, Doku, anderes Skript, Skill-Doc) ergaenzen oder
      begruendeten `allowlist_globs`-Eintrag in `docs/code-quality/gates.yaml` vorschlagen.
      Keine Baseline-Ausnahme, kein Loeschen ohne Pruefung der referenzierenden Seite.
- [ ] `task quality:check` — expected: PASS (0 neue Violations).
- [ ] `task workspace:validate` — expected: PASS (Kustomize dry-run nach suspend-Aenderung).

Permitted files: `flux/clusters/fleet/ks-korczewski.yaml`, `flux/clusters/fleet/ks-jobs-korczewski.yaml`, `docs/code-quality/gates.yaml`, S4-Quelldateien mit Referenz

## Task 4 — devmesh: Flux installieren und Devstack per Flux deployen

- [ ] `KUBECONFIG=~/.kube/devmesh.yaml kubectl get crd | grep -ci flux` als Vorher-Beleg sichern
      (Erwartung gemaess #7057: 0), dann `task devmesh:flux:install` ausfuehren.
- [ ] Flux-Reconciliation abwarten: `kubectl --context devmesh get kustomizations,helmreleases -A`
      zeigt `Ready=True`, keine `NotReady`/`Stalled`-Eintraege; `flux/clusters/devmesh/ks-*.yaml`
      (workspace/platform/secrets/agent-board) sind das Ziel, kein manueller `task devmesh:deploy`
      ausser als dokumentierter Break-Glass mit `FORCE=1`.
- [ ] Nachher-Beleg: Namespaces (`flux-system`, `workspace`) plus Revisions-Tabelle
      (Git-Pfad zu Flux-Objekt zu Status) im Commit-Text oder als Beleg-Datei.

Permitted files: `flux/clusters/devmesh/`, Beleg-Notizen im Plan-Ordner

## Task 5 — Watchdog #7050: priorisierte Liste, kein Einbau

- [ ] Issue #7050 (Marker `version-watchdog`) auswerten: faule Images/Actions/npm-Pakete
      nach patch/minor/major trennen, Alter und Blocker-Risiko fuer Spec/Guards vermerken.
- [ ] Ergebnis als Tabelle in den Plan-Ordner oder Commit-Text uebernehmen; kein `gh`-Write,
      kein Image-Pin-Update, kein `npm`-Eingriff in diesem Plan (Entscheidung 5a).
- [ ] CI-Bezug pruefen: `gh run list --branch main --limit 5` zeigt, ob Spec/Guards-Rot (#7066)
      mit Watchdog-Eintraegen korreliert; reine Korrelationsnotiz, keine Kausalaussage ohne Beleg.

Permitted files: `.agents/plans/main-gesund-unblock-flux-watchdog/`

## Task 6 — Verify: Gates, Freshness, Stage

- [ ] `task test:changed` — expected: PASS.
- [ ] `task freshness:regenerate` — expected: PASS, danach betroffene Artefakte stagen.
- [ ] `task freshness:check` — expected: PASS (Freshness plus quality:check S1-S4-Ratchet plus Baseline-Assertion).
- [ ] `task workspace:validate` — expected: PASS (Manifest-Aenderungen aus Task 3 und 4).
- [ ] `task test:inventory` falls Tests angefasst wurden, Inventar-Datei mitcommitten.
- [ ] Branch `fix/main-gesund-unblock-flux-watchdog` pushen (`git push -u origin`), kein PR von hier.
      `echo "plan done $(date -u +%FT%TZ) plan-gestagt" >> .agents/plans/main-gesund-unblock-flux-watchdog/phase-events.log`.

Permitted files: `.agents/plans/main-gesund-unblock-flux-watchdog/`, generierte Artefakte laut `git status`
