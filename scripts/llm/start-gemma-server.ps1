<#
.SYNOPSIS
  Startet llama-server.exe fuer Gemma 4 12B QAT mit MTP-Draft-Head (Port 8091).
.DESCRIPTION
  Chat-Modell fuer die Factory-Phasen plan/implement/verify. Die
  Routing-Entscheidung faellt NICHT hier, sondern in tickets.factory_model_slots
  bzw. tickets.provider_config (siehe
  scripts/migrations/2026-07-27-llm-proxy-gemma-backend.sql). Dieses Skript
  startet nur den Server.

  HERKUNFT (T002277): das Skript lag bis 2026-07-27 unversioniert als
  %UserProfile%\.lmstudio\start-gemma4-12b-mtp.ps1 auf dem Host und war damit
  weder reviewbar noch reproduzierbar. Uebernommen wurden die Parameter
  unveraendert; ergaenzt wurden Existenzpruefungen, der Health-Poll und der
  VRAM-Hinweis, analog zu start-gptoss-server.ps1.

  AUTOSTART: seit T002286 startet install-startup-autostart.ps1 auch Gemma.
  Der fruehere Ausschlussgrund war "-fit on" - damit nahm sich der Server ALLES
  freie VRAM und haette dem Embedding-Stack den Speicher weggenommen, wenn er
  vor ihm gestartet waere. Mit dem festen -c unten ist der Bedarf deterministisch
  und die Startreihenfolge damit unkritisch.

  WARUM FESTES -c 65536 (T002286): "-fit on" ohne -c laedt n_ctx_train (262144)
  und verkleinert ihn nur so weit, bis er ins VRAM passt - auf diesem Host also
  gar nicht, weil 262144 hineinpassen. Die Factory fuellt aber nur 31-37k Tokens
  pro Prompt, nutzte also ~14 Prozent des Kontexts und band den Rest als KV-Cache.
  Gemessen 2026-07-27: -c 65536 senkt die VRAM-Belegung von 15670 auf 13054 MiB
  (2560 MiB frei), der Frei-Speicher steigt von 328 auf 2944 MiB. 65536 laesst
  gegenueber 37k weiterhin Reserve. "-fit off" ist dabei sicher, weil 65536
  deutlich UNTER dem vorher passenden Wert liegt - das OOM-Risiko von "-fit off"
  besteht nur nach oben. Nebeneffekt: die Konfiguration ist reproduzierbar,
  waehrend Auto-Fit je nach Belegung durch :8095/:8096 andere Groessen ergab.

  WARUM DER FORK-BUILD: --spec-type draft-mtp gibt es nur im
  llama-bonsai-cuda13.3-Build, nicht im Upstream-Release b10090, das Embedding
  und Rerank verwenden. Gemma bringt einen Multi-Token-Prediction-Head mit; ihn
  als Draft-Modell zu nutzen ist billiger als ein separates kleines Draft-Modell,
  weil der Head ohnehin Teil der Gewichte ist.

  WARUM Q4_0-DRAFTER UND N-MAX 4 (T002293): der Q4_0-Head ist NICHT die
  abgespeckte Variante, sondern der native QAT-Drafter - laut Modellkarte sind
  ~97 Prozent seiner Gewichte byte-exakt auf dem int4-Grid ("near-lossless").
  Q8_0/BF16/F16 sind Hochskalierungen derselben Gewichte, also groesser ohne
  Mehrwert. Sweep vom 2026-07-27 auf diesem Host bestaetigt es:

    Drafter   n_max   tg          Draft-Akzeptanz
    Q4_0        4     210,9 t/s   0,763   <- Optimum
    Q4_0        6     209,3 t/s   0,668
    Q4_0        3     181,9 t/s   0,808
    Q4_0        2     172,7 t/s   0,867
    Q8_0        4     179,0 t/s   0,628
    Q8_0        6     164,5 t/s   0,510

  Der Q8_0-Head ist in BEIDEN Dimensionen schlechter. Und die vorher gesetzte
  n_max 2 ist nur der Startwert aus dem Unsloth-MTP-Guide, der selbst sagt:
  "do not assume 2 is optimal, try 1 through 6". Hier gewinnt 4 um ~22 Prozent.
  Hohe Akzeptanz allein ist kein Ziel - bei n_max 2 werden zwar 87 Prozent der
  Drafts angenommen, aber es gibt je Verify-Schritt nur 2 zu gewinnen.

  WARUM -fa on EXPLIZIT (T002293): quantisierter KV-Cache ERZWINGT
  FlashAttention - mit "-fa off" bricht der Start hart ab mit
  "llama_init_from_model: V cache quantization requires flash_attn". Der Default
  ist "auto", der hier faktisch "on" waehlt; explizit ist trotzdem besser, weil
  auto eine hardwareabhaengige Entscheidung ist und /props sie NICHT exponiert.
  Es gibt also keine Laufzeitpruefung, nur den Startabbruch als Indiz.

  ACHTUNG REASONING-CONTENT: mit --jinja antwortet Gemma 4 als Reasoning-Modell.
  llama.cpp legt den Denkteil in reasoning_content, waehrend content LEER bleibt,
  bis das Denken abgeschlossen ist. Bei zu knappem max_tokens kommt deshalb eine
  Antwort mit leerem content und finish_reason=length zurueck - kein Fehler, aber
  auch kein Ergebnis. Gemessen: max_tokens 64 liefert leeren content, 512 liefert
  "Berlin". Wer Clients gegen diesen Server baut, muss das Budget entsprechend
  bemessen.
