#!/usr/bin/env bash
# T014028 — FreeToken-native als lokales Backend
# Stellt die Umstellung weg von den llama-Loadouts strukturell sicher.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "loadouts.json: gemma26-throughput und qwen38-220k sind enabled:false" {
  python3 - <<EOF
import json
d = json.load(open("$REPO/scripts/llm/loadouts.json"))
by = {lo.get("slug"): lo for lo in d["loadouts"]}
for slug in ("gemma26-throughput", "qwen38-220k"):
    assert by[slug].get("enabled") is False, f"{slug} ist nicht stillgelegt"
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

@test "agent-models.jsonc: kein Agent referenziert noch llamacpp-local/qwen38-220k" {
  ! grep -q '"model": "llamacpp-local/qwen38-220k"' "$REPO/.opencode/agent-models.jsonc"
}

@test "agent-models.jsonc: kein Agent referenziert noch ein llama-Backend" {
  # T014105 hat die Konsolidierung ueberholt: mehrere lokale Primaries sind
  # geblieben, aber ALLE lokalen Agenten (Primary wie Subagent) fahren den
  # FreeToken-Provider. Eine einzelne llamacpp-local-Referenz waere ein
  # Rueckfall auf ein stillgelegtes Backend.
  ! grep -q '"model": "llamacpp-local/' "$REPO/.opencode/agent-models.jsonc"
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
// T014028/T014105: "lokal" = Provider-Teil ist freetoken-local oder
// llamacpp-local. Positiv-Anker zuerst: es gibt ueberhaupt welche.
const locals=Object.entries(o.agent)
  .filter(([,a])=>String(a.model||"").startsWith("freetoken-local")||String(a.model||"").startsWith("llamacpp-local"))
  .filter(([,a])=>a.mode==="primary");
if(locals.length<1) throw new Error("kein lokaler Primary vorhanden");
const foreign=locals.filter(([,a])=>!String(a.model).startsWith("freetoken-local"));
if(foreign.length) throw new Error("lokale Primaries ausserhalb von freetoken-local: "+foreign.map(([n])=>n).join(","));
' "$REPO/.opencode/agent-models.jsonc"
}

@test "route-provider.sh: Fallback emittiert FreeToken statt llama-Proxy" {
  grep -q 'FT_LOCAL_BASEURL="http://127.0.0.1:1919/v1"' "$REPO/scripts/factory/route-provider.sh"
  ! grep -q '"baseUrl":"http://127.0.0.1:18235"' "$REPO/scripts/factory/route-provider.sh"
}

@test "Mirror-Stand: agents.yaml kennt die lokalen Agenten auf dem FreeToken-Alias" {
  # T014105: der Mirror folgt agent-models.jsonc — lokale Agenten stehen auf
  # freetoken-local/active, und kein Mirror-Eintrag zeigt mehr auf ein
  # llama-Loadout-Modell.
  grep -q 'model: freetoken-local/active' "$REPO/docs/agent-guide/registry/agents.yaml"
  ! grep -qE '^    model: llamacpp-local/' "$REPO/docs/agent-guide/registry/agents.yaml"
}
