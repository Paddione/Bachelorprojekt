#!/usr/bin/env python3
import subprocess
import os
import sys

env = os.environ.copy()
env['FACTORY_DAILY_DEPLOY_CAP'] = '5'
env['FACTORY_GLOBAL_CAP'] = '3'

result = subprocess.run(
    ['bash', 'scripts/vda.sh', 'factory-prep'],
    capture_output=True,
    text=True,
    timeout=180,
    env=env,
    cwd='/home/patrick/Bachelorprojekt'
)

if result.stdout.strip():
    print(result.stdout.strip())
elif result.returncode != 0:
    print('{"launch":[],"skipped":[]}', file=sys.stderr)
    sys.exit(result.returncode)
else:
    print('{"launch":[],"skipped":[]}')
