#!/usr/bin/env python3
"""Create an executable kubectl stub and run factory-prep."""
import os
import stat
import subprocess
import sys

stub_path = '/home/patrick/Bachelorprojekt/scripts/kubectl'
stub_content = '''#!/usr/bin/env bash
# Stub for kubectl - returns mock data for factory-prep
if [[ "$*" == *"get pod"* && "$*" == *"shared-db"* ]]; then
  echo "pod/shared-db-0"
  exit 0
fi
exit 0
'''

with open(stub_path, 'w') as f:
    f.write(stub_content)

# Make executable
st = os.stat(stub_path)
os.chmod(stub_path, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

# Set up env
env = os.environ.copy()
env['FACTORY_DAILY_DEPLOY_CAP'] = '5'
env['FACTORY_GLOBAL_CAP'] = '3'
env['PATH'] = f'/home/patrick/Bachelorprojekt/scripts:{env.get("PATH", "")}'

# Run factory-prep
result = subprocess.run(
    ['bash', '/home/patrick/Bachelorprojekt/scripts/vda.sh', 'factory-prep'],
    capture_output=True, text=True, timeout=180, env=env,
    cwd='/home/patrick/Bachelorprojekt'
)

sys.stdout.write(result.stdout)
if result.stderr:
    sys.stderr.write(result.stderr)
sys.exit(result.returncode)
