// scripts/llm-proxy/runner.mjs
// Einziger Ort, der Prozesse anfasst. Die argv-Konstruktion ist bewusst als
// reine Funktion herausgezogen, damit sie ohne GPU getestet werden kann.
//
// WARUM null-Felder WEGGELASSEN werden (gemessen 2026-07-28):
//   llama.cpp b10155 hat --fit per Default auf 'on' und passt nur UNGESETZTE
//   Argumente an das freie VRAM an. Ein serialisiertes `-c 0` waere ein GESETZTES
//   Argument und schaltet die Anpassung ab. Handgesetzt -ngl 19 -c 65536 lieferte
//   30,9 tok/s decode; ungesetzt mit -fitt 2400 waren es 158-166 tok/s bei
//   105.472 statt 65.536 Kontext.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { generateUiConfigSeed } from '../llm/ui-config-seed.mjs';

// T002555 — Repo-Wurzel fuer das schreibende Binding der gehaerteten Unit.
// Aus dem Modulpfad abgeleitet (scripts/llm-proxy/ → zwei Ebenen hoch) statt
// hartkodiert, damit ein Worktree oder ein anderer Checkout-Ort nicht still das
// falsche Verzeichnis einbindet. FACTORY_REPO ueberschreibt, konsistent mit
// scripts/factory/sandbox-run.sh.
const REPO_ROOT = process.env.FACTORY_REPO || path.resolve(import.meta.dirname, '../..');

export function unitName(slug) { return `llama-${slug}.service`; }

