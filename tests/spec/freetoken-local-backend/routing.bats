#!/usr/bin/env bash
# T014028 — lokale Backends: FreeToken-native ODER ein lebendes llama-Loadout
#
# URSPRUNG: T014028 legte die llama-Loadouts still, weil sie neben
# FreeToken-native verhungerten (~10 tok/s). Die Guards verboten daraufhin
# PAUSCHAL jede llamacpp-Referenz.
#
# GEAENDERT 2026-09-09 (T900094): das Pauschalverbot war zu grob. Es adressierte
# einen echten Fehler — ein Agent zeigt auf ein STILLGELEGTES Loadout und faellt
# im Betrieb aus —, verbot dafuer aber auch den funktionierenden Fall. Mit dem
# Dual-GPU-Split (5070 Ti + 3060 Ti, q4_0-KV, ~205k Kontext) ist qwen38-220k
# wieder tragfaehig.
#
# Die Regel lautet jetzt: ein lokaler Agent faehrt FreeToken ODER ein llama-
# Loadout, das WIRKLICH LEBT (enabled) und die Split-Config traegt. Der
# eigentliche Fehlerfall bleibt abgedeckt — zusaetzlich durch den generischen
# Guard "T003204: kein Agent zeigt auf ein abgeschaltetes Loadout" in
# tests/spec/local-llm-proxy/opencode-agent-model-drift.bats, der backend-
# unabhaengig greift.
#
# WAS NICHT GELOCKERT WIRD: der Factory-Fallback und der Projekt-Default
# bleiben FreeToken (Tests unten bzw. qwen38-default-backend.bats). Und die
# beiden Backends bleiben ALTERNATIVEN, kein Parallelbetrieb — FreeToken
# belegt ~15,7 von 16 GB VRAM exklusiv.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  # In das Repo wechseln, damit die Python-Bloecke unten RELATIVE Pfade
  # verwenden koennen. Ein interpolierter MSYS-Pfad (/c/Users/...) ist fuer
  # Windows-Python nicht aufloesbar - der Test faellt dann lokal aus, ohne
  # dass an der Sache etwas falsch waere.
  cd "$REPO" || return 1
}

@test "loadouts.json: gemma26-throughput ist stillgelegt, qwen38-220k traegt die Split-Config wenn aktiv" {
  python3 - <<EOF
import json
d = json.load(open("scripts/llm/loadouts.json"))
by = {lo.get("slug"): lo for lo in d["loadouts"]}

assert by["gemma26-throughput"].get("enabled") is False, "gemma26-throughput ist nicht stillgelegt"

# qwen38-220k darf laufen — dann aber nur mit der Konfiguration, die es
# tragfaehig macht. Ein 'enabled: true' ohne Split und ohne q4-KV waere der
# Rueckfall in genau die Lage, wegen der T014028 abgeschaltet hat.
q = by["qwen38-220k"]
if q.get("enabled") is not False:
    args = q.get("args", {})
    assert args.get("cacheTypeK") == "q4_0" and args.get("cacheTypeV") == "q4_0", \\
        "qwen38-220k aktiv, aber KV-Cache nicht q4_0 — der Kontext passt dann nicht in den VRAM"
    devs = (q.get("env") or {}).get("CUDA_VISIBLE_DEVICES", "")
    assert devs.count(",") >= 1, \\
        "qwen38-220k aktiv, aber env.CUDA_VISIBLE_DEVICES nennt keine zwei GPUs (Split fehlt)"
    fit = q.get("fit", {})
    assert fit.get("enabled") is True, "qwen38-220k aktiv, aber fit ist aus — fester ctx kippt bei belegtem VRAM"
    assert (fit.get("minCtx") or 0) >= 200000, \\
        f"qwen38-220k aktiv, aber minCtx {fit.get('minCtx')} < 200000 — der Split rechtfertigt sich nur ueber den Kontext"
# T014028: factory.model muss ein Loadout-Slug sein (Validator-Regel in
# scripts/llm-proxy/loadouts.mjs) — der Modellname 'Qwen3.6-35B-A3B-NVFP4'
# allein war kein gueltiger Wert, weil dafuer kein Loadout existierte.
assert d["factory"]["model"] == "freetoken-local", "factory.model nicht auf den FreeToken-Slug umgehängt"
ft = [lo for lo in d["loadouts"] if lo.get("slug") == "freetoken-local"]
assert ft and ft[0].get("managed") == "external" and ft[0].get("port") == 1919, \
    "freetoken-local fehlt oder ist nicht managed=external auf :1919"
EOF
}

@test "agent-models.jsonc: Provider freetoken-local mit FreeToken-Modell vorhanden" {
  node -e '
const fs=require("fs");
let s=fs.readFileSync(process.argv[1],"utf8");
let out="",i=0,str=false,esc=false;
while(i<s.length){const c=s[i];
 if(str){out+=c;if(esc)esc=false;else if(c==="\\")esc=true;else if(c===String.fromCharCode(34))str=false;i++;continue;}
 if(c===String.fromCharCode(34)){str=true;out+=c;i++;continue;}
 if(c==="/"&&s[i+1]==="/"){while(i<s.length&&s[i]!=="\n")i++;continue;}
 if(c==="/"&&s[i+1]==="*"){i+=2;while(i<s.length&&!(s[i]==="*"&&s[i+1]==="/"))i++;i+=2;continue;}
 out+=c;i++;}
const o=JSON.parse(out);
const ft=o.provider["freetoken-local"];
if(!ft) throw new Error("Provider freetoken-local fehlt");
if(ft.options.baseURL!=="http://127.0.0.1:1919/v1") throw new Error("baseURL falsch");
if(!ft.models["Qwen3.6-35B-A3B-NVFP4"]) throw new Error("Modell fehlt");
' "$REPO/.opencode/agent-models.jsonc"
}

