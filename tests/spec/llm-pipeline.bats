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

@test "install-startup-autostart.ps1 covers embed and rerank only (T002276)" {
  [ -f "$REPO/scripts/llm/install-startup-autostart.ps1" ]
  run grep -q "start-embed-server.ps1', 'start-rerank-server.ps1')" \
      "$REPO/scripts/llm/install-startup-autostart.ps1"
  [ "$status" -eq 0 ]
  # Chat-Server bewusst nicht im Autostart: stark unterschiedlicher VRAM-Bedarf,
  # ein pauschaler Start wuerde dem Embedding-Stack den Speicher wegnehmen.
  run bash -c "grep -nE '^[^#]*start-bonsai-server' '$REPO'/scripts/llm/*.ps1 2>/dev/null"
  [ -z "$output" ]
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
