# p4 — Engine-Isolation und Modellvergleich (Rolle ops)

Frontmatter-Anker: Ticket T900087 · Rolle ops · haengt an P1 (VRAM-Fix in
`start-gptoss-server.ps1`/`start-gemma-server.ps1` — ohne ihn bricht der
llama.cpp-Start mit „Cannot convert System.Object[] to Int32" ab, weil zwei
GPUs zwei Zeilen von `nvidia-smi --query-gpu=memory.free` liefern).

**target_file:** `scripts/llm/bench-engine-ab.sh` (neu, S1-Limit `.sh` 800,
Budget 800/800 frei — kein Bestand, siehe `docs/code-quality/gates.yaml:61`).

## Kernidee (warum dieses Partial existiert)

Die bisherige Backend-Entscheidung (T014028/T014105) vermengt zwei Fragen —
Engine und Modell. FreeToken erschien schneller, weil eine Offload-MoE gegen
ein **dichtes** Modell (`qwen38-220k`) gemessen wurde. Die Isolation ist
gratis zu haben: `gpt-oss-20b` liegt bereits in beiden Formaten auf Platte,
kein Download noetig.

- **FreeToken**: Profil `gptoss-65k` in `scripts/llm/restart-freetoken.ps1`
  (Zeile 62: `$env:USERPROFILE\models\gpt-oss-20b`, `--num-tokens 65536`,
  `--max-running-requests 1`), Port `:1919`.
- **llama.cpp**: `scripts/llm/start-gptoss-server.ps1`, Modell
  `$env:UserProfile\.lmstudio\models\ggml-org\gpt-oss-20b-GGUF\gpt-oss-20b-MXFP4.gguf`,
  Port `:8097`.

Beide Startskripte pruefen `Test-Path` auf ihr Modell selbst — `bench-engine-ab.sh`
dupliziert diese Pruefung NICHT, sondern laesst die Startskripte fehlschlagen
und gibt deren stderr weiter (dünner Treiber, kein Nachbau).

## Task T1 — Wiederverwendung statt Neubau festhalten

- [x] Vor der Implementierung die drei vorhandenen Mess-Skripte lesen und ihre
      Zustaendigkeit im Skript-Header von `bench-engine-ab.sh` als Kommentar
      referenzieren (kein Copy-Paste ihrer Logik):
      - `scripts/llm/bench-decode.sh <port> <label>` — liest den
        `timings`-Block von llama.cpp `/completion` (`prompt_per_second`,
        `predicted_per_second`, `draft_n`/`draft_n_accepted`). Fuer die
        llama.cpp-Seite von Stufe 1.
      - `scripts/llm/bench-concurrent.sh <port> <n> <label>` — trennt
        Einzelstrom von Gesamtdurchsatz. Nur als `np=1`-Beleg relevant (siehe
        T4), da FreetToken `gptoss-65k` fest auf `--max-running-requests 1`
        steht und ein Vergleich bei hoeherer Parallelitaet nicht moeglich ist.
      - `scripts/llm/bench-freetoken-prefill.sh --tag <t> --base-url <url>` —
        end-to-end Wanduhr fuer Prefill (kalt/Radix-Cache-Treffer) und Decode
        gegen FreeToken `/v1/chat/completions`. Fuer die FreeToken-Seite.
- [x] Verifikation, dass alle drei existieren und ausfuehrbar sind (Positiv-Anker):
      ```bash
      test -x scripts/llm/bench-decode.sh && echo "bench-decode.sh: OK"
      test -x scripts/llm/bench-concurrent.sh && echo "bench-concurrent.sh: OK"
      test -x scripts/llm/bench-freetoken-prefill.sh && echo "bench-freetoken-prefill.sh: OK"
      ```

## Task T2 — Skript-Geruest und CLI

- [x] `scripts/llm/bench-engine-ab.sh` anlegen mit `set -euo pipefail`,
      `REPO_ROOT="$(git rev-parse --show-toplevel)"`, `cd "$REPO_ROOT"`.