/** @returns {string[]} argv fuer llama-server, OHNE das Binary selbst */
export function buildServerArgv(loadout, modelPath, defaults, resolved = {}) {
  const a = loadout.args ?? {};
  const argv = ['-m', modelPath, '--host', defaults.host, '--port', String(loadout.port)];

  if (loadout.fit?.enabled) {
    argv.push('-fit', 'on');
    if (loadout.fit.targetMarginMib != null) argv.push('-fitt', String(loadout.fit.targetMarginMib));
    if (loadout.fit.minCtx != null) argv.push('-fitc', String(loadout.fit.minCtx));
  } else {
    argv.push('-fit', 'off');
  }

  // Nur was NICHT null ist, wird gesetzt.
  if (a.ctx != null) argv.push('-c', String(a.ctx));
  if (a.ngl != null) argv.push('-ngl', String(a.ngl));
  if (a.parallel != null) argv.push('-np', String(a.parallel));
  if (a.cacheTypeK != null) argv.push('-ctk', a.cacheTypeK);
  if (a.cacheTypeV != null) argv.push('-ctv', a.cacheTypeV);
  if (a.loadMode != null) argv.push('-lm', a.loadMode);
  if (a.flashAttention) argv.push('-fa', 'on');
  if (a.jinja) argv.push('--jinja');
  if (a.metrics) argv.push('--metrics');
  if (a.reasoning != null) argv.push('-rea', a.reasoning);
  if (a.reasoningBudget != null) argv.push('--reasoning-budget', String(a.reasoningBudget));

  // T002579 — Sampling. Bis hierher setzte kein Loadout Sampling-Parameter, es
  // galten also stillschweigend die llama.cpp-Defaults (temp 0.8, top-k 40).
  // Das war kein Entschluss, sondern eine Luecke: die Modellkarten nennen fuer
  // Gemma 4 abweichende, kalibrierte Werte. Wie ueberall hier gilt: nur was
  // NICHT null ist, erzeugt ein Argument — Loadouts ohne diese Felder behalten
  // exakt ihre bisherige Kommandozeile.
  if (a.temperature != null) argv.push('--temp', String(a.temperature));
  if (a.topP != null) argv.push('--top-p', String(a.topP));
  if (a.topK != null) argv.push('--top-k', String(a.topK));

  // T002579 — Chat-Template-Argumente, insbesondere enable_thinking.
  //
  // BEWUSST NICHT ueber 'a.reasoning' abgebildet, obwohl es verwandt aussieht:
  // '-rea' steuert, ob llama-server reasoning_content PARST und ausliefert.
  // 'enable_thinking' ist ein Argument des CHAT-TEMPLATES und entscheidet, ob
  // das Modell ueberhaupt denkt. Zwei Ebenen — ein gemeinsames Feld wuerde
  // einen der beiden Namen zur Luege machen.
  //
  // Serialisierung hier statt in der Konfiguration: der Wert steht in
  // loadouts.json als echtes Objekt, damit ihn niemand von Hand escapen muss.
  if (a.chatTemplateKwargs != null) {
    argv.push('--chat-template-kwargs', JSON.stringify(a.chatTemplateKwargs));
  }

  // D2: Vision tower. Resolved path from caller beats raw loadout value.
  const mmproj = resolved.mmprojPath ?? a.mmprojPath ?? null;
  if (mmproj != null) argv.push('--mmproj', mmproj);
  const s = loadout.speculative ?? {};
  // D2: local draft path beats HF repo
  const draftPath = resolved.draftModelPath ?? s.draftModelPath ?? null;
  if (draftPath != null) argv.push('--spec-draft-model', draftPath);
  else if (s.draftHfRepo != null) argv.push('--spec-draft-hf', s.draftHfRepo);
  if (s.draftNgl != null) argv.push('-ngld', String(s.draftNgl));

  if (loadout.mcp?.serversConfig != null) argv.push('--mcp-servers-config', loadout.mcp.serversConfig);
  if (loadout.uiConfigFile != null) argv.push('--ui-config-file', loadout.uiConfigFile);

  // T002550 — Eingebaute Tools (edit_file, write_file, grep_search,
  // exec_shell_command …). Sie sind KEINE MCP-Tools: kein MCP-Server im Repo
  // bietet Dateibearbeitung an, llama-server bringt sie selbst mit und schaltet
  // sie nur ueber dieses Flag frei.
  //
  // ACHTUNG, kein Detail: llama.cpp kennt weder Sandbox noch
  // Wurzelverzeichnis-Beschraenkung. Mit 'all' laeuft exec_shell_command mit
  // den Rechten der Unit ueber das gesamte Benutzerverzeichnis — einschliesslich
  // ~/.ssh, ~/.config und der git-crypt-entschluesselten Secrets im Repo. Das
  // Feld bleibt deshalb OPTIONAL und wird bewusst pro Loadout gesetzt, nie global.
  //
  // Nebenwirkung laut upstream: --tools begrenzt --cors-origins standardmaessig
  // auf localhost. Fuer unseren Fall folgenlos, weil WebUI und alle acht
  // MCP-Endpunkte auf loopback liegen.
  if (loadout.tools != null) argv.push('--tools', String(loadout.tools));

  // T002426: GEGENRICHTUNG zu --mcp-servers-config. Jenes Flag macht llama-server
  // zum MCP-*Client* (das Modell ruft fremde Tools). --ui-mcp-proxy betrifft die
  // Web-UI: ohne das Flag verbindet der BROWSER direkt zum eingetragenen
  // MCP-Server und scheitert an einem lokalen Server ohne CORS-Header; mit dem
  // Flag verbindet llama-server serverseitig. Voraussetzung dafuer, dass der
  // bge-Shim in der UI ueberhaupt eintragbar ist.
  if (a.uiMcpProxy) argv.push('--ui-mcp-proxy');

  // Der Alias ist der Slug: damit taucht das Loadout unter seinem eigenen Namen
  // in /v1/models auf und ist ohne Zuordnungstabelle anfragbar.
  argv.push('--alias', loadout.slug);

  return argv.concat(loadout.extraArgs ?? []);
}

