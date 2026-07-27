#!/usr/bin/env bats
# tests/spec/llm-pipeline.bats
# SSOT: openspec/specs/llm-pipeline.md
#
# Covers: LLM_ENABLED switch, embedding gateway, fail-closed on bge-m3 errors.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Embedding infrastructure ──────────────────────────────────────────

@test "embeddings.ts exists for embedding routing" {
  [ -f "$REPO/website/src/lib/embeddings.ts" ]
}

@test "embeddings.ts references LLM_ENABLED switch" {
  run grep -q 'LLM_ENABLED' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

@test "embeddings.ts routes through LLM gateway when LLM_ENABLED" {
  run grep -q 'llm-gateway' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

@test "embeddings.ts falls back to voyageai when LLM_ENABLED=false" {
  run grep -q 'voyageai\|voyage' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

# ── Fail-closed on GPU router errors ──────────────────────────────────

@test "embeddings.ts has error handling (EmbeddingQueryError or similar)" {
  run grep -qi 'EmbeddingQueryError\|EmbeddingIndexError\|throw.*Error\|catch' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

# ── Knowledge DB layer ────────────────────────────────────────────────

@test "knowledge-db.ts exists for pgvector operations" {
  [ -f "$REPO/website/src/lib/knowledge-db.ts" ]
}

# ── LLM_HOST_IP reachability from the k3d dev cluster [T002109] ────────
#
# The dev k3d cluster reaches the WSL host over the WireGuard mesh
# (192.168.100.0/24), the same address prod already uses. Docker bridge
# addresses do not work here: Docker Desktop runs its daemon in a separate
# docker-desktop distro, so no docker0/br-* interface exists in the working
# distro and k3d assigns a random per-cluster subnet.

dev_llm_host_ip() {
  grep -E '^\s*LLM_HOST_IP:' "$REPO/environments/dev.yaml" \
    | head -1 | sed -E 's/.*:\s*"?([0-9.]+)"?.*/\1/'
}

@test "dev LLM_HOST_IP is not a Docker bridge address" {
  local ip; ip="$(dev_llm_host_ip)"
  [ -n "$ip" ]
  # 172.16.0.0/12 covers docker0 (172.17.x) and every k3d-assigned subnet.
  if [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]]; then
    echo "LLM_HOST_IP=$ip is a Docker bridge address — unreachable from k3d pods" >&2
    return 1
  fi
}

@test "dev LLM_HOST_IP is inside the wg-mesh CIDR 192.168.100.0/24" {
  local ip; ip="$(dev_llm_host_ip)"
  [[ "$ip" =~ ^192\.168\.100\.[0-9]+$ ]]
}

@test "dev LLM_HOST_IP matches the GPU-host address used by prod envs" {
  local dev prod
  dev="$(dev_llm_host_ip)"
  prod="$(grep -E '^\s*LLM_HOST_IP:' "$REPO/environments/mentolder.yaml" \
    | head -1 | sed -E 's/.*:\s*"?([0-9.]+)"?.*/\1/')"
  [ "$dev" = "$prod" ]
}

@test "allow-llm-gateway-egress covers the CIDR that dev LLM_HOST_IP lives in" {
  run grep -q '192\.168\.100\.0/24' "$REPO/k3d/network-policies.yaml"
  [ "$status" -eq 0 ]
}

# ── llama.cpp infrastructure [T002110] ──────────────────────────

@test "k3d/llm-gpu.yaml defines llm-gateway-embed service on port 8095" {
  run grep -q 'name: llm-gateway-embed' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
  run grep -q 'port: 8095' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
}

@test "k3d/llm-gpu.yaml defines llm-gateway-rerank service on port 8096" {
  run grep -q 'name: llm-gateway-rerank' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
  run grep -q 'port: 8096' "$REPO/k3d/llm-gpu.yaml"
  [ "$status" -eq 0 ]
}

@test "no environment file references old llm-gateway-tei-embed service" {
  run grep -r 'llm-gateway-tei-embed' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "no environment file references old llm-gateway-tei-rerank service" {
  run grep -r 'llm-gateway-tei-rerank' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "no environment file references old llm-gateway-lmstudio service" {
  run grep -r 'llm-gateway-lmstudio' "$REPO/environments/"
  [ "$status" -eq 1 ]
}

# T002181: die vier folgenden Negativ-Assertions grepten über die ganze Datei und
# trafen damit die Grabstein-Kommentare ("# LLM_LMSTUDIO_URL removed — …"), die
# dokumentieren WARUM die Variable entfernt wurde. Die Variablen selbst sind
# längst weg. Geprüft wird jetzt gezielt die aktive YAML-Deklaration
# (`- name: <VAR>`); die erklärenden Kommentare dürfen bleiben.
assert_var_not_declared() {
  local var="$1"
  run grep -rE "^[[:space:]]*-[[:space:]]*name:[[:space:]]*${var}[[:space:]]*$" "$REPO/environments/"
  [ "$status" -eq 1 ]
}

@test "no schema or env file contains dead var LLM_LMSTUDIO_URL" {
  assert_var_not_declared LLM_LMSTUDIO_URL
}

@test "no schema or env file contains dead var LLM_CHAT_MODEL" {
  assert_var_not_declared LLM_CHAT_MODEL
}

@test "no schema or env file contains dead var LLM_CODING_MODEL" {
  assert_var_not_declared LLM_CODING_MODEL
}

@test "no schema or env file contains dead var LLM_EMBED_MODEL_NOMIC" {
  assert_var_not_declared LLM_EMBED_MODEL_NOMIC
}

@test "scripts/llm/start-embed-server.ps1 exists and contains --pooling cls" {
  # T002181: der Test suchte '--pooling cls' als zusammenhängenden String. Das
  # Skript ist PowerShell und übergibt Argumente als Array-Elemente:
  #   "--pooling", "cls"
  # Der Flag-Wert war also immer korrekt gesetzt, nur die Schreibweise im Test
  # passte nicht zur Sprache der Datei.
  [ -f "$REPO/scripts/llm/start-embed-server.ps1" ]
  run grep -qE '"--pooling",[[:space:]]*"cls"' "$REPO/scripts/llm/start-embed-server.ps1"
  [ "$status" -eq 0 ]
}

@test "scripts/llm/start-rerank-server.ps1 exists and contains --reranking" {
  [ -f "$REPO/scripts/llm/start-rerank-server.ps1" ]
  run grep -q '\--reranking' "$REPO/scripts/llm/start-rerank-server.ps1"
  [ "$status" -eq 0 ]
}

@test "scripts/llm/register-scheduled-tasks.ps1 exists" {
  [ -f "$REPO/scripts/llm/register-scheduled-tasks.ps1" ]
}

# ── Physischer Batch (T002260) ────────────────────────────────────────
# bge-m3 und bge-reranker-v2-m3 sind nicht-kausal (XLM-RoBERTa). llama.cpp kann
# eine solche Sequenz NICHT über mehrere physische Batches aufteilen — ohne
# -b/-ub gilt der Default n_ubatch=512 und jeder längere Input scheitert mit
# "input (N tokens) is too large to process". Das gesetzte -c 8192 hilft nicht.
# Der Ausfall ist unsichtbar: Kurztext-Smoke-Tests bleiben grün, und
# website/src/lib/rerank.ts verschluckt Rerank-Fehler zu score: 0. Diese Tests
# sind der Regressionsschutz — die Flags dürfen nicht wieder verschwinden.
# Schreibweise wie bei --pooling (s. T002181-Kommentar oben): PowerShell
# übergibt Array-Elemente, nicht zusammenhängende Strings.

@test "start-embed-server.ps1 sets -b and -ub to the full context length (T002260)" {
  run grep -qE '"-b",[[:space:]]*"8192"' "$REPO/scripts/llm/start-embed-server.ps1"
  [ "$status" -eq 0 ]
  run grep -qE '"-ub",[[:space:]]*"8192"' "$REPO/scripts/llm/start-embed-server.ps1"
  [ "$status" -eq 0 ]
}

@test "start-rerank-server.ps1 sets -b and -ub to the full context length (T002260)" {
  run grep -qE '"-b",[[:space:]]*"8192"' "$REPO/scripts/llm/start-rerank-server.ps1"
  [ "$status" -eq 0 ]
  run grep -qE '"-ub",[[:space:]]*"8192"' "$REPO/scripts/llm/start-rerank-server.ps1"
  [ "$status" -eq 0 ]
}

# ── CPU-Default fuer Embed und Rerank (T002337) ───────────────────────
# Beide Hilfsmodelle liegen im CPU-RAM, damit das VRAM dem Chat-Modell gehoert:
# Gemma laeuft seit T002297 mit -Ctx 262144 und belegt rund 15,1 von 16,3 GiB.
# Der Reranker war der Beweis, dass ein einzelner Guard hier nicht reicht —
# T002319 stellte den Embedder auf 0 um und liess start-rerank-server.ps1 auf
# 99 stehen; weil install-startup-autostart.ps1 beide Skripte ARGUMENTLOS
# aufruft, holte jeder Autostart die GPU-Variante zurueck, ohne dass etwas rot
# wurde. Deshalb pruefen die Guards BEIDE Skripte gemeinsam. Der GPU-Rueckweg
# bleibt ueber LLM_EMBED_NGL/LLM_RERANK_NGL offen — hier steht nur der Default.
# Das [[:space:]]*$ am Ende ist kein Schoenheitsfehler: die .ps1-Dateien sind
# durchgehend CRLF, ein blosses "$ scheitert am \r vor dem Zeilenende.

@test "start-embed-server.ps1 defaults -ngl to 0 (CPU RAM, T002337)" {
  run grep -qE '^\$Ngl = "0"[[:space:]]*$' "$REPO/scripts/llm/start-embed-server.ps1"
  [ "$status" -eq 0 ]
}

@test "start-rerank-server.ps1 defaults -ngl to 0 (CPU RAM, T002337)" {
  run grep -qE '^\$Ngl = "0"[[:space:]]*$' "$REPO/scripts/llm/start-rerank-server.ps1"
  [ "$status" -eq 0 ]
}

# T002276: die beiden Guards, die dieselben Flags in den Args-Zeilen von
# register-scheduled-tasks.ps1 prueften, sind entfallen. Dort gibt es keine Args
# mehr (der Task verweist auf das Startskript), und die beiden Guards oben
# pruefen die Flags bereits an ihrer einzigen verbleibenden Stelle.
# T002264: der Zugriff stand auf $Task.Expr, ein Key dieses Namens existiert nicht.
# PowerShell liefert dafür still $null, also wurde jede Scheduled Task mit leerem
# Executable-Pfad registriert (/tr "" <args>) und konnte nichts starten — der
# Grund, warum es faktisch keine Server-Persistenz gab.
# ── PowerShell-5.1-Parsebarkeit (T002275) ─────────────────────────────
# Vier von fuenf scripts/llm/*.ps1 waren fuer PowerShell 5.1 nicht parsebar, aus
# zwei unabhaengigen Gruenden. Beide Guards sind statisch, weil CI unter Linux
# laeuft und kein PowerShell hat. Der echte Test ist auf Windows:
#   [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$null, [ref]$errs)
#
# Grund 1 — Encoding: PS 5.1 liest eine .ps1 OHNE BOM als ANSI/Windows-1252.
# UTF-8-Mehrbyte-Sequenzen zerfallen, und einige der Bytes sind typografische
# Anfuehrungszeichen, die PowerShell als String-Delimiter akzeptiert:
#   '-' em dash  E2 80 94 -> Byte 0x94 = '"' in cp1252
#   Haken        E2 9C 93 -> Byte 0x93 = '"'
#   Pfeil rechts E2 86 92 -> Byte 0x92 = "'"
# Ein solches Zeichen im KOMMENTAR genuegt: es oeffnet einen String, der bis zum
# naechsten Anfuehrungszeichen laeuft. Der Parser zeigt dann auf eine Zeile weit
# darunter ("Zeichenfolge hat kein Abschlusszeichen").
#
# Grund 2 — Ternary: 'cond ? a : b' gibt es erst ab PowerShell 7. Auf diesem Host
# ist nur 5.1 installiert (kein pwsh.exe), dort ist es ein Parse-Fehler.

@test "no scripts/llm/*.ps1 contains a byte above 0x7F (T002275)" {
  # Absichtlich ALLE non-ASCII-Bytes, nicht nur die bekannten Quote-Ausloeser:
  # ein Test auf 'keine em dashes' waere zu eng, Haken und Pfeile brechen genauso.
  run bash -c "LC_ALL=C grep -lP '[\\x80-\\xff]' '$REPO'/scripts/llm/*.ps1 2>/dev/null"
  [ -z "$output" ]
  [ "$status" -ne 0 ]
}

@test "no scripts/llm/*.ps1 uses the PS7-only ternary operator (T002275)" {
  run bash -c "grep -lE '\\)[[:space:]]+\\?[[:space:]]' '$REPO'/scripts/llm/*.ps1 2>/dev/null"
  [ -z "$output" ]
  [ "$status" -ne 0 ]
}

# ── Autostart-Struktur (T002276) ──────────────────────────────────────
# Ersetzt die frueheren T002274-Guards. Jene prueften die Bonsai-Argumente
# INNERHALB von register-scheduled-tasks.ps1 — diese Argumente existieren nicht
# mehr: der Task verweist jetzt auf das jeweilige Startskript. Zwei Gruende:
# schtasks begrenzt /tr auf 261 Zeichen (Bonsai brauchte 338, Embed 262), und die
# Argumente lagen doppelt vor (Registrierung UND Startskript) — genau die
# Zwei-Wahrheiten-Falle, die bei start-embeddings.ps1 die -b/-ub-Flags
# verschluckt hat. Bonsai ist zusaetzlich aus dem Autostart entfernt.

@test "register-scheduled-tasks.ps1 points tasks at start scripts (T002276)" {
  run bash -c "grep -E '^[[:space:]]+Args = ' '$REPO/scripts/llm/register-scheduled-tasks.ps1'"
  [ "$status" -ne 0 ]
  run bash -c "grep -cE '^[[:space:]]+Script = ' '$REPO/scripts/llm/register-scheduled-tasks.ps1'"
  [ "$output" -ge 2 ]
}

@test "register-scheduled-tasks.ps1 checks schtasks exit codes (T002276)" {
  # Vorher: Ausgabe nach Out-Null plus unbedingtes "[ok] registered" - das Skript
  # meldete dreimal Erfolg, obwohl kein einziger Task entstand.
  run grep -q 'LASTEXITCODE -ne 0' "$REPO/scripts/llm/register-scheduled-tasks.ps1"
  [ "$status" -eq 0 ]
}

@test "no scripts/llm/*.ps1 starts a server via Start-Job (T002276)" {
  # Ein Job haengt an der PowerShell-Sitzung; endet sie, stirbt der Server mit.
  # Kommentarzeilen ausgenommen - dort ist der alte Mechanismus dokumentiert.
  run bash -c "grep -nE 'Start-Job[[:space:]]+-ScriptBlock' '$REPO'/scripts/llm/*.ps1 2>/dev/null"
  [ -z "$output" ]
}

@test "every scripts/llm/start-*.ps1 frees its port before starting (T002288)" {
  # Ohne Raeumung scheitert der neue Server still am Bind, waehrend der ALTE
  # Prozess sein Modell weiter im VRAM haelt. Gemessen 2026-07-27 nach einem
  # Lauf von llm-stack-autostart.cmd: je zwei llama-server auf 8095 und 8096,
  # 14119 statt 12285 MiB belegt - rund 1,8 GB pro Lauf, kumulierend.
  # Verzeichnisweit wie der Start-Job-Guard oben, damit neu hinzukommende
  # Startskripte automatisch abgedeckt sind.
  missing=""
  for f in "$REPO"/scripts/llm/start-*.ps1; do
    grep -q 'Get-NetTCPConnection' "$f" || missing="$missing $(basename "$f")"
  done
  [ -z "$missing" ] || { echo "ohne Port-Raeumung:$missing"; false; }
}

@test "install-startup-autostart.ps1 covers embed, rerank and gemma in that order (T002286)" {
  [ -f "$REPO/scripts/llm/install-startup-autostart.ps1" ]
  # Reihenfolge ist Absicht: scheitert Gemma (der groesste Brocken), steht der
  # Embedding-Stack trotzdem. Gemma kam erst dazu, nachdem sein Startskript von
  # "-fit on" auf den festen Deckel "-c 65536" umgestellt wurde - vorher haette
  # es sich alles freie VRAM genommen.
  # Seit T002297 ist die flache Namensliste eine Liste von Hashtables mit
  # Script/Arguments, weil Gemma Parameter braucht. Die Reihenfolge wird
  # deshalb ueber die Zeilennummern der Script-Eintraege geprueft statt ueber
  # einen Literal-Vergleich der Array-Zeile.
  auto="$REPO/scripts/llm/install-startup-autostart.ps1"
  emb="$(grep -n "Script *= *'start-embed-server.ps1'" "$auto" | cut -d: -f1)"
  rer="$(grep -n "Script *= *'start-rerank-server.ps1'" "$auto" | cut -d: -f1)"
  gem="$(grep -n "Script *= *'start-gemma-server.ps1'" "$auto" | cut -d: -f1)"
  [ -n "$emb" ] && [ -n "$rer" ] && [ -n "$gem" ]
  [ "$emb" -lt "$rer" ]
  [ "$rer" -lt "$gem" ]
  run bash -c "grep -nE '^[^#]*start-bonsai-server' '$REPO'/scripts/llm/*.ps1 2>/dev/null"
  [ -z "$output" ]
}

@test "autostart passes the measured max-context profile to gemma (T002297)" {
  # Ohne Argumente bekaeme Gemma die Skript-Defaults (-Ctx 65536, q4_0) - das
  # waere nach einem Reboot ein anderer Server als der, den wir vermessen
  # haben, ohne dass irgendwo etwas rot wird. Deshalb ein eigener Guard.
  # 262144 ist n_ctx_train; ein hoeherer Wert waere nicht nutzbar.
  auto="$REPO/scripts/llm/install-startup-autostart.ps1"
  gemline="$(grep "Script *= *'start-gemma-server.ps1'" "$auto")"
  [ -n "$gemline" ]
  echo "$gemline" | grep -q -- '-Ctx 262144'
  echo "$gemline" | grep -q -- '-Slots 1'
  echo "$gemline" | grep -q -- '-KvType q8_0'
}

# ── gpt-oss-20b als Factory-Kandidat (T002268) ────────────────────────
# Der Kandidat muss INERT bleiben, bis jemand bewusst umschaltet. Zwei
# Invarianten sichern das ab: priority 1 (Bonsai steht auf 0, route-provider.sh
# sortiert priority ASC) und KEIN Schreiben in tickets.factory_model_slots — das
# ist der Phase-Pin, den route-provider.sh gegenueber provider_config bevorzugt.

@test "start-gptoss-server.ps1 exists and serves port 8097 (T002268)" {
  [ -f "$REPO/scripts/llm/start-gptoss-server.ps1" ]
  run grep -qE '"--port",[[:space:]]*"8097"' "$REPO/scripts/llm/start-gptoss-server.ps1"
  [ "$status" -eq 0 ]
}

@test "start-gptoss-server.ps1 passes --jinja for tool_calls (T002268)" {
  # Ohne --jinja liefert llama-server keine strukturierten tool_calls - und genau
  # dafuer wurde dieser Kandidat ausgewaehlt (ifstruct-v1.0 91.95).
  run grep -q '"--jinja"' "$REPO/scripts/llm/start-gptoss-server.ps1"
  [ "$status" -eq 0 ]
}

@test "provider-register-gptoss.sh registers at priority 1, not 0 (T002268)" {
  [ -f "$REPO/scripts/factory/provider-register-gptoss.sh" ]
  run grep -qE '^PRIORITY=1$' "$REPO/scripts/factory/provider-register-gptoss.sh"
  [ "$status" -eq 0 ]
}

@test "provider-register-gptoss.sh does NOT write factory_model_slots (T002268)" {
  # Es wird auf echtes DML geprueft, nicht auf die bloesse Erwaehnung des
  # Tabellennamens: das Skript dokumentiert den Verzicht im Kommentar UND gibt
  # am Ende einen Hinweis aus, wo man bewusst umschalten wuerde. Beides soll
  # bleiben duerfen - nur ein INSERT/UPDATE/DELETE waere der Fehler.
  run bash -c "grep -iE '(INSERT INTO|UPDATE|DELETE FROM)[[:space:]]+tickets\.factory_model_slots' '$REPO/scripts/factory/provider-register-gptoss.sh'"
  [ "$status" -ne 0 ]
}

@test "register-scheduled-tasks.ps1 reads only defined hashtable keys (T002264/T002276)" {
  # T002264 fand hier '$Exe = $Task.Expr' - einen Key, den die Hashtable nie
  # definierte; PowerShell liefert dafuer still $null. Mit T002276 tragen die
  # Eintraege nur noch Name/Description/Script, der Zugriff geht auf $Task.Script.
  # Der Guard bleibt als Klasse erhalten: kein Zugriff auf einen undefinierten Key.
  run bash -c "grep -vE '^[[:space:]]*#' '$REPO/scripts/llm/register-scheduled-tasks.ps1' | grep -oE '\\\$Task\\.[A-Za-z]+' | sort -u"
  [ "$status" -eq 0 ]
  for key in $output; do
    short="${key#\$Task.}"
    run grep -qE "^[[:space:]]+$short = " "$REPO/scripts/llm/register-scheduled-tasks.ps1"
    [ "$status" -eq 0 ]
  done
}

# ── Gemma-Chat-Server (T002277) ───────────────────────────────────────
# Das Skript lag bis 2026-07-27 unversioniert unter %UserProfile%\.lmstudio\.
# Die Guards sichern die drei Parameter, ohne die der Server fuer die Factory
# unbrauchbar waere - alle drei waren im Original bereits richtig gesetzt und
# sollen es beim Uebertragen ins Repo geblieben sein.

@test "start-gemma-server.ps1 exists and enables MTP speculative decoding (T002277)" {
  [ -f "$REPO/scripts/llm/start-gemma-server.ps1" ]
  run grep -qE '"--spec-type",[[:space:]]*"draft-mtp"' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
  run grep -q '\--spec-draft-model' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
}

@test "start-gemma-server.ps1 defaults the context to 65536 (T002286/T002293)" {
  # Loest den -fitc-Floor aus T002277 ab. Die Schutzabsicht ist dieselbe - die
  # Factory fuellt 31-37k Tokens pro Prompt und braucht mehr als den llama.cpp-
  # Default -, nur strenger umgesetzt: ein fester -c kann gar nicht erst still
  # nach unten ausweichen, waehrend Auto-Fit je nach VRAM-Belegung variierte.
  # Seit T002293 ist -c ueber -Ctx parametrisierbar (Mehr-Agenten-Profil). Die
  # Absicht bleibt unveraendert, nur die Pruefstelle wandert: der DEFAULT muss
  # 65536 sein, und -c muss den Parameter benutzen statt eines Literals - sonst
  # koennte ein Aufrufer den Deckel setzen, ohne dass das Skript es zeigt.
  run grep -qE '\$Ctx[[:space:]]*=[[:space:]]*65536' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
  run grep -qE '"-c",[[:space:]]*"\$Ctx"' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
}

@test "start-gemma-server.ps1 disables auto-fit (T002286)" {
  # "-fit on" zog den Kontext auf n_ctx_train (262144) hoch und band ~86 Prozent
  # davon ungenutzt als KV-Cache. Gemessen 2026-07-27: der feste Deckel gibt
  # 3094 MiB VRAM frei (15670 -> 12576 MiB belegt). Ohne "-fit off" wuerde das
  # gesetzte -c zwar gelten, aber die Absicht waere im Skript nicht mehr lesbar.
  run grep -qE '"-fit",[[:space:]]*"off"' "$REPO/scripts/llm/start-gemma-server.ps1"
  [ "$status" -eq 0 ]
  run bash -c "grep -E '\"-fit\",[[:space:]]*\"on\"' '$REPO/scripts/llm/start-gemma-server.ps1'"
  [ "$status" -ne 0 ]
}

@test "start-gemma-server.ps1 pairs -np > 1 with -kvu if it ever parallelises (T002286)" {
  # llama.cpp teilt -c stur durch -np, SOFERN nicht --kv-unified gesetzt ist.
  # Gemessen: "-c 8192 -np 4 -kvu" => n_ctx 8192 je Slot, mit "-no-kvu" => 2048.
  # Wer hier auf mehrere Slots umstellt, ohne -kvu zu setzen, viertelt den
  # Kontext lautlos unter den Factory-Bedarf.
  # Seit T002293 kommt -np aus dem Parameter $Slots. Beide Formen bleiben
  # zulaessig, die Absicht wird in beiden geprueft:
  #   a) Literal ("-np", "N")      -> N > 1 verlangt ein unbedingtes "-kvu"
  #   b) Parameter ("-np", "$Slots") -> Default muss 1 sein UND es muss einen
  #      Zweig geben, der -kvu bei > 1 dazuschaltet.
  # Der Wert steht in Anfuehrungszeichen ("-np", "1"), daher tr statt Anker-Regex.
  gemma="$REPO/scripts/llm/start-gemma-server.ps1"
  np="$(grep -oE '"-np",[[:space:]]*"[0-9]+"' "$gemma" | tr -dc '0-9')"
  if [ -n "$np" ]; then
    if [ "$np" -gt 1 ]; then
      run grep -q '"-kvu"' "$gemma"
      [ "$status" -eq 0 ]
    fi
  else
    run grep -qE '"-np",[[:space:]]*"\$Slots"' "$gemma"
    [ "$status" -eq 0 ]
    run grep -qE '\$Slots[[:space:]]*=[[:space:]]*1' "$gemma"
    [ "$status" -eq 0 ]
    # Muss den tatsaechlichen Parameter-Append treffen, NICHT irgendeine Zeile,
    # die beides erwaehnt: die Statusausgabe des Skripts enthaelt ebenfalls
    # "$Slots -gt 1" und den Text "-kvu" und wuerde eine lose Regex erfuellen,
    # auch wenn der Zweig geloescht waere (beim Negativtest aufgefallen).
    run grep -qE 'if[[:space:]]*\([[:space:]]*\$Slots[[:space:]]*-gt[[:space:]]*1[[:space:]]*\)[[:space:]]*\{[[:space:]]*\$Params[[:space:]]*\+=[[:space:]]*"-kvu"' "$gemma"
    [ "$status" -eq 0 ]
  fi
}

@test "start-gemma-server.ps1 keeps :8091 multimodal via --mmproj (T002296)" {
  # Gemma 4 12B kann Bild UND Audio, aber nur mit geladenem mmproj-Tower. Ohne
  # ihn startet der Server klaglos als reines Textmodell - /props meldet dann
  # vision:false/audio:false, und auffallen wuerde es erst, wenn ein Client ein
  # Bild schickt und eine hilflose Textantwort bekommt. Genau das ist zwischen
  # T002293 und T002296 passiert: der Live-Server hatte den Tower, das Skript
  # nicht, und der erste Start ueber das Skript hat ihn lautlos entfernt.
  gemma="$REPO/scripts/llm/start-gemma-server.ps1"
  run grep -qE '\$Mmproj[[:space:]]*=[[:space:]]*Join-Path' "$gemma"
  [ "$status" -eq 0 ]
  # Der Append muss an der Bedingung haengen, nicht irgendwo im Text stehen.
  run grep -qE '\$Params[[:space:]]*\+=[[:space:]]*@\("--mmproj",[[:space:]]*\$Mmproj\)' "$gemma"
  [ "$status" -eq 0 ]
  # Und ein fehlender Tower darf nicht still durchrutschen.
  run grep -qE 'mmproj not found' "$gemma"
  [ "$status" -eq 0 ]
}

@test "start-gemma-server.ps1 pairs quantised KV with -fa on (T002296)" {
  # Harte llama.cpp-Kopplung, kein Stilfrage: mit "-fa off" bricht der Start ab
  # mit "llama_init_from_model: V cache quantization requires flash_attn".
  # Nur f16 laedt ohne. Der Default "-fa auto" waehlt hier zwar faktisch "on",
  # ist aber hardwareabhaengig und wird von /props NICHT exponiert - es gibt
  # also keine Laufzeitpruefung, die den Fehler nachtraeglich sichtbar machte.
  gemma="$REPO/scripts/llm/start-gemma-server.ps1"
  kv="$(grep -oE '\$KvType[[:space:]]*=[[:space:]]*"[a-z0-9_]+"' "$gemma" | head -1 | sed -E 's/.*"([a-z0-9_]+)"/\1/')"
  [ -n "$kv" ]
  if [ "$kv" != "f16" ]; then
    run grep -qE '"-fa",[[:space:]]*"on"' "$gemma"
    [ "$status" -eq 0 ]
  fi
}

# Kein eigener Start-Job-Guard fuer start-gemma-server.ps1: der Test
# "no scripts/llm/*.ps1 starts a server via Start-Job (T002276)" oben deckt
# jedes Skript im Verzeichnis ab, auch neu hinzugekommene.

# ── -NoWait-Schalter (T002339) ──────────────────────────────────────
# Alle drei Startskripte sollen einen -NoWait-Schalter anbieten, der Health-Poll
# und Hinweistext ueberspringt. CRLF-Toleranz wie die -ngl-Guards (T002337):
# [[:space:]]*$ statt $, weil .ps1-Dateien durchgehend CRLF sind.

@test "every scripts/llm/start-*.ps1 has a NoWait switch (T002339)" {
  missing=""
  for f in "$REPO"/scripts/llm/start-*.ps1; do
    grep -qE '\[switch\]\$NoWait[[:space:]]*$' "$f" || missing="$missing $(basename "$f")"
  done
  [ -z "$missing" ] || { echo "ohne -NoWait:$missing"; false; }
}

@test "every scripts/llm/start-*.ps1 wraps health-poll/text in if (-not \$NoWait) (T002339)" {
  missing=""
  for f in "$REPO"/scripts/llm/start-*.ps1; do
    grep -qE 'if[[:space:]]*\([[:space:]]*-not[[:space:]]+\$NoWait[[:space:]]*\)' "$f" || missing="$missing $(basename "$f")"
  done
  [ -z "$missing" ] || { echo "ohne -NoWait-Guard:$missing"; false; }
}

@test "install-startup-autostart.ps1 autostarts no SECOND chat model (T002286)" {
  # Die urspruengliche Absicht (T002276) - der Embedding-Stack darf nicht
  # verhungern - gilt weiter, nur nicht mehr pauschal gegen jedes Chat-Modell.
  # Gemma ist mit festem -c 65536 planbar (12576 von 16303 MiB) und laesst
  # bge-m3 + Reranker mit zusammen ~1,7 GB Platz. Ein ZWEITES Chat-Modell passt
  # daneben nicht: gpt-oss-20b allein braucht 12,1 GB.
  run bash -c "grep -E 'start-(gptoss|bonsai)' '$REPO/scripts/llm/install-startup-autostart.ps1'"
  [ "$status" -ne 0 ]
}

# ── [T002335] Watchdog fuer die LLM-Server ────────────────────────────
#
# Der Autostart startet die Server EINMAL bei der Anmeldung. Stirbt danach einer,
# bleibt er tot - unter \Llama\ war kein Scheduled Task registriert, der es haette
# bemerken koennen. Diese Guards halten fest, was den Watchdog wirksam macht.

@test "T002335: watchdog-llm-servers.ps1 existiert" {
  [ -f "$REPO/scripts/llm/watchdog-llm-servers.ps1" ]
}

@test "T002335: jeder Watchdog-Server-Eintrag hat Name, Port, Script und Args" {
  # Ein fehlender Hashtable-Key liefert in PowerShell still $null (T002264) - der
  # Eintrag liefe dann mit leerem Skriptpfad los. Deshalb strukturell pruefen.
  local entries
  entries=$(grep -cE '@\{ *Name *=.*Port *=.*Script *=.*Args *=' \
    "$REPO/scripts/llm/watchdog-llm-servers.ps1")
  [ "$entries" -eq 3 ] || { echo "erwartet 3 vollstaendige Server-Eintraege, gefunden: $entries"; false; }
}

@test "T002335: der Watchdog prueft localhost:PORT/health" {
  run grep -qE 'http://localhost:\$Port/health' "$REPO/scripts/llm/watchdog-llm-servers.ps1"
  [ "$status" -eq 0 ]
}

@test "T002335: install-startup-autostart.ps1 referenziert das Watchdog-Skript" {
  run grep -q 'watchdog-llm-servers.ps1' "$REPO/scripts/llm/install-startup-autostart.ps1"
  [ "$status" -eq 0 ]
}

@test "T002335: der Watchdog nutzt Start-Process, nie Start-Job" {
  # T002276-Klasse: Start-Job bindet den Server an die erzeugende PowerShell-
  # Sitzung. Endet sie, stirbt der Server mit - ein Watchdog, der so startet,
  # produziert genau den Ausfall, den er verhindern soll.
  # Nur Code pruefen: der <# .. #>-Hilfeblock und die Zeilenkommentare ERKLAEREN,
  # warum Start-Job falsch ist. Ein ungefiltertes grep bliebe an der Erklaerung
  # haengen und waere gruen, sobald jemand den Kommentar loescht - also genau
  # falschherum. awk schneidet den Hilfeblock heraus, grep -v die Kommentarzeilen.
  local code
  code="$(awk '/^<#/{s=1} !s{print} /^#>/{s=0}' \
    "$REPO/scripts/llm/watchdog-llm-servers.ps1" | grep -vE '^[[:space:]]*#')"
  run bash -c "printf '%s' \"\$1\" | grep -q 'Start-Job'" _ "$code"
  [ "$status" -ne 0 ] || { echo "Start-Job im Code des Watchdogs gefunden"; false; }
  run bash -c "printf '%s' \"\$1\" | grep -q 'Start-Process'" _ "$code"
  [ "$status" -eq 0 ] || { echo "Watchdog startet nicht per Start-Process"; false; }
}

@test "T002335: Write-WatchdogLog schreibt nicht in den Success-Stream" {
  # Write-Output waere Teil des Rueckgabewerts jeder aufrufenden Funktion.
  # Gemessen am 2026-07-28: Invoke-WatchdogCycle lieferte dadurch ein Array aus
  # Log-Zeilen statt der Anzahl gesunder Server; '$alive -eq $Servers.Count'
  # wirkt auf Arrays als Filter und war nur zufaellig wahr.
  local body
  body="$(awk '/^function Write-WatchdogLog/{s=1} s{print} s&&/^}/{exit}' \
    "$REPO/scripts/llm/watchdog-llm-servers.ps1")"
  [ -n "$body" ] || { echo "Write-WatchdogLog nicht gefunden"; false; }
  run bash -c "printf '%s' \"\$1\" | grep -q 'Write-Output'" _ "$body"
  [ "$status" -ne 0 ] || { echo "Write-WatchdogLog nutzt Write-Output"; false; }
}
