import re
import os

# 1. k3d/kustomization.yaml
with open('k3d/kustomization.yaml', 'r') as f:
    kust = f.read()
kust = re.sub(r'\s*- claude-code-mcp-grafana\.yaml\n', '\n', kust)
kust = re.sub(r'\s*- claude-code-mcp-prometheus\.yaml\n', '\n', kust)
with open('k3d/kustomization.yaml', 'w') as f:
    f.write(kust)

# 2. Taskfile.yml
with open('Taskfile.yml', 'r') as f:
    task = f.read()
# Remove observability/monitoring tasks
task = re.sub(r'  # ─────────────────────────────────────────────\n  # Observability.*?  # ─────────────────────────────────────────────\n', '  # ─────────────────────────────────────────────\n', task, flags=re.DOTALL)
task = re.sub(r'  observability:install:.*?(?=  # ─────────────────────────────────────────────)', '', task, flags=re.DOTALL)
task = re.sub(r'\s*- task: workspace:monitoring\n', '\n', task)
with open('Taskfile.yml', 'w') as f:
    f.write(task)

# 3. scripts/mcp-select.sh
with open('scripts/mcp-select.sh', 'r') as f:
    mcp = f.read()
mcp = re.sub(r'\s*"prometheus\|mcp-prometheus\|3000\|/mcp\|Prometheus metrics"\n', '\n', mcp)
mcp = re.sub(r'\s*"grafana\|mcp-grafana\|3000\|/mcp\|Grafana dashboards"\n', '\n', mcp)
with open('scripts/mcp-select.sh', 'w') as f:
    f.write(mcp)

# 4. CLAUDE.md
with open('CLAUDE.md', 'r') as f:
    claude = f.read()
claude = re.sub(r'.*task workspace:monitoring.*\n', '', claude)
claude = re.sub(r'\s*PROM\["fa:fa-chart-line Prometheus \+ Grafana"\]\n', '\n', claude)
claude = re.sub(r'\s*subgraph monitoring-ns \["Namespace: monitoring"\]\n\s*PROM\["fa:fa-chart-line Prometheus \+ Grafana"\]\n\s*end\n', '\n', claude)
with open('CLAUDE.md', 'w') as f:
    f.write(claude)

