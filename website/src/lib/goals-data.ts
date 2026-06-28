export type GoalPriority = 'A' | 'B' | 'C';
export type GoalDirection = 'lower' | 'higher';
export type GoalStatus = 'critical' | 'at_risk' | 'on_track' | 'achieved' | 'unknown';

export interface HealthGoal {
  id: string;
  title: string;
  category: string;
  priority: GoalPriority;
  direction: GoalDirection;
  baseline: number | null;
  current: number | null;
  target: number | null;
  unit: string;
  status: GoalStatus;
  measurement: string;
  source: string;
  measured_at: string;
  note?: string;
}

function computeStatus(g: HealthGoal): GoalStatus {
  if (g.status !== 'unknown') return g.status;
  if (g.current === null || g.target === null) return 'unknown';
  const met = g.direction === 'lower' ? g.current <= g.target : g.current >= g.target;
  if (met) return 'achieved';
  if (g.baseline === null) return 'on_track';
  const range = Math.abs(g.target - g.baseline);
  if (range === 0) return 'achieved';
  const progress = g.direction === 'lower'
    ? (g.baseline - g.current) / range
    : (g.current - g.baseline) / range;
  if (progress >= 0.8) return 'on_track';
  if (progress >= 0.3) return 'at_risk';
  return progress < 0 ? 'critical' : 'at_risk';
}

/** Health % [0–100]. Achieved = 100, unknown = null. */
export function healthPercent(g: HealthGoal): number | null {
  if (g.status === 'achieved') return 100;
  if (g.current === null || g.target === null || g.baseline === null) return null;
  const met = g.direction === 'lower' ? g.current <= g.target : g.current >= g.target;
  if (met) return 100;
  const range = Math.abs(g.target - g.baseline);
  if (range === 0) return 100;
  const raw = g.direction === 'lower'
    ? (g.baseline - g.current) / range
    : (g.current - g.baseline) / range;
  return Math.max(0, Math.min(99, Math.round(raw * 100)));
}

