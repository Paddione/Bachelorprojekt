---
title: llm-start-port-cleanup
ticket_id: T002288
domains: [infra, test]
status: plan_staged
---

# llm-start-port-cleanup — Implementation Plan

Angleichen einer Inkonsistenz: `start-embed-server.ps1` und `start-rerank-server.ps1` räumen
ihren Port nicht, bevor sie einen neuen `llama-server` starten. `start-gemma-server.ps1` und
`start-gptoss-server.ps1` tun es. Root-Cause, Messwerte und Edge Cases: `design.md`.

## File Structure

| Datei | Zeilen (ist) | S1-Budget |
|---|---|---|
| `scripts/llm/start-embed-server.ps1` | 95 | kein Limit für diese Extension |
| `scripts/llm/start-rerank-server.ps1` | 92 | kein Limit für diese Extension |
| `tests/spec/llm-pipeline.bats` | 396 | kein Limit für diese Extension |

Keine neuen Dateien. `scripts/llm/start-gemma-server.ps1` dient nur als Vorlage und wird
nicht geändert.

## Task 1 — Failing Guard (rot)

Der verzeichnisweite Guard steht bereits in `tests/spec/llm-pipeline.bats` und ist rot.
Er iteriert über `scripts/llm/start-*.ps1` statt einzelne Dateien aufzuzählen, damit künftig
hinzukommende Startskripte automatisch abgedeckt sind — nach dem Vorbild des bestehenden
Guards `no scripts/llm/*.ps1 starts a server via Start-Job (T002276)`.

Step: Rot-Nachweis führen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline.bats
```

expected: FAIL — `not ok every scripts/llm/start-*.ps1 frees its port before starting (T002288)`
mit der Diagnosezeile `ohne Port-Raeumung: start-embed-server.ps1 start-rerank-server.ps1`.

## Task 2 — Port-Parameter und Räumung in start-embed-server.ps1

Der Räumungsblock referenziert `$Port`; das Skript hat diesen Parameter bisher nicht, der
Port steht literal in der Argumentliste. Deshalb zuerst den Parameter einführen, exakt wie
in `start-gemma-server.ps1` (`[int]$Port = 8091`).

Steps:

1. In den `param(...)`-Block (Zeile 28) nach `$LlamaDir` ergänzen: `[int]$Port = 8095`.
   Auf das Komma nach dem `$LlamaDir`-Eintrag achten — bisher ist es der einzige Parameter.
2. In der Argumentliste `"--port", "8095"` (Zeile 68) ersetzen durch `"--port", "$Port"`.
3. Vor dem Start des Prozesses den Räumungsblock aus `start-gemma-server.ps1` einfügen,
   inklusive des erklärenden Kommentars:

```powershell
# Port raeumen - ein noch laufender Server auf diesem Port laesst den neuen
# still am Bind scheitern.
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port $Port (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}
```

Acceptance: Kommentare in reinem ASCII (Guard T002275 verbietet Bytes über 0x7F in
`scripts/llm/*.ps1`), kein Ternary-Operator, kein `Start-Job`.

## Task 3 — Port-Parameter und Räumung in start-rerank-server.ps1

Identisch zu Task 2, mit den Werten dieses Skripts.

Steps:

1. In den `param(...)`-Block ergänzen: `[int]$Port = 8096`.
2. Argumentliste `"--port", "8096"` (Zeile 66) ersetzen durch `"--port", "$Port"`.
3. Denselben Räumungsblock wie in Task 2 vor dem Prozessstart einfügen.

Acceptance: identische Guards wie Task 2.

## Task 4 — Guard grün und Syntax prüfen

Steps:

1. PowerShell-Parse beider geänderter Skripte — ein Syntaxfehler würde sonst erst beim
   nächsten Anmelden auffallen, wo niemand zusieht:

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command "
foreach (\$f in @('start-embed-server.ps1','start-rerank-server.ps1')) {
  \$p='\\\\wsl\$\k3d-dev\home\patrick\Bachelorprojekt\.worktrees\llm-port-cleanup\scripts\llm\'+\$f
  \$err=\$null
  [System.Management.Automation.Language.Parser]::ParseFile(\$p,[ref]\$null,[ref]\$err) | Out-Null
  if (\$err.Count -eq 0) { Write-Output \"OK \$f\" } else { \$err | ForEach-Object { Write-Output \$_.Message } }
}"
```

2. Die Suite grün fahren:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline.bats
```

Acceptance: alle Tests `ok`, insbesondere der T002288-Guard sowie die unveränderten
T002260-Guards (`-b`/`-ub` auf volle Kontextlänge) und T002275-Guards (ASCII, kein Ternary).

## Task 5 — Laufzeit-Gegenprobe am echten Server

Der Guard prüft nur die Existenz des Blocks im Text. Dass er auch wirkt, muss einmal am
laufenden Stack belegt werden — genau die Lücke, durch die der Bug entstanden ist.

Steps:

1. PID des aktuellen Rerank-Servers auf 8096 notieren.
2. `scripts/llm/start-rerank-server.ps1` erneut ausführen.
3. Prüfen, dass danach **genau ein** `llama-server` mit Port 8096 läuft und seine PID neu ist:

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command "
Get-CimInstance Win32_Process -Filter \"Name='llama-server.exe'\" | Where-Object { \$_.CommandLine -match 'port 8096' } | Select-Object ProcessId,CreationDate"
```

4. Funktionsnachweis statt `/health` allein (T002260): `/rerank` mit vier Dokumenten muss
   vier Ergebnisse liefern.

Acceptance: genau ein Prozess auf 8096, VRAM nicht höher als vor dem Neustart.

## Task 6 — Verifikation

Steps:

1. `task test:changed`
2. `tests/unit/lib/bats-core/bin/bats tests/spec/llm-pipeline.bats` — die spec-Suite läuft
   in CI unter `test:spec:changed` und wird von `task test:changed` nicht abgedeckt.
3. `task test:inventory` und `website/src/data/test-inventory.json` mitcommitten, weil ein
   Test hinzugekommen ist.
4. `task freshness:regenerate`
5. `task freshness:check`

Acceptance: alle Kommandos Exit 0, Arbeitsbaum nach dem Commit sauber.
