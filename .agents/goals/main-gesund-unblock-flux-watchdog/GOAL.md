# GOAL — main gesund: CI/Guards entblocken, Seed+Freeze fixen, devmesh-Flux, Watchdog-Inventur

## Objective
`main` (Paddione/Bachelorprojekt) ist wieder grün und pushbar:
CI-Rot #7066 und S4-Push-Blockade #7062 behoben, danach Seed-Parse #7059
und Freeze-Doktrin #7058 korrigiert, danach devmesh per Flux deployed #7057,
dazu Watchdog-Updates #7050 inventarisiert. Ein Sammel-Goal, strikt in Phasen-Reihenfolge.
Entscheidungsstand aus setgoal-Runde 2026-11-02: Optionen 1a/2a/3a/4a/5a.

## Erfolgskriterien (messbar, in Reihenfolge)
- Phase 1 — Unblock:
  - [x] #7066: Spec + Guards @ 68562fd (Shard 1/3) grün per Beleg-Run (Run-URL + Head-SHA);
        Close per `bash scripts/ci-red-intake.sh resolve --sha <sha>` mit Beleg-Kommentar.
  - [x] #7062: `quality:check` S4 grün auf `main`; die 4 unreferenzierten Dateien sind
        referenziert oder begründet entfernt (je Datei: Keep-Referenz oder Delete-Beleg).
  - [x] Push von `feature/*` läuft wieder ohne S4-Blockade.
- Phase 2 — Seed + Freeze:
  - [x] #7059: `pocket-id-client-seed` gegen v2.18 ohne 404; greedy id-Parse greift nicht
        mehr die Secret-UUID (Reproducer vorher/nachher + Seed-Run-Beleg).
  - [x] #7058: `ks-korczewski.yaml` / `ks-jobs-korczewski.yaml` wieder `suspend: true`,
        konform zur Freeze-Doktrin (keine Ausnahme, kein Scale-up).
- Phase 3 — devmesh/Flux:
  - [x] #7057: Flux auf devmesh installiert, Devstack via Flux deployed und verifiziert
        (`task workspace:validate` + Status-Beleg, keine manuellen Deploys daneben).
- Phase 4 — Watchdog:
  - [x] #7050: Priorisierte Update-Liste patch/minor/major getrennt liegt vor;
        KEIN Einspielen in diesem Goal.

## Nicht-Ziele
- Kein Einspielen von Watchdog-Updates (nur Inventur).
- Keine Ausnahme für korczewski-Freeze (`suspend:false` wird nicht übernommen,
  keine Go-Live-Aktivierung, keine Namespace-Skalierung > 0).
- Kein manueller devmesh-Deploy ohne Flux; kein direkter Push auf `main`.
- Keine Doktrin-Änderung an AGENTS.md/repo.yaml in diesem Goal.

## Abhängigkeiten
- Repo `Bachelorprojekt`, Branch `main`, Runner Taskfile; Kommandos via
  `bash scripts/vda.sh oracle '<goal>'` auflösen, nie hardcoden.
- Abgrenzung zu `.agents/goals/k3d-devstack-flux-verify` (85 %, read-only Verify):
  jenes Goal hat #7057/#7058 nur als Rot-Beleg erfasst; dieses Goal fixt sie.
  Re-Verify nach Fix dort zurückspiegeln, dann ggf. auf 100 % schließen.
- Cluster-Kontexte: `devmesh` lokal (ADR-008), `fleet` prod; `k3d/` nur Manifest-Basis,
  kein k3d-Cluster (T900120).
- Scopes: `commitlint.config.cjs`, Tickets: none (Merge = Abschluss).
- Bei Rot/neuen Fehlern: Bug-Triage-Konvention (Titel + Reproducer + Version), kein stiller Fix.

## Annahmen
- Annahme: Empfehlungen 1a/2a/3a/4a/5a aus setgoal gelten (Sammel-Goal, Unblock zuerst,
  suspend:true, Flux installieren, nur inventarisieren).
- Annahme: `~/.kube/devmesh.yaml` zeigt auf `gpu-cluster2` (Stand 2026-11-02 aus Verify-Goal);
  bei Rückkehr von `gpu-cluster` ggf. erneut mergen.

## plan_refs
- [.agents/plans/main-gesund-unblock-flux-watchdog/tasks.md] (Branch `fix/main-gesund-unblock-flux-watchdog`, gestagt 2026-11-02)
