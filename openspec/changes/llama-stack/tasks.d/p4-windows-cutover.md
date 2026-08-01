---
title: "p4 — Windows-Cutover: Gemma-Eintrag aus Watchdog/Autostart entfernen"
ticket_id: T002459
domains: [scripts]
status: plan_staged
file_locks: [scripts/llm/watchdog-llm-servers.ps1, scripts/llm/install-startup-autostart.ps1]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [p1, p2, p3]
---

# p4 — Windows-Cutover

**Scope-Abgrenzung:** Dieses Partial rührt ausschließlich die beiden Windows-PowerShell-Dateien
an. `loadouts.json`, `loadouts.mjs`, `runner.mjs`, `server.mjs` und alle Tests gehören zu anderen
Partials (p1–p3) und werden hier nicht angefasst. Dieses Partial läuft **zuletzt** — es setzt
voraus, dass `gemma-factory`/`gemma-multiagent` bereits in `loadouts.json` existieren und der
llm-proxy sie starten kann (D1/D2 in design.md), sonst hat der Smoke-Test in Task 3 nichts, gegen
das er laufen kann.

**Zieldateien:**

| Datei | Ist | Budget |
|---|---|---|
| `scripts/llm/watchdog-llm-servers.ps1` | 234 | n/a — `.ps1` ist keine gegatete Extension (siehe S1-Tabelle in `plan-quality-gates.md`: `.ts/.js/.jsx/.py`, `.svelte/.sh/.mjs/.mts`, `.astro/.tsx/.java/.php`, `.cjs`, `.bash`; `.ps1` fehlt in allen vier Zeilen). Kein Zeilenbudget-Gate für diese Datei. |
| `scripts/llm/install-startup-autostart.ps1` | 173 | n/a — dieselbe Begründung, `.ps1` ungegatet. |

**Explizit NICHT Teil dieses Partials:** `scripts/llm/start-gemma-server.ps1` bleibt unverändert
liegen (design.md D5 — dokumentierter, nicht automatisierter Rollback-Pfad). Kein Löschen, kein
inhaltliches Ändern dieser Datei in diesem oder einem anderen Task.

## Task 1: Gemma-Eintrag aus `$Servers` in `watchdog-llm-servers.ps1` entfernen

Der bestehende `$Servers`-Array-Kommentar (Zeilen 57-63) erklärt bereits, warum `gpt-oss-20b`
fehlt ("zwei Chat-Server passen nicht auf die Karte") — der neue Gemma-Kommentar wird im selben
Stil direkt darüber ergänzt, nicht als separater Block.

Diff-Vorschlag (Kontext: Zeilen 57-73 von `scripts/llm/watchdog-llm-servers.ps1`):

```diff
 # SSOT dafuer, welche Server zum Stack gehoeren. Die Gemma-Argumente stehen NUR
 # hier und in install-startup-autostart.ps1 - nicht ein drittes Mal im
 # Startskript-Default. T002276 entstand aus genau so einer Duplikation.
 # Warum 262144/q8_0/1 Slot: gemessen unter T002297 - 262144 ist n_ctx_train,
 # q8_0 ist schneller als q4_0 (146,9 vs 138,0 t/s) und ein Slot maximiert den
 # Praefix-Reuse. -NoWait, weil der Watchdog selbst auf Health wartet.
 # gpt-oss-20b (:8097) fehlt bewusst: zwei Chat-Server passen nicht auf die Karte.
+#
+# GEMMA FEHLT SEIT T002459 BEWUSST: Gemma laeuft nicht mehr ueber dieses
+# Windows-Skript, sondern als Loadout ('gemma-factory'/'gemma-multiagent',
+# beide Port 8091) im Linux-llm-proxy (scripts/llm-proxy/). Der Autorestart
+# passiert dort nativ ueber 'systemd Restart=on-failure' (design.md D3) -
+# dieser Watchdog muesste sonst zwei getrennte Mechanismen fuer denselben
+# Server pflegen. ROLLBACK (design.md D5, kein Feature-Flag, rein manuell):
+# 1. diesen Commit per 'git revert' rueckgaengig machen (bringt den
+#    Gemma-Eintrag unten zurueck), 2. '.\scripts\llm\start-gemma-server.ps1'
+# erneut ausfuehren. 'start-gemma-server.ps1' selbst wurde dafuer bewusst
+# NICHT geloescht.
 $Servers = @(
   @{ Name = 'bge-m3';   Port = 8095; Script = 'start-embed-server.ps1';  Args = '-NoWait' },
   @{ Name = 'Reranker'; Port = 8096; Script = 'start-rerank-server.ps1'; Args = '-NoWait' },
-  @{ Name = 'Gemma';    Port = 8091; Script = 'start-gemma-server.ps1';  Args = '-Ctx 262144 -Slots 1 -KvType q8_0 -NoWait' },
   # T002426 - Paar A (Batch, CPU). Stirbt es unbemerkt, faellt jeder Reindex still
   # auf Paar B zurueck und konkurriert dort mit den interaktiven Anfragen - genau
   # der Zustand, den dieser Vorgang beseitigt. Der Watchdog macht ihn sichtbar.
   @{ Name = 'bge-m3-batch';   Port = 8085; Script = 'start-embed-batch-server.ps1';  Args = '-NoWait' },
   @{ Name = 'Reranker-batch'; Port = 8086; Script = 'start-rerank-batch-server.ps1'; Args = '-NoWait' }
 )
```

