#!/usr/bin/env node
// scripts/warden-mcp/launch.mjs — startet @icoretech/warden-mcp (stdio) fuer Claude Code. [T900404]
//
// Credentials kommen ausschliesslich aus ~/.config/warden-mcp/server.env und nie
// aus dem Repo: .mcp.json ist getrackt und wird von Qwen ohne ${VAR}-Expansion
// gelesen (T004272). Fehlt die Datei oder einer der Pflicht-Keys, startet der
// Server nicht (fail-closed). Werte werden nie ausgegeben.
//
// Windows-Befunde aus dem Smoke-Test (T900404):
//   - warden-mcp spawnt `bw` ohne Shell; das gebuendelte @bitwarden/cli ist dort
//     eine .js-Datei (spawn EFTYPE). BW_BIN muss auf eine echte bw.exe zeigen —
//     aus server.env oder aus dem PATH (winget install Bitwarden.CLI).
//   - bw >= 2026.7.0 kann Eintraege von Vaultwarden 1.36.0 nicht entschluesseln
//     (SDK: "invalid type: JsValue(Object ...)"); 2026.6.0 funktioniert.
//   - HOME ist leer, warden-mcp legte sein Profil sonst unter /data/bw-profiles ab.
//   - Ein UNC-Arbeitsverzeichnis (\\wsl.localhost\...) laesst cmd.exe scheitern;
//     npx wird deshalb direkt ueber npx-cli.js und mit cwd=Home gestartet.
//
// opencode laeuft in WSL (T900404). Dort ist das mitgelieferte @bitwarden/cli
// zwar ein startbares ELF, aber mit derselben Versionsgrenze: 2026.9.0 legt
// Eintraege von Vaultwarden 1.36.0 nicht entschluesseln. Deshalb sucht der
// Launcher auf BEIDEN Plattformen zuerst eine echte, gepinnte bw-Binary
// (PATH, ~/.local/bin, WinGet-Paket) und warnt, wenn die Version >= 2026.7.0
// ist — der rohe Fehler von warden-mcp lautet dann nur
// "create item <redacted> failed with exit code 1".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const PACKAGE = '@icoretech/warden-mcp@0.2.44';
const REQUIRED = ['BW_HOST', 'BW_CLIENTID', 'BW_CLIENTSECRET', 'BW_PASSWORD'];
const isWin = process.platform === 'win32';
const home = os.homedir();
const confDir = path.join(home, '.config', 'warden-mcp');
const envFile = path.join(confDir, 'server.env');

const fail = (msg) => {
  process.stderr.write(`warden-mcp: ${msg}\n`);
  process.exit(1);
};

// Parser wie render_agy_json in scripts/mcp-sync.sh: KEY=VALUE, #-Kommentare,
// umschliessende Quotes entfernen.
function readEnvFile(file) {
  const vars = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (val.length > 1 && val[0] === val[val.length - 1] && (val[0] === "'" || val[0] === '"')) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function findOnPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ~/.local/bin liegt in WSL-Loginshells im PATH, aber nicht zwingend im
// Environment eines von opencode uebergebenen Kindprozesses.
function findUserLocalBw() {
  const candidate = path.join(home, '.local', 'bin', 'bw');
  return fs.existsSync(candidate) ? candidate : null;
}

// 'Bitwarden CLI 2026.6.0' (Windows) bzw. '2026.6.0' (Linux) -> [2026, 6, 0].
function bwVersion(bin) {
  try {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10000 });
    const m = /(\d{4})\.(\d+)\.(\d+)/.exec(`${probe.stdout || ''}${probe.stderr || ''}`);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  } catch {
    return null;
  }
}

// Fallback fuer Prozesse, die vor `winget install` gestartet wurden und den
// neuen PATH-Eintrag nicht kennen (z. B. eine laufende Claude-Desktop-App).
function findWingetBw() {
  const pkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (!process.env.LOCALAPPDATA || !fs.existsSync(pkgs)) return null;
  const dir = fs.readdirSync(pkgs).find((d) => d.startsWith('Bitwarden.CLI_'));
  const candidate = dir && path.join(pkgs, dir, 'bw.exe');
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

if (!fs.existsSync(envFile)) {
  fail(`${envFile} fehlt — Datei mit ${REQUIRED.join(', ')} anlegen (Rechte nur fuer den eigenen Benutzer).`);
}
const fileVars = readEnvFile(envFile);
const missing = REQUIRED.filter((k) => !fileVars[k]);
if (missing.length) fail(`in ${envFile} fehlen oder sind leer: ${missing.join(', ')}`);

if (!isWin && (fs.statSync(envFile).mode & 0o077) !== 0) {
  process.stderr.write(`warden-mcp: WARN: ${envFile} ist fuer andere lesbar — chmod 600 empfohlen\n`);
}

const env = { ...process.env, ...fileVars };
env.KEYCHAIN_BW_HOME_ROOT ||= path.join(confDir, 'bw-profiles');
if (!env.BW_BIN) {
  env.BW_BIN = findOnPath(isWin ? 'bw.exe' : 'bw') || findUserLocalBw() || (isWin && findWingetBw()) || null;
  if (!env.BW_BIN) {
    process.stderr.write('warden-mcp: WARN: keine bw-CLI gefunden — der Server startet, aber jedes ' +
      'keychain_*-Tool scheitert. Gepinnte 2026.6.x in PATH oder ~/.local/bin ablegen, ' +
      'alternativ BW_BIN in server.env setzen.\n');
  } else {
    const v = bwVersion(env.BW_BIN);
    if (v && (v[0] > 2026 || (v[0] === 2026 && v[1] >= 7))) {
      process.stderr.write(`warden-mcp: WARN: ${env.BW_BIN} meldet bw ${v.join('.')} — ab 2026.7.0 ` +
        'koennen die Eintraege von Vaultwarden 1.36.0 nicht entschluesselt werden. Version 2026.6.x ' +
        'installieren oder BW_BIN in server.env setzen.\n');
    }
  }
}

// npx ohne Shell starten: unter Windows ueber npm's npx-cli.js neben node.exe.
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
const [cmd, args] = isWin && fs.existsSync(npxCli)
  ? [process.execPath, [npxCli, '-y', PACKAGE, '--stdio']]
  : ['npx', ['-y', PACKAGE, '--stdio']];

if (process.env.WARDEN_MCP_DRY_RUN === '1') {
  process.stderr.write(`warden-mcp: dry-run: npx -y ${PACKAGE} --stdio ` +
    `(bw-profiles=${env.KEYCHAIN_BW_HOME_ROOT}, bw=${env.BW_BIN || 'mitgeliefertes @bitwarden/cli'})\n`);
  process.exit(0);
}

const child = spawn(cmd, args, { stdio: 'inherit', env, cwd: home });
child.on('error', (err) => fail(`Start fehlgeschlagen: ${err.message}`));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
