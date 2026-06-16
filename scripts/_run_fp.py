#!/usr/bin/env python3
import subprocess, os, sys

env = os.environ.copy()
env['FACTORY_DAILY_DEPLOY_CAP'] = '5'
env['FACTORY_GLOBAL_CAP'] = '3'

result = subprocess.run(
    ['bash', 'scripts/vda.sh', 'factory-prep'],
    capture_output=True, text=True, timeout=120,
    cwd='/home/patrick/Bachelorprojekt',
    env=env
)
sys.stdout.write(result.stdout)
if result.stderr:
    sys.stderr.write(result.stderr)
sys.exit(result.returncode)
