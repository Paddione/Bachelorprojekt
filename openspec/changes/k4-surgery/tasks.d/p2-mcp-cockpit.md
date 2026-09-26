---
title: "k4-surgery/p2-mcp-cockpit — Partial Plan"
ticket_id: T900451
domains: [brain, cleanup]
status: active
---

# k4-surgery/p2-mcp-cockpit — Implementation Plan

_Ticket: T900451 · Change: k4-surgery (4/6) · Partial p2-mcp-cockpit (impl, disjoint — nur brain-mcp-Retire, Cockpit-Entverdrahtung, Vitest-Inventar)._

Designanker: E1 (brain-mcp retirieren, nicht repointen — Recall läuft über K1/K3), E5 (totaler Cockpit-Rückbau: lib + API-Route + Tests + brain.yaml + kustomization-Ref), E7 (nur funktionales Wiring; Doku-Prosa gehört 5/6). Disjunkt zu p1-pipeline (Taskfile-Dateien, Health-Goal-Dateien, Pipeline-Skripte samt Skill) — keine Datei dieses Partials steht in dessen File Structure. Messung: `bash scripts/plan-intel-filter.sh k4-surgery <targets>` meldete `intel.json not found` — Grep-Fallback, alle Pfade unten per `ls`/`grep`/`wc -l`/`jq` verifiziert. S4: Die Löschungen entfernen Skripte samt ihren Referenzen (Registry-Einträge, Harness-Configs, kustomization-Ref) — der kustomization-Edit hält S4 grün, es bleibt kein Orphan-Manifest zurück. Keine Baseline-Einträge werden hinzugefügt. S2/S3/CQ02: keine neue Codezeile, keine Hostnamen-Literale, keine any-Typen — nichts zu planen.

## File Structure

### Deleted (DEL — alle per `ls` verifiziert, Anweisung: `git rm`)

| path | act | lines |
| `scripts/brain-mcp-server.py` | DEL | 162 |
| `scripts/brain-mcp-node/` | DEL | 658 (3 Dateien) |
| `components/website/src/lib/sdlc/brain-links.ts` | DEL | 90 |
| `components/website/src/pages/sdlc/api/cockpit/brain.ts` | DEL | 83 |
| `components/website/src/lib/sdlc/brain-links.test.ts` | DEL | 52 |
| `components/website/src/pages/sdlc/api/cockpit/brain.test.ts` | DEL | 68 |
| `k3d/brain.yaml` | DEL | 72 |
| `k3d/oauth2-proxy-brain.yaml` | DEL | 139 |

(8 Pfade: 7 Dateien + Verzeichnis `scripts/brain-mcp-node/` mit `index.mjs` 410, `package.json` 6, `server.mjs` 242 — Verzeichnisliste verifiziert, Anweisung: `git rm -r`.)

### Edited (nur die genannten Blöcke, Rest byte-identical)

| path | act | ist | rest |
| `.mcp.json` | EDIT | 60 | n/a (60 → 51) |
| `.opencode/opencode.jsonc` | EDIT | 279 | n/a (279 → 267) |
| `docs/agent-guide/registry/mcp.yaml` | EDIT | 462 | n/a (462 → 431) |
| `docs/agent-guide/registry/capabilities.yaml` | EDIT | 840 | n/a (840 → 821) |
| `docs/agent-guide/maps/toolset-map.md` | EDIT | 694 | n/a (694 → 677) |
| `k3d/kustomization.yaml` | EDIT | 146 | n/a (146 → 143) |
| `docker/mcp-node/supervisor.sh` | EDIT | 154 | 646 (.sh-Limit 800) |
| `k3d/ingress.yaml` | EDIT | 197 | n/a (197 → 187) |
| `k3d/dev-pod/deployment.yaml` | EDIT | 250 | n/a (250 → 249) |
| `k3d/dev-pod/service.yaml` | EDIT | 32 | n/a (32 → 31) |

