#!/usr/bin/env python3
"""Run factory-prep and capture JSON output."""
import subprocess, json, os

os.environ['FACTORY_DAILY_DEPLOY_CAP'] = '5'
os.environ['FACTORY_GLOBAL_CAP'] = '3'

r = subprocess.run(
    ['bash', 'scripts/vda.sh', 'factory-prep'],
    capture_output=True, text=True, cwd='/home/patrick/Bachelorprojekt', timeout=120
)
print(r.stdout)
if r.stderr:
    print(r.stderr, file=__import__('sys').stderr)
