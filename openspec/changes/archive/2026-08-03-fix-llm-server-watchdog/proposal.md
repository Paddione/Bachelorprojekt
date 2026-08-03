# Proposal: LLM-Server Watchdog

## Context

Der GPU-Host (Korczewski WSL) betreibt drei llama.cpp-Server als Windows-Prozesse:

| Server | Modell | Port |
|--------|--------|------|
| Gemma 4 12B (Chat) | gemma-4-12B-it-qat-UD-Q4_K_XL | 8091 |
| bge-m3 (Embedding) | bge-m3-Q8_0 | 8095 |
| bge-reranker-v2-m3 (Rerank) | bge-reranker-v2-m3-Q8_0 | 8096 |

**Problem (beobachtet 2026-07-27):** Gemma (:8091) und Reranker (:8096) fielen
um 13:55 bzw. 13:45 aus und blieben **über drei Stunden tot**, ohne dass
irgendwo etwas rot wurde. Erst eine manuelle Nachfrage deckte es auf.

**Ursache:** `Get-ScheduledTask -TaskPath '\Llama\*'` liefert auf dem GPU-Host
eine leere Menge. Die in `scripts/llm/register-scheduled-tasks.ps1`
vorgesehenen Windows Scheduled Tasks sind nicht (mehr) registriert. Es
existiert **kein Watchdog**, der einen weggefallenen llama.cpp-Server neu
startet — unabhängig davon, ob der Ausfall ein Crash, ein GPU-Reset oder ein
versehentlicher Hard-Kill war.

**Vorgeschichte (T002276):** Der Weg über Windows Scheduled Tasks ist auf
diesem Host policy-beschränkt (MDM/Intune-verwaltet, AzureAD-joined). Die
Tasks werden nach erfolgreicher Erstellung still entfernt. Als Workaround
wurde `install-startup-autostart.ps1` eingeführt, der die Server über den
Startup-Ordner startet. Dieser Workaround läuft **nur bei Anmeldung** und
hat keinerlei Überwachung.

## Ansatz

Wir erstellen ein Watchdog-PowerShell-Skript `watchdog-llm-servers.ps1`, das:

1. **Regelmäßig die Health-Endpoints** aller drei Server abfragt
   (`GET /health` auf :8091, :8095, :8096)
2. **Tote Server automatisch neu startet** mit den bestehenden Startskripten
   (`start-*-server.ps1`)
3. **Restarts protokolliert** (mit Zeitstempel, PID, Exit-Code des alten
   Prozesses)
4. **Einen Exit-Code != 0 liefert**, wenn überhaupt kein Server mehr läuft
   (damit externe Überwachung anschlagen kann)

Der Watchdog wird über den Windows Startup-Ordner gestartet (ähnlich wie der
bestehende `llm-stack-autostart.cmd`) und läuft als Endlosschleife mit
konfigurierbarem Poll-Interval (Default 60 s). Er wird als
**eigenständiger Scheduled Task** nur dann registriert, wenn die Intune-Policy
dies erlaubt (separater Schritt, kein Blocking des Kern-Fixes).

Als Fallback wird der Watchdog in `install-startup-autostart.ps1` integriert:
nach dem Start der Server wird eine Watchdog-Instanz im Hintergrund gestartet.

## Abgrenzung

- **kein Eingriff in die Startskripte** — der Watchdog ruft sie nur auf
- **kein Eingriff in register-scheduled-tasks.ps1** — separate Baustelle
- **kein Eingriff in den llm-proxy** — dessen Health-Berichterstattung ist
  ein separates Problem (im Ticket erwähnt)
- **kein Systemdienst** — bleibt im Benutzerkontext, analog zum bestehenden
  Startup-Workaround