/**
 * T002555 — systemd-Hardening fuer die llama-Unit.
 *
 * Die eingebauten llama-Tools (write_file, edit_file, exec_shell_command; via
 * `tools` im Loadout) laufen IM llama-server-Prozess — nicht im
 * Factory-Sandbox-Container. Die Sandbox aus T002483 umschliesst den Agenten,
 * nicht den Inferenzserver; fuer diese Tools ist sie die falsche Ebene. Ohne das
 * Hardening hier haette das Modell die vollen Rechte des Benutzers, ~/.ssh und
 * die git-crypt-entschluesselten Secrets eingeschlossen.
 *
 * ProtectHome=tmpfs blendet /home komplett aus; erreichbar bleibt nur, was
 * unten ausdruecklich zurueckgebunden wird. /dev und /usr sind davon unberuehrt,
 * die GPU (unter WSL /dev/dxg, NICHT /dev/nvidia*) bleibt also erreichbar —
 * gemessen an der laufenden Unit, die zur Laufzeit genau /dev/dxg und
 * /usr/lib/wsl/drivers/… offen haelt.
 *
 * Das fuehrende '-' ist Pflicht, nicht Stil: BindReadOnlyPaths auf einen
 * fehlenden Pfad laesst die Unit mit 226/NAMESPACE scheitern, BEVOR das Modell
 * startet, und meldet das als "Failed to set up mount namespacing" — was nicht
 * nach Konfigurationsfehler aussieht. Genau das passierte im Test mit
 * ~/.config/llama-cpp: das Verzeichnis entsteht erst, wenn ein Loadout mit
 * uiConfigFile startet, existiert also bei den uebrigen gar nicht.
 *
 * Pfade ausserhalb /home (z.B. die zweite Modellwurzel unter /mnt/c) sind von
 * ProtectHome nicht betroffen und bleiben erreichbar. Eine Isolation gegen den
 * Windows-Dateibaum waere ein eigener Vorgang.
 */
export function buildHardeningProperties(loadout, modelPath, binPath, repoRoot = REPO_ROOT) {
  const dirOf = (p) => (typeof p === 'string' && p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : null);

  // Das Binary allein reicht NICHT: llama-server laedt libllama-server-impl.so
  // aus einem lib/ NEBEN bin/. Wird nur bin/ zurueckgebunden, startet der
  // Prozess und stirbt sofort mit
  //   "error while loading shared libraries: libllama-server-impl.so"
  // (Status 127) — im Live-Test genau so beobachtet. Gebunden wird deshalb die
  // Installationswurzel, also die Ebene ueber bin/.
  //
  // BEIDE Pfade, wenn die Installationswurzel ein Symlink ist (~/opt/llama-current
  // zeigt auf die konkrete Build-Version). Nur das Ziel zu binden reicht nicht:
  // der ExecStart nennt weiterhin den Symlink-Pfad, und der existiert im tmpfs
  // dann nicht mehr — die Unit stirbt mit 203/EXEC, bevor sie eine Zeile
  // protokolliert. Auch das im Live-Test genau so beobachtet.
  const binDir = dirOf(binPath);
  const installRoot = binDir && binDir.endsWith('/bin') ? dirOf(binDir) : binDir;
  let resolvedRoot = null;
  try {
    if (installRoot) {
      const real = realpathSync(installRoot);
      if (real !== installRoot) resolvedRoot = real;
    }
  } catch { /* Pfad existiert nicht — das '-'-Praefix faengt es ab */ }

  const readOnly = [installRoot, resolvedRoot, dirOf(modelPath), dirOf(loadout.uiConfigFile)];

  return [
    '--property=ProtectHome=tmpfs',
    '--property=PrivateTmp=yes',
    '--property=NoNewPrivileges=yes',
    ...readOnly.filter(Boolean).map((p) => `--property=BindReadOnlyPaths=-${p}`),
    // Schreibend, damit write_file/edit_file ihren Zweck behalten. Die Secrets
    // darin bleiben ausgespart — InaccessiblePaths gilt AUCH innerhalb eines
    // BindPaths, im Test verifiziert.
    `--property=BindPaths=-${repoRoot}`,
    `--property=InaccessiblePaths=-${repoRoot}/environments/.secrets`,
  ];
}

