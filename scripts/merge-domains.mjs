#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const [appName, dryRunFlag] = process.argv.slice(2);
if (!appName) {
  console.error('Usage: node merge-domains.mjs <APP_NAME> [--dry-run]');
  process.exit(1);
}

const dryRun = dryRunFlag === '--dry-run';
const appYamlPath = path.resolve(`apps/${appName}/app.yaml`);

if (!fs.existsSync(appYamlPath)) {
  console.error(`App manifest not found: ${appYamlPath}`);
  process.exit(1);
}

try {
  const manifest = YAML.parse(fs.readFileSync(appYamlPath, 'utf8'));
  const domains = manifest.domains || [];

  if (domains.length === 0) {
    console.log('No domains to merge.');
    process.exit(0);
  }

  const targets = [
    {
      path: 'k3d/configmap-domains.yaml',
      mapHost: (host) => host.replace(/\$\{PROD_DOMAIN\}/g, 'localhost')
    },
    {
      path: 'prod/configmap-domains.yaml',
      mapHost: (host) => host
    }
  ];

  for (const target of targets) {
    const filePath = path.resolve(target.path);
    if (!fs.existsSync(filePath)) {
      console.log(`Target configmap-domains ${target.path} does not exist. Skipping.`);
      continue;
    }

    const doc = YAML.parseDocument(fs.readFileSync(filePath, 'utf8'));
    const data = doc.get('data');

    let modified = false;
    for (const d of domains) {
      const mappedHost = target.mapHost(d.host);
      if (!data.has(d.key)) {
        console.log(`[DOMAINS] Would add ${d.key}: "${mappedHost}" to ${target.path}`);
        if (!dryRun) {
          data.set(d.key, mappedHost);
          modified = true;
        }
      } else {
        console.log(`[DOMAINS] Key ${d.key} already exists in ${target.path}. Skipping.`);
      }
    }

    if (modified && !dryRun) {
      fs.writeFileSync(filePath, doc.toString());
      console.log(`Successfully updated ${target.path}`);
    }
  }

  process.exit(0);
} catch (err) {
  console.error(`Error merging domains: ${err.message}`);
  process.exit(1);
}