- `.mcp.json` Ist 60 · Baseline nicht-baselined · kein `.json`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit ist reiner Shrink (−9 Zeilen, Block 3–11).
- `.opencode/opencode.jsonc` Ist 279 · Baseline nicht-baselined · kein `.jsonc`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit ist reiner Shrink (−12 Zeilen, Block 183–194).
- `docs/agent-guide/registry/mcp.yaml` Ist 462 · Baseline nicht-baselined · kein `.yaml`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit ist reiner Shrink (−31 Zeilen, Block 202–232).
- `docs/agent-guide/registry/capabilities.yaml` Ist 840 · Baseline nicht-baselined · kein `.yaml`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit ist reiner Shrink (−19 Zeilen, Blöcke 374–392).
- `docs/agent-guide/maps/toolset-map.md` Ist 694 · Baseline nicht-baselined · kein `.md`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit ist reiner Shrink (−17 Zeilen, Blöcke 311–327).
- `k3d/kustomization.yaml` Ist 146 · Baseline nicht-baselined · kein `.yaml`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit ist reiner Shrink (−3 Zeilen, 116–118).
- `docker/mcp-node/supervisor.sh` Ist 154 · Baseline nicht-baselined · `.sh`-Limit 800 aus `gates.yaml` → Budget 646; Edit entfernt 1 Zeile + 2 Teilzeilen (→ 153).
- `k3d/ingress.yaml` Ist 197 · Baseline nicht-baselined · kein `.yaml`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit ist reiner Shrink (−10 Zeilen, Regel 108–117).
- `k3d/dev-pod/deployment.yaml` Ist 250 · Baseline nicht-baselined · kein `.yaml`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit entfernt 1 Zeile + 2 Teilzeilen (→ 249).
- `k3d/dev-pod/service.yaml` Ist 32 · Baseline nicht-baselined · kein `.yaml`-Eintrag in `s1.limits` (Extension ungated) → keine S1-Zahl; Edit entfernt 1 Zeile (→ 31).

### Grenzen (explizit NICHT anfassen)

- Taskfile-Dateien + Health-Goal-Dateien (p1), Doku-Prosa (`docs/brain/k4*`, Runbooks, `mcp-tool-guide.md`), `k3d/docs-content-built/`, BATS-Guards — alles nicht dieser Partial.
- `oauth2-proxy-brainstorm.yaml` + `brainstorm-tls`-Ingress (dev-stack): anderes Feature (Brainstorming, nicht Brain-Wiki) — bleibt.
- G-BRAIN15 + `templates/brain/` (p1-Grenze, bleibt grün).

### Task 1: brain-mcp-Retire (E1)

**Files:** `scripts/brain-mcp-server.py`, `scripts/brain-mcp-node/`, `.mcp.json`, `.opencode/opencode.jsonc`, `docs/agent-guide/registry/mcp.yaml`, `docs/agent-guide/registry/capabilities.yaml`, `docs/agent-guide/maps/toolset-map.md`, `docker/mcp-node/supervisor.sh`, `k3d/dev-pod/deployment.yaml`, `k3d/dev-pod/service.yaml`.

Löschungen:

```bash
git rm scripts/brain-mcp-server.py
git rm -r scripts/brain-mcp-node
```

Edits (Rest byte-identical; bei Zeilenversatz per Anker-Grep relokalisieren — Muster stehen je Edit):

