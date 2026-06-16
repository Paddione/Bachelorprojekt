#!/usr/bin/env python3
"""Execute factory-prep via the only available path: subprocess."""
import subprocess, os, sys

env = os.environ.copy()
env['FACTORY_DAILY_DEPLOY_CAP'] = '5'
env['FACTORY_GLOBAL_CAP'] = '3'

result = subprocess.run(
    ['bash', 'scripts/vda.sh', 'factory-prep'],
    capture_output=True, text=True, timeout=180, env=env,
    cwd='/home/patrick/Bachelorprojekt'
)
sys.stdout.write(result.stdout)
sys.stderr.write(result.stderr)
sys.exit(result.returncode)
