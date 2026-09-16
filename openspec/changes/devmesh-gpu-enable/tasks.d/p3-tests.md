## Partial P3 — Tests & Verifikation (Rolle: test)

**Ziel:** Das Verhalten von `scripts/devmesh/gpu-enable.sh` ist offline gegen Stubs
abgesichert (Requirement „GPU enablement on a host is scripted and repeatable"), und die
drei Akzeptanzstufen gegen die echte GTX 970 sind als manueller Schritt mit konkreten
Befehlen festgehalten.

**Dateien dieses Partials:**

| Datei | Ist | Budget |
|---|---|---|
| `tests/spec/local-dev-mesh/gpu-enable.bats` | 0 (neu) | nicht S1-gated |

`.bats` steht nicht in `s1.limits` von `docs/code-quality/gates.yaml`
(`grep -A20 '^  limits:' docs/code-quality/gates.yaml` listet `.sh`, `.bash`, `.mjs`, … aber
kein `.bats`), und `jq -r '."S1:tests/spec/local-dev-mesh/gpu-enable.bats".metric // "nicht-baselined"' docs/code-quality/baseline.json`
liefert `nicht-baselined`. Die Datei unterliegt damit keiner Zeilenschwelle; als Orientierung
liegen die Nachbardateien bei 165 (`k3s-install.bats`) und 132 Zeilen (`preflight.bats`).

**Kein NVIDIA-Host in CI — gemessen, nicht angenommen:**

```bash
# Stand: main@19eebe20e
grep -rn 'nvidia' .github/workflows/ ; echo "rc=$?"
# -> keine Trefferzeile, rc=1
```

Daraus folgt: die BATS-Datei darf **kein** NVIDIA-Werkzeug und keinen echten Host
voraussetzen. Sie läuft ausschliesslich gegen einen `ssh`-Stub im PATH eines
Temp-Verzeichnisses. Ein Verfügbarkeits-Guard (`command -v nvidia-smi >/dev/null 2>&1 || skip`)
ist deshalb **nicht** nötig und wäre schädlich: er würde die Tests in CI stillschweigend
überspringen. Benötigt werden nur `bash` und der vendored Runner, beide in CI vorhanden.
Die Datei benutzt bewusst auch kein `yq` zur Laufzeit — das Fixture wird nicht mutiert.

**Schnittstellenvertrag, den P1 (`gpu-enable.sh`) erfüllen muss** — die Tests hängen daran:

- Aufruf: `scripts/devmesh/gpu-enable.sh <host>`, Inventar aus `DEVMESH_INVENTORY`.
- Lokale Pflichtwerkzeuge (`ssh`, `yq`): fehlt eines → Exit 2, Meldung nennt den Namen des
  Werkzeugs, **kein** `ssh`-Aufruf.
- Erreichbarkeitsprobe: `ssh … <user>@<lan_ip> 'sudo -n true'`; Exit ≠ 0 → Exit 2, Meldung
  nennt den Hostnamen aus dem Inventar.
- Zustandsabfrage: `ssh … <user>@<lan_ip> 'nvidia-ctk --version'`. Erfolg ⇒ Host ist bereits
  aktiviert: Zeile mit Präfix `unveraendert: `, Exit 0, kein Install-Kommando, kein
  k3s-Neustart.
- Erstlauf: Installationsskript geht über **stdin** an `ssh … 'sudo -n bash -s'` und enthält
  `nvidia-container-toolkit`, `nvidia-ctk runtime configure --runtime=containerd` und
  `systemctl restart k3s`.

---

### Task P3.1 — Failing-Test-Step (RED): `gpu-enable.bats` anlegen

**Files:**
- Create: `tests/spec/local-dev-mesh/gpu-enable.bats`

**Interfaces:**
- Consumes: `scripts/devmesh/gpu-enable.sh` (Schnittstellenvertrag oben),
  `tests/spec/local-dev-mesh/fixtures/inventory.yaml` (Host `gpu-metal`, `lan_ip 10.1.0.101`,
  SSH-Nutzer `patrick` wie in `k3s-install.bats`).
- Produces: vier `@test`-Blöcke, auf die Task P3.2 als GREEN-Nachweis verweist.

- [ ] **Schritt 1: Die Testdatei schreiben.**

```bash
cat > tests/spec/local-dev-mesh/gpu-enable.bats << 'EOF'
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/gpu-enable.bats — scripts/devmesh/gpu-enable.sh [T900179]
#
# Pruefmodus: Output-Verifikation. Das Skript laeuft gegen einen ssh-Stub, der argv und
# stdin getrennt protokolliert; bewertet werden Exit-Code, die Protokolle und einzelne
# Ausgabezeilen — nie der Quelltext des Skripts.
#
# Kein NVIDIA-Werkzeug und kein echter Host: in CI gibt es keinen GPU-Runner
# (grep -rn 'nvidia' .github/workflows/ -> keine Treffer). Die drei Akzeptanzstufen gegen
# die echte Karte laufen manuell, siehe Plan-Task P3.3.
#
# $0-Falle (tests/CLAUDE.md): das Arbeitsverzeichnis heisst hier selbst
# "devmesh-gpu-enable-T900179". Keine Assertion liest den Gesamtoutput ungefiltert; die
# Meldungstests filtern den Skriptpfad vorher heraus (_msg).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/gpu-enable.sh"
  export DEVMESH_INVENTORY="${BATS_TEST_DIRNAME}/fixtures/inventory.yaml"
  BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$BIN"
  export SSH_ARGV_LOG="${BATS_TEST_TMPDIR}/ssh-argv.log"
  export SSH_STDIN_LOG="${BATS_TEST_TMPDIR}/ssh-stdin.log"
  : > "$SSH_ARGV_LOG"
  : > "$SSH_STDIN_LOG"
  cat > "$BIN/ssh" << 'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SSH_ARGV_LOG"
cmd="${!#}"
case "$cmd" in
  *"sudo -n true"*) exit "${STUB_REACH_RC:-0}" ;;
  *"nvidia-ctk --version"*)
    if [ -n "${STUB_TOOLKIT:-}" ]; then printf '%s\n' "$STUB_TOOLKIT"; exit 0; fi
    exit 1 ;;
  *"bash -s"*) cat >> "$SSH_STDIN_LOG" ;;
  *) echo "ssh-Stub: unerwarteter Aufruf: $cmd" >&2; exit 99 ;;
esac
STUB
  chmod +x "$BIN/ssh"
}

# Ausgabe ohne die Zeilen, die den Skriptpfad tragen (Usage/$0) — siehe Kopfkommentar.
_msg() { printf '%s\n' "$output" | grep -vF "$SCRIPT" || true; }

@test "Erstlauf: Toolkit-Installation, containerd-Konfiguration und k3s-Neustart gehen an den Host" {
  run env PATH="$BIN:$PATH" bash "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  grep -qF 'patrick@10.1.0.101' "$SSH_ARGV_LOG"
  grep -qF 'nvidia-container-toolkit' "$SSH_STDIN_LOG"
  grep -qF 'nvidia-ctk runtime configure --runtime=containerd' "$SSH_STDIN_LOG"
  grep -qF 'systemctl restart k3s' "$SSH_STDIN_LOG"
}

@test "zweiter Lauf gegen aktivierten Host: Exit 0, meldet das Toolkit, kein k3s-Neustart" {
  export STUB_TOOLKIT='NVIDIA Container Toolkit CLI version 1.17.8'
  run env PATH="$BIN:$PATH" bash "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q '^unveraendert: '
  # Positiv-Anker: der Zustand wurde tatsaechlich per ssh abgefragt
  grep -qF 'nvidia-ctk --version' "$SSH_ARGV_LOG"
  # ... und danach ging nichts mehr raus: kein Install-Skript, kein Neustart
  [ ! -s "$SSH_STDIN_LOG" ]
  restarts="$(grep -cF 'restart k3s' "$SSH_ARGV_LOG" || true)"
  [ "$restarts" -eq 0 ]
}

@test "fehlendes lokales Werkzeug: Exit 2, nennt yq, kein Kommando gegen den Host" {
  # Positiv-Anker: mit vollstaendigem PATH laeuft derselbe Aufruf durch und redet mit dem Host
  run env PATH="$BIN:$PATH" bash "$SCRIPT" gpu-metal
  [ "$status" -eq 0 ]
  [ -s "$SSH_ARGV_LOG" ]

  : > "$SSH_ARGV_LOG"
  : > "$SSH_STDIN_LOG"
  for t in bash env awk grep sed head tail cat cut tr sort dirname basename mktemp; do
    ln -sf "$(command -v "$t")" "$BIN/$t"
  done
  run env PATH="$BIN" "$BASH" "$SCRIPT" gpu-metal
  [ "$status" -eq 2 ]
  _msg | grep -qF 'yq'
  [ ! -s "$SSH_ARGV_LOG" ]
  [ ! -s "$SSH_STDIN_LOG" ]
}

@test "unerreichbarer Host: Exit 2, nennt den Host, keine Zustandsaenderung" {
  export STUB_REACH_RC=255
  run env PATH="$BIN:$PATH" bash "$SCRIPT" gpu-metal
  [ "$status" -eq 2 ]
  _msg | grep -qF 'gpu-metal'
  # Positiv-Anker: die Erreichbarkeitsprobe wurde abgesetzt, danach nichts mehr
  grep -qF 'sudo -n true' "$SSH_ARGV_LOG"
  [ ! -s "$SSH_STDIN_LOG" ]
}
EOF
```

- [ ] **Schritt 2: Syntax der Datei prüfen.** `bash -n` taugt für `.bats` nicht
      (`@test "x" { … }` ist keine gültige Bash-Syntax, `tests/CLAUDE.md`). Stattdessen:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/local-dev-mesh/gpu-enable.bats
# erwartet: 4
```

- [ ] **Schritt 3: Testlauf RED.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/gpu-enable.bats
# expected: FAIL — scripts/devmesh/gpu-enable.sh existiert noch nicht,
# alle vier Tests brechen mit "No such file or directory" ab.
```

- [ ] **Schritt 4: Commit.**

```bash
git add tests/spec/local-dev-mesh/gpu-enable.bats
git commit -m "test(devmesh): guard fuer gpu-enable.sh (rot) [T900179]"
```

---

### Task P3.2 — GREEN: Guard gegen die fertige Implementierung laufen lassen

Läuft, nachdem die Partials P1 (`scripts/devmesh/gpu-enable.sh`) und P2
(`dev-local/gpu/`, `status.sh`) im Branch liegen.

**Files:**
- Test: `tests/spec/local-dev-mesh/gpu-enable.bats` (nur ausführen; Änderungen hier nur,
  wenn ein Test nachweislich falsch misst)

- [ ] **Schritt 1: Die vier Tests grün laufen lassen.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/gpu-enable.bats
# erwartet: 4 Tests, alle ok
```

- [ ] **Schritt 2: Beide Formen der Spec-Tests erfassen** (Sammeldatei *und* Verzeichnis,
      `tests/CLAUDE.md` T002696) — sonst bleibt eine Hälfte ungeprüft bis CI:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-dev-mesh*
```

- [ ] **Schritt 3: Rot-Gegenprobe des Idempotenz-Tests.** Ein grüner Test belegt noch
      nicht, dass er die richtige Grösse misst. Einmal beweisen, dass er zuschlägt:
      im Stub `*"nvidia-ctk --version"*` temporär auf `exit 1` festnageln, Test erneut
      laufen lassen (muss rot werden), Änderung verwerfen.

```bash
git diff --quiet tests/spec/local-dev-mesh/gpu-enable.bats || git checkout -- tests/spec/local-dev-mesh/gpu-enable.bats
```

- [ ] **Schritt 4: Test-Inventar regenerieren und mitcommitten** (CI vergleicht es):

```bash
task test:inventory
git add components/website/src/data/test-inventory.json
git commit -m "test(devmesh): gpu-enable-guard gruen, Inventar aktualisiert [T900179]"
```

---

### Task P3.3 — Manuelle Akzeptanz gegen die echte GTX 970 (nicht in CI)

Diese Stufen brauchen `gpu-metal` und die Karte; sie erzeugen **kein** Dateiartefakt und
laufen ausserhalb der CI. Reihenfolge einhalten — Stufe 1 und 2 können grün sein, während
Stufe 3 scheitert (Design D4).

- [ ] **Stufe 1: Der Knoten bietet die Ressource an.**

```bash
kubectl --context devmesh get node gpu-metal -o jsonpath='{.status.allocatable.nvidia\.com/gpu}'
# erwartet: 1
```

- [ ] **Stufe 2: Ein Pod mit `runtimeClassName: nvidia` sieht die Karte.**

```bash
kubectl --context devmesh run gpu-smoke --rm -it --restart=Never \
  --image=nvidia/cuda:12.8.1-base-ubuntu24.04 \
  --overrides='{"spec":{"runtimeClassName":"nvidia","nodeSelector":{"gpu":"true"},"containers":[{"name":"gpu-smoke","image":"nvidia/cuda:12.8.1-base-ubuntu24.04","command":["nvidia-smi"],"resources":{"limits":{"nvidia.com/gpu":"1"}}}]}}'
# erwartet: nvidia-smi-Tabelle mit "GeForce GTX 970" und Treiber 580.173.02
```

- [ ] **Stufe 3: Maxwell-Beweis — llama.cpp-CUDA lädt `bge-m3-Q8_0` mit `-ngl 99`.**
      Das ist die eigentliche Frage: compute capability 5.2, sm_50-PTX per JIT
      (Design D4). Stufe 1 und 2 sagen darüber nichts aus.

```bash
kubectl --context devmesh run bge-maxwell --rm -it --restart=Never \
  --image=ghcr.io/ggml-org/llama.cpp:server-cuda \
  --overrides='{"spec":{"runtimeClassName":"nvidia","nodeSelector":{"gpu":"true"},"containers":[{"name":"bge","image":"ghcr.io/ggml-org/llama.cpp:server-cuda","args":["-hf","gpustack/bge-m3-GGUF:Q8_0","--embedding","-ngl","99","--no-warmup"],"resources":{"limits":{"nvidia.com/gpu":"1"}}}]}}'
# erwartet im Log: "offloaded 25/25 layers to GPU" (Layer-Zahl modellabhaengig,
# entscheidend ist X/X statt 0/X) und ein Serverstart ohne CUDA-Fehler.
```

- [ ] **Abbruchbedingung festhalten.** Scheitert Stufe 3 (CUDA-Fehler, `no kernel image is
      available for execution on the device`, oder Fallback auf 0 offloaded layers), dann
      ist das Folgevorhaben TS3 (BGE-Embeddings auf der GTX 970) in der geplanten Form
      **nicht machbar**. In diesem Fall: Ergebnis samt Logauszug als Kommentar an T900179
      hängen, TS3 nicht starten, und den Change auf die Stufen 1–2 begrenzt abschliessen.
      Nur bei grüner Stufe 3 gilt der Maxwell-Pfad als belegt.

- [ ] **Ergebnis der drei Stufen am Ticket dokumentieren** — je Stufe der ausgeführte
      Befehl und die beobachtete Ausgabe (Mess-Konvention T002717: ohne Befehl ist die
      Zahl kein Beleg).

```bash
bash scripts/ticket.sh add-comment --id T900179 --body "Akzeptanz devmesh-gpu-enable: Stufe 1/2/3 mit Befehl und Ausgabe."
```

---

### Task P3.4 — Finale Verifikation (Pflicht-Gates)

- [ ] **Schritt 1: Die drei verpflichtenden CI-Gates ausführen.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Schritt 2: Regenerierte Artefakte mitcommitten**, falls
      `task freshness:regenerate` etwas verändert hat:

```bash
git status --short
git add -A && git commit -m "chore: freshness-Artefakte nach gpu-enable-Guard [T900179]"
```

> Fällt `task test:changed` mit `Executed 0 instead of expected N` aus, fehlt GNU `parallel`
> — das ist kein Testfehlschlag (`tests/CLAUDE.md`). Dann seriell nachfahren:
> `tests/unit/lib/bats-core/bin/bats -r tests/spec/local-dev-mesh*`.
