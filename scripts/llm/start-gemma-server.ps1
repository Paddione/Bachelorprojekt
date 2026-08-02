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

  AUTOSTART: seit T002459 laeuft Gemma nicht mehr ueber den Windows-Autostart,
  sondern als Loadout ('gemma-factory'/'gemma-multiagent', Port 8091) im
  Linux-llm-proxy mit nativem 'systemd Restart=on-failure'. Den Windows-Startup-
  Ordner (install-startup-autostart.ps1) gibt es seit T002551 nicht mehr - er
  verwaltete nur noch den in den Cluster migrierten bge-Stack.

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
  bis das Denken abgeschlossen ist. Bei   zu knappem max_tokens kommt deshalb eine
  Antwort mit leerem content und finish_reason=length zurueck - kein Fehler, aber
  auch kein Ergebnis. Gemessen: max_tokens 64 liefert leeren content, 512 liefert
  "Berlin". Wer Clients gegen diesen Server baut, muss das Budget entsprechend
  bemessen.

  HEALTH-POLL-FENSTER: bis zu 240 Sekunden. Wer dieses Skript mit einem Timeout
  aufruft, der unter dem Poll-Fenster liegt, bekommt Exit 143 fuer eine erfolgreiche
  Operation gemeldet. Ein blinder Retry killt den laufenden Server (Port-Cleanup).
  Mit -NoWait kehrt das Skript sofort nach Start-Process zurueck und ueberspringt
  Health-Poll und Hinweistext.
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
.PARAMETER KvType
  KV-Cache-Quantisierung. Default q4_0 (T002296) - gibt bei grossem -Ctx das
  VRAM fuer den mmproj-Tower frei, kostet ~3,6 Prozent Generierungsdurchsatz.
  q8_0 holt den Durchsatz und die bessere woertliche Kontext-Treue zurueck.
  f16 ist unquantisiert und der einzige Wert, der ohne "-fa on" laedt.
.PARAMETER NoMmproj
  Startet ohne Vision-/Audio-Tower. Spart ~200 MiB VRAM, macht :8091 aber zu
  einem reinen Textmodell (/props meldet dann vision:false, audio:false).
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
  [int]$NMax = 4,
  [ValidateSet("q4_0", "q8_0", "f16")]
  [string]$KvType = "q4_0",
  [switch]$NoMmproj,
  [switch]$NoWait
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
# Vision-/Audio-Tower (T002296). Gemma 4 12B kann Bild UND Audio; ohne --mmproj
# meldet /props "vision: false, audio: false" und der Server ist ein reines
# Textmodell. Das war zwischen T002293 und T002296 der Fall - der Live-Server
# hatte den Tower, das Skript nicht, und der erste Start ueber das Skript hat
# ihn lautlos entfernt. Deshalb steht er jetzt hier und nicht nur im Kopf des
# Aufrufers. F16 statt F32: halber Speicher (175 statt 210 MB), gleiche
# Ausgabe im Rahmen der Messgenauigkeit. Abschaltbar mit -NoMmproj.
$Mmproj = Join-Path $ModelDir "mmproj-F16.gguf"

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
$mmWord = if ($NoMmproj) { "kein mmproj (nur Text)" } else { "mmproj F16 (Vision+Audio)" }
Write-Output "Starting Gemma 4 12B QAT + MTP head on port $Port ($Ctx ctx, $KvType KV, $slotWord, n-max $NMax, $mmWord) ..."
Write-Output "  Model:     $Model"
Write-Output "  MTP head:  $MtpHead"
Write-Output "  Free VRAM: $freeMiB MiB"
# Der Bedarf skaliert mit $Ctx UND mit $KvType: gemessen 2026-07-27 rund
# 14,6 KiB VRAM je Kontext-Token bei q8_0, ~7,3 KiB bei q4_0, ~29 KiB bei f16
# (Gemma teilt KV ueber Layer und nutzt ein 1024er-SWA-Fenster, deshalb
# ueberhaupt so wenig). Sockel = Gewichte + Q4_0-Draft-Head + Compute-Buffer,
# plus ~200 MiB fuer den mmproj-Tower, wenn er mitlaeuft.
$perTokMiB = 0.0143
if ($KvType -eq "q4_0") { $perTokMiB = 0.0072 }
if ($KvType -eq "f16")  { $perTokMiB = 0.0286 }
$baseMiB = 8000
if (-not $NoMmproj) { $baseMiB += 200 }
$needMiB = $baseMiB + [int]($Ctx * $perTokMiB)
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
  # KV-Quantisierung, Default q4_0 (T002296). ACHTUNG - das ist eine bewusste
  # Umkehr der Entscheidung von T002286, nicht ein Versehen:
  #
  # Der alte Kommentar argumentierte, q4_0 spare "nur Kontext, von dem ohnehin
  # Ueberschuss herrscht". Das galt fuer -Ctx 65536 mit einem Slot. Gemessen
  # 2026-07-27 an genau diesem Server, identischer Prompt, temperature 0:
  #
  #   -c 262144 / q8_0   15362 MiB   151,1 t/s
  #   -c 262144 / q4_0   14184 MiB   145,5 t/s   (-1178 MiB, -3,7 %)
  #   -c 65536  / q8_0   12552 MiB   151,3 t/s
  #   -c 65536  / q4_0   12181 MiB   145,9 t/s   (-371 MiB,  -3,6 %)
  #
  # Die Ersparnis skaliert mit -Ctx, die Kosten nicht: bei kleinem Kontext
  # lohnt q4_0 nicht, beim Mehr-Agenten-Profil (-Ctx 200000) sind es ~1,4 GB.
  # Dieses VRAM finanziert den mmproj-Tower unten. Wer Durchsatz ueber
  # Multimodalitaet stellt: "-KvType q8_0" und die 3,6 Prozent sind zurueck.
  #
  # Der bekannte Nachteil bleibt bestehen und ist der Preis: 4-Bit-KV
  # degradiert das woertliche Zurueckholen von Pfaden, Symbolnamen und
  # Tool-Call-Argumenten aus dem Kontext staerker als q8_0. Faellt das in der
  # Factory auf, ist "-KvType q8_0" der erste Hebel.
  #
  # HARTE KOPPLUNG: jede Quantisierung setzt "-fa on" voraus. Mit "-fa off"
  # bricht der Start ab: "V cache quantization requires flash_attn". Nur f16
  # laeuft ohne. Der Guard in tests/spec/llm-pipeline.bats haelt das fest.
  "--cache-type-k", "$KvType"
  "--cache-type-v", "$KvType"
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

# Fail-loud statt fail-silent: ein fehlender Tower wuerde den Server als reines
# Textmodell hochbringen, und das faellt erst auf, wenn ein Client ein Bild
# schickt und eine hilflose Textantwort bekommt.
if (-not $NoMmproj) {
  if (Test-Path $Mmproj) {
    $Params += @("--mmproj", $Mmproj)
  } else {
    Write-Error "mmproj not found at: $Mmproj"
    Write-Output "  Ohne ihn startet :8091 ohne Vision/Audio. Entweder holen:"
    Write-Output "    hf download unsloth/gemma-4-12B-it-qat-GGUF --include '*mmproj-F16*' --local-dir $ModelDir"
    Write-Output "  oder bewusst verzichten: -NoMmproj"
    exit 1
  }
}

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

if (-not $NoWait) {
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
}
