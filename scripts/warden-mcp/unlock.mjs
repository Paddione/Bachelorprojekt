#!/usr/bin/env node
// scripts/warden-mcp/unlock.mjs — Master-Passwort fuer warden-mcp, ohne Klartext in server.env.
//
//   node scripts/warden-mcp/unlock.mjs           Nur-Session: einmal entsperren, nur die
//                                                bw-Session landet in warden-mcps Profil
//   node scripts/warden-mcp/unlock.mjs --store   Passwort in die Windows-Anmeldeinformations-
//                                                verwaltung legen (auch aus WSL); launch.mjs
//                                                holt es dort automatisch ab
//   node scripts/warden-mcp/unlock.mjs --lock    Nur-Session-Profil sperren (Session ungueltig)
//   node scripts/warden-mcp/unlock.mjs --status  zeigt, welche Quelle launch.mjs nutzen wuerde
//
// Das Passwort wird verdeckt abgefragt, vor dem Speichern gegen den Tresor geprueft
// und nie ausgegeben oder als Argument uebergeben.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  envFile, readEnvFile, findBw, profileDir, SESSION_ONLY_PASSWORD,
  credTarget, readCredential, writeCredential,
} from './common.mjs';

const mode = process.argv[2] || '--session';
const fail = (msg) => { process.stderr.write(`warden-unlock: ${msg}\n`); process.exit(1); };

if (!fs.existsSync(envFile)) fail(`${envFile} fehlt.`);
const vars = readEnvFile(envFile);
for (const k of ['BW_HOST', 'BW_CLIENTID', 'BW_CLIENTSECRET']) if (!vars[k]) fail(`${k} fehlt in ${envFile}`);
const bw = vars.BW_BIN || findBw();
if (!bw) fail('keine bw-CLI gefunden (gepinnte 2026.6.x in PATH oder ~/.local/bin).');

// bw gegen ein bestimmtes warden-mcp-Profil; stdout wird abgefangen, nie ausgegeben.
function runBw(dir, args, extraEnv = {}) {
  const env = { ...process.env, HOME: dir, BITWARDENCLI_APPDATA_DIR: path.join(dir, '.bitwarden-cli'), ...extraEnv };
  return spawnSync(bw, args, { env, encoding: 'utf8', timeout: 120000, windowsHide: true });
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stderr } = process;
    if (!stdin.isTTY) fail('kein Terminal — bitte interaktiv ausfuehren.');
    stderr.write(question);
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stderr.write('\n'); resolve(value); return; }
        if (c === '\u0003') { stdin.setRawMode(false); stderr.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1); else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

// Profil anmelden (API-Key, kein Passwort noetig) und mit dem Passwort entsperren.
function unlockProfile(dir, password) {
  fs.mkdirSync(path.join(dir, '.bitwarden-cli'), { recursive: true });
  let status = {};
  try { status = JSON.parse(runBw(dir, ['status']).stdout || '{}'); } catch { /* leeres Profil */ }
  if (status.serverUrl !== vars.BW_HOST) {
    if (status.status && status.status !== 'unauthenticated') runBw(dir, ['logout']);
    if (runBw(dir, ['config', 'server', vars.BW_HOST]).status !== 0) fail('bw config server fehlgeschlagen.');
    status.status = 'unauthenticated';
  }
  if (status.status === 'unauthenticated') {
    const login = runBw(dir, ['login', '--apikey', '--raw'],
      { BW_CLIENTID: vars.BW_CLIENTID, BW_CLIENTSECRET: vars.BW_CLIENTSECRET });
    if (login.status !== 0) fail('bw login --apikey fehlgeschlagen (BW_CLIENTID/BW_CLIENTSECRET pruefen).');
  }
  const unlock = runBw(dir, ['unlock', '--passwordenv', 'WARDEN_UNLOCK_PW', '--raw'], { WARDEN_UNLOCK_PW: password });
  const session = (unlock.stdout || '').trim();
  return unlock.status === 0 && session ? session : null;
}

function writeSessionState(dir, session) {
  // Format von BwSessionStorage.writeSession in @icoretech/warden-mcp (version 1).
  const now = new Date().toISOString();
  const file = path.join(dir, '.bitwarden-cli', '.warden-mcp-session.json');
  fs.writeFileSync(file, JSON.stringify({
    version: 1, host: vars.BW_HOST, identity: `apikey:${vars.BW_CLIENTID}`, session, createdAt: now, validatedAt: now,
  }), { encoding: 'utf8', mode: 0o600 });
}

const sessionDir = profileDir(vars, SESSION_ONLY_PASSWORD);

if (mode === '--status') {
  const fromFile = Boolean(vars.BW_PASSWORD);
  const fromCred = !fromFile && Boolean(readCredential(vars.BW_HOST));
  const stateFile = path.join(sessionDir, '.bitwarden-cli', '.warden-mcp-session.json');
  let sessionOk = false;
  if (fs.existsSync(stateFile)) {
    const { session } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    sessionOk = runBw(sessionDir, ['--session', session, 'unlock', '--check']).status === 0;
  }
  console.log(`server.env BW_PASSWORD:       ${fromFile ? 'gesetzt (Klartext — entfernen!)' : 'nicht gesetzt'}`);
  console.log(`Anmeldeinformationsverwaltung: ${fromCred ? `vorhanden (${credTarget(vars.BW_HOST)})` : fromFile ? '(nicht geprueft)' : 'kein Eintrag'}`);
  console.log(`Nur-Session-Profil:            ${sessionOk ? 'entsperrt' : 'gesperrt / nicht eingerichtet'}`);
  console.log(`launch.mjs nutzt:              ${fromFile ? 'server.env' : fromCred ? 'Anmeldeinformationsverwaltung' : sessionOk ? 'Nur-Session' : 'NICHTS — unlock.mjs ausfuehren'}`);
  process.exit(0);
}

if (mode === '--lock') {
  runBw(sessionDir, ['lock']);
  fs.rmSync(path.join(sessionDir, '.bitwarden-cli', '.warden-mcp-session.json'), { force: true });
  console.log('Nur-Session-Profil gesperrt.');
  process.exit(0);
}

if (mode !== '--session' && mode !== '--store') fail(`unbekannte Option ${mode} (--store, --lock, --status)`);

const password = await promptHidden(`Master-Passwort fuer ${vars.BW_HOST}: `);
if (!password) fail('leeres Passwort.');
const session = unlockProfile(sessionDir, password);
if (!session) fail('Entsperren fehlgeschlagen — Passwort falsch?');

if (mode === '--store') {
  if (!writeCredential(vars.BW_HOST, vars.BW_CLIENTID, password)) {
    fail('Schreiben in die Anmeldeinformationsverwaltung fehlgeschlagen (powershell.exe erreichbar?).');
  }
  console.log(`Passwort geprueft und als ${credTarget(vars.BW_HOST)} in der Windows-Anmeldeinformationsverwaltung abgelegt.`);
}
writeSessionState(sessionDir, session);
console.log('Nur-Session-Profil entsperrt — warden-mcp braucht kein BW_PASSWORD mehr in server.env.');
