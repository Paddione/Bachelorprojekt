## Why

Die lokale llama.cpp-FIM-Funktion ist im Editor nicht reproduzierbar integriert: `llama.vim` liegt nur als externes Beispiel in zwei Build-/Source-Verzeichnissen, arbeitet mit einem callback-anfälligen Request-Lebenszyklus und liefert Vorschläge erst nach der vollständigen Antwort. Eine repo-eigene, getestete Integration soll den vorhandenen Vim-9.1-Arbeitsplatz zuverlässig anbinden und zugleich einen modernen Neovim-0.10+-Pfad ermöglichen.

## What Changes

- Eine installierbare, repo-eigene `llama.vim`-Distribution mit dokumentierter Herkunft und einem idempotenten Setup-/Update-Pfad wird eingeführt; externe Dateien unter `~/.unsloth` und `~/opt/llama.cpp-src` bleiben unverändert.
- Der Transport erhält eine request-ID-basierte Zustandsmaschine mit genau einem aktiven FIM-Request pro Buffer, expliziter Cancellation und getrennten Adaptern für Neovim 0.10+ sowie Vim 9.1 mit Shell/Job-Fallback.
- FIM-Antworten werden als SSE oder NDJSON gestreamt, inkrementell zu Ghost Text zusammengesetzt und bei veralteten, abgebrochenen oder erkennbar repetitiven Ergebnissen verworfen.
- Transiente Fehler werden strukturiert klassifiziert und begrenzt mit exponentiellem Backoff erneut versucht; permanente Fehler bleiben sichtbar und lösen keine Retry-Schleife aus.
- Auto-FIM wird pro Filetype konfigurierbar, die Konfiguration wird gegen ein Schema geprüft und kann ohne Disable/Enable-Zyklus neu geladen werden.
- Der Kontext wird buffer-/dateipfadbezogen verwaltet, nutzt sprachbewusste Funktions-/Klassengrenzen und kann LSP-Definitionen bzw. -Referenzen priorisiert ergänzen, ohne bei fehlendem LSP zu scheitern.
- Endpoint-, Capability- und Modelldaten können über `/health`, `/props` und `/v1/models` ermittelt werden; explizite Konfiguration hat Vorrang. Verbindungszustand, Modell und Kontextbelegung werden über `:LlamaStatus` und eine optionale Statusline-Funktion bereitgestellt.
- Repo-Defaults adressieren den lokalen `qwen38-220k`-Loadout konfigurierbar über `127.0.0.1:8094`, erhöhen den lokalen Kontext auf 512 Prefix-Zeilen und begrenzen den Cross-File-Ring auf 32 Chunks. Ein offline gestarteter Server ist ein normaler, nicht blockierender Zustand.
- Nicht-Ziele: Installation von Neovim, Start/Stop des GPU-Servers, Änderungen an FreeToken auf Port 1919, automatisches Deployment sowie ein Upstream-PR an llama.cpp im Rahmen dieses Changes.

## Capabilities

### New Capabilities

- `vim-ai-completion`: Repo-eigene Vim-/Neovim-FIM-Integration mit Streaming, sicherem Request-Lebenszyklus, resilienter Konfiguration, kontextbewusster Vervollständigung und beobachtbarem Serverstatus.

### Modified Capabilities

Keine. Die bestehende Capability `llm-local-dev` verwaltet andere lokale LLM- und Providerpfade; deren Anforderungen werden durch die Editorintegration nicht geändert.

## Impact

- Neue Dateien unter `editor/llama-vim/`, ein Setup-/Prüfskript unter `scripts/vim/`, eine kurze Bedienungsdokumentation und offline ausführbare Vimscript-/BATS-Tests.
- Optionale Neovim-Lua-Laufzeit ab 0.10; Vim 9.1, `curl` und dessen Job-/Channel-API bleiben der auf diesem Rechner verifizierte Basispfad.
- Read-only HTTP-Zugriffe auf konfigurierbare lokale Endpunkte (`/health`, `/props`, `/v1/models`, `/infill`); keine Credentials und keine festgeschriebenen externen Modellpfade.
- Persönliche `~/.vimrc`-Anpassungen erfolgen ausschließlich über einen expliziten Installationsschritt mit Sicherung und werden nicht als Repository-Datei behandelt.

_Ticket: T900141_
