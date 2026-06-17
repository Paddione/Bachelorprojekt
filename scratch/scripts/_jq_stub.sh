#!/usr/bin/env bash
# Stub that replaces jq with python3+json
python3 -c "
import sys, json
data = json.load(sys.stdin)
filters = '$*'
# Handle simple .key access
parts = filters.strip().split('.')
for p in parts:
    if p.startswith('[') and p.endswith(']'):
        idx = int(p[1:-1])
        data = data[idx]
    elif p and p != '[]':
        data = data[p]
if isinstance(data, str):
    print(data)
elif isinstance(data, bool):
    print(str(data).lower())
elif data is None:
    print('null')
elif isinstance(data, (list, dict)):
    print(json.dumps(data))
"
