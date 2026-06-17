#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { execSync } from 'child_process';

const [appName, envName, dryRunFlag] = process.argv.slice(2);
if (!appName || !envName) {
  console.error('Usage: node process-secrets.mjs <APP_NAME> <ENV_NAME> [--dry-run]');
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
  const secrets = manifest.secrets || [];

  if (secrets.length === 0) {
    console.log('No secrets to process.');
    process.exit(0);
  }

  for (const secret of secrets) {
    if (dryRun) {
      console.log(`[SECRETS] Would register secret "${secret}" in schema and environments/.secrets/${envName}.yaml`);
    } else {
      console.log(`[SECRETS] Registering secret ${secret}...`);
      execSync(`node scripts/register-secret.mjs "${secret}" "${envName}"`, { stdio: 'inherit' });
    }
  }

  process.exit(0);
} catch (err) {
  console.error(`Error processing secrets: ${err.message}`);
  process.exit(1);
}
