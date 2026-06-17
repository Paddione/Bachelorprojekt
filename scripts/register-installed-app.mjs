#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const [appName, envName, dryRunFlag] = process.argv.slice(2);
if (!appName || !envName) {
  console.error('Usage: node register-installed-app.mjs <APP_NAME> <ENV_NAME> [--dry-run]');
  process.exit(1);
}

const dryRun = dryRunFlag === '--dry-run';
const registryPath = path.resolve(`apps/installed-${envName}.json`);

try {
  let installedApps = [];
  if (fs.existsSync(registryPath)) {
    const content = fs.readFileSync(registryPath, 'utf8');
    if (content.trim()) {
      installedApps = JSON.parse(content);
    }
  }

  if (!Array.isArray(installedApps)) {
    installedApps = [];
  }

  if (dryRun) {
    console.log(`[REGISTRY] Would add "${appName}" to ${registryPath}`);
  } else {
    if (!installedApps.includes(appName)) {
      installedApps.push(appName);
      fs.writeFileSync(registryPath, JSON.stringify(installedApps, null, 2) + '\n');
      console.log(`[REGISTRY] Added "${appName}" to ${registryPath}`);
    } else {
      console.log(`[REGISTRY] "${appName}" is already registered as installed in ${registryPath}`);
    }
  }
  process.exit(0);
} catch (err) {
  console.error(`Error updating installed apps registry: ${err.message}`);
  process.exit(1);
}
