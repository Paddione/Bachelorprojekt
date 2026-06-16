#!/usr/bin/env python3
import subprocess, os, sys, json

os.environ['FACTORY_DAILY_DEPLOY_CAP'] = '5'
os.environ['FACTORY_GLOBAL_CAP'] = '3'

result = subprocess.run(
    ['bash', '/home/patrick/Bachelorprojekt/scripts/vda.sh', 'factory-prep'],
    capture_output=True, text=True, timeout=120,
    cwd='/home/patrick/Bachelorprojekt',
    env={**os.environ, 'PATH': '/home/patrick/Bachelorprojekt/scripts:' + os.environ.get('PATH', '')}
)

# Parse and re-emit just the JSON
try:
    data = json.loads(result.stdout.strip())
    print(json.dumps(data))
except (json.JSONDecodeError, ValueError):
    # If it's not valid JSON, try to find the JSON part
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith('{') and line.endswith('}'):
            print(line)
            break
    else:
        print(json.dumps({"error": "no JSON output found", "stdout": result.stdout, "stderr": result.stderr}))