const RAW_GOALS: HealthGoal[] = [
  // ── Priority A — Aktive Defekte ──────────────────────────────────────
  {
    id: 'G-SIZE04', title: 'Netto-LOC/Woche', category: 'Code-Größe',
    priority: 'A', direction: 'lower',
    baseline: 2000, current: 3684, target: 2000, unit: 'LOC/Wo',
    status: 'unknown',
    measurement: "git log --since='2026-06-21' --no-merges --numstat --pretty=tformat: -- '*.ts' '*.svelte' '*.astro' '*.js' '*.sh' | awk 'NF==3 && $1!=\"-\"{a+=$1;d+=$2} END{print a-d}'",
    source: '.agents/lib/goals.md · G-SIZE04',
    measured_at: '2026-06-28',
    note: 'Shallow-Clone: nur ~6 Tage Historie sichtbar',
  },
  {
    id: 'G-DEP01', title: 'High/Critical npm-Vulns', category: 'Dependencies',
    priority: 'A', direction: 'lower',
    baseline: 6, current: 6, target: 0, unit: 'Vulns',
    status: 'unknown',
    measurement: "cd website && pnpm audit --json 2>/dev/null | python3 -c \"import sys,json; v=json.load(sys.stdin).get('metadata',{}).get('vulnerabilities',{}); print(v.get('high',0)+v.get('critical',0))\"",
    source: '.agents/lib/goals.md · G-DEP01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-CI01', title: 'main CI-Erfolgsrate', category: 'CI/CD',
    priority: 'A', direction: 'higher',
    baseline: 85, current: 85, target: 95, unit: '%',
    status: 'unknown',
    measurement: "gh-axi run list --workflow ci.yml --branch main --limit 20 | grep -oE 'completed,(success|failure|cancelled)' | sort | uniq -c",
    source: '.agents/lib/goals.md · G-CI01',
    measured_at: '2026-06-28',
    note: 'Gleitendes 20-Lauf-Fenster',
  },
  {
    id: 'G-CD01', title: 'korczewski Deploy-Rate', category: 'CI/CD',
    priority: 'A', direction: 'higher',
    baseline: 53, current: 53, target: 90, unit: '%',
    status: 'unknown',
    measurement: "gh-axi run list --workflow build-website-korczewski.yml --branch main --limit 15 | grep -oE 'completed,(success|failure)' | sort | uniq -c",
    source: '.agents/lib/goals.md · G-CD01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-GIT03', title: 'Dateien >1MB im Git-Tree', category: 'Repo-Hygiene',
    priority: 'A', direction: 'lower',
    baseline: 7, current: 7, target: 6, unit: 'Dateien',
    status: 'unknown',
    measurement: "git ls-files -z | xargs -0 -I{} sh -c 'test -f \"{}\" && wc -c \"{}\"' 2>/dev/null | awk '$1>1048576{c++} END{print c+0}'",
    source: '.agents/lib/goals.md · G-GIT03',
    measured_at: '2026-06-28',
    note: 'Neu: search-index.json > 1MB',
  },

  // ── Priority B — Offene Ziele ─────────────────────────────────────────
  {
    id: 'G-RH03', title: 'OpenSpec-BATS-Abdeckung', category: 'Test-Health',
    priority: 'B', direction: 'higher',
    baseline: 46, current: 46, target: 60, unit: '%',
    status: 'unknown',
    measurement: "SPECS=$(ls openspec/specs/*.md | wc -l); BATS=$(ls tests/spec/*.bats | wc -l); python3 -c \"print(f'{$BATS/$SPECS*100:.0f}')\"",
    source: '.agents/lib/goals.md · G-RH03',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-TEST01', title: 'BATS Debt-Skips', category: 'Test-Health',
    priority: 'B', direction: 'lower',
    baseline: 9, current: 9, target: 0, unit: 'Skips',
    status: 'unknown',
    measurement: "grep -rniE \"skip ['\\\"']\" tests --include=*.bats | grep -ciE 'pending|todo|gap-analysis|WP-|not implemented|disabled|stub'",
    source: '.agents/lib/goals.md · G-TEST01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-CQ02', title: 'Explizite `any`-Typen', category: 'Code-Qualität',
    priority: 'B', direction: 'lower',
    baseline: 463, current: 463, target: 280, unit: 'Vorkommen',
    status: 'unknown',
    measurement: "grep -rn ': any\\|<any>\\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro | wc -l",
    source: '.agents/lib/goals.md · G-CQ02',
    measured_at: '2026-06-28',
    note: '+39 Regression seit letztem Stand',
  },
  {
    id: 'G-CQ05', title: 'Echte TODO-Marker', category: 'Code-Qualität',
    priority: 'B', direction: 'lower',
    baseline: 6, current: 6, target: 1, unit: 'TODOs',
    status: 'unknown',
    measurement: "grep -rnE '\\bTODO\\b' --include=*.ts --include=*.svelte --include=*.sh --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null | grep -vE 'node_modules|plan-lint|openspec.sh' | wc -l",
    source: '.agents/lib/goals.md · G-CQ05',
    measured_at: '2026-06-28',
    note: '+5 Regression (war 1)',
  },
  {
    id: 'G-SIZE01', title: 'Freeze-Frühwarn-Band (80–100%)', category: 'Code-Größe',
    priority: 'B', direction: 'lower',
    baseline: 39, current: 39, target: 15, unit: 'Dateien',
    status: 'unknown',
    measurement: "bash scripts/health-goals-check.sh --only=G-SIZE01 --quiet 2>/dev/null | grep -oE '[0-9]+'",
    source: '.agents/lib/goals.md · G-SIZE01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-SIZE03', title: 'God-File website-db.ts', category: 'Code-Größe',
    priority: 'B', direction: 'lower',
    baseline: 4435, current: 4435, target: 3000, unit: 'Zeilen',
    status: 'unknown',
    measurement: 'wc -l < website/src/lib/website-db.ts',
    source: '.agents/lib/goals.md · G-SIZE03',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-IMG01', title: 'Ungepinnte Fremd-Images', category: 'Dependencies',
    priority: 'B', direction: 'lower',
    baseline: 39, current: 39, target: 0, unit: 'Images',
    status: 'unknown',
    measurement: "grep -rhE 'image:' k3d/ prod*/ 2>/dev/null | grep -v '@sha256' | grep -vE 'website|brett|docs|videovault|mentolder-web' | sort -u | wc -l",
    source: '.agents/lib/goals.md · G-IMG01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-K8S03', title: 'Deployments ohne securityContext', category: 'Infrastruktur',
    priority: 'B', direction: 'lower',
    baseline: 3, current: 3, target: 0, unit: 'Deployments',
    status: 'unknown',
    measurement: "python3 -c \"import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print(len([x for x in D if not x['spec']['template']['spec'].get('securityContext') and not all(c.get('securityContext') for c in x['spec']['template']['spec']['containers'])]))\"",
    source: '.agents/lib/goals.md · G-K8S03',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-SPEC03', title: 'Proposals ohne Ticket (.ticket)', category: 'Prozess',
    priority: 'B', direction: 'lower',
    baseline: 12, current: 12, target: 0, unit: 'Changes',
    status: 'unknown',
    measurement: "m=0; for d in openspec/changes/*/; do b=$(basename \"$d\"); [ \"$b\" = archive ] && continue; [ -f \"$d/.ticket\" ] || m=$((m+1)); done; echo $m",
    source: '.agents/lib/goals.md · G-SPEC03',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-DOC02', title: 'CLAUDE.md Zeilenzahl', category: 'Dokumentation',
    priority: 'B', direction: 'lower',
    baseline: 273, current: 273, target: 200, unit: 'Zeilen',
    status: 'unknown',
    measurement: 'wc -l < CLAUDE.md',
    source: '.agents/lib/goals.md · G-DOC02',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-DOC04', title: 'Architektur-ADRs', category: 'Dokumentation',
    priority: 'B', direction: 'higher',
    baseline: 0, current: 0, target: 5, unit: 'ADRs',
    status: 'unknown',
    measurement: "find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l",
    source: '.agents/lib/goals.md · G-DOC04',
    measured_at: '2026-06-28',
  },

  // ── Priority C — Green Gates (erreicht, halten) ───────────────────────
  {
    id: 'G-RH01', title: 'Gate-Violations (baseline.json)', category: 'Kern-Ziele',
    priority: 'C', direction: 'lower',
    baseline: 98, current: 28, target: 30, unit: 'Violations',
    status: 'achieved',
    measurement: "python3 -c \"import json,sys; print(len(json.load(sys.stdin)))\" < docs/code-quality/baseline.json",
    source: '.agents/lib/goals.md · G-RH01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-RH02', title: 'TypeScript-Suppressionen', category: 'Kern-Ziele',
    priority: 'C', direction: 'lower',
    baseline: 9, current: 0, target: 0, unit: 'Suppressionen',
    status: 'achieved',
    measurement: "grep -r '@ts-ignore\\|@ts-expect-error' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l",
    source: '.agents/lib/goals.md · G-RH02',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-RH07', title: 'Freshness-Check grün', category: 'Kern-Ziele',
    priority: 'C', direction: 'lower',
    baseline: null, current: null, target: null, unit: 'Exit',
    status: 'achieved',
    measurement: 'task freshness:check; echo "Exit: $?"',
    source: '.agents/lib/goals.md · G-RH07',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-CQ07', title: 'Import-Zyklen (S2)', category: 'Code-Qualität',
    priority: 'C', direction: 'lower',
    baseline: 4, current: 0, target: 0, unit: 'Zyklen',
    status: 'achieved',
    measurement: "python3 -c \"import json,sys; print(sum(1 for v in json.load(sys.stdin).values() if v['gate']=='S2'))\" < docs/code-quality/baseline.json",
    source: '.agents/lib/goals.md · G-CQ07',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-CQ09', title: 'Hartkodierte Hostnames (S3)', category: 'Code-Qualität',
    priority: 'C', direction: 'lower',
    baseline: 24, current: 0, target: 0, unit: 'Treffer',
    status: 'achieved',
    measurement: "python3 -c \"import json,sys; print(sum(1 for v in json.load(sys.stdin).values() if v['gate']=='S3'))\" < docs/code-quality/baseline.json",
    source: '.agents/lib/goals.md · G-CQ09',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-SEC01', title: 'Hardcoded Secrets (k3d)', category: 'Sicherheit',
    priority: 'C', direction: 'lower',
    baseline: null, current: 0, target: 0, unit: 'Treffer',
    status: 'achieved',
    measurement: "grep -rn 'password.*=.*[^$]' k3d/*.yaml | grep -iv 'secretKeyRef\\|valueFrom\\|_PASSWORD}' | wc -l",
    source: '.agents/lib/goals.md · G-SEC01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-K8S01', title: 'Deployments ohne Resource-Limits', category: 'Infrastruktur',
    priority: 'C', direction: 'lower',
    baseline: null, current: 0, target: 0, unit: 'Deployments',
    status: 'achieved',
    measurement: "python3 -c \"import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print(sum(1 for x in D if not all(c.get('resources',{}).get('limits') for c in x['spec']['template']['spec']['containers'])))\"",
    source: '.agents/lib/goals.md · G-K8S01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-SPEC01', title: 'openspec:validate grün', category: 'Prozess',
    priority: 'C', direction: 'lower',
    baseline: null, current: null, target: null, unit: 'Exit',
    status: 'achieved',
    measurement: 'bash scripts/openspec.sh validate >/dev/null 2>&1; echo "exit=$?"',
    source: '.agents/lib/goals.md · G-SPEC01',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-SEC02', title: 'git-crypt Klartext-Guard', category: 'Sicherheit',
    priority: 'C', direction: 'lower',
    baseline: null, current: null, target: null, unit: 'Exit',
    status: 'achieved',
    measurement: 'bash scripts/git-crypt-guard.sh check-tracked >/dev/null 2>&1; echo "exit=$?"',
    source: '.agents/lib/goals.md · G-SEC02',
    measured_at: '2026-06-28',
  },
  {
    id: 'G-IMG02', title: 'Fremd-Image-Versions-Drift', category: 'Dependencies',
    priority: 'C', direction: 'lower',
    baseline: 3, current: 0, target: 0, unit: 'Drifts',
    status: 'achieved',
    measurement: "grep -rhE 'image:' k3d/ prod*/ 2>/dev/null | sed -E 's/.*image:[[:space:]]*//' | awk -F: '{print $1}' | sort | uniq -d | wc -l",
    source: '.agents/lib/goals.md · G-IMG02',
    measured_at: '2026-06-28',
  },
];

export const GOALS: HealthGoal[] = RAW_GOALS.map(g => ({ ...g, status: computeStatus(g) }));

export const ACTIVE_GOALS = GOALS.filter(g => g.priority !== 'C' || g.status !== 'achieved');
export const GREEN_GATES  = GOALS.filter(g => g.priority === 'C' && g.status === 'achieved');

export const CATEGORIES = [...new Set(GOALS.map(g => g.category))];
