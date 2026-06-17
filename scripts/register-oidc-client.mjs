#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const [clientId, title, redirectUrisJson, secretVarName] = process.argv.slice(2);
if (!clientId || !title || !redirectUrisJson || !secretVarName) {
  console.error('Usage: node register-oidc-client.mjs <CLIENT_ID> <TITLE> <REDIRECT_URIS_JSON> <SECRET_VAR_NAME>');
  process.exit(1);
}

let redirectUrisInput;
try {
  redirectUrisInput = JSON.parse(redirectUrisJson);
  if (!Array.isArray(redirectUrisInput)) {
    throw new Error('Must be an array');
  }
} catch (err) {
  console.error(`Invalid redirect URIs JSON: ${err.message}`);
  process.exit(1);
}

const targets = [
  {
    path: 'k3d/realm-workspace-dev.json',
    mapUri: (uri) => uri.replace(/\$\{PROD_DOMAIN\}/g, 'localhost').replace(/^https:\/\//, 'http://'),
    mapOrigin: (uri) => {
      const mapped = uri.replace(/\$\{PROD_DOMAIN\}/g, 'localhost').replace(/^https:\/\//, 'http://');
      try {
        const url = new URL(mapped);
        return `${url.protocol}//${url.host}`;
      } catch {
        return mapped.split('/').slice(0, 3).join('/');
      }
    }
  },
  {
    path: 'prod/realm-workspace-prod.json',
    mapUri: (uri) => uri,
    mapOrigin: (uri) => {
      // e.g. https://board.${PROD_DOMAIN}/oidc/callback -> https://board.${PROD_DOMAIN}
      return uri.split('/').slice(0, 3).join('/');
    }
  },
  {
    path: 'prod-mentolder/realm-workspace-mentolder.json',
    mapUri: (uri) => uri.replace(/\$\{PROD_DOMAIN\}/g, 'mentolder.de'),
    mapOrigin: (uri) => {
      const mapped = uri.replace(/\$\{PROD_DOMAIN\}/g, 'mentolder.de');
      return mapped.split('/').slice(0, 3).join('/');
    }
  },
  {
    path: 'prod-korczewski/realm-workspace-korczewski.json',
    mapUri: (uri) => uri.replace(/\$\{PROD_DOMAIN\}/g, 'korczewski.de'),
    mapOrigin: (uri) => {
      const mapped = uri.replace(/\$\{PROD_DOMAIN\}/g, 'korczewski.de');
      return mapped.split('/').slice(0, 3).join('/');
    }
  }
];

const clientTemplate = {
  clientId,
  name: title,
  enabled: true,
  clientAuthenticatorType: 'client-secret',
  standardFlowEnabled: true,
  implicitFlowEnabled: false,
  directAccessGrantsEnabled: false,
  serviceAccountsEnabled: false,
  protocol: 'openid-connect',
  publicClient: false,
  attributes: {
    'oidc.ciba.grant.enabled': 'false',
    'oauth2.device.authorization.grant.enabled': 'false',
    'backchannel.logout.session.required': 'true'
  },
  protocolMappers: [
    {
      name: 'email',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-property-mapper',
      consentRequired: false,
      config: {
        'userinfo.token.claim': 'true',
        'user.attribute': 'email',
        'id.token.claim': 'true',
        'access.token.claim': 'true',
        'claim.name': 'email',
        'jsonType.label': 'String'
      }
    },
    {
      name: 'username',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-property-mapper',
      consentRequired: false,
      config: {
        'userinfo.token.claim': 'true',
        'user.attribute': 'username',
        'id.token.claim': 'true',
        'access.token.claim': 'true',
        'claim.name': 'preferred_username',
        'jsonType.label': 'String'
      }
    }
  ],
  secret: `\${${secretVarName}}`
};

for (const target of targets) {
  const filePath = path.resolve(target.path);
  if (!fs.existsSync(filePath)) {
    console.log(`Target realm file ${target.path} does not exist. Skipping.`);
    continue;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const realm = JSON.parse(content);

    if (!realm.clients) {
      realm.clients = [];
    }

    const existingIdx = realm.clients.findIndex((c) => c.clientId === clientId);
    const redirectUris = redirectUrisInput.map(target.mapUri);
    const webOrigins = [...new Set(redirectUrisInput.map(target.mapOrigin))];

    const clientData = {
      ...clientTemplate,
      redirectUris,
      webOrigins
    };

    if (existingIdx >= 0) {
      console.log(`Updating existing OIDC client "${clientId}" in ${target.path}`);
      realm.clients[existingIdx] = {
        ...realm.clients[existingIdx],
        ...clientData
      };
    } else {
      console.log(`Adding new OIDC client "${clientId}" to ${target.path}`);
      realm.clients.push(clientData);
    }

    fs.writeFileSync(filePath, JSON.stringify(realm, null, 2) + '\n');
  } catch (err) {
    console.error(`Error writing OIDC client to ${target.path}: ${err.message}`);
    process.exit(1);
  }
}

console.log('✅ OIDC client registered successfully across all targets.');
process.exit(0);
