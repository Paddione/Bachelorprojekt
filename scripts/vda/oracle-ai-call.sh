# ── Check if local LLM (Ollama) is available ───────────────────────────────
local_llm_available() {
  if [[ "${HERMES:-}" == "/dev/null" ]]; then
    return 1
  fi
  python3 -c '
import urllib.request, sys
try:
    urllib.request.urlopen("http://localhost:11434/api/tags", timeout=0.8)
    sys.exit(0)
except Exception:
    sys.exit(1)
' 2>/dev/null
}

# ── Wrapper: query local LLM ──────────────────────────────────────────────
ask_llm() {
  local prompt="$1"
  python3 -c '
import urllib.request, json, sys

def get_ollama_model(base_url):
    try:
        req = urllib.request.Request(f"{base_url}/api/tags")
        with urllib.request.urlopen(req, timeout=1.5) as response:
            data = json.loads(response.read().decode("utf-8"))
            models = [m["name"] for m in data.get("models", [])]
    except Exception:
        return None
    if not models:
        return None
    # Routing is a lightweight classification task -- deterministically prefer a
    # small qwen3 model and avoid large coder models, so the local GPU footprint
    # stays minimal regardless of which other models happen to be pulled.
    big = ("14b", "30b", "32b", "35b", "70b", "72b")
    def is_small(m): return not any(b in m.lower() for b in big)
    for pref in (lambda m: m == "qwen3:4b",
                 lambda m: "qwen3" in m.lower() and is_small(m),
                 lambda m: "qwen" in m.lower() and is_small(m),
                 lambda m: "qwen" in m.lower()):
        hit = [m for m in models if pref(m)]
        if hit:
            return hit[0]
    return models[0]

def query_ollama(base_url, prompt):
    model = get_ollama_model(base_url)
    if not model:
        return None
    url = f"{base_url}/api/generate"
    payload = {"model": model, "prompt": prompt, "stream": False}
    try:
        req = urllib.request.Request(
            url, 
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data.get("response", "")
    except Exception:
        return None

prompt = sys.argv[1]
res = query_ollama("http://localhost:11434", prompt)
if res:
    print(res)
    sys.exit(0)
sys.exit(1)
' "$prompt" 2>/dev/null
}