Nach dieser Änderung enthält `$Servers` noch 4 Einträge (`bge-m3`, `Reranker`, `bge-m3-batch`,
`Reranker-batch`); `$Servers.Count` in `Invoke-WatchdogCycle` (Zeile 180) und die Summary-Meldung
(Zeile 181) brauchen keine separate Anpassung, da sie bereits generisch über `$Servers.Count`
rechnen.

Verifikation nach dem Edit (Windows-Host, manuell — kein CI-Runner für `.ps1`):

```powershell
.\scripts\llm\watchdog-llm-servers.ps1 -NoLoop
# erwartet: 4/4 Server healthy in der Summary-Zeile, kein Eintrag mehr fuer 'Gemma'
```

## Task 2: Gemma-Start aus `install-startup-autostart.ps1` entfernen

`grep -n "start-gemma-server" scripts/llm/install-startup-autostart.ps1` zeigt vor dieser Änderung
zwei Fundstellen: den `$startups`-Array-Eintrag (Zeile 121) und die SYNOPSIS/DESCRIPTION-Prosa
(Zeilen 9, 35-42), die die Autostart-Reihenfolge "embed -> rerank -> gemma" erklärt. Beide werden
angepasst — die Prosa bleibt sonst falsch dokumentiert, selbst wenn der Code stimmt.

Diff-Vorschlag für den `$startups`-Array (Kontext: Zeilen 108-122):

```diff
 # WARUM 262144/q8_0/1 Slot (T002297), alles am 2026-07-27 gemessen:
 #   - 262144 ist n_ctx_train, das harte Modell-Maximum. Darueber warnt
 #     llama.cpp und nutzt es nicht.
 #   - q8_0 statt q4_0: schneller (146,9 vs 138,0 t/s) und praktisch verlustfrei.
 #     Der 4-Bit-Umweg (T002296) diente nur dazu, VRAM fuer den mmproj-Tower
 #     freizuraeumen - bei einem Slot ist der Platz auch mit 8 Bit da.
 #   - 1 Slot: maximaler Praefix-Reuse (T002286), und mehrere Slots teilen sich
 #     mit -kvu ohnehin denselben Pool.
 #   Ergebnis: 15437 von 16303 MiB belegt, 561 MiB frei, :8095/:8096 laufen
 #   daneben weiter. Verifiziert mit einem 155009-Token-Prompt.
+#
+# GEMMA FEHLT SEIT T002459 BEWUSST: der Autostart startet Gemma nicht mehr.
+# Gemma laeuft als Loadout ('gemma-factory'/'gemma-multiagent') im
+# Linux-llm-proxy und wird dort ueber '/admin/loadouts/<slug>/start' bzw. die
+# Auto-Start-Queue (design.md D4) hochgefahren, mit nativem
+# 'systemd Restart=on-failure' (design.md D3) statt Watchdog-Polling.
+# ROLLBACK (design.md D5): Cutover-Commit per 'git revert' zurueckdrehen
+# (bringt den Array-Eintrag unten zurueck) und danach den Shim neu erzeugen
+# ('.\scripts\llm\install-startup-autostart.ps1'), oder manuell
+# '.\scripts\llm\start-gemma-server.ps1' ausfuehren. Die Datei
+# 'start-gemma-server.ps1' bleibt dafuer unangetastet im Repo liegen.
 $startups = @(
   @{ Script = 'start-embed-server.ps1';  Arguments = '' },
-  @{ Script = 'start-rerank-server.ps1'; Arguments = '' },
-  @{ Script = 'start-gemma-server.ps1';  Arguments = '-Ctx 262144 -Slots 1 -KvType q8_0' }
+  @{ Script = 'start-rerank-server.ps1'; Arguments = '' }
 )
```

Die SYNOPSIS/DESCRIPTION-Prosa (Zeilen 1-61) wird an drei Stellen nachgezogen — keine
Wortlaut-Vorgabe, aber inhaltlich müssen diese Punkte verschwinden bzw. ersetzt werden:

- Zeile 9 (`.DESCRIPTION`-Aufzählung der drei Startskripte): den Gemma-Eintrag
  (`start-gemma-server.ps1 (Gemma 4 12B QAT, Port 8091)`) streichen, die Aufzählung hat danach nur
  noch Embed und Rerank.