1. `.mcp.json` Zeilen 3–11 löschen (exakter Wortlaut, Anker `grep -n '"brain-mcp-node"' .mcp.json` → genau 1 Treffer, Block bis Folgezeile `    },`):
```text
    "brain-mcp-node": {
      "command": "node",
      "args": [
        "scripts/brain-mcp-node/server.mjs"
      ],
      "env": {
        "BRAIN_WIKI_DIR": "~/brain/wiki"
      }
    },
```
2. `.opencode/opencode.jsonc` Zeilen 183–194 löschen (Leerzeile 183 + Block; Leerzeile 195 bleibt, Anker `grep -n '"brain-mcp-node"' .opencode/opencode.jsonc`):
```text

    "brain-mcp-node": {

      "type": "local",

      "command": ["node","scripts/brain-mcp-node/server.mjs"],

      "environment": {"BRAIN_WIKI_DIR":"~/brain/wiki"},

      "enabled": false

    },
```
3. `docs/agent-guide/registry/mcp.yaml` Zeilen 202–232 löschen (Block + Leerzeile 232; Kommentar 196–201 bleibt, er beschreibt auch `ticket-mcp-node`; Anker `grep -n '^  brain-mcp-node:' docs/agent-guide/registry/mcp.yaml`):
```text
  brain-mcp-node:
    transport: stdio
    command: node
    args: [/home/patrick/Bachelorprojekt/scripts/brain-mcp-node/server.mjs]
    env:
      BRAIN_WIKI_DIR: ~/brain/wiki
    harness:
      claude_code:
        command: node
        args: [scripts/brain-mcp-node/server.mjs]
        env:
          BRAIN_WIKI_DIR: ~/brain/wiki
      agy:
        command: node
        args: [/home/patrick/Bachelorprojekt/scripts/brain-mcp-node/server.mjs]
        env:
          BRAIN_WIKI_DIR: ~/brain/wiki
      opencode:
        # opencode laeuft seit 2026-09-11 in WSL (nicht mehr nativ auf
        # Windows/pk-desktop). Der Server ist stdio und laeuft dort, wo der
        # Harness laeuft — Pfad bleibt relativ/portabel.
        type: local
        # Kein Brain-Wiki-Checkout unter ~/brain/wiki — weder auf dem
        # Windows-Host noch in WSL (2026-09-11 verifiziert, siehe brain-ingest):
        # der Server ist nicht startbar, bis das Brain-Repo ausgecheckt ist.
        # Disabled statt toter Pfad; Pfad ist trotzdem portabel.
        command: [node, scripts/brain-mcp-node/server.mjs]
        environment:
          BRAIN_WIKI_DIR: ~/brain/wiki
        enabled: false
```
4. `docs/agent-guide/registry/capabilities.yaml` Zeilen 374–392 löschen (Fähigkeit `wissens-wiki` mit `skill:brain-ingest`-Block 374–381 — der Skill wird in p1 gelöscht, der Eintrag würde dangling stehen — plus Leerzeile 382 plus Fähigkeit `wiki-nachschlagen` 383–391 plus Leerzeile 392; Anker `grep -n 'skill:brain-ingest\|mcp:brain-mcp-node' docs/agent-guide/registry/capabilities.yaml`):
```text
  wissens-wiki:
    skill:brain-ingest:
      state: canonical
      use_when: "Brain-Wiki kompilieren und ins externe Paddione/brain-Repo veröffentlichen."
      avoid_when: "Zum Lesen des Wikis — dieser Skill schreibt es."
      roles: [orchestrator]
      tier: caution
      deep_ref: ".claude/skills/brain-ingest/SKILL.md"

  wiki-nachschlagen:
    mcp:brain-mcp-node:
      state: canonical
      use_when: "Im Brain-Wiki nachschlagen: BM25-Suche und Seiten lesen (brain_search, brain_read)."
      avoid_when: "Wiki kompilieren/veröffentlichen — dafür wissens-wiki/brain-ingest."
      fallback: "grep -r <begriff> ~/brain/wiki"
      roles: [all]
      tier: safe
      deep_ref: ".claude/skills/references/mcp-tool-guide.md"
```
5. `docs/agent-guide/maps/toolset-map.md` Zeilen 311–327 löschen (Abschnitt `wissens-wiki` mit `skill:brain-ingest`-Block 311–317 — der Skill wird in p1 gelöscht — plus Leerzeile 318 plus Abschnitt `wiki-nachschlagen` 319–326 plus Leerzeile 327; übrige Prosa bleibt per E7 für 5/6; Anker `grep -n 'skill:brain-ingest\|mcp:brain-mcp-node' docs/agent-guide/maps/toolset-map.md`):
```text
## Fähigkeit: `wissens-wiki`

- **`skill:brain-ingest`** — Status `canonical` · Tier `caution`
  - _Wann:_ Brain-Wiki kompilieren und ins externe Paddione/brain-Repo veröffentlichen.
  - _Nicht:_ Zum Lesen des Wikis — dieser Skill schreibt es.
  - _Rollen:_ `orchestrator`
  - _Tiefe:_ `.claude/skills/brain-ingest/SKILL.md`

## Fähigkeit: `wiki-nachschlagen`

- **`mcp:brain-mcp-node`** — Status `canonical` · Tier `safe`
  - _Wann:_ Im Brain-Wiki nachschlagen: BM25-Suche und Seiten lesen (brain_search, brain_read).
  - _Nicht:_ Wiki kompilieren/veröffentlichen — dafür wissens-wiki/brain-ingest.
  - _Fallback:_ `grep -r <begriff> ~/brain/wiki`
  - _Rollen:_ `all`
  - _Tiefe:_ `.claude/skills/references/mcp-tool-guide.md`
```

