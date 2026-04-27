#!/usr/bin/env python3
import json
import sys
import os

domain = os.environ.get("DOMAIN", "mcp.localhost")
token = os.environ.get("TOKEN", "")

servers = {
    "mcp-kubernetes": {"url": f"https://{domain}/kubernetes/mcp", "headers": {"Authorization": f"Bearer {token}"}},
    "mcp-postgres": {"url": f"https://{domain}/postgres/mcp", "headers": {"Authorization": f"Bearer {token}"}},
    "mcp-keycloak": {"url": f"https://{domain}/keycloak/mcp/sse", "headers": {"Authorization": f"Bearer {token}"}},
    "mcp-browser": {"url": f"https://{domain}/browser/mcp", "headers": {"Authorization": f"Bearer {token}"}},
    "mcp-github": {"url": f"https://{domain}/github/mcp", "headers": {"Authorization": f"Bearer {token}"}},
    "mcp-stripe": {"url": f"https://{domain}/stripe/mcp", "headers": {"Authorization": f"Bearer {token}"}}
}
print(json.dumps(servers, indent=2))
