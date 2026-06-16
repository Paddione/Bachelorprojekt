#!/usr/bin/env python3
"""Run the factory-prep logic and output JSON."""
import subprocess, json, os, sys

REPO = "/home/patrick/Bachelorprojekt"
os.chdir(REPO)

env = os.environ.copy()
env["FACTORY_DAILY_DEPLOY_CAP"] = "5"
env["FACTORY_GLOBAL_CAP"] = "3"

launch = []
skipped = []

for brand in ["mentolder", "korczewski"]:
    # Guard killswitch_on: runs ticket.sh factory-control get which needs kubectl
    # Without kubectl access, this will fail and return fail-closed ON
    skip = False
    reason = ""

    # We call the actual script - it will fail without kubectl and skip the brand
    result = subprocess.run(
        ["bash", "scripts/vda.sh", "factory-prep"],
        capture_output=True, text=True, timeout=180, env=env
    )

    # If the script produced valid JSON, output it and exit
    if result.returncode == 0 and result.stdout.strip():
        try:
            data = json.loads(result.stdout.strip())
            print(json.dumps(data))
            sys.exit(0)
        except json.JSONDecodeError:
            pass

    # Fallback: just print stderr for debugging
    if result.stderr:
        print(result.stderr, file=sys.stderr)

# Final fallback if everything above fails
output = {"launch": launch, "skipped": skipped}
print(json.dumps(output))
