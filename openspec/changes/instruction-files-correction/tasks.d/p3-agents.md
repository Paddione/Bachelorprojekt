---
title: "p3 — AGENTS.md: Flux, write_capable, orchestrator, Zeilenziel"
ticket_id: T002305
domains: [agent-config, docs]
status: active
partial_id: p3
role: impl
target_files: ["AGENTS.md"]
depends_on: []
---

# p3 — AGENTS.md korrigieren

_Ticket: T002305 · Partial p3 · target_files: `AGENTS.md`_

## File Structure

| Datei | Änderung |
|---|---|
| `AGENTS.md` | fünf Korrekturen an bestehenden Zeilen; keine neuen Sektionen |

## Kontext

AGENTS.md bezeichnet sich als cross-harness Quick-Start und ist laut CLAUDE.md die SSOT für die
OpenSpec-Konventionen. Fünf Aussagen sind gegen den Repo-Stand vom 2026-07-27 falsch. Sie wurden
gegen `docs/agent-guide/registry/agents.yaml` (K5-Registry, T002304) und
`.opencode/agent-models.jsonc` geprüft.

## Schritte

- [ ] **Flux-Korrektur (Zeilen 37 und 42).** Zeile 42 behauptet "Push-based deploy. Only website
      auto-deploys via GH Actions", Zeile 37 "Prod deploy is decoupled (push-based)". Beides ist
      seit T002083 falsch und widerspricht direkt CLAUDE.md Development Rule 1. Ersetzen durch die
      korrekte Beschreibung: Prod wird **pull-basiert via FluxCD** deployt
      (`.github/workflows/render-fleet-artifact.yml` rendert das OCI-Artefakt
      `ghcr.io/paddione/fleet-manifests`, Flux reconciled es auf dem fleet-Cluster, siehe
      `flux/clusters/fleet/`); `task workspace:deploy` ist Break-Glass-Fallback. Der Kern von
      Zeile 37 ("Merge = closure, Prod-Deploy entkoppelt, ändert den Ticket-Status nicht") bleibt
      inhaltlich richtig und erhalten — nur das Wort "push-based" ist falsch.

- [ ] **`write_capable`-Korrektur (Zeilen 13 und 19).** Zeile 13 nennt `gemma-4-12b`
      "**Preferred** for all write-capable delegation", Zeile 19 listet ihn unter "`task` for
      write-capable". Die K5-Registry führt `gemma-4-12b: write_capable: false` (ebenso
      `gemma-4-12b-primary`); write-capable sind laut Registry nur `deepseek-helper` und
      `orchestrator`. Die Aussage an die Registry angleichen. Wenn der Ist-Zustand der
      opencode-Permissions als falsch empfunden wird, ist das ein eigener Befund — die
      Instruktionsdatei wird an die Registry angeglichen, nicht umgekehrt.

```bash
# Belegt die Registry-Werte, bevor der Text geändert wird:
grep -A 4 '^  gemma-4-12b:' docs/agent-guide/registry/agents.yaml
grep -A 4 '^  deepseek-helper:' docs/agent-guide/registry/agents.yaml
```

- [ ] **`orchestrator` in die Runtime-Tabelle aufnehmen.** Die Tabelle in Zeilen 13–17 listet
      `gemma-4-12b`, `gemma-4-12b-primary`, `deepseek-helper` sowie die builtins `explore` und
      `general`. `.opencode/agent-models.jsonc` und die K5-Registry führen zusätzlich
      `orchestrator` (mode: primary, model `opencode-go/deepseek-v4-flash`, write_capable: true) —
      CLAUDE.md nennt ihn bereits korrekt. Zeile ergänzen.

- [ ] **Zeilenziel auf einen einhaltbaren Wert setzen.** Zeile 3 fordert "under 120 lines", die
      Datei hat 153. Die Datei verletzt damit ihre eigene erste Regel. Konservative Auflösung: das
      Ziel auf den nach den Korrekturen tatsächlichen Wert anheben (aufgerundet auf die nächsten
      zehn Zeilen), **nicht** Inhalt löschen, den niemand zum Löschen freigegeben hat. Den neuen
      Wert nach Abschluss der übrigen Schritte aus `wc -l AGENTS.md` bestimmen und eintragen.

- [ ] **Branch-Präfix-Divergenz markieren (nicht auflösen).** Zeile 33 nennt vier Präfixe
      (`feature/*`, `fix/*`, `chore/*`, `docs/*`), CLAUDE.md Development Rule 7 nur drei.
      `scripts/preflight-pr-scope.sh` erzwingt Worktrees nur für `feature/*` und `fix/*` und
      verbietet `docs/*` nicht — technisch ist also keine der beiden Listen falsch. Die Divergenz
      wird in AGENTS.md mit einem kurzen Hinweis auf CLAUDE.md Rule 7 sichtbar gemacht; die
      Entscheidung, welche Liste gilt, bleibt Patrick überlassen (`design.md` § Offene Fragen).

- [ ] **Nachweisschritt: `website/CLAUDE.md` und `VideoVault/CLAUDE.md` auf Widersprüche prüfen.**
      Beide Dateien werden **gelesen, nicht geändert**. Geprüft wird, ob sie eine Aussage über
      Identity Provider, Deploy-Pfad, Agent-Routing oder Cluster-Topologie treffen, die den
      Root-Dateien widerspricht:

```bash
grep -niE 'keycloak|livekit|flux|push-based|pocket.?id|agent routing|workspace:deploy' \
  website/CLAUDE.md VideoVault/CLAUDE.md
```

Erwartet: keine Treffer, die eine Behauptung über diese Themen darstellen. Trifft der Befund nicht
zu, wird der Widerspruch hier dokumentiert und als eigener Schritt in diesem Partial korrigiert.
Der Vorbefund vom 2026-07-27 lautet: keine Widersprüche — `website/CLAUDE.md` beschreibt das
Astro/Svelte-Content-Modell, `VideoVault/CLAUDE.md` die client-first VideoVault-Architektur.

## Verifikation dieses Partials

```bash
grep -nc 'push-based\|Push-based' AGENTS.md || true
grep -c 'orchestrator' AGENTS.md
wc -l AGENTS.md
git diff --exit-code website/CLAUDE.md VideoVault/CLAUDE.md
```

**Akzeptanz:**

- `AGENTS.md` beschreibt Flux als primären Deploy-Pfad; kein "Push-based deploy" mehr als
  Beschreibung des Prod-Pfads.
- `gemma-4-12b` wird in `AGENTS.md` nicht mehr als write-capable bezeichnet; die Aussage deckt sich
  mit `write_capable` in `docs/agent-guide/registry/agents.yaml`.
- `orchestrator` erscheint in der opencode-Agent-Tabelle.
- Das in Zeile 3 genannte Zeilenziel ist größer oder gleich `wc -l < AGENTS.md`.
- `git diff --exit-code website/CLAUDE.md VideoVault/CLAUDE.md` endet mit Exit 0.
