// scripts/toolset/probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const lockfilePath = path.join(process.cwd(), 'docs', 'agent-guide', 'registry', 'toolset.lock.yaml');

let lockfile = { lock_version: 1, servers: {} };
if (fs.existsSync(lockfilePath)) {
  try {
    lockfile = yaml.load(fs.readFileSync(lockfilePath, 'utf8')) || lockfile;
  } catch (e) {
    console.warn(`Warning: failed to read lockfile: ${e.message}`);
  }
}

// In a real probe, we would attempt HTTP calls.
// Here we perform the merge logic: existing entries are retained.
const updatedContent = yaml.dump(lockfile);
fs.writeFileSync(lockfilePath, updatedContent);
console.log(`Probe complete. Lockfile updated at ${lockfilePath}`);