export function buildStartCommand(loadout, modelPath, defaults, binPath, resolved = {}) {
  return [
    'systemd-run', '--user',
    `--unit=${unitName(loadout.slug)}`,
    // --collect: ohne das Flag bleibt eine fehlgeschlagene transiente Unit im
    // Zustand 'failed' stehen und blockiert den Unit-Namen -- der naechste
    // Startversuch scheitert dann mit "unit already exists", obwohl nichts laeuft.
    '--collect',
    // D3: systemd restart properties. MUST be before '--' separator.
    '--property=Restart=on-failure',
    '--property=RestartSec=5',
    ...buildHardeningProperties(loadout, modelPath, binPath),
    // T002538: Umgebungsvariablen der Unit. Ebenfalls VOR dem '--' — danach
    // gaeben sie systemd-run als Argumente an das Binary weiter, das sie nicht
    // kennt und mit unbekannter Option abbricht.
    ...Object.entries(loadout.env ?? {}).map(([k, v]) => `--property=Environment=${k}=${v}`),
    `--description=llama.cpp loadout ${loadout.slug}`,
    '--',
    binPath,
    ...buildServerArgv(loadout, modelPath, defaults, resolved),
  ];
}

/**
 * T002549 — Erzeugt die Datei, auf die `--ui-config-file` zeigt.
 *
 * T002544 lieferte das Flag (buildServerArgv) und den Generator, aber keinen
 * Aufruf: `--ui-config-file` zeigte auf einen Pfad, den niemand schrieb. Der
 * Aufruf gehoert hierher und nicht in eine handgepflegte systemd-Unit — so
 * wirkt er automatisch fuer jedes kuenftige Loadout mit dem Feld, und die
 * Logik bleibt im Repo statt auf dem Host.
 *
 * Best-effort mit Absicht: schlaegt das Rendern fehl (z.B. weil BGE_MCP_TOKEN
 * fehlt), soll der Modellstart trotzdem laufen. Ein Server ohne vorbelegte
 * MCP-Liste ist brauchbar, ein nicht startender Server nicht. Der Fehler wird
 * laut protokolliert, nicht verschluckt.
 *
 * @param {{slug?: string, uiConfigFile?: string|null}} loadout
 */
export function ensureUiConfigRendered(loadout) {
  if (!loadout || !loadout.uiConfigFile) return;
  try {
    generateUiConfigSeed({ outputPath: loadout.uiConfigFile });
  } catch (err) {
    console.error(
      `[runner] ui-config seed for '${loadout.slug}' not written: ${err.message}\n` +
      `  Der Server startet ohne vorbelegte MCP-Liste; die WebUI faellt auf den Browser-Storage zurueck.`,
    );
  }
}

export function startUnit(loadout, modelPath, defaults, binPath, resolved = {}) {
  ensureUiConfigRendered(loadout);
  const [cmd, ...args] = buildStartCommand(loadout, modelPath, defaults, binPath, resolved);
  execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
}

export function stopUnit(slug) {
  execFileSync('systemctl', ['--user', 'stop', unitName(slug)], { encoding: 'utf8', stdio: 'pipe' });
}

export function unitStatus(slug) {
  try {
    const out = execFileSync('systemctl',
      ['--user', 'show', unitName(slug), '--property=ActiveState,SubState,LoadState'],
      { encoding: 'utf8', stdio: 'pipe' });
    const kv = Object.fromEntries(out.trim().split('\n').map((l) => l.split('=')));
    return {
      exists: kv.LoadState !== 'not-found',
      active: kv.ActiveState ?? 'unknown',
      sub: kv.SubState ?? 'unknown',
    };
  } catch {
    return { exists: false, active: 'unknown', sub: 'unknown' };
  }
}

export function recentLogs(slug, lines = 30) {
  try {
    return execFileSync('journalctl',
      ['--user', '-u', unitName(slug), '-n', String(lines), '--no-pager'],
      { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    return `journalctl nicht verfuegbar: ${err.message}`;
  }
}
