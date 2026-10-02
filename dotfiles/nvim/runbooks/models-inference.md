---
page: models-inference
ticket: T900663
status: complete
actions:
  - models-status
  - server-config
  - server-logs
  - gpu-resources
  - server-start
  - server-stop
---

## Voraussetzungen

- Neovim v0.12.5 mit der Dashboard-Foundation (T900655) und der Models & Inference Seite (T900663 p1+p2).
- `llama-server` unter `~/opt/llama-current/bin/llama-server` (verifiziert: Version 0.5.0-dev Build 747). Pruefen: `~/opt/llama-current/bin/llama-server --version | head -3`.
- systemd-User-Units `qwen38-gsq-iq2s` (`:1919`, Modell `Qwen3.8-27B-gsq-iq2s`) und `qwen35-mtp` (`:1920`, Modell `Qwen3.5-4B-MTP`). Pruefen: `systemctl --user is-active qwen38-gsq-iq2s qwen35-mtp`.
- LM Studio auf `:1234` (Prozess `llmster`). Pruefen: `curl -s -m 5 http://127.0.0.1:1234/v1/models | head -c 300`.
- `nvidia-smi` im `PATH` fuer die Ressourcen-Ansicht. Pruefen: `nvidia-smi --query-gpu=index,name,memory.used,memory.total --format=csv`.
- ToggleTerm (`akinsho/toggleterm.nvim`, bereits Kept-Plugin in `plugins/core.lua`) fuer die Log-Ansicht.
- Der aktuelle Buffer muss innerhalb eines Git-Repository liegen: Alle Aktionen loesen ihr Arbeitsverzeichnis zur Ausfuehrungszeit ueber `config.gitroot.root()` auf (nil-Guard: ohne Repository erscheint eine Warnung, keine Aktion startet).
- FreeToken ist ausgemustert (T900363, Skill `.agents/skills/freetoken-setup/SKILL.md` archiviert) und kein lebendes Backend dieser Seite. Aeltere Referenzen, die `:1919` als FreeToken-nativ bezeichnen (z. B. der Kommentar in `routing-check.sh`), sind stale und duerfen nicht befolgt werden.
- Die Unit `glimmer` ist inaktiv, obwohl ihr Service-File-Header noch das `:1919`-Backend beansprucht — der Header ist stale. Gueltig ist nur der Live-Status (`systemctl --user is-active`), den die Aktionen dieser Seite abfragen.

## Geordnete Schritte

Fokus-versus-Ausfuehrung: Das Navigieren auf der Seite (Cursor bewegen) fuehrt **keine** Aktion aus; erst Enter bzw. der Buchstabe der jeweiligen Zeile startet die Aktion.

1. **models-status**: Oeffnen Sie die Seite (Dashboard: `<leader>h`, Kapitel "Models & Inference"). Druecken Sie `s`. Die Aktion fragt `:1919`, `:1920` und `:1234` je mit `curl -m 5 /v1/models` ab, liest den Live-Status der beiden Units und zeigt eine Zusammenfassung (eine Zeile pro Backend: Name, Aktiv-Status, Modell-Ids oder Fehlergrund) per `vim.notify`.
2. **server-config**: Druecken Sie `c`. Die Aktion ermittelt die gerade aktive Unit, liest deren Repo-Service-Datei (`<git-root>/scripts/llm/<unit>.service`, z. B. `qwen38-gsq-iq2s.service`) plus den passenden `loadouts.json`-Eintrag und zeigt die effektiven Flags (`-c`, `-ngl`, `-fa`, `-ctk`/`-ctv`, `-np`, Draft-Einstellungen) schreibgeschuetzt in einem Scratch-Buffer.
3. **server-logs**: Druecken Sie `l`. Die Aktion oeffnet das Journal der aktiven Unit (`journalctl --user -u <unit> -f -n 100`) in einem ToggleTerm-Fenster. Ist keine Unit aktiv, erscheint stattdessen eine Warnung mit den geprueften Unit-Namen.
4. **gpu-resources**: Druecken Sie `g`. Die Aktion zeigt die `nvidia-smi`-Tabelle (Index, Name, belegter/gesamter Speicher, Auslastung, Temperatur) per `vim.notify`. Fehlt `nvidia-smi`, erscheint eine Warnung mit Installationshinweis.
5. **server-start**: Druecken Sie `b`. Explizite Start-Prozedur in zwei Bestaetigungen: zuerst die Unit per Auswahlmenue waehlen, dann wortwoertlich `yes` eintippen — erst danach laeuft `systemctl --user start <unit>` und der resultierende `is-active`-Status wird angezeigt. Ohne exakt `yes` passiert nichts (kein Auto-Start). Tuning-Prozedur (live Flag-Vokabular aus den Repo-Service-Dateien): `-c` Kontextgroesse, `-ngl` GPU-Layer, `-fa` Flash Attention, `-ctk`/`-ctv` KV-Quant-Typen, `-np` parallele Slots, `--spec-type` Draft-Typ. Unit-Installationsregel: kopieren, kein Symlink (`cp scripts/llm/<unit>.service ~/.config/systemd/user/`, danach `systemctl --user daemon-reload && systemctl --user enable --now <unit>`). Gemessene VRAM-Obergrenzen aus den Service-Headern: RTX 3060 Ti Desktop-Limit 7600 MiB, RTX 5070 Ti WSL-Spill-Decke nahe 15,9 GB.
6. **server-stop**: Druecken Sie `x`. Explizite Stop-Prozedur mit denselben zwei Bestaetigungen (Unit waehlen, `yes` tippen); erst danach laeuft `systemctl --user stop <unit>` und der resultierende Status wird angezeigt. Ohne exakt `yes` passiert nichts.