- [x] CLI: `--tag <name>` (Pflicht, geht in Dateinamen und Log-Zeilen ein —
      gleiches Muster wie `bench-freetoken-prefill.sh --tag`), `--n-predict N`
      (Default 512, an `bench-decode.sh`/`bench-concurrent.sh` durchgereicht
      via `N_PREDICT` env), `--warmup-requests N` (Default 5, siehe T5),
      `--skip-llamacpp` / `--skip-freetoken` (Debug-Flag fuer Wiederholung
      einer Seite ohne die andere neu zu starten), `--help`.
- [x] Mess-Konvention T002717 fest im Skript verankern — JEDE Ausgabezeile
      traegt Tag, erzeugenden Befehl (Skriptname) und Commit-Stand:
      ```bash
      COMMIT="$(git rev-parse HEAD)"
      echo "# commit: $COMMIT"
      echo "# erzeugt von: scripts/llm/bench-engine-ab.sh --tag $TAG (siehe Skriptkopf fuer den vollen Aufruf)"
      ```
- [x] Ohne `--tag`: `echo "bench-engine-ab.sh: --tag <name> ist Pflicht" >&2; exit 2`.

## Task T3 — Strikte Sequenzierung (Fallstrick: exklusiver VRAM)

FreeToken belegt ~15,7 von 16 GB VRAM exklusiv, evictet llama.cpp nicht und
wird nicht evictet (`docs/runbooks/freetoken-native.md`). Beide Engines
MUESSEN daher strikt nacheinander laufen, mit verifiziertem Prozessende
zwischen den Phasen — nicht nur "Start-Process hat zurueckgegeben".

- [x] Helper `wait_port_free <port> <timeout_s>` implementieren: pollt per
      `powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue"`
      im 1s-Takt, bricht mit `exit 1` und einer klaren Fehlermeldung ab, wenn
      der Port nach `<timeout_s>` (Default 60, wie in `restart-freetoken.ps1`
      Zeile 106-111) noch belegt ist — ein Timeout ist ein harter Fehler, kein
      stilles Weiterlaufen, sonst startet die naechste Phase gegen einen noch
      lebenden Prozess und die Isolation ist verletzt.
