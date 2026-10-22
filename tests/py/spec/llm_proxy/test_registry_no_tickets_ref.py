"""llm-proxy-Registry ohne tickets-Poll (F2: Poller gegen retirtes Schema).

Der Ticket-Retirement (2026-10-14) hat das `tickets`-Schema aus der Dev-DB
entfernt; der Registry-Poller in scripts/llm-proxy/ traf es weiter alle 30 s
(`relation "tickets.llm_proxy_backends" does not exist`, 5,4 % Rollback-Rate
auf `website`). Fix-Mechanismus: `backends.mjs:loadBackendsOnce` nimmt
`LLM_PROXY_BACKENDS_JSON` aus der Umgebung und fragt dann gar nicht erst die
DB — der DB-Fallback in `backends.mjs:17` bleibt bewusst für Pfade ohne Env
bestehen (Design-Entscheidung, siehe Plan-design.md).

RED: kein Env-JSON im Deployment. GREEN: Deployment liefert valides
Backend-JSON, der Env-Bypass-Zweig existiert, kein stale
`tickets.llm_proxy_backends`-Verweis in den Routen.
"""

import json
import re
from pathlib import Path

import yaml

DEPLOYMENT = "dev-local/components/llm-services/deployment.yaml"

# Felder je backends.mjs-Typedef (apiKeyEnv darf null sein).
PFLICHTFELDER = {
    "name", "kind", "baseUrl", "apiKeyEnv", "enabled",
    "priority", "fixups", "modelAliases", "maxInflight", "roles",
}


def _mcp_node_container(repo_root: Path) -> dict:
    manifest = yaml.safe_load((repo_root / DEPLOYMENT).read_text())
    container = manifest["spec"]["template"]["spec"]["containers"]
    treffer = [c for c in container if c.get("name") == "mcp-node"]
    assert treffer, "mcp-node-Container im Deployment"
    return treffer[0]


def test_registry_env_json_vollstaendig(repo_root: Path):
    env = {e["name"]: e.get("value", "") for e in _mcp_node_container(repo_root)["env"]}
    assert "LLM_PROXY_BACKENDS_JSON" in env, "LLM_PROXY_BACKENDS_JSON fehlt im Deployment"
    backends = json.loads(env["LLM_PROXY_BACKENDS_JSON"])
    assert isinstance(backends, list) and backends, "Backend-JSON leer oder keine Liste"
    for backend in backends:
        fehlend = PFLICHTFELDER - set(backend)
        assert not fehlend, f"Backend {backend.get('name')}: Felder fehlen: {fehlend}"
        key_name = backend["apiKeyEnv"]
        assert key_name is None or re.fullmatch(r"[A-Z][A-Z0-9_]*", key_name), (
            f"Backend {backend.get('name')}: apiKeyEnv ist kein Env-Name: {key_name!r}"
        )


def test_env_bypass_zweig_besteht(repo_root: Path):
    text = (repo_root / "scripts/llm-proxy/backends.mjs").read_text()
    assert "LLM_PROXY_BACKENDS_JSON" in text, "Env-Bypass-Zweig fehlt in backends.mjs"


def test_routen_ohne_tickets_registry(repo_root: Path):
    text = (repo_root / "scripts/llm-proxy/bge-routes.mjs").read_text()
    assert "tickets.llm_proxy_backends" not in text, "stale Registry-Verweis in bge-routes.mjs"