.PARAMETER LlamaDir
  Verzeichnis mit dem Fork-Build. Default: C:\Users\PatrickKorczewski\llama-bonsai-cuda13.3
.PARAMETER Port
  Listen-Port. Default 8091 (so in tickets.llm_proxy_backends registriert).
.PARAMETER Ctx
  Kontextfenster. Default 65536 (Factory-Profil, Begruendung in .DESCRIPTION).
  Fuer das Mehr-Agenten-Profil zusammen mit -Slots hochsetzen, z.B. 200000.
  Modell-Maximum ist 262144.
.PARAMETER Slots
  Parallele Slots (-np). Default 1 - siehe den Praefix-Reuse-Block bei den
  Parametern unten, warum das fuer die serielle Factory die schnellere Wahl ist.
  Werte > 1 schalten automatisch -kvu dazu, sonst teilt llama.cpp $Ctx durch $Slots.
.PARAMETER NMax
  --spec-draft-n-max. Default 4 (gemessenes Optimum, Sweep in .DESCRIPTION).
.EXAMPLE
  .\scripts\llm\start-gemma-server.ps1
  # Factory-Profil: 65536 ctx, 1 Slot, maximaler Praefix-Reuse
.EXAMPLE
  .\scripts\llm\start-gemma-server.ps1 -Ctx 200000 -Slots 3
  # Mehr-Agenten-Profil: 200k als GEMEINSAMER Pool ueber 3 Slots (-kvu).
  # Wirkt nur, wenn tickets.llm_proxy_backends.max_inflight ebenfalls >= 3 ist.
#>

param(
  [string]$LlamaDir = "C:\Users\PatrickKorczewski\llama-bonsai-cuda13.3",
  [int]$Port = 8091,
  [int]$Ctx = 65536,
  [int]$Slots = 1,
  [int]$NMax = 4
)

# Bei diesem Build liegt llama-server.exe in \bin, nicht flach im Root.
$Exe = Join-Path $LlamaDir "bin\llama-server.exe"
if (-not (Test-Path $Exe)) { $Exe = Join-Path $LlamaDir "llama-server.exe" }
if (-not (Test-Path $Exe)) {
  Write-Error "llama-server.exe not found under: $LlamaDir"
  exit 1
}

$ModelDir = "$env:UserProfile\.lmstudio\models\unsloth\gemma-4-12B-it-qat-UD-Q4_K_XL"
$Model   = Join-Path $ModelDir "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"
# Q4_0 ist der native QAT-Drafter und in Durchsatz UND Akzeptanz besser als der
# Q8_0-Upscale (Messwerte in .DESCRIPTION). mtp-gemma-4-12B-it.gguf im Repo-Root
# ist byte-identisch damit - das ist die Datei, die "-hf" automatisch zieht.
$MtpHead = Join-Path $ModelDir "mtp-gemma-4-12B-it-Q4_0.gguf"

if (-not (Test-Path $Model)) {
  Write-Error "Model not found at: $Model"
  Write-Output "  hf download unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL --local-dir $ModelDir"
  exit 1
}
if (-not (Test-Path $MtpHead)) {
  Write-Error "MTP draft head not found at: $MtpHead"
  Write-Output "  Ohne den Head kann --spec-type draft-mtp nicht starten."
  exit 1
}

