# P1 — Server-Startskripte (GPU-Auswahl + VRAM-Check)

Rolle: **infra**. Disjunkter Partial des Change `freetoken-backend-evaluation` (T900087).

**Zweck:** Beide llama.cpp-Startskripte sind seit dem Einbau der zweiten GPU nicht mehr
lauffähig. P1 repariert sie. P1 misst nichts und vergleicht nichts — der Partial ist reine
Vorarbeit und **blockiert P4** (`bench-engine-ab.sh`): ohne startenden `llama-server` gibt es
keine Engine-Isolation.

**target_files (ausschliesslich):**

```
scripts/llm/start-gptoss-server.ps1   (edit)  Ist 154 LOC
scripts/llm/start-gemma-server.ps1    (edit)  Ist 400 LOC
```

**S1:** `docs/code-quality/gates.yaml` → `s1.limits` kennt keine Schwelle für `.ps1`, und
keine der beiden Dateien steht in `docs/code-quality/baseline.json`. Es gibt daher kein
Zeilen-Gate und keinen Verkleinerungs- oder Split-Zwang. Prüfbefehl:

```bash
grep -A15 '  limits:' docs/code-quality/gates.yaml | grep -c '\.ps1'   # erwartet: 0
jq -r '."S1:scripts/llm/start-gptoss-server.ps1".metric // "nicht-baselined"' docs/code-quality/baseline.json
jq -r '."S1:scripts/llm/start-gemma-server.ps1".metric  // "nicht-baselined"' docs/code-quality/baseline.json
```

