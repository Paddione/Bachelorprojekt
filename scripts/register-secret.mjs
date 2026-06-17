#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import YAML from 'yaml';

const [secretName, envName] = process.argv.slice(2);
if (!secretName || !envName) {
  console.error('Usage: node register-secret.mjs <SECRET_NAME> <ENV_NAME>');
  process.exit(1);
}

const schemaPath = path.resolve('environments/schema.yaml');
const secretFilePath = path.resolve(`environments/.secrets/${envName}.yaml`);

try {
  // 1. Update environments/schema.yaml
  if (fs.existsSync(schemaPath)) {
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const doc = YAML.parseDocument(schemaContent);
    const secretsList = doc.get('secrets');

    // Check if secret already exists in schema
    let exists = false;
    if (secretsList && typeof secretsList.items === 'object') {
      for (const item of secretsList.items) {
        if (item && item.get && item.get('name') === secretName) {
          exists = true;
          break;
        }
      }
    }

    if (!exists) {
      console.log(`Adding ${secretName} to environments/schema.yaml`);
      const newSecretNode = doc.createNode({
        name: secretName,
        required: true,
        generate: true,
        length: 32
      });
      secretsList.add(newSecretNode);
      fs.writeFileSync(schemaPath, doc.toString());
    } else {
      console.log(`${secretName} already exists in environments/schema.yaml`);
    }
  }

  // 2. Update environments/.secrets/<env>.yaml
  if (fs.existsSync(secretFilePath)) {
    const secretContent = fs.readFileSync(secretFilePath, 'utf8');
    const doc = YAML.parseDocument(secretContent);

    if (!doc.has(secretName)) {
      console.log(`Adding ${secretName} stub to environments/.secrets/${envName}.yaml`);
      const randomVal = crypto.randomBytes(32).toString('hex');
      doc.set(secretName, randomVal);
      fs.writeFileSync(secretFilePath, doc.toString());
    } else {
      console.log(`${secretName} already exists in environments/.secrets/${envName}.yaml`);
    }
  } else {
    // If the file doesn't exist, create it
    console.log(`Creating environments/.secrets/${envName}.yaml with ${secretName}`);
    const randomVal = crypto.randomBytes(32).toString('hex');
    const doc = new YAML.Document();
    doc.set(secretName, randomVal);
    fs.writeFileSync(secretFilePath, doc.toString());
  }

  process.exit(0);
} catch (err) {
  console.error(`Error registering secret: ${err.message}`);
  process.exit(1);
}
