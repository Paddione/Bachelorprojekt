#!/usr/bin/env python3
import json
import sys
import os

settings_file = sys.argv[1]
mcp_json_str = sys.stdin.read()
mcp_servers = json.loads(mcp_json_str)

if os.path.exists(settings_file):
    with open(settings_file, "r") as f:
        try:
            data = json.load(f)
        except:
            data = {}
else:
    data = {}

data.setdefault("mcpServers", {}).update(mcp_servers)

with open(settings_file, "w") as f:
    json.dump(data, f, indent=2)