@test "agent-models.jsonc: jede llamacpp-Referenz trifft ein aktives Loadout" {
  # Ersetzt das fruehere Pauschalverbot (T900094). Der Fehler, der gemeint war,
  # ist der Verweis auf ein TOTES Loadout — nicht der Verweis auf llama.cpp.
  # Genau das wird hier geprueft, statt den Backend-Namen zu verbieten.
  python3 - <<'PY'
import json, re

raw = open(".opencode/agent-models.jsonc", encoding="utf-8").read()
refs = set(re.findall(r'"model":\s*"llamacpp-local/([A-Za-z0-9._-]+)"', raw))

d = json.load(open("scripts/llm/loadouts.json", encoding="utf-8"))
by = {lo.get("slug"): lo for lo in d["loadouts"]}

dead = []
for slug in sorted(refs):
    lo = by.get(slug)
    if lo is None:
        dead.append(f"{slug} (kein solches Loadout)")
    elif lo.get("enabled") is False:
        dead.append(f"{slug} (enabled:false)")

assert not dead, "Agenten zeigen auf nicht nutzbare Loadouts: " + ", ".join(dead)
PY
}

@test "agent-models.jsonc: jeder lokale Primary faehrt den FreeToken-Provider" {
  node -e '
const fs=require("fs");
let s=fs.readFileSync(process.argv[1],"utf8");
let out="",i=0,str=false,esc=false;
while(i<s.length){const c=s[i];
 if(str){out+=c;if(esc)esc=false;else if(c==="\\")esc=true;else if(c===String.fromCharCode(34))str=false;i++;continue;}
 if(c===String.fromCharCode(34)){str=true;out+=c;i++;continue;}
 if(c==="/"&&s[i+1]==="/"){while(i<s.length&&s[i]!=="\n")i++;continue;}
 if(c==="/"&&s[i+1]==="*"){i+=2;while(i<s.length&&!(s[i]==="*"&&s[i+1]==="/"))i++;i+=2;continue;}
 out+=c;i++;}
const o=JSON.parse(out);
// T014028/T014105/T900094: "lokal" = Provider-Teil ist freetoken-local oder
// llamacpp-local. Positiv-Anker zuerst: es gibt ueberhaupt welche.
const locals=Object.entries(o.agent)
  .filter(([,a])=>String(a.model||"").startsWith("freetoken-local")||String(a.model||"").startsWith("llamacpp-local"))
  .filter(([,a])=>a.mode==="primary");
if(locals.length<1) throw new Error("kein lokaler Primary vorhanden");
// Beide lokalen Backends sind zulaessig. Dass ein llamacpp-Ziel auch LEBT,
// prueft der Guard "jede llamacpp-Referenz trifft ein aktives Loadout"; hier
// geht es nur darum, dass kein lokaler Primary auf einem dritten, unbekannten
// Provider landet.
const foreign=locals.filter(([,a])=>{
  const m=String(a.model);
  return !m.startsWith("freetoken-local/")&&!m.startsWith("llamacpp-local/");
});
if(foreign.length) throw new Error("lokale Primaries auf unbekanntem Provider: "+foreign.map(([n])=>n).join(","));
// Mindestens ein Primary MUSS FreeToken fahren: es ist das Backend ohne
// GPU-Vorbedingung und der Rueckfallweg, wenn das llama-Loadout nicht laedt.
if(!locals.some(([,a])=>String(a.model).startsWith("freetoken-local/")))
  throw new Error("kein lokaler Primary auf freetoken-local — der Rueckfallweg fehlt");
' "$REPO/.opencode/agent-models.jsonc"
}

@test "route-provider.sh: Fallback emittiert FreeToken statt llama-Proxy" {
  grep -q 'FT_LOCAL_BASEURL="http://127.0.0.1:1919/v1"' "$REPO/scripts/factory/route-provider.sh"
  ! grep -q '"baseUrl":"http://127.0.0.1:18235"' "$REPO/scripts/factory/route-provider.sh"
}

@test "Mirror-Stand: agents.yaml folgt agent-models.jsonc bei den lokalen Backends" {
  # T014105/T900094: der Mirror folgt der SSOT. Frueher hiess das "kein
  # llamacpp-Eintrag"; seit der Split-Wiederinbetriebnahme heisst es: was im
  # Mirror auf llamacpp-local zeigt, muss auch in agent-models.jsonc so stehen.
  # Ein Mirror-Eintrag ohne SSOT-Entsprechung ist Drift, egal welches Backend.
  grep -q 'model: freetoken-local/active' "$REPO/docs/agent-guide/registry/agents.yaml"

  python3 - <<'PY'
import re

mirror = set(re.findall(r'^\s*model:\s*(llamacpp-local/[A-Za-z0-9._-]+)\s*$',
                        open("docs/agent-guide/registry/agents.yaml", encoding="utf-8").read(), re.M))
ssot = set(re.findall(r'"model":\s*"(llamacpp-local/[A-Za-z0-9._-]+)"',
                      open(".opencode/agent-models.jsonc", encoding="utf-8").read()))

orphan = mirror - ssot
assert not orphan, "agents.yaml nennt llamacpp-Modelle, die agent-models.jsonc nicht kennt: " + ", ".join(sorted(orphan))
PY
}