# Port raeumen - ein noch laufender Server auf diesem Port laesst den neuen
# still am Bind scheitern.
$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
    Write-Output "Stopping existing process on port $Port (PID $($c.OwningProcess)) ..."
    & taskkill.exe /F /T /PID $c.OwningProcess 2>&1 | Out-Null
  }
}

$freeMiB = [int](& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits).Trim()
$slotWord = if ($Slots -gt 1) { "$Slots slots, -kvu (gemeinsamer Pool)" } else { "1 slot" }
Write-Output "Starting Gemma 4 12B QAT + MTP head on port $Port ($Ctx ctx, Q8_0 KV, $slotWord, n-max $NMax) ..."
Write-Output "  Model:     $Model"
Write-Output "  MTP head:  $MtpHead"
Write-Output "  Free VRAM: $freeMiB MiB"
# Der Bedarf skaliert mit $Ctx: gemessen 2026-07-27 rund 14,6 KiB VRAM je
# Kontext-Token bei q8_0-KV (Gemma teilt KV ueber Layer und nutzt ein
# 1024er-SWA-Fenster, deshalb so wenig). 8000 MiB Sockel = Gewichte + Q4_0-Head
# + mmproj + Compute-Buffer.
$needMiB = 8000 + [int]($Ctx * 0.0143)
if ($freeMiB -lt $needMiB) {
  Write-Output "  WARNUNG: unter $needMiB MiB frei. Die Gewichte allein brauchen ~7.4 GB,"
  Write-Output "           dazu der MTP-Head (~0.25 GB) und $Ctx Tokens KV."
  Write-Output "           Mit '-fit off' faellt der Start bei zu wenig VRAM hart aus,"
  Write-Output "           statt still auf weniger Kontext auszuweichen - das ist Absicht."
  Write-Output "           Laeuft parallel ein anderes Chat-Modell (gpt-oss :8097)? Dann beenden."
}
if ($freeMiB -gt 15000) {
  Write-Output "  HINWEIS: sehr viel VRAM frei - laufen bge-m3 (:8095) und der Reranker"
  Write-Output "           (:8096) ueberhaupt? Sie belegen zusammen rund 1,7 GB."
}

$Params = @(
  "-m", $Model
  # Speculative Decoding ueber den mitgelieferten MTP-Head. n-max 4 heisst:
  # hoechstens 4 Tokens vorausraten, bevor das Hauptmodell verifiziert.
  # Warum 4 und nicht der Guide-Startwert 2: Sweep-Tabelle in .DESCRIPTION.
  "--spec-type", "draft-mtp"
  "--spec-draft-model", $MtpHead
  "--spec-draft-n-max", "$NMax"
  "-ngl", "999"
  # Explizit statt Default "auto" - Begruendung in .DESCRIPTION. Ohne
  # FlashAttention ist der quantisierte KV-Cache unten nicht ladbar.
  "-fa", "on"
  # Ein einziger Slot. Zwei Gruende, beide 2026-07-27 gemessen (T002286):
  #   1. tickets.llm_proxy_backends.max_inflight = 1 fuer llamacpp-gemma - der
  #      llm-proxy serialisiert. Weitere Slots blieben schlicht ungenutzt.
  #   2. Ein Slot haelt EINEN KV-Zustand, den aufeinanderfolgende Aufrufer per
  #      Praefix-Reuse teilen: bei gleichem System-Prompt wurden nur 12 von 3034
  #      Prompt-Token neu berechnet (99,6 Prozent Treffer). Mit 4 Slots prefillt
  #      jeder Slot den gemeinsamen Praefix voll (3240 Token je Slot) - bei einem
  #      37k-Factory-Prompt also ~148k statt ~37k Token. Parallelitaet und
  #      Praefix-Reuse sind hier Gegenspieler; seriell gewinnt der Cache.
  # Echte Parallelitaet gibt es ueber -Slots N. Der Schalter setzt -kvu gleich
  # mit, sonst teilt llama.cpp $Ctx stur durch $Slots (gemessen: "-c 8192 -np 4
  # -kvu" => n_ctx 8192 je Slot, mit "-no-kvu" => 2048). Mit -kvu ist $Ctx ein
  # GEMEINSAMER Pool: bei "-Ctx 200000 -Slots 3" melden alle drei Slots
  # n_ctx 200192, teilen sich aber einen Puffer (14,8 GB VRAM; drei separate
  # 200k-Caches braeuchten ~19 GB und wuerden mit "-fit off" nicht starten).
  # ACHTUNG - zwei Bedingungen, sonst verpufft es:
  #   1. tickets.llm_proxy_backends.max_inflight fuer llamacpp-gemma muss
  #      ebenfalls >= $Slots sein, sonst serialisiert der llm-proxy weiter.
  #   2. Der Praefix-Reuse-Vorteil oben geht anteilig verloren.
  "-np", "$Slots"
  # KV q8_0: praktisch verlustfrei und halbiert den Cache gegenueber f16.
  # Bewusst NICHT q4_0: das spart nur Kontext, von dem hier ohnehin Ueberschuss
  # herrscht, und degradiert genau das woertliche Zurueckholen von Pfaden,
  # Symbolnamen und Tool-Call-Argumenten aus dem Kontext.
  "--cache-type-k", "q8_0"
  "--cache-type-v", "q8_0"
  # Fester Deckel statt Auto-Fit - Begruendung und Messwerte in .DESCRIPTION.
  "-c", "$Ctx"
  "-fit", "off"
  # --jinja: strukturierte tool_calls aus der im GGUF hinterlegten Vorlage.
  # Ohne sie liefert der Server keine tool_calls - fuer die Factory unbrauchbar.
  "--jinja"
  "--host", "0.0.0.0"
  "--port", "$Port"
)

