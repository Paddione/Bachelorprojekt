'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Only these task commands can be triggered from the dashboard
const ALLOWED_COMMANDS = new Set([
  'hooks:install',
  'env:validate:all', 'env:init', 'env:validate', 'env:show', 'env:generate', 'env:seal',
  'cluster:create', 'cluster:start', 'cluster:stop', 'cluster:status', 'cluster:delete',
  'ha:status',
  'up', 'down',
  'workspace:preflight', 'workspace:validate', 'workspace:up',
  'workspace:deploy', 'workspace:status', 'workspace:office:deploy',
  'workspace:post-setup', 'workspace:talk-setup', 'keycloak:sync',
  'workspace:logs', 'workspace:restart', 'workspace:check-connectivity',
  'workspace:backup', 'workspace:backup:list', 'workspace:restore',
  'workspace:teardown',
  'workspace:create-guest', 'workspace:import-users', 'workspace:migrate',
  'argocd:setup', 'argocd:status', 'argocd:apps:apply',
  'mcp:deploy', 'mcp:status', 'claude-code:setup',
  'website:deploy', 'website:build', 'website:status', 'website:dev',
  'test:all', 'test:unit', 'test:manifests',
]);

// These go-task commands have `prompt:` and need --yes to avoid blocking on stdin
const PROMPT_COMMANDS = new Set(['cluster:delete', 'workspace:teardown', 'down']);

const VALID_ENV = /^(dev|mentolder|korczewski)$/;

function isArgSafe(arg) {
  if (typeof arg !== 'string' || arg.length > 64) return false;
  if (arg === '--') return true;
  if (/^ENV=(dev|mentolder|korczewski)$/.test(arg)) return true;
  if (/^(dev|mentolder|korczewski)$/.test(arg)) return true;
  if (/^(cluster|business)$/.test(arg)) return true;
  if (/^(all|keycloak|nextcloud|vaultwarden|website|docuseal)$/.test(arg)) return true;
  // service names and general identifiers (alphanumeric + dash, no shell chars)
  if (/^[a-z][a-z0-9-]{0,31}$/.test(arg)) return true;
  // timestamps: digits, dashes, underscores, colons, T only
  if (/^[\dT:\-_]{8,30}$/.test(arg)) return true;
  return false;
}

let activeProcess = null;

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('run-task', ({ command, args = [], envVars = {} }) => {
    if (activeProcess) {
      socket.emit('log', { type: 'error', data: '\n[Dashboard] A task is already running. Please wait or stop it.\n' });
      return;
    }

    if (typeof command !== 'string' || !ALLOWED_COMMANDS.has(command)) {
      socket.emit('log', { type: 'error', data: `\n[Dashboard] Command not allowed: ${String(command).slice(0, 64)}\n` });
      return;
    }

    const cleanArgs = Array.isArray(args) ? args.slice(0, 8) : [];
    for (const arg of cleanArgs) {
      if (!isArgSafe(arg)) {
        socket.emit('log', { type: 'error', data: `\n[Dashboard] Invalid argument: "${String(arg).slice(0, 64)}"\n` });
        return;
      }
    }

    // Only inherit safe ENV from envVars; never allow arbitrary env injection
    const safeEnv = { ...process.env };
    if (typeof envVars?.ENV === 'string' && VALID_ENV.test(envVars.ENV)) {
      safeEnv.ENV = envVars.ENV;
    }

    // Pass --yes for tasks that have go-task `prompt:` so they don't block on stdin
    const taskFlags = PROMPT_COMMANDS.has(command) ? ['--yes'] : [];
    const spawnArgs = [...taskFlags, command, ...cleanArgs];

    socket.emit('log', { type: 'info', data: `\n[Dashboard] Starting: task ${command} ${cleanArgs.join(' ')}\n` });

    // No shell:true — each arg is a distinct element, no shell metacharacter expansion
    activeProcess = spawn('task', spawnArgs, {
      env: safeEnv,
      cwd: path.join(__dirname, '..'),
    });

    activeProcess.stdout.on('data', (data) => socket.emit('log', { type: 'stdout', data: data.toString() }));
    activeProcess.stderr.on('data', (data) => socket.emit('log', { type: 'stderr', data: data.toString() }));

    activeProcess.on('close', (code) => {
      socket.emit('log', { type: code === 0 ? 'success' : 'error', data: `\n[Dashboard] Task finished with code ${code}\n` });
      activeProcess = null;
      socket.emit('task-finished', { code });
    });

    activeProcess.on('error', (err) => {
      socket.emit('log', { type: 'error', data: `\n[Dashboard] Process error: ${err.message}\n` });
      activeProcess = null;
      socket.emit('task-finished', { code: 1 });
    });
  });

  socket.on('stop-task', () => {
    if (activeProcess) {
      socket.emit('log', { type: 'info', data: '\n[Dashboard] Stopping task...\n' });
      const proc = activeProcess;
      activeProcess = null;
      proc.kill('SIGTERM');
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 3000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
