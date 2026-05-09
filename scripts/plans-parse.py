#!/usr/bin/env python3
"""Shell-callable entry point for plans_parse."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plans_parse import parse_plan
import json

if len(sys.argv) != 2:
    print("Usage: plans-parse.py <plan.md>", file=sys.stderr)
    sys.exit(1)
result = parse_plan(sys.argv[1])
print(json.dumps(result, indent=2))
