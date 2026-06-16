#!/usr/bin/env python3
import subprocess, json, os
env = os.environ.copy()
env['FACTORY_DAILY_DEPLOY_CAP'] = '5'
env['FACTORY_GLOBAL_CAP'] = '3'
r = subprocess.run(
    ['bash', '/home/patrick/Bachelorprojekt/scripts/vda.sh', 'factory-prep'],
    capture_output=True, text=True, timeout=120,
    cwd='/home/patrick/Bachelorprojekt', env=env
)
out = r.stdout.strip()
if out:
    try:
        d = json.loads(out)
        print(json.dumps(d))
    except json.JSONDecodeError:
        print(json.dumps({"stdout": out, "stderr": r.stderr, "rc": r.returncode}))
else:
    print(json.dumps({"stdout": "", "stderr": r.stderr, "rc": r.returncode}))
