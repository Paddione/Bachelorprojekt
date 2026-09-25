# glimmer-worker-mcp

MCP-Server, über den **Muse Code** (Metas Coding-CLI, WSL und Windows) das lokale **Muse Glimmer 30B**
(`llama-server` auf `:1919`, `scripts/llm/glimmer.service`) als Arbeitermodell nutzt. Muse Spark plant und
prüft, Glimmer führt abgegrenzte Aufgaben lokal aus. Ticket T900373, Design:
`openspec/changes/archive/*glimmer-worker-mcp/design.md`.

## Warum MCP und kein Muse-Provider

Muse Code spricht nur mit seinem Meta-Provider. Auf `:1919` umgebogen, verwirft es llama-servers
Responses-Stream (`reason="protocol"`), und llama-server verwirft Muses `namespace`-Tools. MCP ist Muses
offizieller Erweiterungspunkt.

## Tools

| Tool | Zweck |
|---|---|
| `glimmer_worker_start {task, cwd, timeout_s?}` | Auftrag einreihen; liefert sofort `job_id`. `cwd` muss in einem Git-Arbeitsbaum liegen; Windows-Pfade (`C:\…`, `\\wsl.localhost\<distro>\…`) werden übersetzt. |
| `glimmer_worker_result {job_id, wait_s?}` | Wartet höchstens 55 s; am Ende `status`, `exit_code`, `summary`, `git_status`, `diff_stat`. |
| `glimmer_worker_status {}` | Zustand von `:1919` (Modell, `n_ctx`) und der Warteschlange. |

Ein Job führt `opencode run --agent glimmer-primary --dir <cwd> <task>` aus. Jobs laufen nacheinander,
weil `:1919` einen Slot hat (`-np 1`); Default-Zeitlimit 900 s.

## Installation

```bash
task llm:glimmer-worker:install
```

Der Installer erzeugt das Bearer-Token (`~/.config/glimmer-worker-mcp/server.env`, Modus 600), startet die
User-Unit `glimmer-worker-mcp` auf `127.0.0.1:13007` und trägt `mcpServers.glimmer-worker` in
`~/.config/muse/settings.json` (WSL) und `%USERPROFILE%\.config\muse\settings.json` (Windows) ein, jeweils mit
Backup (`.bak`). Windows erreicht den WSL-Listener über `networkingMode = Mirrored` in `.wslconfig`.

Nur die Registrierung erneuern (z. B. nach einem Muse-Update, das `settings.json` neu schreibt):

```bash
bash scripts/glimmer-worker-mcp/install.sh --register-only
```

## Grenzen

- Nur Git-Arbeitsbäume: jede Änderung des Workers ist als Diff sichtbar und zurücksetzbar.
- Die Warteschlange sieht nur ihre eigenen Jobs; ein gleichzeitiger opencode-`local`-Dispatch teilt sich den
  Slot auf `:1919` und verlängert die Wartezeit.
- Bewusst **nicht** in `docs/agent-guide/registry/mcp.yaml`: `task mcp:sync` würde den Server sonst in
  opencode eintragen, wo `glimmer-primary` selbst läuft (Rekursion).
