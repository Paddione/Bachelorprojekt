<!-- Partial p1a-gpu-endpoint — target_files: devmesh/inventory.yaml, devmesh/tailnet-policy.hujson, dev-local/core/gpu-endpoint.yaml, scripts/devmesh/render-stack.sh -->

## Partial P1a: GPU-Endpunkt (Inventar, Tailnet-Policy, Render)

**Rolle:** impl. **depends_on:** keine.

**Ziel:** `llm-gateway-host` bekommt einen benannten Port je Windows-GPU-Dienst, die Tailnet-Policy
die passende Ausnahme (design.md D2). Die Komponente `llm-services` und die Registry folgen in
P1b (`tasks.d/p1b-llm-services.md`).

**Spec:** `openspec/changes/devmesh-llm-services/specs/local-dev-mesh.md` → "The GPU endpoint
exposes one port per workstation GPU service".

### Befunde aus der Planung

- **B1 — `gpu_endpoint.address` fehlt im Inventar.** `scripts/devmesh/render-stack.sh` liest
  `.gpu_endpoint.address`, `devmesh/inventory.yaml` fuehrt nur `host` und `port`. Der Render bricht
  deshalb heute mit dem echten Inventar ab (der BATS-Guard nutzt eine eigene Fixture):
  ```bash
  PRE=db16df855
  bash scripts/devmesh/render-stack.sh core >/dev/null; echo "rc=$?"
  # 2026-09-16: "gpu_endpoint.address '' liegt nicht in 100.64.0.0/10", rc=2
  ```
  Task P1a.1 traegt die Adresse aus `hosts.gpu-host` der Tailnet-Policy nach
  (`grep -n gpu-host devmesh/tailnet-policy.hujson`). Ohne diesen Nachtrag ist `task devmesh:deploy`
  nicht lauffaehig, unabhaengig von diesem Change.
