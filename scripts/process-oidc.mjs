#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { execFileSync } from 'child_process';

const [appName, envName, dryRunFlag] = process.argv.slice(2);
if (!appName || !envName) {
  console.error('Usage: node process-oidc.mjs <APP_NAME> <ENV_NAME> [--dry-run]');
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
  const oidc = manifest.oidc;

  if (!oidc) {
    console.log('No OIDC configuration found. Skipping.');
    process.exit(0);
  }

  const clientId = oidc.client_id;
  const title = manifest.title || clientId;
  const redirectUris = oidc.redirect_uris || [];
  const secretVarName = `${clientId.toUpperCase().replace(/-/g, '_')}_OIDC_SECRET`;

  if (dryRun) {
    console.log(`[OIDC] Would register OIDC client "${clientId}"`);
    console.log(`[OIDC] Would register secret "${secretVarName}" in schema and environments/.secrets/${envName}.yaml`);
    console.log(`[OIDC] Redirect URIs: ${JSON.stringify(redirectUris)}`);
  } else {
    // 1. Register secret
    console.log(`[OIDC] Registering secret ${secretVarName}...`);
    execFileSync('node', ['scripts/register-secret.mjs', secretVarName, envName], { stdio: 'inherit' });

    // 2. Register OIDC client in Keycloak JSON files
    console.log(`[OIDC] Registering OIDC client ${clientId}...`);
    const redirectUrisJson = JSON.stringify(redirectUris);
    execFileSync('node', ['scripts/register-oidc-client.mjs', clientId, title, redirectUrisJson, secretVarName], { stdio: 'inherit' });
  }

  process.exit(0);
} catch (err) {
  console.error(`Error processing OIDC: ${err.message}`);
  process.exit(1);
}
