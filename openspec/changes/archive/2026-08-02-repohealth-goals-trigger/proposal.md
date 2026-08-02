# Proposal: repohealth-goals-trigger

## Why

Das Repo-Health-Dashboard unter `/admin/repohealth` zeigt veraltete Werte. Es aktualisiert
sich nur **zufällig** — nämlich dann, wenn ein thematisch unbeteiligter PR nebenbei einen
`website/**`-Pfad anfasst und damit einen Website-Build auslöst.

Ursache ist die Publish-Kette, nicht die Messung:

```
.claude/lib/goals.md                        ← SSOT (Markdown)
   │  scripts/gen-goals-data.mjs   (task health:goals:emit)
   ▼
website/src/lib/goals-data.generated.json   ← committet
   │  statischer ESM-Import in website/src/lib/goals-data.ts:1
   ▼
Astro-Bundle → ghcr.io/paddione/website → Rollout → /admin/repohealth
```

Weil der JSON-Import **statisch** ist, landet er im Bundle. Neue Werte erfordern zwingend ein
neues Website-Image; `repohealth.astro` hat zwar `prerender = false`, liest die Daten aber
nicht zur Laufzeit. Zwei Trigger-Brüche verhindern genau diesen Build:

**A — `build-website.yml` triggert nicht auf die Datenquelle.**
Die `paths`-Liste enthält `website/**` und den Workflow selbst. `.claude/lib/goals.md` fehlt.
Ein Commit, der nur die Goals redaktionell fortschreibt, baut also kein Image.

**B — `[skip ci]` im Bot-Commit unterdrückt den einen Pfad, der triggern würde.**
`freshness-regen.yml:64` committet `chore: auto-regenerate freshness artifacts [skip ci]`.
Genau dieser Commit ist der Ort, an dem der Bot `website/src/lib/goals-data.generated.json`
fortschreibt — also der einzige Pfad, der `build-website.yml` auslösen *würde*. `[skip ci]`
unterdrückt ihn unterschiedslos, zusammen mit `ci.yml` und `render-fleet-artifact.yml`.
Heute latent, weil das CI-Freshness-Gate (`ci.yml:101`) den JSON schon im PR erzwingt; sobald
der Bot den JSON wirklich anfasst, ist der ausgelieferte Stand permanent stale.

Belegt: `build-website.yml:38` hat einen `Regenerate freshness artifacts before build`-Step.
Deshalb ist der Dashboard-Stand nach fremden `website/**`-PRs zufällig korrekt — letzter Fall
`d1cd912ce`, das nebenbei `website/src/data/openspec-status.json` enthielt.

Das ist strukturell **dasselbe Muster wie T002157**: eine Komponente, die ein Artefakt
bestimmt, steht nicht in ihren eigenen Trigger-Pfaden — also bleibt das Artefakt stale, bis
zufällig ein anderer Pfad angefasst wird.

## What

1. **A — Trigger-Pfad ergänzen:** `.claude/lib/goals.md` in die `paths`-Liste von
   `.github/workflows/build-website.yml` aufnehmen. Damit löst jede Goals-Änderung den Build
   aus, und der bestehende `Regenerate freshness artifacts before build`-Step übernimmt die
   Transformation ohne weitere Änderung.

2. **B — `[skip ci]` bedingt setzen:** In `.github/workflows/freshness-regen.yml` wird
   `[skip ci]` nur noch angehängt, wenn der Regen-Diff **keine** `website/**`-Pfade enthält.
   Berührt der Bot ein Website-Artefakt, entsteht ein normaler Commit und `build-website.yml`
   greift über seine `paths`. Die Trigger-Wahrheit bleibt damit an einem Ort (den `paths` der
   Zielworkflows) statt in imperativer Dispatch-Logik. `render-fleet-artifact.yml` profitiert
   automatisch mit, falls der Bot je `k3d/**` anfasst.

3. **Regressionstest** in `tests/spec/ci-cd.bats` für beide Brüche.

4. **Mitgenommen** (bereits im Working Tree, thematisch zugehörig):
   - `.claude/lib/goals.md` — Root-Cause-Notiz zu G-E2E (DNS `EAI_AGAIN web.korczewski.de`
     in CI-Runnern, zusätzlich 401 auf dem Ingest-Endpoint).
   - `k3d/monitoring/health-goals-cronjob.yaml` — Image-Pin `alpine/k8s:1.28.2` →
     `1.36.2` mit Digest.

## Nicht in diesem Change (Follow-ups)

- **C — automatische Messung.** Aktuell misst **nichts** von selbst: `freshness:regenerate`
  ruft nur `health:goals:emit` (`Taskfile.yml:981`) — reine Markdown→JSON-Transformation. Die
  echte Messung (`health:goals:update` → `scripts/health-goals-check.sh`) läuft nirgends in
  CI, und der Cluster-CronJob `health-goals-check` ist ein Stub
  (`command: ["/bin/sh","-c","echo 'Running health goals check cron'"]`). Ein Scheduled
  Workflow dafür braucht `FLEET_KUBECONFIG`, DB-Zugriff (G-DB09) und `gh` (G-E2E) — eigene
  Secrets-Fläche, eigener Plan.
- **D — Architektur.** Solange die Wahrheit ein im Repo committetes Artefakt ist, ist
  „automatisch aktuell" definitionsgemäß an Merge + Build gebunden. Ein echt live-Dashboard
  bräuchte die Messwerte in Postgres (analog `v_timeline`) mit dem CronJob als Producer.

_Ticket: T002158_