- **B2 — Tailnet-Guard ist auf genau einen Port geschrieben.** `tests/spec/local-dev-mesh/tailnet-policy.bats`
  verlangt `exc=1` (eine Ausnahme-Regel) und `excdst=gpu-host:<gpu_endpoint.port>` als einziges
  Ziel. P1a haelt `exc=1` (eine Regel, ein Ziel je Port) und `gpu_endpoint.port: 1234`. Der zweite
  Test wird mit P1a rot, weil `excdst` danach fuenf Ziele traegt. Die Umstellung auf
  `gpu_endpoint.ports` gehoert P5a (tests/**). Vertrag fuer P5a: `excdst` ist die Liste
  `gpu-host:<p>` fuer jedes `p` aus `gpu_endpoint.ports[].port`, in Inventar-Reihenfolge.
- **B3 — GPU-Portliste.** Aktive fleet-Registry (gemessen 2026-09-16, Befehl im Auftrag) plus
  `scripts/llm/loadouts.json`:
  ```bash
  jq -r '.. | objects | select(has("port")) | "\(.slug // .name) \(.port)"' scripts/llm/loadouts.json | sort -u
  ```
  Aufgenommen: 1234 (LM Studio), 1919 (FreeToken), 8089, 8090, 8094 (llama.cpp mit aktiver
  Registry-Zeile). Nicht aufgenommen: 8095/8096 (CPU-Loadouts, Loadout-Mechanik bleibt entfernt),
  8091/8092/8097/8098/8100 (keine aktive Registry-Zeile), 45013 (Unsloth Studio, kein Proxy-Backend).

### File Structure (dieses Partial)

| Datei | Verantwortung | Ist | Budget |
|---|---|---|---|
| `devmesh/inventory.yaml` | `gpu_endpoint.address` und `gpu_endpoint.ports` | 68 | kein S1-Limit (.yaml) |
| `devmesh/tailnet-policy.hujson` | eine Ausnahme-Regel, ein Ziel je GPU-Port | 23 | kein S1-Limit (.hujson) |
| `dev-local/core/gpu-endpoint.yaml` | Kopfkommentar zur Portliste | 29 | kein S1-Limit (.yaml) |
| `scripts/devmesh/render-stack.sh` | Portliste validieren und in Service + EndpointSlice rendern | 48 | 752 |

**S1-Budget:** Nur `scripts/devmesh/render-stack.sh` faellt unter `s1.limits` (`.sh: 800`) und ist
nicht gebaselined; Ist 48, Budget 752, Ziel nach P1a.3 rund 65 Zeilen. Gemessen mit:

```bash
PRE=db16df855
yq '.s1.limits' docs/code-quality/gates.yaml
for f in devmesh/inventory.yaml devmesh/tailnet-policy.hujson dev-local/core/gpu-endpoint.yaml \
  scripts/devmesh/render-stack.sh dev-local/core/kustomization.yaml environments/schema.yaml \
  taskfiles/Taskfile.devmesh.yml; do
  printf '%s %s %s\n' "$f" "$(wc -l < "$f")" \
    "$(jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json)"
done
# 2026-09-16: alle "nicht-baselined"; render-stack.sh 48 Zeilen
```

### Interfaces

- **Produces fuer P5a (tests/**):**
  - `render-stack.sh core` enthaelt `llm-gateway-host` mit je einem Port pro
    `gpu_endpoint.ports`-Eintrag (plus `http`) in Service und EndpointSlice.
  - Fehlt `gpu_endpoint.ports`, rendert das Skript nur `http` (die bestehende Fixture in
    `dev-local-render.bats` bleibt gruen). Ein Eintrag mit ungueltigem Namen oder Port bricht mit
    Exit 2 und einer Zeile `render-stack: gpu_endpoint.ports ...` auf stderr ab.
  - Tailnet-Vertrag siehe B2.
- **Produces fuer P1b:** `gpu_endpoint.ports` (1234, 1919, 8089, 8090, 8094) ist die Portliste, die
  die Registry-Migration als `llm-gateway-host:<port>` adressiert. `render-stack.sh` rendert auch
  die in P1b eingehaengte Komponente.

---

### Task P1a.1: Inventar um Adresse und Portliste erweitern

**Files:**
- Modify: `devmesh/inventory.yaml`

- [ ] **Schritt 1: Kopfkommentar und `gpu_endpoint` ersetzen**

Die Kommentarzeilen zu `gpu_endpoint` (Zeilen 6–8 und 15–16) und der Block `gpu_endpoint:` werden zu:

```yaml
# gpu_endpoint  GPU-Inferenz auf dem Windows-Arbeitsplatz; einziger erlaubter Pfad von
#               tag:devmesh in einen Client (devmesh/tailnet-policy.hujson, Alias gpu-host).
#   address     Tailnet-Adresse von host (identisch zu hosts.gpu-host in der Policy)
#   port        Ziel des Service-Ports http (sdlc-console, LLM_PROXY_URL); bleibt 1234
#   ports       ein Eintrag je Windows-GPU-Dienst [T900191]; name = IANA-Service-Name
#               (klein, a-z0-9 und -, hoechstens 15 Zeichen). render-stack.sh macht daraus
#               je einen benannten Port in llm-gateway-host, die Policy je ein Ziel.
...
# Gelesen von scripts/devmesh/*.sh, taskfiles/Taskfile.devmesh.yml
# und vom Policy-Guard tests/spec/local-dev-mesh/tailnet-policy.bats (gpu_endpoint).
k3s_version: v1.36.1+k3s1
gpu_endpoint:
  host: pk-desktop
  address: 100.102.71.114
  port: 1234
  ports:
    - {name: lmstudio, port: 1234}
    - {name: freetoken, port: 1919}
    - {name: gemma12, port: 8089}
    - {name: gemma4, port: 8090}
    - {name: qwen38, port: 8094}
```

- [ ] **Schritt 2: Pruefen**

```bash
yq -r '.gpu_endpoint.address, .gpu_endpoint.port, (.gpu_endpoint.ports | length)' devmesh/inventory.yaml
grep -n '"gpu-host"' devmesh/tailnet-policy.hujson
bash scripts/devmesh/render-stack.sh core >/dev/null; echo "rc=$?"
```

Erwartet: `100.102.71.114`, `1234`, `5`; die Policy-Zeile nennt dieselbe Adresse; `rc=0` (B1 behoben).

---

### Task P1a.2: Tailnet-Policy — ein Ziel je GPU-Port

**Files:**
- Modify: `devmesh/tailnet-policy.hujson`

- [ ] **Schritt 1: Ausnahme-Regel ersetzen**

```hujson
		// Einzige Ausnahme in einen Client: GPU-Inferenz auf den Ports aus gpu_endpoint.ports
		// (ADR-008 Nachtrag, Punkt 1; T900191). Eine Regel, ein Ziel je Port.
		{"action": "accept", "src": ["tag:devmesh"], "dst": [
			"gpu-host:1234",
			"gpu-host:1919",
			"gpu-host:8089",
			"gpu-host:8090",
			"gpu-host:8094",
		]},
```

Die Kommentarzeilen bleiben ganzzeilig (Format-Regel des Guards).

- [ ] **Schritt 2: Pruefen, dass Policy und Inventar dieselben Ports nennen**

```bash
python3 - <<'PY'
import json, re, yaml
raw = open("devmesh/tailnet-policy.hujson").read()
lines = [l for l in raw.splitlines() if not l.lstrip().startswith("//")]
pol = json.loads(re.sub(r",(\s*[}\]])", r"\1", "\n".join(lines)))
exc = [a for a in pol["acls"] if "tag:devmesh" in a["src"] and any(not d.startswith("tag:devmesh") for d in a["dst"])]
inv = yaml.safe_load(open("devmesh/inventory.yaml"))
want = [f"gpu-host:{p['port']}" for p in inv["gpu_endpoint"]["ports"]]
got = [d for a in exc for d in a["dst"]]
print(f"Anker: regeln={len(exc)} ziele={len(got)} soll={len(want)}")
raise SystemExit(0 if len(exc) == 1 and got == want else 1)
PY
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/tailnet-policy.bats
```

Erwartet: Python-Check `Anker: regeln=1 ziele=5 soll=5`, Exit 0. Im BATS-Lauf sind die Tests 1, 3
und 4 gruen; der Test "GPU-Endpunkt ist die einzige Ausnahme" meldet `Ausnahme-Ziel ist nicht
gpu-host:1234`. Das ist der in B2 beschriebene Uebergang, P5a stellt den Guard um.

---

### Task P1a.3: `render-stack.sh` rendert die Portliste

**Files:**
- Modify: `scripts/devmesh/render-stack.sh`
- Modify: `dev-local/core/gpu-endpoint.yaml` (nur Kopfkommentar)

- [ ] **Schritt 1: Portliste lesen und validieren** (nach der bestehenden Pruefung von `GPU_ENDPOINT_PORT`)

```bash
# Benannte GPU-Ports [T900191]. Fehlt die Liste, bleibt es beim Port http.
GPU_PORTS_JSON="$(yq -o=json -I=0 '.gpu_endpoint.ports // []' "$INVENTORY")"
while IFS=$'\t' read -r pname pport; do
  [[ -z "$pname$pport" ]] && continue
  [[ "$pname" =~ ^[a-z0-9]([-a-z0-9]{0,13}[a-z0-9])?$ && "$pname" != http ]] \
    || { echo "render-stack: gpu_endpoint.ports Name '$pname' ungueltig ($INVENTORY)" >&2; exit 2; }
  [[ "$pport" =~ ^[0-9]+$ ]] && (( pport > 0 && pport < 65536 )) \
    || { echo "render-stack: gpu_endpoint.ports Port '$pport' ($pname) ist keine gueltige Portnummer" >&2; exit 2; }
done < <(yq -r '.gpu_endpoint.ports // [] | .[] | [.name, .port] | @tsv' "$INVENTORY")
export GPU_PORTS_JSON
```

- [ ] **Schritt 2: Letzte Pipeline-Stufe ergaenzen** (ersetzt die bisherige letzte Zeile)

```bash
# Benannte Ports an Service und EndpointSlice llm-gateway-host anhaengen. Kustomize kann
# ueber eine Liste nicht iterieren, deshalb geschieht das nach dem Rendern.
envsubst "$vars" <<<"$rendered" | sed -E 's/\$\$(\{?[A-Za-z_])/$\1/g' | yq e '
  (select(.kind == "Service" and .metadata.name == "llm-gateway-host") | .spec.ports) +=
    (env(GPU_PORTS_JSON) | map({"name": .name, "port": .port, "protocol": "TCP"})) |
  (select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .ports) +=
    (env(GPU_PORTS_JSON) | map({"name": .name, "port": .port, "protocol": "TCP"}))' -
```

Der Kopfkommentar des Skripts nennt zusaetzlich `gpu_endpoint.ports`. Ein Prototyp dieser Stufe
wurde bei der Planung gegen eine Scratch-Fixture gerendert: `yq` rueckt nur Listen neu ein, der
Inhalt bleibt gleich (Schritt 4 belegt das).

- [ ] **Schritt 3: Kopfkommentar von `dev-local/core/gpu-endpoint.yaml`** um diese Zeilen ergaenzen

```yaml
# Port http (80 -> gpu_endpoint.port) bleibt fuer sdlc-console. Je Eintrag in
# gpu_endpoint.ports haengt render-stack.sh einen benannten Port gleicher Nummer an
# Service und EndpointSlice an; die Registry adressiert llm-gateway-host:<port> [T900191].
```

- [ ] **Schritt 4: Pruefen**

```bash
bash -n scripts/devmesh/render-stack.sh && shellcheck scripts/devmesh/render-stack.sh
bash scripts/devmesh/render-stack.sh core > /tmp/p1a-core.yaml; echo "rc=$?"
yq ea -r 'select(.metadata.name == "llm-gateway-host") | .kind + " " + ([(.spec.ports // .ports)[] | .name + ":" + (.port | tostring)] | join(","))' /tmp/p1a-core.yaml
bash scripts/devmesh/render-stack.sh core | grep -c 'name: llm-gateway-host'
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/dev-local-render.bats
```

Erwartet: `rc=0`; Service `http:80,lmstudio:1234,freetoken:1919,gemma12:8089,gemma4:8090,qwen38:8094`,
EndpointSlice `http:1234,lmstudio:1234,...`; `grep -c` meldet mindestens 2; `dev-local-render.bats`
gruen (Fixture ohne `ports`). Ein Inventar mit `name: Bad_Name` liefert Exit 2 mit der
Meldung `gpu_endpoint.ports Name 'Bad_Name' ungueltig`.

### Task P1a.4: Verifikation dieses Partials

**Files:**
- Verify: alle Dateien aus der File-Structure-Tabelle

- [ ] **Schritt 1: Render, Lint und S1**

```bash
shellcheck scripts/devmesh/render-stack.sh
wc -l scripts/devmesh/render-stack.sh
jq -r '."S1:scripts/devmesh/render-stack.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json
bash scripts/devmesh/render-stack.sh core | grep -cE 'name: llm-gateway-host$'
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/
```

Erwartet: `shellcheck` ohne Befund, Zeilenzahl unter 100, `nicht-baselined`, Treffer mindestens 2.
Im BATS-Lauf ist nur der in B2 genannte Tailnet-Test rot, bis P5a ihn umstellt.

- [ ] **Schritt 2: Die drei Pflicht-Kommandos**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartet: alle drei Exit 0 bis auf den B2-Test in `task test:changed`, falls P5a noch nicht gemergt
ist. `task freshness:check` meldet `0 blocking`.
