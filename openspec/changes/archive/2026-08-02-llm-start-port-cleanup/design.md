# llm-start-port-cleanup — Design

## Purpose

Die Startskripte des lokalen LLM-Stacks verhalten sich uneinheitlich beim Neustart: zwei von
vier räumen ihren Port nicht, bevor sie einen neuen `llama-server` starten. Dadurch entstehen
Zombie-Prozesse, die den Port verlieren, ihr Modell aber weiter im VRAM halten. Auf einer
16-GB-Karte, die sich drei Modelle teilen, ist das unmittelbar spürbar.

## Root Cause

Gemessen am 2026-07-27 nach einem Lauf von `llm-stack-autostart.cmd` bei bereits laufendem Stack:

```
Port ProcId Start
8091  17692 07:19:50   <- neu, lauscht      (sauber ersetzt)
8095  12764 03:40:20   <- ALT, lauscht NICHT (Zombie)
8095  27532 07:19:49   <- neu, lauscht
8096  12720 06:44:38   <- ALT, lauscht NICHT (Zombie)
8096   7888 07:19:49   <- neu, lauscht
```

VRAM mit Zombies: 14119 von 16303 MiB belegt (1879 frei).
VRAM nach dem Killen von 12764 und 12720: 12285 MiB belegt (3713 frei).
Kostenpunkt also rund 1,8 GB pro Lauf, **kumulierend** bei jedem weiteren Aufruf.

Ursache ist ein fehlender Räumungsblock. Verifiziert per grep über alle vier Startskripte:

| Skript | `Get-NetTCPConnection` |
|---|---|
| `start-gemma-server.ps1` | vorhanden |
| `start-gptoss-server.ps1` | vorhanden |
| `start-embed-server.ps1` | **fehlt** |
| `start-rerank-server.ps1` | **fehlt** |

Der Block existiert also bereits zweifach im Repo — es ist keine neue Mechanik zu entwerfen,
sondern eine Inkonsistenz anzugleichen.

## Warum es zählt, obwohl der Reboot-Autostart sauber ist

Beim echten Anmelden läuft noch kein Server, dort entsteht kein Zombie. Getroffen wird
ausgerechnet der **dokumentierte Testpfad**: `install-startup-autostart.ps1` gibt selbst aus

> "Wirksam ab der naechsten Anmeldung. Sofort testen ohne Neustart: & '$shim'"

Genau dieser Aufruf produziert das Leck. Ebenso jeder manuelle Neustart eines einzelnen
Servers über sein Startskript. Ein Defekt, der nur die Verifikation trifft, ist besonders
unangenehm, weil er das Vertrauen in den Schritt untergräbt, der ihn finden soll.

## Fix-Ansatz

Den vorhandenen Block aus `start-gemma-server.ps1` nach `start-embed-server.ps1` und
`start-rerank-server.ps1` übernehmen:

```powershell
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port $Port (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}
```

Der Block referenziert `$Port`. Beide Skripte haben diesen Parameter bisher nicht — der Port
steht literal in der Argumentliste (`"--port", "8095"`). Deshalb wird zusätzlich ein
`[int]$Port`-Parameter mit dem bisherigen Wert als Default eingeführt, exakt wie in
`start-gemma-server.ps1` (`[int]$Port = 8091`) und `start-gptoss-server.ps1`. Das ist keine
Erweiterung des Fixes, sondern seine Voraussetzung, und gleicht die vier Skripte zugleich
auf dieselbe Signatur an.

Geprüft: kein BATS-Guard besteht auf dem literalen Port **in den Skripten**. Die
Port-Assertions in `tests/spec/llm-pipeline.bats` (Zeilen 88, 95) betreffen die
Service-Definitionen in `k3d/llm-gpu.yaml`, nicht die Startskripte.

## Guard

Ein verzeichnisweiter BATS-Guard nach dem Vorbild des bestehenden
`no scripts/llm/*.ps1 starts a server via Start-Job (T002276)`: iteriert über
`scripts/llm/start-*.ps1` statt einzelne Dateien aufzuzählen, damit künftig hinzukommende
Startskripte automatisch abgedeckt sind. Bei Fehlschlag nennt er die betroffenen Dateien,
statt nur einen Exit-Code zu liefern.

## Edge Cases

- **Port frei:** `Get-NetTCPConnection` liefert mit `-ErrorAction SilentlyContinue` nichts,
  die Schleife läuft nullmal. Kein Sonderfall nötig.
- **`OwningProcess` = 0:** abgefangen durch die bestehende `-ne 0`-Bedingung (System-Idle).
- **Fremdprozess auf dem Port:** wird gekillt. Das ist beabsichtigt und entspricht dem
  Verhalten der beiden anderen Skripte — ein belegter Port bedeutet, dass der Server sonst
  still am Bind scheitert.

## Constraints

- Keine Bytes über 0x7F in `scripts/llm/*.ps1` (Guard T002275) — Kommentare in ASCII.
- Kein PS7-only Ternary (Guard T002275).
- Kein `Start-Job` (Guard T002276).