- [x] Helper `stop_freetoken()`:
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Stop`,
      danach `wait_port_free 1919 60`.
- [x] Helper `stop_llamacpp()`: `taskkill.exe` gegen die PID aus
      `C:\Users\PatrickKorczewski\llama-b10090-13.3\gptoss.pid` (Pfad-Muster
      aus `start-gptoss-server.ps1` Zeile 124 — `$LlamaDir` ist der
      Skript-Default; bei abweichendem `-LlamaDir` schlaegt dieser Helper
      bewusst fehl statt zu raten, denn ein falsch geratener Pfad wuerde
      keinen Fehler werfen und stattdessen den Prozess einfach weiterlaufen
      lassen), danach `wait_port_free 8097 60`. Idempotent: fehlt die PID-Datei
      oder ist der Port schon frei, ist das kein Fehler.
- [x] Ablauf: `stop_freetoken; stop_llamacpp` (Phase 1 startet mit beiden
      Engines garantiert unten) → Phase 1 llama.cpp → `stop_llamacpp` →
      Phase 2 FreeToken → `stop_freetoken` am Skriptende (auch bei Fehlern,
      also `trap 'stop_llamacpp; stop_freetoken' EXIT`).

## Task T4 — Phase 1: llama.cpp (Port 8097)

- [x] `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/start-gptoss-server.ps1`
      aufrufen (kein `-NoWait` — das Skript pollt selbst bis zu 240 s auf
      `/health`, siehe Zeilen 126-153; Exit-Code auswerten, bei Fehlschlag
      mit dessen `gptoss-err.log`-Tail abbrechen statt weiterzumachen).
- [x] `bash scripts/llm/bench-decode.sh 8097 "llamacpp-gptoss20b-${TAG}"`
      ausfuehren und Ausgabe nach
      `scripts/llm/measurements/raw/${TAG}-llamacpp-decode.log` spiegeln
      (`tee`). `bench-decode.sh` waermt intern bereits vor (Zeile 60-62 im
      Skript) — kein zusaetzlicher Warmup fuer die llama.cpp-Seite noetig,
      das JIT-Fallstrick betrifft nur FreeToken/Triton (siehe T5).
- [x] `bash scripts/llm/bench-concurrent.sh 8097 1 "llamacpp-gptoss20b-${TAG}-np1"`
      zusaetzlich ausfuehren und nach
      `scripts/llm/measurements/raw/${TAG}-llamacpp-concurrent.log` spiegeln —
      dokumentiert `np=1` als eigene Messgroesse (siehe T7/Fallstrick
      Parallelitaet), NICHT um sie mit FreeToken zu mitteln.
- [x] `stop_llamacpp` (siehe T3).

## Task T5 — Phase 2: FreeToken (Port 1919), JIT-Warmup als Fallstrick abgebildet

Die ersten FreeToken-Requests laufen mit 4-40 tok/s, bis die Triton-Kernel
kompiliert sind (`docs/runbooks/freetoken-native.md`). Ohne explizites
Warmfahren misst `bench-freetoken-prefill.sh` den Compiler, nicht die Engine —
und das Skript selbst warnt davor nicht, weil es das Muster im Serverstart
nicht kennt.

- [x] `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/llm/restart-freetoken.ps1 -Profile gptoss-65k -Tag "ab-${TAG}"`
      aufrufen (das Skript wartet selbst bis zu 900 s auf `status=ok` UND
      `maintenance=serving`, Zeilen 145-176 — das ist Prozessbereitschaft,
      NICHT JIT-Warmheit; beide sind verschiedene Dinge).
- [x] Nach Bereitschaft `--warmup-requests` (Default 5) sequentielle
      Kurz-Completions gegen `http://127.0.0.1:1919/v1/chat/completions`
      schicken und **einzeln mit Wanduhrzeit loggen** (nicht stumm
      verwerfen) — der sichtbare Abfall von 4-40 tok/s auf den stabilen Wert
      ist der Beleg, dass der JIT-Fallstrick tatsaechlich adressiert wurde,
      statt behauptet:
      ```bash
      for i in $(seq 1 "$WARMUP_REQUESTS"); do
        t0=$(date +%s.%N)
        curl -sS --max-time 60 http://127.0.0.1:1919/v1/chat/completions \
          -H 'Content-Type: application/json' \
          -d '{"model":"gpt-oss-20b","messages":[{"role":"user","content":"Sag OK."}],"max_tokens":16,"temperature":0.0}' \
          -o /dev/null
        t1=$(date +%s.%N)
        echo "  warmup $i/$WARMUP_REQUESTS: $(python3 -c "print(f'{$t1-$t0:.2f}')")s"
      done
      ```
- [x] `bash scripts/llm/bench-freetoken-prefill.sh --tag "freetoken-gptoss20b-${TAG}" --base-url http://127.0.0.1:1919`
      ausfuehren und Ausgabe nach
      `scripts/llm/measurements/raw/${TAG}-freetoken-prefill.log` spiegeln.
- [x] `--max-running-requests 1` (aus dem `gptoss-65k`-Profil, nicht
      abstellbar ohne das Profil zu aendern) als Notiz in die Log-Datei
      schreiben — Parallelitaet ist bei FreeToken in diesem Profil nicht
      vergleichbar zu `bench-concurrent.sh`, das gehoert als eigene
      Messgroesse ausgewiesen statt gemittelt (siehe Task T4 zweiter Punkt).
- [x] `stop_freetoken` (siehe T3).

## Task T6 — Zusammenfuehrung ohne Messlogik-Nachbau