**Keine STRUCT2/STRUCT3-Steps in diesem Partial.** Der Failing-Test-Step und der finale
Verify-Task liegen im Index (`tasks.md` → „Verify (RED → GREEN)") und hängen am
Telemetrie-Guard aus P7. P1 trägt eigene, für sich prüfbare Verifikationsbefehle.

---

## Befundlage

### Befund 1 — Der VRAM-Check bricht ab (verifiziert 2026-09-04)

`scripts/llm/start-gptoss-server.ps1:84` und `scripts/llm/start-gemma-server.ps1:208` enthalten
wortgleich:

```powershell
$freeMiB = [int](& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits).Trim()
```

Bei zwei Karten liefert `nvidia-smi` zwei Zeilen; PowerShell bindet das als `System.Object[]`,
`.Trim()` existiert darauf nicht und der `[int]`-Cast wirft:

```
Cannot convert the System.Object[] value of type System.Object[] to type System.Int32
```

Dieselbe Konstruktion steht ein zweites Mal in der Erfolgsmeldung nach dem Health-Poll
(`start-gptoss-server.ps1:140`, `start-gemma-server.ps1:382`) — dort ebenfalls unrestringiert.

### Befund 2 — Es gibt keine explizite Kartenwahl

Beide Skripte setzen `CUDA_VISIBLE_DEVICES` nicht und nehmen damit implizit CUDA-Gerät 0.
CUDA sortiert per Default nach „fastest first", `nvidia-smi` nach PCI-Bus-Reihenfolge. Die
beiden Indizes dürfen also auseinanderlaufen — ein Index ist deshalb keine belastbare
Kartenreferenz. Die Auswahl erfolgt in diesem Partial **per UUID**, in beiden Richtungen:
`nvidia-smi --id=<uuid>` für die Messung, `CUDA_VISIBLE_DEVICES=<uuid>` für den Serverprozess.

### Hardware-Bestand (gemessen 2026-09-04)

```bash
nvidia-smi --query-gpu=index,name,uuid,pci.bus_id,memory.total,display_active,pcie.link.width.current --format=csv
```

| Index | Karte | VRAM | PCI | Link | display_active | UUID |
|---|---|---|---|---|---|---|
| 0 | NVIDIA GeForce RTX 3060 Ti | 8192 MiB | 00000000:04:00.0 | PCIe 3.0 x4 | Enabled | `GPU-6b9ac882-e9e9-a364-4423-92d838536b86` |
| 1 | NVIDIA GeForce RTX 5070 Ti | 16303 MiB | 00000000:08:00.0 | PCIe 4.0 x16 | Disabled | `GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4` |

Index 0 (Zotac 3060 Ti) treibt den Desktop und hat 8 GB an einem x4-Link; Index 1
(Gigabyte 5070 Ti) ist die LLM-Karte. Alle Messwerte in `scripts/llm/loadouts.json` und
`docs/runbooks/freetoken-native.md` beziehen sich auf die 5070 Ti — sie ist deshalb der
Default, nicht die schnellere Ratewahl.

### `nvidia-smi`-Verhalten bei UUID-Selektion (gemessen 2026-09-04)

```bash
nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits --id=GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4  # -> 15995, exit 0
nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits --id=GPU-deadbeef                              # -> "No devices were found", exit 6
```

`-i` und `--id=` verhalten sich identisch; im Skript wird `--id=` verwendet, weil die Form
selbsterklärend ist. Wichtig für den Fix: eine falsche UUID liefert **Exit 6**, nicht eine
leere Erfolgsmeldung — der Fehlerfall ist also erkennbar und wird fail-loud behandelt statt
still zu 0 MiB zu degradieren.

---

## Entwurfsentscheidungen

**Der Helper wird in beiden Skripten dupliziert, nicht ausgelagert.** Ein gemeinsames
`scripts/llm/gpu-common.ps1` läge ausserhalb der target_files dieses Partials und wäre als
neue, nur per Dot-Sourcing erreichbare Datei ein S4-Kandidat. Die Duplikation umfasst rund
zwölf Zeilen und ist der geringere Eingriff; entsteht ein dritter Aufrufer, ist die
Extraktion ein eigener Change.

**`CUDA_VISIBLE_DEVICES` wird auf die UUID gesetzt, nicht auf einen Index.** Innerhalb des
Serverprozesses ist die gewählte Karte danach das einzige sichtbare Gerät und trägt dort
Index 0 — `-ngl 999` und die Default-`--main-gpu` bleiben damit unverändert korrekt.
`Start-Process` wird ohne `-UseNewEnvironment` aufgerufen und erbt die Prozessumgebung des
Skripts; die Zuweisung an `$env:CUDA_VISIBLE_DEVICES` vor dem Start genügt daher.

**Der VRAM-Check misst dieselbe Karte, auf der der Server startet.** Beide Werte stammen aus
derselben Variablen `$GpuUuid`. Das ist die eigentliche Zusicherung dieses Partials: eine
Freispeicher-Zahl von einer anderen Karte als der Zielkarte ist schlimmer als gar keine, weil
sie eine Prüfung vortäuscht.

**Die vorhandenen `.DESCRIPTION`-Blöcke werden erweitert, nicht gekürzt.** Sie tragen
Messwerte (Drafter-Sweep, KV-Quantisierungstabelle, VRAM-Rechnungen) und Begründungen, die
anderswo nicht existieren. Kein Schritt in diesem Partial löscht eine bestehende Zeile aus
`.DESCRIPTION`; ergänzt wird jeweils ein eigener Absatz plus ein `.PARAMETER GpuUuid`-Eintrag.

**Repo-Konvention für `.ps1` (`scripts/llm/CLAUDE.md`, T002495-M7)** — verbindlich für jeden
Schritt unten:

- Rein ASCII, kein BOM, keine typografischen Sonderzeichen oder Em-Dashes. PowerShell 5.1
  (auf diesem Host: 5.1.26100.9278) liest UTF-8 ohne BOM als CP1252; ein Em-Dash in einem
  String beendet diesen mitten drin und das Skript startet kommentarlos gar nicht.
- Vor dem Commit Parser-Check mit
  `[System.Management.Automation.Language.Parser]::ParseFile`.
- Generierte `.conf`-Dateien mit `-Encoding ASCII` schreiben. Betrifft P1 nicht direkt —
  die bestehenden `Out-File ... -Encoding ascii` für die PID-Dateien bleiben unverändert.

---

## File `scripts/llm/start-gptoss-server.ps1` (edit)

### Task P1.1 — GPU-Parameter und VRAM-Helper einführen

- [x] Ersetze den `param()`-Block (Zeilen 51-55) durch:

```powershell
param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-b10090-13.3",
  [int]$Ctx = 40960,
  # Zielkarte per UUID, nicht per Index: CUDA sortiert per Default nach
  # "fastest first", nvidia-smi nach PCI-Bus - die Indizes duerfen
  # auseinanderlaufen. Default ist die RTX 5070 Ti (16303 MiB, PCIe 4.0 x16,
  # display_active=Disabled); die zweite Karte im Host ist eine RTX 3060 Ti
  # (8192 MiB, x4-Link) und treibt den Desktop. Ueberschreibbar mit -GpuUuid.
  [string]$GpuUuid = "GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4",
  [switch]$NoWait
)

# Freier VRAM GENAU der Zielkarte. Ohne --id liefert nvidia-smi bei zwei Karten
# zwei Zeilen; PowerShell bindet das als System.Object[], .Trim() existiert
# darauf nicht und der [int]-Cast wirft "Cannot convert the System.Object[]
# value of type System.Object[] to type System.Int32" (verifiziert 2026-09-04).
# Eine unbekannte UUID liefert Exit 6 und "No devices were found" - das wird
# fail-loud behandelt, nicht still zu 0 MiB degradiert.
function Get-FreeVramMiB {
  param([string]$Uuid)
  $lines = @(& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits --id=$Uuid 2>&1)
  if ($LASTEXITCODE -ne 0 -or $lines.Count -lt 1) {
    Write-Error "nvidia-smi failed for GPU '$Uuid' (exit $LASTEXITCODE): $($lines -join ' ')"
    Write-Output "  Vorhandene Karten auflisten:"
    Write-Output "    nvidia-smi --query-gpu=index,name,uuid --format=csv"
    exit 1
  }
  return [int]("$($lines[0])".Trim())
}
```

- [x] Verifikation, dass der Bug vorher real war und der Ausdruck nachher trägt (beide
      Zeilen sind auf diesem Host ausführbar):

```bash
# RED - der bestehende Ausdruck (erwartet: Cannot convert ... System.Object[] ...)
powershell.exe -NoProfile -Command '[int](& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits).Trim()'

# GREEN - der neue Ausdruck (erwartet: eine einzelne Zahl, Exit 0)
powershell.exe -NoProfile -Command '[int]("$(@(& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits --id=GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4)[0])".Trim())'
```

### Task P1.2 — Beide Messstellen und die Kartenwahl umstellen

- [x] Ersetze Zeile 84 durch den Helper-Aufruf und setze die Kartenwahl unmittelbar davor:

```powershell
# Der Serverprozess sieht ausschliesslich die Zielkarte; sie traegt dort Index 0,
# weshalb -ngl 999 und die Default---main-gpu unveraendert korrekt bleiben.
# Start-Process laeuft ohne -UseNewEnvironment und erbt diese Zuweisung.
$env:CUDA_VISIBLE_DEVICES = $GpuUuid
$freeMiB = Get-FreeVramMiB -Uuid $GpuUuid
```

- [x] Ergänze die Startausgabe (nach Zeile 89, `"  Free VRAM: ..."`) um eine Zeile, die die
      gewählte Karte benennt — ohne sie ist im Log nicht unterscheidbar, welche der beiden
      Karten gemessen wurde:

```powershell
Write-Output "  GPU:       $GpuUuid"
```

- [x] Ersetze in Zeile 140 (Erfolgsmeldung nach dem Health-Poll) den unrestringierten
      Aufruf durch `$(Get-FreeVramMiB -Uuid $GpuUuid)`. Die Schwelle in Zeile 90
      (`-lt 13500`) bleibt unverändert: sie war schon immer gegen die 16-GB-Karte gerechnet
      (12.11 GB Gewichte + KV + bge-Stack), und genau die ist jetzt der Default.

- [x] Verifikation, dass kein unrestringierter Aufruf mehr übrig ist:

```bash
# erwartet: 0 Zeilen Ausgabe
grep -n 'query-gpu=memory.free' scripts/llm/start-gptoss-server.ps1 scripts/llm/start-gemma-server.ps1 \
  | grep -v -- '--id='
```

### Task P1.3 — `.DESCRIPTION` und `.PARAMETER` erweitern

- [x] Ergänze im Kopfblock (vor `.PARAMETER LlamaDir`, Zeile 45) einen neuen Absatz. Bestehende
      Absätze bleiben wortwörtlich stehen:

```
  ZWEI-GPU-HOST (2026-09-04): der Host traegt seit dem Einbau der zweiten Karte
  eine RTX 3060 Ti (8192 MiB, PCIe 3.0 x4, treibt den Desktop) und eine
  RTX 5070 Ti (16303 MiB, PCIe 4.0 x16). Alle Messwerte in loadouts.json und
  docs/runbooks/freetoken-native.md beziehen sich auf die 5070 Ti; sie ist der
  Default von -GpuUuid. Ausgewaehlt wird per UUID und NICHT per Index, weil CUDA
  per Default nach "fastest first" sortiert und nvidia-smi nach PCI-Bus - die
  Indizes duerfen auseinanderlaufen. Bis zu diesem Fix warf der VRAM-Check
  "Cannot convert the System.Object[] value ... to type System.Int32", weil
  nvidia-smi ohne --id zwei Zeilen liefert.
```

- [x] Ergänze nach `.PARAMETER LlamaDir` (Zeile 45-46):

```
.PARAMETER GpuUuid
  UUID der Zielkarte. Default: GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4
  (RTX 5070 Ti). Setzt CUDA_VISIBLE_DEVICES fuer den Serverprozess UND
  restringiert die nvidia-smi-Messung - beide Werte stammen aus derselben
  Variablen, damit der VRAM-Check die Karte misst, auf der der Server laeuft.
  Karten auflisten: nvidia-smi --query-gpu=index,name,uuid --format=csv
```

- [x] Ergänze einen zweiten `.EXAMPLE` nach Zeile 48:

```
.EXAMPLE
  .\scripts\llm\start-gptoss-server.ps1 -GpuUuid GPU-6b9ac882-e9e9-a364-4423-92d838536b86
  # Auf die 3060 Ti ausweichen. Nur 8192 MiB - der Warnschwellenwert 13500 MiB
  # schlaegt dann berechtigt an; -Ctx entsprechend reduzieren.
```

---

## File `scripts/llm/start-gemma-server.ps1` (edit)

### Task P1.4 — GPU-Parameter und VRAM-Helper einführen

- [x] Ergänze den `param()`-Block (Zeilen 149-162) um `$GpuUuid` — direkt nach `[int]$Port = 8091`,
      damit die vorhandene Positionsreihenfolge der übrigen Parameter unberührt bleibt:

```powershell
  # Zielkarte per UUID. Begruendung identisch zu start-gptoss-server.ps1 und
  # ausfuehrlich in .DESCRIPTION: Index-basierte Auswahl ist auf diesem Host
  # unzuverlaessig, weil CUDA und nvidia-smi verschieden sortieren.
  [string]$GpuUuid = "GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4",
```

- [x] Füge unmittelbar nach dem schliessenden `)` des `param()`-Blocks (Zeile 162) dieselbe
      `Get-FreeVramMiB`-Funktion ein wie in Task P1.1 (wortgleich, inklusive Kommentarblock).
      Die Duplikation ist beabsichtigt und in „Entwurfsentscheidungen" begründet.

### Task P1.5 — Beide Messstellen und die Kartenwahl umstellen

- [x] Ersetze Zeile 208 durch:

```powershell
$env:CUDA_VISIBLE_DEVICES = $GpuUuid
$freeMiB = Get-FreeVramMiB -Uuid $GpuUuid
```

- [x] Ergänze nach Zeile 215 (`"  Free VRAM: $freeMiB MiB"`):

```powershell
Write-Output "  GPU:       $GpuUuid"
```

- [x] Ersetze in Zeile 382 (Erfolgsmeldung) den unrestringierten Aufruf durch
      `$(Get-FreeVramMiB -Uuid $GpuUuid)`.

- [x] Die VRAM-Bedarfsrechnung in den Zeilen 216-243 bleibt inhaltlich unverändert
      (`$perTokMiB`, `$baseMiB = 8000`, die Hinweisschwelle `-gt 15000`). Sie war gegen die
      16-GB-Karte gerechnet, und die ist jetzt der Default — die Zahlen werden durch diesen
      Partial korrekt, nicht falsch. Prüfbefehl, dass nichts verrutscht ist:

```bash
grep -n 'perTokMiB\|baseMiB\|-gt 15000' scripts/llm/start-gemma-server.ps1   # erwartet: unveraenderte Zeilen
```

### Task P1.6 — `.DESCRIPTION` und `.PARAMETER` erweitern

- [x] Ergänze im Kopfblock vor `.PARAMETER LlamaDir` (Zeile 95) denselben
      `ZWEI-GPU-HOST (2026-09-04)`-Absatz wie in Task P1.3. Die bestehenden Blöcke
      (`WARUM FESTES -c 65536`, der Drafter-Sweep, die KV-Quantisierungstabelle, der
      Guardrail-Cache-Block) bleiben vollständig erhalten — keine Zeile wird gelöscht.

- [x] Ergänze einen `.PARAMETER GpuUuid`-Eintrag mit demselben Wortlaut wie in Task P1.3.

### Task P1.7 — Toter `LlamaDir`-Default: dokumentieren, nicht umbiegen

Nebenbefund, gemessen 2026-09-04:

```bash
ls -d /c/Users/PatrickKorczewski/llama-*/                                     # vorhanden: nur llama-b10090-13.3
find /c/Users/PatrickKorczewski -maxdepth 3 -iname '*bonsai*' -type d | wc -l # 0
```

`scripts/llm/start-gemma-server.ps1:150` zeigt auf `C:\Users\PatrickKorczewski\llama-bonsai-cuda13.3`.
Dieses Verzeichnis existiert auf der Platte nicht.

**Entscheidung: P1 dokumentiert und schärft die Fehlermeldung, repariert aber nicht.**
Begründung — ein Umbiegen auf `llama-b10090-13.3` wäre keine Reparatur, sondern ein stiller
Semantikwechsel: `--spec-type draft-mtp` gibt es laut `.DESCRIPTION` (Zeilen 34-38) ausschliesslich
im Fork-Build, nicht im Upstream-Release b10090. Der Server startete dann entweder gar nicht
oder ohne den MTP-Draft-Head, dessen Optimum (n-max 4, 210,9 t/s, Akzeptanz 0,763) genau die
Grundlage der bestehenden Messwerte ist. Der Bestand ist ausserdem bereits fail-loud: die
`Test-Path`-Kette in den Zeilen 165-170 bricht mit `exit 1` ab. Was fehlt, ist nicht der
Abbruch, sondern die Information, dass ein Repoint keine Lösung ist. Das Beschaffen des
Fork-Builds ist eine Provisionierungsaufgabe und gehört in den Partial, der ihn tatsächlich
braucht (P4/P5), nicht in eine Skriptänderung.

- [x] Erweitere die Fehlermeldung in Zeile 168 um drei Zeilen, ohne die bestehende zu ändern:

```powershell
  Write-Error "llama-server.exe not found under: $LlamaDir"
  Write-Output "  Dieses Skript braucht den Fork-Build (--spec-type draft-mtp gibt es"
  Write-Output "  NICHT im Upstream-Release b10090). Ein -LlamaDir auf b10090 ist daher"
  Write-Output "  keine Loesung: der MTP-Draft-Head faellt damit weg."
  exit 1
```

- [x] Ergänze denselben Sachverhalt als Absatz im `WARUM DER FORK-BUILD`-Block (nach Zeile 38):

```
  STAND 2026-09-04: das Default-Verzeichnis llama-bonsai-cuda13.3 liegt auf
  diesem Host nicht (mehr) vor - vorhanden ist nur llama-b10090-13.3. Das Skript
  bricht deshalb bereits an der Test-Path-Kette ab. Der Fork-Build muss neu
  bereitgestellt werden; ein Umbiegen von -LlamaDir auf b10090 ersetzt ihn nicht.
```

---

## Verifikation dieses Partials

Jeder Befehl ist auf dem Windows-GPU-Host ausführbar und für sich prüfbar.

- [x] **Parser-Check** (Repo-Konvention `scripts/llm/CLAUDE.md`, Pflicht vor dem Commit).
      Erwartet für beide Dateien `OK` und Exit 0:

```bash
powershell.exe -NoProfile -Command '
  $err = $null; $tok = $null
  foreach ($f in @("scripts\llm\start-gptoss-server.ps1","scripts\llm\start-gemma-server.ps1")) {
    [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $f), [ref]$tok, [ref]$err)
    if ($err.Count -gt 0) { Write-Output "FAIL $f"; $err | ForEach-Object { Write-Output ("  " + $_.Message) }; exit 1 }
    Write-Output "OK $f"
  }'
```

- [x] **ASCII- und BOM-Guard** (bestehender Test, deckt beide Dateien über den
      `find scripts/llm -name '*.ps1'`-Sweep ab). Erwartet: alle Tests grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/powershell-ascii-only.bats
```

- [x] **Struktur-Check der Kartenwahl.** Erwartet je Datei genau eine
      `CUDA_VISIBLE_DEVICES`-Zuweisung und mindestens zwei Helper-Aufrufe; die harte
      Bedingung verhindert, dass ein leerer grep als Erfolg durchgeht:

```bash
for f in scripts/llm/start-gptoss-server.ps1 scripts/llm/start-gemma-server.ps1; do
  cv=$(grep -c 'CUDA_VISIBLE_DEVICES = \$GpuUuid' "$f")
  hc=$(grep -c 'Get-FreeVramMiB -Uuid \$GpuUuid' "$f")
  echo "$f: cuda=$cv helperCalls=$hc"
  [ "$cv" -eq 1 ] && [ "$hc" -ge 2 ] || { echo "FAIL $f"; exit 1; }
done
```

- [x] **RED/GREEN am realen Ausdruck** (die beiden Befehle aus Task P1.1 erneut): der alte
      Ausdruck wirft weiterhin, der neue liefert eine einzelne Zahl. Das belegt, dass der Fix
      die gemeldete Ursache trifft und nicht nur die Symptomzeile umschreibt.

- [x] **Kartengebundenheit der Messung.** Erwartet zwei verschiedene Zahlen in der
      Grössenordnung der jeweiligen Karte (ca. 15995 MiB bzw. ca. 7020 MiB am 2026-09-04) —
      belegt, dass `--id=` tatsächlich selektiert statt eine Gesamtzahl zu liefern:

```bash
for u in GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4 GPU-6b9ac882-e9e9-a364-4423-92d838536b86; do
  echo "$u -> $(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits --id=$u) MiB"
done
```

- [x] **Startlauf.** Beide Skripte mit `-NoWait` aufrufen und prüfen, dass sie den VRAM-Block
      passieren, also nicht mehr am Cast scheitern:

```bash
powershell.exe -NoProfile -File scripts\llm\start-gptoss-server.ps1 -NoWait
powershell.exe -NoProfile -File scripts\llm\start-gemma-server.ps1  -NoWait
```

  **Erwartungslage am 2026-09-04, damit dieser Schritt nicht falsch gelesen wird:** beide
  Läufe enden derzeit an einer Bestandsprüfung *hinter* dem Parameterblock und *vor* dem
  Serverstart — `start-gemma-server.ps1` an der `llama-server.exe`-Kette (Task P1.7),
  `start-gptoss-server.ps1` an `Test-Path $Model`, weil unter
  `.lmstudio\models\ggml-org\gpt-oss-20b-GGUF\` keine GGUF-Datei liegt (siehe
  „Nebenbefunde"). Bestanden ist dieser Schritt, wenn die Ausgabe genau diese
  Bestandsmeldung zeigt und **keinen** `System.Object[]`-Castfehler. Sind die Artefakte
  später vorhanden, muss derselbe Aufruf bis zur PID-Zeile durchlaufen.

---

## Nebenbefunde — ausserhalb der target_files von P1

Beide sind Bestandsbefunde ohne Skriptfehler dahinter; die betroffenen Prüfungen greifen
bereits fail-loud. Sie gehören in den Partial, der die Artefakte braucht (P4), und in den
Bericht (P6):

- **Die gpt-oss-GGUF liegt nicht auf der Platte.** Das Proposal führt für Stufe 1 an, beide
  Artefakte lägen bereits vor („Download null"). Für den llama.cpp-Arm trifft das derzeit
  nicht zu — vorhanden sind nur die FreeToken-Gewichte (`freetoken-*.ftw`) unter
  `~/models/gpt-oss-20b`. P4 muss den Download einplanen oder die Annahme korrigieren.

```bash
ls /c/Users/PatrickKorczewski/.lmstudio/models/ggml-org/gpt-oss-20b-GGUF/ 2>&1                                      # Verzeichnis fehlt
find /c/Users/PatrickKorczewski/.cache/huggingface/hub/models--ggml-org--gpt-oss-20b-GGUF -name '*.gguf' | wc -l    # 0
ls /c/Users/PatrickKorczewski/models/gpt-oss-20b/*.ftw | wc -l                                                      # 2 (FreeToken-Format)
```

- **Das Gemma-Modellverzeichnis fehlt ebenfalls** (`.lmstudio\models\unsloth\gemma-4-12B-it-qat-UD-Q4_K_XL`),
  zusammen mit dem Fork-Build aus Task P1.7. Relevant für jeden Partial, der `:8091` als
  Vergleichspunkt heranzieht.

## Scope-Grenzen (nicht in P1)

- Keine Änderung an `scripts/llm/loadouts.json` — im Index (`tasks.md` → „File Structure")
  ausdrücklich als Nicht-Ziel des gesamten Change festgehalten.
- Keine Messung, kein Benchmark, kein Bericht (P4, P5, P6).
- Keine Telemetrie und kein Guard dafür (P2, P7).
- Keine Änderung an den übrigen `scripts/llm/*.ps1` (`freetoken-kv-ladder.ps1`,
  `restart-freetoken.ps1`, `start-tablet-rerank.ps1`, `harden-gpu-firewall.ps1`); sie tragen
  den fehlerhaften Ausdruck nicht — geprüft mit dem `grep -n 'query-gpu=memory.free'`-Sweep
  aus Task P1.2, der ausserhalb der beiden Zieldateien null Treffer liefert.