## Erwartetes Ergebnis

- Die Seite "Models & Inference" zeigt genau sechs Aktionen in dieser Reihenfolge: `models-status`, `server-config`, `server-logs`, `gpu-resources`, `server-start`, `server-stop`.
- `models-status` meldet eine Zeile pro Backend (`:1919`/`:1920` je mit Unit-Status und Modell-Ids, LM Studio `:1234` mit Modell-Ids, llm-proxy `:18235` als erreichbar-aber-auth-pflichtig oder mit dem konkreten Fehler).
- `server-config` oeffnet einen schreibgeschuetzten Buffer mit Alias, Modellpfad und den effektiven Flags der aktiven Unit.
- `server-logs` oeffnet ein ToggleTerm-Fenster mit dem laufenden Journal der aktiven Unit.
- `gpu-resources` zeigt die aktuelle GPU-Tabelle beider Karten.
- `server-start`/`server-stop` melden nach den zwei Bestaetigungen den neuen `is-active`-Status der gewaehlten Unit.
- Headless-Start des Moduls (`require('config.models-inference')`) endet mit Exit-Code 0 und definiert genau die sechs Aktionen.
- Es werden keine `BufWritePre`-Autocommands angelegt — keine Formatierung beim Speichern.

## Troubleshooting

- **Backend auf `:1919` unerreichbar**: `curl -s -m 5 http://127.0.0.1:1919/v1/models` pruefen; bei leerer Antwort den Unit-Status mit `systemctl --user is-active qwen38-gsq-iq2s` pruefen und ggf. per `server-start` starten.
- **Backend auf `:1920` unerreichbar**: `curl -s -m 5 http://127.0.0.1:1920/v1/models` pruefen; Unit-Status mit `systemctl --user is-active qwen35-mtp` pruefen.
- **Backend auf `:1234` unerreichbar**: `curl -s -m 5 http://127.0.0.1:1234/v1/models` pruefen; LM Studio (Prozess `llmster`) laeuft nicht — LM Studio starten.
- **Unit inaktiv**: `systemctl --user is-active qwen38-gsq-iq2s qwen35-mtp` zeigt `inactive` — per `server-start` (zwei Bestaetigungen) starten.
- **`glimmer` inaktiv trotz Header-Anspruch**: Erwartet — der `glimmer.service`-Header ist stale, `:1919` wird von `qwen38-gsq-iq2s` bedient. Nur `systemctl --user is-active` ist massgeblich, nicht der Header.
- **llm-proxy `:18235` antwortet mit Auth-Fehler**: `curl -s -m 5 http://127.0.0.1:18235/v1/models` liefert `{"error":{"code":"unauthorized"}}` — das belegt Erreichbarkeit (devmesh-Forward per `scripts/mcp-gateway/devmesh-forward.service`), aber keinen nutzbaren Zugriff. Kein Fehler der Seite.
- **`nvidia-smi` fehlt**: Warnung der Aktion — NVIDIA-Treiber installieren, danach `nvidia-smi -L` pruefen.
- **Log-Ansicht leer / Warnung statt Terminal**: Keine Unit aktiv — erst per `server-start` eine Unit starten, dann `server-logs` erneut aufrufen.
- **Start/Stop verweigert**: Die Bestaetigung war nicht exakt `yes` — Aktion erneut aufrufen und wortwoertlich `yes` eintippen.
- **Aktion startet nicht / Warnung "no project root"**: Der Buffer liegt ausserhalb eines Git-Repository. `git rev-parse --show-toplevel` im Buffer pruefen; in ein Repository wechseln.

## Recovery

- `server-stop` hinterlaesst keinen persistenten Zustand: Die Units lassen sich jederzeit per `server-start` wieder starten; es gibt nichts zurueckzurollen.
- Seite entfernen: `dotfiles/nvim/lua/config/models-inference.lua` loeschen und den `models-inference`-Block in `dotfiles/nvim/lua/config/dashboard.lua` (zwischen den `T900663`-Markern) entfernen — der Auto-Stub uebernimmt wieder.
- Konfiguration komplett zuruecksetzen: Das zeitgestempelte Backup-Verzeichnis `~/.config/nvim-backup-*` zurueckkopieren und Neovim neu starten.
