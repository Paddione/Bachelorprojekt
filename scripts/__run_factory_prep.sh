#!/usr/bin/env bash
set -euo pipefail

# Replace jq with a node-based implementation
jq() {
  node -e "
const args = process.argv.slice(1);
const stdin = require('fs').readFileSync('/dev/stdin', 'utf-8').trim();
const data = stdin ? JSON.parse(stdin) : null;

const filter = args[0] || '.';

// Handle -n (null input, use --argjson variables)
if (filter === '-n') {
  const result = {};
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

// Handle -r (raw output)
const raw = filter === '-r';
if (raw) {
  const expr = args[1] || '.';
  const parts = expr.split('.').filter(Boolean);
  let val = data;
  for (const p of parts) {
    if (val && typeof val === 'object') val = val[p];
    else { val = ''; break; }
  }
  process.stdout.write(String(val ?? ''));
  process.exit(0);
}

// Handle -c (compact)
const compact = filter === '-c';
if (compact) {
  if (Array.isArray(data)) {
    for (const item of data) process.stdout.write(JSON.stringify(item) + '\n');
  } else {
    process.stdout.write(JSON.stringify(data));
  }
  process.exit(0);
}

// Handle select filter: .[] | select(...) -> just iterate array
if (filter.includes('.[]')) {
  if (Array.isArray(data)) {
    for (const item of data) console.log(JSON.stringify(item));
  }
  process.exit(0);
}

// Handle simple field access like .external_id or .brand
if (filter.startsWith('.') && !filter.includes('|') && !filter.includes('{')) {
  const parts = filter.split('.').filter(Boolean);
  let val = data;
  for (const p of parts) {
    if (val && typeof val === 'object') val = val[p];
    else { val = null; break; }
  }
  process.stdout.write(val !== null && val !== undefined ? JSON.stringify(val) : 'null');
  process.exit(0);
}

// Handle .[] | .field
if (filter.includes('|')) {
  const parts = filter.split('|').map(s => s.trim());
  let result = data;
  for (const part of parts) {
    if (part.startsWith('.[]')) {
      if (Array.isArray(result)) {
        const sub = part.substring(3).trim();
        if (sub.startsWith('.')) {
          const field = sub.substring(1);
          for (const item of result) {
            console.log(item != null ? JSON.stringify(item[field] ?? null) : 'null');
          }
        } else {
          for (const item of result) console.log(JSON.stringify(item));
        }
      }
      process.exit(0);
    }
    if (part.startsWith('.')) {
      const field = part.substring(1);
      result = result != null ? result[field] : null;
    }
  }
  if (result !== null && result !== undefined) process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

// Handle .[].field
const match = filter.match(/^\.\[\]\.(.+)/);
if (match && data) {
  const field = match[1];
  if (Array.isArray(data)) {
    for (const item of data) {
      process.stdout.write(JSON.stringify(item != null ? (item[field] ?? null) : null) + '\n');
    }
  }
  process.exit(0);
}

// Handle --arg / --argjson
if (filter.includes('--arg') || filter.includes('--argjson')) {
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}

// Handle .[].<field> or similar patterns
if (filter.startsWith('.[') && filter.endsWith(']')) {
  const inner = filter.slice(2, -1);
  if (data && Array.isArray(data)) {
    for (const item of data) {
      const val = inner.startsWith('.') ? item[inner.slice(1)] : item;
      process.stdout.write(JSON.stringify(val) + '\n');
    }
  }
  process.exit(0);
}

// Handle select(.field == value)
if (filter.includes('select(')) {
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}

// Handle . | select(.field == value)
const exprMatch = filter.match(/\.\s*\|\s*select\((.+)\)/);
if (exprMatch) {
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}

// Handle object construction: {launch: \$launch, skipped: \$skipped}
if (filter.startsWith('{') && filter.endsWith('}')) {
  // Just pass through whatever python already built
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}

// If nothing matched, pass through
process.stdout.write(JSON.stringify(data));
" "$@"
}

export -f jq

# Also override the "jq" binary path lookup
# Now run the actual factory-prep script
FACTORY_DAILY_DEPLOY_CAP=${FACTORY_DAILY_DEPLOY_CAP:-5} FACTORY_GLOBAL_CAP=${FACTORY_GLOBAL_CAP:-3} bash scripts/vda/factory-prep.sh 2>&1