6. `docs/agent-guide/registry/mcp.yaml` Zeile 433 löschen (exakter Wortlaut, Anker `grep -n 'name: brain-mcp' docs/agent-guide/registry/mcp.yaml` → genau 1 Treffer):
```text
        - { name: brain-mcp, port: 3004 }
```
7. `docker/mcp-node/supervisor.sh`: `brain-mcp` aus 3 Stellen streichen (Server wird oben gelöscht, der Supervisor würde sonst einen toten Pfad starten) — Zeile 19 Kommentar (`, brain-mcp` entfernen), Zeile 69 `KNOWN=` (`brain-mcp ` entfernen), Zeile 130 Gateway-Zeile vollständig löschen:
```text
enabled brain-mcp       && gateway brain-mcp     3004 "node $REPO/scripts/brain-mcp-node/server.mjs"
```
8. `k3d/dev-pod/deployment.yaml`: Zeile 8 Kommentar (`, brain-mcp` entfernen), Zeile 91 `MCP_NODE_SERVICES`-Value (`brain-mcp,` entfernen), Zeile 117 Port-Zeile vollständig löschen:
```text
            - { containerPort: 3004, name: brain, protocol: TCP }
```
9. `k3d/dev-pod/service.yaml` Zeile 30 vollständig löschen:
```text
    - { name: brain, port: 3004, targetPort: 3004, protocol: TCP }
```

Verifikation (Muss-Ergebnisse in Klammern):

```bash
test ! -e scripts/brain-mcp-server.py && test ! -d scripts/brain-mcp-node
jq empty .mcp.json && echo "OK: .mcp.json valides JSON"
bash -n docker/mcp-node/supervisor.sh && echo "OK: supervisor.sh Syntax"
grep -rn "brain-mcp-node" .mcp.json .opencode/opencode.jsonc docs/agent-guide/registry/mcp.yaml docs/agent-guide/registry/capabilities.yaml docs/agent-guide/maps/toolset-map.md && exit 1 || echo "OK: 0 brain-mcp-node-Treffer im Wiring"
grep -rn "brain_search\|brain_read" docs/agent-guide/registry/capabilities.yaml docs/agent-guide/maps/toolset-map.md && exit 1 || echo "OK: 0 brain_search/brain_read-Treffer im Wiring"
grep -rn "skill:brain-ingest" docs/agent-guide/registry/capabilities.yaml docs/agent-guide/maps/toolset-map.md && exit 1 || echo "OK: 0 skill:brain-ingest-Treffer (Skill in p1 geloescht)"
grep -n "brain-mcp" docker/mcp-node/supervisor.sh k3d/dev-pod/deployment.yaml && exit 1 || echo "OK: 0 brain-mcp-Treffer in Supervisor/Bundle"
grep -n "3004" k3d/dev-pod/deployment.yaml k3d/dev-pod/service.yaml docs/agent-guide/registry/mcp.yaml && exit 1 || echo "OK: Port 3004 nirgends mehr verdrahtet"
```

Muss zeigen: beide Pfade weg, `.mcp.json` valides JSON, `supervisor.sh` Syntax ok, alle Greps melden 0 Treffer.

### Task 2: Cockpit-Entverdrahtung (E5)

**Files:** `components/website/src/lib/sdlc/brain-links.ts`, `components/website/src/pages/sdlc/api/cockpit/brain.ts`, `components/website/src/lib/sdlc/brain-links.test.ts`, `components/website/src/pages/sdlc/api/cockpit/brain.test.ts`, `k3d/brain.yaml`, `k3d/oauth2-proxy-brain.yaml`, `k3d/kustomization.yaml`, `k3d/ingress.yaml`.

```bash
git rm components/website/src/lib/sdlc/brain-links.ts components/website/src/pages/sdlc/api/cockpit/brain.ts \
  components/website/src/lib/sdlc/brain-links.test.ts components/website/src/pages/sdlc/api/cockpit/brain.test.ts \
  k3d/brain.yaml k3d/oauth2-proxy-brain.yaml
```

