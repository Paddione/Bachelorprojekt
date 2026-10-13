# Devmesh Python Sandbox Worker

Hardware-isolierte, unprivileged Python-Ausführungsumgebung für Devmesh-Agenten (Lead Orchestrator 9B, Reasoning Worker 4B, Execution Worker 2B, Antigravity/Codex/Claude).

## Sicherheits- & Isolationsarchitektur

Die Sandbox basiert auf unprivileged Linux-Namespaces via **Bubblewrap (`bwrap`)**:

1. **Vollständiges Airgap (`--unshare-all`)**:
   - `CLONE_NEWNET`: Kein Netzwerkzugriff. Socket-Erstellung schlägt mit `ENETUNREACH` fehl. Schutz interner Datenbanken, Tailnet-Knoten und Secrets.
   - `CLONE_NEWPID`: Der Prozess sieht ausschließlich sich selbst als isolierten Prozessbaum. Host-Prozesse sind unsichtbar.
   - `CLONE_NEWNS`: Das Host-Dateisystem (`/home`, `/root`, `/etc/shadow`, Git-Worktrees, SSH-Schlüssel, Dotfiles) existiert im Mount-Namespace nicht.
   - `CLONE_NEWIPC` & `CLONE_NEWUTS`: Keine Interprozesskommunikation mit dem Host.

2. **Ephemeres Dateisystem**:
   - Nur das spezifische Arbeitsverzeichnis wird beschreibbar unter `/workspace` eingehängt.
   - Systembibliotheken (`/usr`, `/lib`, `/bin`) sind read-only gemountet.
   - Nach der Ausführung werden neu erzeugte Artefakte extrahiert und das Verzeichnis atomar gelöscht.

3. **Ressourcenquoten**:
   - `RLIMIT_AS`: Virtuelles Speicherlimit (Standard 512 MB, konfigurierbar bis 4096 MB) gegen Memory Leaks / OOM.
   - `RLIMIT_CPU`: Begrenzung der CPU-Zeit.
   - Harter Execution-Timeout via `subprocess.TimeoutExpired`.
   - `--die-with-parent`: Kills der Sandbox bei Abbruch des aufrufenden Prozesses.

## Komponenten

- `engine.py`: Core Sandbox Runner (bwrap Wrapper, File Validation, Pytest Runner, Artifact Collector).
- `server.py`: FastAPI Microservice (`GET /health`, `POST /v1/execute`, `POST /v1/pytest`).
- `mcp_server.py`: Model Context Protocol (MCP) JSON-RPC Stdio-Server für direkte Harness-Einbindung.

## Endpunkte

### `POST /v1/execute`
```json
{
  "code": "print('Ergebnis:', 40 + 2)",
  "files": {"data.txt": "123"},
  "timeout_seconds": 10,
  "memory_limit_mb": 256
}
```

### `POST /v1/pytest`
```json
{
  "test_code": "def test_math(): assert 2 + 2 == 4",
  "source_files": {"app.py": "def add(a, b): return a + b"},
  "timeout_seconds": 15
}
```
