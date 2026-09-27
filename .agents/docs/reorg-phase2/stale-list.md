# Stale-Liste — Befund, Beleg, Verdict

Mess-Stand: `PRE=0425e2bc3`. Alle Befehle laufen auf sauberem `origin/main`-Checkout.
Konvention: `G='<pfad>'` + `grep -rln "$G" --exclude-dir=node_modules --exclude-dir=.git
--exclude-dir=openspec .`

## Löschen (Repo, destruktiv — Freigabe nötig)

| Pfad | Befund | Beleg | Charge |
|------|--------|-------|--------|
| `openspec/` | 1.418 Dateien, 131 Specs, 932 archivierte Changes, **0 aktive**. SSOT-Rolle geht an Code + Guards + ADRs über | `ls openspec/changes` → nur `archive/`; Reaper-Check grün | C7b |
| `claude-code/` | 3 Dateien (Guide, settings, System-Prompt), kein maschineller Konsument, Root-Fehlplatzierung | `git ls-files claude-code` (3); Grep nur Doku-Treffer | C2 (Move nach `dotfiles/claude-code/`) |
| `openclaw/` | 1 Datei (`.env.example`), gehört zu `dotfiles/openclaw/` | `git ls-files openclaw`; Ref nur in `taskfiles/Taskfile.openclaw.yml:11` + Kommentar `Taskfile.yml:67` | C2 (Merge nach `dotfiles/openclaw/`, Refs anpassen) |
| `.openclaw/workspace-state.json` | Flüchtiger Harness-Zustand, versioniert — verstößt gegen Intent/Zustand-Trennung | `git ls-files .openclaw` | C2 (untracken + `.gitignore`) |

## Moven (Repo, nicht destruktiv)

| Pfad | Befund | Beleg | Ziel |
|------|--------|-------|------|
| `environments/korczewski/*`, `environments/mentolder/*` (Assets) | Brand-HTML, Screenshots, Uploads, CSS im Env-Config-Verzeichnis; von Live-Code **nicht** referenziert | Grep nur generierte Indexe (`repo-index.json`, `goals-data.generated.json`), History + `renovate.json5:54-55` (Ignores) | `assets/brands/{korczewski,mentolder}/` (C3) |
| `Taskfile.yml`-Bodies | 5.428 Zeilen in der Root-Fassade; Teil-Taskfiles existieren bereits (`taskfiles/`, 15 Dateien) | `wc -l Taskfile.yml`; `grep -n '^includes:' Taskfile.yml` | Bodies → `taskfiles/`, Root < 300 Zeilen (C4) |
| `CLAUDE.md`-Bulk | 10 KB Realdatei statt Zeiger/Import (Shadowing-Risiko); enthält Harness-Spezifika + delegierte Doktrin | `ls -la CLAUDE.md`; Header verweist auf AGENTS.md | Import + Harness-Abschnitt, Rest nach `.claude/` (C1) |
| Golden-Guards in `tests/spec/` | Akzeptanz-Guards ohne Schreibschutz für Agenten | Verzeichnis `tests/evals/` fehlt (`ls tests/`) | `tests/evals/` + Hook/CI-Schutz (C5) |

## Lokal putzen (gitignoriert, kein Commit — User-Aktion)

| Pfad | Befund | Beleg |
|------|--------|-------|
| `scratch/` | VM-Images (`ubuntu-*.img/.raw`, `cidata.iso`) im Arbeits-Checkout | `git check-ignore -v scratch` → `.gitignore:190`; `ls scratch/` |
| `website/` | Leer, ignoriert, überholt (Move nach `components/website/` done: 1.862 Dateien) | `git check-ignore -v website` → `.gitignore:12`; `ls website/` leer |
| `tmp/`, `.output/`, `node_modules/` | Ignorierter Scratch/Build-Output | `.gitignore:104,118,148` |
| `skills.json`, `.mishaps.log` | Ignorierte Harness-Artefakte | `.gitignore:180`; `git ls-files \| grep -i mishap` leer |
| `.gemini/`, `.vscode/`, `.lighthouseci/` | Lokal vorhanden, im Commit-Stand nicht enthalten | Fehlen in `git ls-files`-Dotdir-Aufstellung |
| `consideration.md` | 83 KB, User-Datei, ignoriert — **tabu, nicht anfassen** | `.gitignore:264` |

## Behalten (mit Begründung)

| Pfad | Begründung |
|------|------------|
| `.gitlab-ci.yml` + `.gitlab-ci-images/` | GitLab ist Mirror-Ziel mit eigenem Workflow (`mirror-to-gitlab.yml`); Images in 9 Build-Workflows referenziert. Verifikation „Pipeline live?“ als C0-Follow-up, kein Blind-Delete |
| `prod/`, `prod-fleet/`, `prod-mentolder/`, `prod-korczewski/` | In Taskfile/Skripten/`environments/` verdrahtet; Prod-Risiko. `prod-mentolder` vs `prod-fleet/mentolder`-Doppelung ist Follow-up-Epic, nicht Teil dieses Plans |
| `k3d/`, `flux/`, `scripts/`, `migrations/`, `templates/`, `tools/`, `wireguard/`, `rustdesk-installer/`, `docker/`, `design/`, `editor/`, `dev-local/`, `devmesh/` | Live bzw. konventionell; `devmesh/` + `editor/llama-vim` haben Test-Referenzen. Verstehen via `llms.txt`, nicht via Move |
| `.opencode/` (424), `.claude/` (77), `.agents/`, `.github/`, `.githooks/`, `.lavish/`, `.design-sync/`, `.agy/` | Harness-Häuser; Skills laufen bereits über Shared-Source-Symlinks (kein Triple-Maintenance) |
| `GEMINI.md`, `QWEN.md` | Bereits Zeiger (Phase 1) |
| `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `LICENSE`, Root-Configs | SSOT + GitHub-/Tooling-Konventionen; AGENTS.md wird nur entschlackt (C1) |
| `docs/*.docx` | Liefer-Artefakte (Handbücher, Fragebogen); Verbleib wird in C8 entschieden, nicht hier |