- [x] Am Skriptende NUR die bereits von den Unterskripten berechneten
      Decode-Zahlen nebeneinander drucken (Quelle bleibt sichtbar, keine neue
      Berechnung, kein automatischer "Sieger"):
      ```bash
      echo "== Zusammenfassung ${TAG} (commit ${COMMIT}) =="
      grep '^  decode' "scripts/llm/measurements/raw/${TAG}-llamacpp-decode.log" | sed 's/^/llama.cpp  /'
      grep '^decode ' "scripts/llm/measurements/raw/${TAG}-freetoken-prefill.log" | sed 's/^/freetoken /'
      echo "(unterschiedliche Messmethodik: llama.cpp = interne timings, FreeToken = end-to-end Wanduhr — beide Zahlen nebeneinander lesen, nicht subtrahieren)"
      ```
- [x] Diese Zusammenfassung zusaetzlich nach
      `scripts/llm/measurements/raw/${TAG}-summary.log` schreiben — P6 liest
      genau diese Datei fuer den finalen Messbericht
      (`scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md`).

## Task T7 — Abbruchpunkt 2 explizit als Schritt

- [x] Nach T6: die Zusammenfassung manuell (kein automatisierter Vergleich,
      siehe T6-Begruendung) gegen das Abbruchkriterium aus der Proposal
      pruefen: **verliert llama.cpp bei identischen Gewichten (`gpt-oss-20b`
      auf beiden Engines) bereits in Decode-tok/s gegen FreeToken?**
      - Ja → Abbruchpunkt 2 ist erreicht. Das ist ein **Ergebnis, kein
        Fehlschlag**. In `scripts/llm/measurements/raw/${TAG}-summary.log`
        eine Zeile `ABBRUCHPUNKT-2: erreicht` ergaenzen. P5
        (Modellvergleich, Gemma/Qwen3.8/FreeToken-Amtsinhaber, ~26 GB
        Download) entfaellt dann — P6 uebernimmt diesen Befund direkt in den
        Messbericht, ohne dass P5 noch laeuft.
      - Nein → Zeile `ABBRUCHPUNKT-2: nicht erreicht` ergaenzen, P5 laeuft
        wie geplant.
- [x] Diese Entscheidung wird in P4 nur **markiert**, nicht vollzogen — ob P5
      tatsaechlich uebersprungen wird, entscheidet P6 beim Zusammenfuehren
      (Abhaengigkeitshinweis aus `tasks.md`: „P6 verdichtet die Ergebnisse aus
      P2-P5").

## Task T8 — GREEN belegen

- [x] Syntax-Check (kein Interpreter-Fehler vor dem ersten Live-Lauf):
      ```bash
      bash -n scripts/llm/bench-engine-ab.sh
      ```
- [x] S1-Zeilenlimit einhalten (Budget 800/800, siehe Kopf dieser Datei):
      ```bash
      wc -l scripts/llm/bench-engine-ab.sh
      # erwartet: <= 800
      ```
- [x] Quality-Gate lokal:
      ```bash
      task quality:check
      ```
- [ ] OFFEN (bewusst nicht ausgefuehrt, Scope-Grenze T900087-Lauf 2026-09-04):
      Funktionaler Lauf auf dem GPU-Host (RTX 5070 Ti, WireGuard-Mesh
      `10.10.0.3` bzw. lokal falls `pk-desktop` — siehe `infra-ops` §5),
      NACHDEM P1 gemergt ist:
      ```bash
      bash scripts/llm/bench-engine-ab.sh --tag smoke001
      # erwartet: beide Phasen laufen durch, scripts/llm/measurements/raw/smoke001-summary.log
      # enthaelt eine ABBRUCHPUNKT-2-Zeile und zwei Decode-Werte mit commit-Zeile
      ```
- [x] S4-Erreichbarkeit: `bench-engine-ab.sh` wird NICHT von einem
      Taskfile-Target aus aufgerufen (bewusst, wie `bench-ifstruct.sh` in P5 —
      kein CI-Bezug, Handwerkzeug). Reachability entsteht stattdessen durch
      P6, das den Skriptaufruf im Messbericht
      (`scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md`) und in
      `docs/runbooks/freetoken-native.md` referenziert — diese Verlinkung ist
      Aufgabe von P6, nicht von P4, aber P4 darf nicht vor P6 als fertig
      gelten, ohne dass diese Abhaengigkeit hier vermerkt ist.