`k3d/kustomization.yaml` Zeilen 116–118 löschen (Brain-Kommentar + beide Refs; die Datei `oauth2-proxy-brain.yaml` ist vollständig brain-spezifisch — Upstream `http://brain:80`, Client-ID `brain` — und geht mit; Anker `grep -n 'brain\.yaml' k3d/kustomization.yaml` → genau 2 Treffer):
```text
  # Brain — Quartz-rendered LLM-wiki static site (T001569)
  - brain.yaml
  - oauth2-proxy-brain.yaml
```

`k3d/ingress.yaml` Zeilen 108–117 löschen (vollständige `brain.localhost`-Regel bis einschließlich `number: 4180`; Anker `grep -n 'host: brain.localhost' k3d/ingress.yaml` → genau 1 Treffer, Block bis zur Folgezeile `    - host: downloads.localhost`):
```text
    - host: brain.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-brain
                port:
                  number: 4180
```

Verifikation (Muss-Ergebnisse in Klammern):

```bash
for f in components/website/src/lib/sdlc/brain-links.ts components/website/src/pages/sdlc/api/cockpit/brain.ts \
  components/website/src/lib/sdlc/brain-links.test.ts components/website/src/pages/sdlc/api/cockpit/brain.test.ts \
  k3d/brain.yaml k3d/oauth2-proxy-brain.yaml; do
  test ! -e "$f" || { echo "DEL-REST: $f"; exit 1; }
done
grep -rn "brain-links" --include="*.ts" --include="*.mjs" --include="*.svelte" --include="*.astro" --include="*.py" --include="*.sh" --exclude-dir=node_modules --exclude-dir=.worktrees . && exit 1 || echo "OK: 0 brain-links-Referenzen im Code"
grep -rn "BRAIN_INTERNAL_URL" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.worktrees . | grep -v "^\./openspec/" && exit 1 || echo "OK: kein BRAIN_INTERNAL_URL ausserhalb openspec"
grep -rn "oauth2-proxy-brain\b" k3d/ --include="*.yaml" | grep -v brainstorm && exit 1 || echo "OK: 0 oauth2-proxy-brain-Refs in k3d (brainstorm ausgenommen)"
grep -n "brain" k3d/ingress.yaml k3d/kustomization.yaml && exit 1 || echo "OK: 0 brain-Treffer in ingress/kustomization"
task workspace:validate
```

Muss zeigen: alle 6 Pfade weg, 0 `brain-links`-Referenzen in Code-Extensions repo-weit (alle 3 standen in gelöschten Dateien), `BRAIN_INTERNAL_URL` nur noch in `openspec/` (Delta-Spec + Archiv), keine Brain-Refs in k3d-Manifeste, `task workspace:validate` grün.

### Task 3: Vitest-Inventar

**Files:** `components/website/src/data/test-inventory.json` (generiert, via Task neu schreiben).

<!-- vitest: kein neuer Test nötig, weil dieser Partial nur Dateien löscht und keine Logik ändert oder hinzufügt -->

```bash
task test:inventory
grep -n "brain-links\.test\|cockpit/brain\.test" components/website/src/data/test-inventory.json && exit 1 || echo "OK: geloeschte Vitest-Dateien nicht im Inventar"
git add components/website/src/data/test-inventory.json
git status --porcelain | grep -E "brain-links|cockpit/brain|test-inventory"
```

Muss zeigen: Inventar ohne die beiden Vitest-Pfade (Planstand: 0 `.test.ts`-Einträge repo-weit — das Inventar mappt BATS/e2e, Regen hält das fest). Die beiden per `git rm` gestagten Test-Löschungen aus Task 2 werden zusammen mit dem Inventar-Update in einem Commit committet:

```bash
git commit -m "refactor(mcp): retire brain-mcp + cockpit brain wiring [T900451]"
```

### Task 4: Verifikation — Gates

**Files:** keine (reine Verify-Task).

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Muss zeigen: alle drei grün. Das Regen aktualisiert die generierten Artefakte (u. a. fallen die `api-inventory.json`-Einträge `/sdlc/api/cockpit/brain` + `brain-mcp-node` und die `repo-index.json`-Pfade der gelöschten Dateien weg) — Änderung mitcommitten, falls der Baum danach dirty ist.