# Nur bei echter Parallelitaet. Mit einem Slot ist -kvu wirkungslos, macht die
# Kommandozeile aber schwerer mit dem Default-Profil vergleichbar.
if ($Slots -gt 1) { $Params += "-kvu" }

$logDir = Split-Path $Exe -Parent
$logOut = Join-Path $logDir "gemma4-12b-mtp-out.log"
$logErr = Join-Path $logDir "gemma4-12b-mtp-err.log"
Remove-Item $logOut -ErrorAction SilentlyContinue
Remove-Item $logErr -ErrorAction SilentlyContinue

# T002276: Start-Process statt Start-Job. Ein Job haengt an der PowerShell-
# SITZUNG - endet sie, stirbt der Server mit.
$p = Start-Process -FilePath $Exe -ArgumentList $Params -WindowStyle Hidden -PassThru `
       -RedirectStandardOutput $logOut -RedirectStandardError $logErr
"PID: $($p.Id)" | Out-File -FilePath (Join-Path $logDir "gemma4-12b-mtp.pid") -Encoding ascii

$deadline = (Get-Date).AddSeconds(240)
$healthy = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  if ($p.HasExited) { break }
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    if ($r.status -eq 'ok') { $healthy = $true; break }
  } catch {}
}

if ($healthy) {
  Write-Output "Gemma 4 12B: PID $($p.Id) healthy on :$Port"
  Write-Output "  VRAM danach: $((& nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits).Trim()) MiB frei"
  Write-Output ""
  Write-Output "Der llm-proxy (:18235) findet den Server ueber die Registry und den Alias"
  Write-Output "'gemma-4-12b'. Laeuft er nicht, aus WSL heraus starten:"
  Write-Output "  task llm:proxy:start        # oder: systemctl --user start llm-proxy"
  Write-Output ""
  Write-Output "Smoke-Test MIT ausreichendem Budget (max_tokens 64 liefert wegen"
  Write-Output "reasoning_content einen LEEREN content, siehe .DESCRIPTION):"
  Write-Output '  $b = @{ model = "gemma-4-12b"; max_tokens = 512;'
  Write-Output '          messages = @(@{ role = "user"; content = "Hauptstadt von Deutschland?" }) } | ConvertTo-Json -Depth 5'
  Write-Output '  Invoke-RestMethod -Uri http://127.0.0.1:18235/v1/chat/completions -Method Post `'
  Write-Output '    -ContentType application/json -Body $b | ForEach-Object { $_.choices[0].message.content }'
} elseif ($p.HasExited) {
  Write-Output "Gemma 4 12B FAILED: exited (code $($p.ExitCode)) - see $logErr"
  Get-Content $logErr -Tail 20
} else {
  Write-Output "Gemma 4 12B WARNING: PID $($p.Id) laeuft, aber nach 240s nicht healthy - see $logErr"
}
