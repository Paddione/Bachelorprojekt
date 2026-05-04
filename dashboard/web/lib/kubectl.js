'use strict';

const { spawn } = require('child_process');

const VERBS      = new Set(['get', 'logs']);
const RESOURCES  = new Set(['pods', 'services', 'ingress', 'ingressroutes', 'applications', 'jobs']);
const NAMESPACES = new Set(['workspace', 'argocd']);
const CONTEXTS   = new Set(['mentolder', 'korczewski']);

const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

function validateRequest({ context, verb, resource, namespace, name }) {
  if (!CONTEXTS.has(context))     return { ok: false, error: `unknown context ${context}` };
  if (!VERBS.has(verb))           return { ok: false, error: `unknown verb ${verb}` };
  if (!RESOURCES.has(resource))   return { ok: false, error: `unknown resource ${resource}` };
  if (!NAMESPACES.has(namespace)) return { ok: false, error: `unknown namespace ${namespace}` };
  if (name !== undefined && !SAFE_NAME.test(String(name))) {
    return { ok: false, error: 'invalid name' };
  }
  return { ok: true };
}

const KORCZEWSKI_KUBECONFIG = process.env.KORCZEWSKI_KUBECONFIG_PATH
  || '/var/run/dashboard/kubeconfig-korczewski';

function buildArgs({ context, verb, resource, namespace, name }) {
  const args = [];
  if (context === 'korczewski') args.push(`--kubeconfig=${KORCZEWSKI_KUBECONFIG}`);
  args.push('-n', namespace);
  if (verb === 'get') {
    args.push('get', resource, '-o', 'json');
    if (name) args.push(name);
  } else {
    args.push('logs', name, '--tail=200');
  }
  return args;
}

function runReadonly(req, { timeoutMs = 8000 } = {}) {
  const v = validateRequest(req);
  if (!v.ok) return Promise.reject(new Error(v.error));
  return new Promise((resolve, reject) => {
    const proc = spawn('kubectl', buildArgs(req), { shell: false });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} reject(new Error('kubectl timeout')); }, timeoutMs);
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`kubectl exited ${code}: ${stderr.trim().slice(0, 500)}`));
    });
    proc.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

module.exports = { validateRequest, runReadonly };
