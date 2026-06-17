#!/usr/bin/env python3
"""Minimal factory-prep runner."""
import subprocess, os, sys

env = os.environ.copy()
env['FACTORY_DAILY_DEPLOY_CAP'] = '5'
env['FACTORY_GLOBAL_CAP'] = '3'

p = subprocess.run(
    ['bash', '/home/patrick/Bachelorprojekt/scripts/vda.sh', 'factory-prep'],
    capture_output=True, text=True, timeout=180, env=env,
    cwd='/home/patrick/Bachelorprojekt'
)
sys.stdout.write(p.stdout or '')
sys.stderr.write(p.stderr or '')
sys.exit(p.returncode)
