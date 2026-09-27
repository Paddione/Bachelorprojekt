# Zielbaum — annotiert

Legende: `+` neu · `~` ändern/entschlacken · `→` Move-Ziel · `-` entfällt · sonst unverändert.

```
BACHELORPROJEKT/
├── AGENTS.md                ~ auf Kern + Verweise dünnen (SSOT bleibt)
├── CLAUDE.md                ~ Import + Harness-Abschnitt (statt 10 KB Bulk)
├── GEMINI.md  QWEN.md         Zeiger (bleiben)
├── README.md  CONTRIBUTING.md  LICENSE
├── llms.txt                 + Howard-Index (System, Architektur, Operatives)
├── Taskfile.yml             ~ Fassade: nur Includes + Aliase (< 300 Zeilen)
├── package.json(.lock)        Script-Test-Harness (bleibt)
├── Root-Configs               .mcp.json, renovate.json5, release-please-*,
│                              commitlint, lighthouserc, compose.dev.yaml … (bleiben)
├── .agents/                 ~ + docs/ (dieses Dossier), + memory/learnings.md
├── .claude/  .opencode/  .github/  .githooks/  .agy/  .lavish/  .design-sync/
│   └── Harness-Häuser (bleiben; Skills via Shared-Source-Symlinks)
├── apps/                      App-Registry (bleibt)
├── assets/                  ~ + brands/{korczewski,mentolder}/ (aus environments/)
│   └── schemas/               Schnittstellenverträge (bleibt, kein 2. schemas/)
├── components/  packages/     Build-Komponenten + npm-Pakete (bleiben)
├── design/  docker/  editor/  dev-local/  devmesh/  dotfiles/  flux/
├── k3d/  migrations/  templates/  tools/  wireguard/  rustdesk-installer/
│   └── Betriebs-Ordner (bleiben; dotfiles/ nimmt claude-code/ + openclaw/.env auf)
├── docs/                    ~ innen: adr/ bleibt; archive/, generated/, legacy-html/,
│                              drift-reports/, audits/ konsolidieren (C8)
├── environments/            ~ minus Brand-Assets (nur noch YAML + certs + sealed-secrets)
├── prod/  prod-fleet/  prod-mentolder/  prod-korczewski/  (bleiben, Follow-up-Epic)
├── scripts/  taskfiles/       (bleiben; taskfiles/ wächst durch C4)
├── tests/                   ~ + evals/ (geschützte Golden-Guards, C5)
├── openspec/                - Abriss in C7 (nach ADR-Extraktion + Guard-Entkopplung)
├── claude-code/  openclaw/   - Moves nach dotfiles/ (C2)
└── .openclaw/workspace-state  - untracken + ignorieren (C2)
```

## Begründete Abweichungen vom 10-Punkte-Papier

1. **Kein `.agent/` (Singular) neben `.agents/` (Plural).** `.agents/` ist etabliert
   (Skills, Shared Source). Ein zweites, fast gleichnamiges Verzeichnis wäre exakt die
   Verwirrung, die dieser Reorg abbaut. Memory (`learnings.md`) und Dossiers (`docs/`)
   leben unter `.agents/`.
2. **Kein `models.yaml`-Duplikat.** Routing-SSOT ist `.opencode/agent-models.jsonc`.
   Eine zweite Routing-Datei würde driften; der Plan referenziert die bestehende.
3. **Kein `schemas/` neben `assets/schemas/`.** `assets/schemas/` hat 80+ Konsumenten
   (Skill-Vertrag). Zweit-Heimat verboten; `llms.txt` dokumentiert die Lage.
4. **Kein `.tools/mcp-servers.json`.** `.mcp.json` ist der Client-Standard (Claude Code
   liest ihn nativ). MCP-Einträge der AST-Toolchain kommen dorthin (C9).
5. **`docs/adr/` statt `docs/decisions/`.** ADR-001…009 existieren; Umbenennung ohne Gewinn.
   ADR-010 (OpenSpec ad acta) liegt diesem Branch bei.
6. **Taskfile statt Makefile.** Go-task ist Repo-Standard (15 Teil-Taskfiles, CI, Skills).
   Eine zweite Fassade wäre Drift; stattdessen Root-Taskfile-Diät (C4).

## Offene Verifikationen (jeweils vor der Charge)

- GitLab-Pipeline live oder nur Mirror? (Bedingung für `.gitlab-ci.yml`-Verbleib, C0)
- `dotfiles/openclaw/.env`: vor Move Secret-Scan (gitleaks), kein Inhalt in Commits (C2)
- `prod-mentolder` vs `prod-fleet/mentolder`: Doppelungs-Audit als Follow-up-Epic (außerhalb)
- `.docx` in `docs/`: Verbleib vs. Release-Artefakte in C8 entscheiden
