// scripts/warden-mcp/common.mjs — gemeinsame Helfer fuer launch.mjs und unlock.mjs.
//
// Das Master-Passwort liegt nicht mehr in server.env. Quellen, in dieser Reihenfolge:
//   1. BW_PASSWORD in server.env (Altbestand, funktioniert weiter, warnt aber)
//   2. Windows-Anmeldeinformationsverwaltung, Ziel "warden-mcp:<BW_HOST>" — aus WSL ueber
//      powershell.exe; einrichten mit `node scripts/warden-mcp/unlock.mjs --store`
//   3. Nur-Session: `node scripts/warden-mcp/unlock.mjs` entsperrt einmal und legt nur
//      die bw-Session in warden-mcps Profil ab; BW_PASSWORD ist dann ein Platzhalter,
//      den warden-mcp nie braucht, solange die Session gueltig ist.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const isWin = process.platform === 'win32';
export const home = os.homedir();
export const confDir = path.join(home, '.config', 'warden-mcp');
export const envFile = path.join(confDir, 'server.env');
// Fester Platzhalter: warden-mcp verlangt BW_PASSWORD und hasht es in den Profil-
// pfad — ein konstanter Wert haelt das Nur-Session-Profil stabil.
export const SESSION_ONLY_PASSWORD = 'warden-mcp-session-only';
export const credTarget = (host) => `warden-mcp:${host}`;

// Parser wie render_agy_json in scripts/mcp-sync.sh: KEY=VALUE, #-Kommentare,
// umschliessende Quotes entfernen.
export function readEnvFile(file) {
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

// Fallback fuer Prozesse, die vor `winget install` gestartet wurden und den
// neuen PATH-Eintrag nicht kennen (z. B. eine laufende Claude-Desktop-App).
function findWingetBw() {
  const pkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (!process.env.LOCALAPPDATA || !fs.existsSync(pkgs)) return null;
  const dir = fs.readdirSync(pkgs).find((d) => d.startsWith('Bitwarden.CLI_'));
  const candidate = dir && path.join(pkgs, dir, 'bw.exe');
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

export function findBw() {
  return findOnPath(isWin ? 'bw.exe' : 'bw') || findUserLocalBw() || (isWin && findWingetBw()) || null;
}

// 'Bitwarden CLI 2026.6.0' (Windows) bzw. '2026.6.0' (Linux) -> [2026, 6, 0].
export function bwVersion(bin) {
  try {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10000 });
    const m = /(\d{4})\.(\d+)\.(\d+)/.exec(`${probe.stdout || ''}${probe.stderr || ''}`);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  } catch {
    return null;
  }
}

// Gleiche Ableitung wie BwSessionPool.keyForEnv in @icoretech/warden-mcp (apikey-Login).
export function profileDir(vars, password) {
  const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
  const keyMaterial = JSON.stringify({
    host: vars.BW_HOST,
    identity: { method: 'apikey', clientId: vars.BW_CLIENTID },
    secrets: { clientSecret: sha(vars.BW_CLIENTSECRET), password: sha(password) },
  });
  const root = process.env.KEYCHAIN_BW_HOME_ROOT || path.join(confDir, 'bw-profiles');
  return path.join(root, sha(keyMaterial));
}

// Windows PowerShell — nativ oder aus WSL ueber Interop.
function powershellBin() {
  if (isWin) return 'powershell.exe';
  const wsl = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  return fs.existsSync(wsl) ? wsl : null;
}

const CRED_PINVOKE = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class WardenCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredReadW(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWriteW(ref CREDENTIAL cred, int flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static string Read(string target) {
    IntPtr p; if (!CredReadW(target, 1, 0, out p)) return null;
    try { var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
          return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2); } finally { CredFree(p); }
  }
  public static bool Write(string target, string user, string secret) {
    var blob = Encoding.Unicode.GetBytes(secret); var c = new CREDENTIAL();
    c.Type = 1; c.TargetName = target; c.UserName = user; c.Persist = 2; c.CredentialBlobSize = blob.Length;
    c.CredentialBlob = Marshal.AllocCoTaskMem(blob.Length);
    try { Marshal.Copy(blob, 0, c.CredentialBlob, blob.Length); return CredWriteW(ref c, 0); }
    finally { Marshal.FreeCoTaskMem(c.CredentialBlob); }
  }
}
'@
`;

function runPowershell(script, input) {
  const ps = powershellBin();
  if (!ps) return null;
  const encoded = Buffer.from(CRED_PINVOKE + script, 'utf16le').toString('base64');
  const r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { input: input ?? '', encoding: 'utf8', timeout: 30000, windowsHide: true });
  return r.status === 0 ? r.stdout : null;
}

// Passwort aus der Anmeldeinformationsverwaltung oder null. Der Wert landet nie in Logs.
export function readCredential(host) {
  const target = credTarget(host).replace(/'/g, "''");
  const out = runPowershell(`$v = [WardenCred]::Read('${target}'); if ($v) { [Console]::Out.Write($v) }`);
  return out ? out : null;
}

// Das Secret kommt ueber stdin, nie ueber die Kommandozeile.
export function writeCredential(host, user, secret) {
  const target = credTarget(host).replace(/'/g, "''");
  const u = String(user).replace(/'/g, "''");
  const out = runPowershell(
    `$s = [Console]::In.ReadToEnd(); if ([WardenCred]::Write('${target}', '${u}', $s)) { 'ok' }`, secret);
  return (out || '').trim() === 'ok';
}