- Zeilen 35-42 (Abschnitt "UMFANG: Embedding, Rerank und Gemma..."): der Absatz beschreibt aktuell,
  warum Gemma seit T002286 im Autostart ist und wie sich VRAM zwischen Gemma und dem Embedding-Stack
  aufteilt. Dieser Absatz wird durch einen kurzen Verweis ersetzt: "UMFANG seit T002459: nur noch
  Embedding und Rerank — Gemma läuft über den Linux-Loadout-Stack (siehe Kommentar über
  `$startups` weiter unten für den Rollback-Pfad)."
- Zeile 44-46 ("WEITERHIN NICHT IM AUTOSTART: gpt-oss-20b..."): bleibt inhaltlich stehen (gpt-oss
  war nie im Autostart), aber falls die Formulierung Gemma als Kontrastfolie nennt, muss sie ohne
  diese Referenz noch verständlich sein — im aktuellen Wortlaut ist das bereits der Fall, keine
  Änderung nötig.

Verifikation nach dem Edit (Windows-Host, manuell):

```powershell
.\scripts\llm\install-startup-autostart.ps1
# erwartet: der ausgegebene Shim-Inhalt (Get-Content $shim) listet genau zwei
# powershell.exe-Aufrufzeilen (start-embed-server.ps1, start-rerank-server.ps1),
# keine Zeile mit start-gemma-server.ps1
```

## Task 3: Cutover-Smoke-Test — MUSS vor diesem PowerShell-Cutover grün sein, in dieser Reihenfolge

Dies ist der letzte Task dieses Partials und entspricht Schritt 5 im Migration Plan von
design.md ("Cutover-Fenster"). Er ist absichtlich **vor** dem Commit von Task 1/Task 2 auszuführen
— nicht danach —, weil design.md D5/Risks explizit verlangt, dass der Windows-Pfad erst nach
einem grünen Smoke-Test gegen den neuen Loadout-Pfad abgebaut wird ("Cutover-Schritt im
Implementierungsplan enthält einen Smoke-Test ... VOR dem Entfernen des Windows-Watchdog-Eintrags").
Reihenfolge:

1. **Voraussetzung prüfen:** `gemma-factory` ist in `loadouts.json` eingetragen (p1/p2 dieses
   Changes) und der llm-proxy läuft auf dem GPU-Host.
2. **Loadout starten und serverseitigen Smoke-Test lesen:**
   ```bash
   curl -sS -X POST http://127.0.0.1:18235/admin/loadouts/gemma-factory/start | tee /tmp/gemma-factory-start.json
   ```
   Die Antwort enthält bereits ein `toolCallOk`-Feld (`smokeTestToolCall` in `server.mjs`, siehe
   Zeilen 213-229/357-362) — Bedingung: `toolCallOk == true`. Ist `toolCallOk == false` oder der
   Request schlägt fehl, bricht dieser Task ab: **kein** Windows-Cutover, Task 1/Task 2 werden
   nicht committet, der Windows-Gemma-Prozess bleibt unangetastet laufen.
3. **Unabhängiger Smoke-Test direkt gegen Port 8091** (nicht nur den Proxy-internen Check
   vertrauen — dieser Schritt prüft, dass Port 8091 tatsächlich von `gemma-factory` bedient wird,
   analog zu `smokeTestToolCall`):
   ```bash
   curl -sS -X POST http://127.0.0.1:8091/v1/chat/completions \
     -H 'content-type: application/json' \
     -d '{
       "messages": [{"role":"user","content":"Read the file /etc/hostname using the available tool."}],
       "tools": [{"type":"function","function":{"name":"read_file","description":"Read a file from disk",
         "parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}}],
       "tool_choice": "auto", "max_tokens": 256
     }' | jq -e '.choices[0].message.tool_calls | type == "array"'
   # erwartet: true (Exit 0). false/Fehler -> Abbruch, siehe Schritt 2.
   ```
4. **Erst bei Erfolg beider Checks (Schritt 2 UND Schritt 3):** Task 1 und Task 2 dieses Partials
   committen, danach den Windows-Gemma-Prozess stoppen (`taskkill` auf die PID, die
   `Get-NetTCPConnection -LocalPort 8091` liefert, oder Neustart des Watchdogs — der entfernte
   Eintrag sorgt dafür, dass er nicht neu gestartet wird) und `install-startup-autostart.ps1`
   erneut laufen lassen, damit der Startup-Shim ohne Gemma-Zeile neu geschrieben wird.
5. **Bei Fehlschlag:** Rollback laut design.md D5 — Git-Revert des Cutover-Commits (falls bereits
   committet) und `.\scripts\llm\start-gemma-server.ps1` erneut ausführen; der Windows-Prozess war
   in diesem Fall ohnehin nie gestoppt worden, weil Schritt 4 (Commit + Stop) nicht erreicht wurde.

Verify-Commands (dieses Partial ändert nur `.ps1`-Dateien ohne Testrunner-Anbindung; die
Repo-weiten CI-Gates laufen trotzdem, damit `freshness:check` und die Baseline-Assertion für den
Gesamt-Change grün bleiben):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
</content>
