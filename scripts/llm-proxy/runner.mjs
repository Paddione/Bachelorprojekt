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

export function unitName(slug) { return `llama-${slug}.service`; }

/** @returns {string[]} argv fuer llama-server, OHNE das Binary selbst */
export function buildServerArgv(loadout, modelPath, defaults) {
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

  const s = loadout.speculative ?? {};
  if (s.draftHfRepo != null) argv.push('--spec-draft-hf', s.draftHfRepo);
  if (s.draftNgl != null) argv.push('-ngld', String(s.draftNgl));

  if (loadout.mcp?.serversConfig != null) argv.push('--mcp-servers-config', loadout.mcp.serversConfig);

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

export function buildStartCommand(loadout, modelPath, defaults, binPath) {
  return [
    'systemd-run', '--user',
    `--unit=${unitName(loadout.slug)}`,
    // --collect: ohne das Flag bleibt eine fehlgeschlagene transiente Unit im
    // Zustand 'failed' stehen und blockiert den Unit-Namen -- der naechste
    // Startversuch scheitert dann mit "unit already exists", obwohl nichts laeuft.
    '--collect',
    `--description=llama.cpp loadout ${loadout.slug}`,
    '--',
    binPath,
    ...buildServerArgv(loadout, modelPath, defaults),
  ];
}

export function startUnit(loadout, modelPath, defaults, binPath) {
  const [cmd, ...args] = buildStartCommand(loadout, modelPath, defaults, binPath);
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
