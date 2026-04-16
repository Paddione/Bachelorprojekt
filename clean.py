import re
import os

files_to_clean = [
    'CONTRIBUTING.md',
    'README.md',
    'k3d/docs-content/security.md',
    'k3d/docs-content/architecture.md',
    'k3d/docs-content/services.md',
    'k3d/docs-content/requirements.md',
    'k3d/docs-content/security-report.md',
    'k3d/docs-content/scripts.md',
    'docs/security.md',
    'docs/architecture.md',
    'docs/services.md',
    'docs/security-report.md',
    'docs/superpowers/plans/2026-04-13-dsgvo-compliance.md',
    'docs/superpowers/plans/2026-04-13-security-hardening.md',
    'docs/scripts.md',
    'docs/requirements.md'
]

for filepath in files_to_clean:
    if not os.path.exists(filepath):
        continue
        
    with open(filepath, 'r') as f:
        content = f.read()

    # Generic cleanups
    content = re.sub(r'.*task workspace:monitoring.*\n', '', content)
    content = re.sub(r'.*task observability:install.*\n', '', content)
    content = re.sub(r'.*claude-code-mcp-grafana\.yaml.*\n', '', content)
    content = re.sub(r'.*claude-code-mcp-prometheus\.yaml.*\n', '', content)
    content = re.sub(r'.*Grafana.*\n', '', content)
    content = re.sub(r'.*Prometheus.*\n', '', content)
    
    with open(filepath, 'w') as f:
        f.write(content)
