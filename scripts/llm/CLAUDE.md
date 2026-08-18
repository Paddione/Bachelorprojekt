# PowerShell-Skripte in scripts/llm/

Diese Datei laedt automatisch, sobald an Dateien unter `scripts/llm/` gearbeitet wird. Ausgelagert aus der Wurzel-`CLAUDE.md` am 2026-08-18.

### PowerShell-Skripte aus WSL (.ps1) [T002495-M7]

PowerShell-Skripte unter `scripts/llm/*.ps1`, die aus WSL bearbeitet werden:
- MÜSSEN rein ASCII kodiert sein (kein BOM, keine typografischen Sonderzeichen/Em-Dashes). PS 5.1 unter Windows liest UTF-8 ohne BOM als CP1252.
- Vor dem Commit mit `[System.Management.Automation.Language.Parser]::ParseFile` oder BATS/linter prüfen.
- Generierte Konfigurationsdateien (`.conf`) mit `-Encoding ASCII` statt `UTF8` schreiben (BOM in WireGuard-Confs bricht Tunnel-Services ab).

