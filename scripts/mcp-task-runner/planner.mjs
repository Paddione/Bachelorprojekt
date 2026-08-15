import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

export class CyclicDependencyError extends Error {
  constructor(message = 'cyclic dependency detected') {
    super(message);
    this.name = 'CyclicDependencyError';
  }
}

/**
 * Parses the project's Taskfile dependency graph.
 * 1. Runs `task --taskfile <root> --list-all --json` to discover the task universe.
 * 2. Extracts dependencies directly from the YAML source files (resolving `includes:` namespaces).
 *
 * @param {string} taskfilePath
 * @returns {Record<string, string[]>} Graph mapping taskName -> deps[]
 */
export function parseTaskfileDAG(taskfilePath) {
  const rootAbs = path.resolve(taskfilePath);

  let out;
  try {
    out = execFileSync('task', ['--taskfile', rootAbs, '--list-all', '--json'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(`task --list-all --json failed: ${err.message}`);
  }

  let taskList;
  try {
    taskList = JSON.parse(out);
  } catch (err) {
    throw new Error(`failed to parse task --list-all --json output: ${err.message}`);
  }

  const tasks = Array.isArray(taskList.tasks) ? taskList.tasks : [];
  const namespaces = resolveIncludes(rootAbs);
  const filePrefixes = invertIncludes(namespaces);

  const fileDepsCache = new Map();
  function getDepsForFile(filePath) {
    if (fileDepsCache.has(filePath)) {
      return fileDepsCache.get(filePath);
    }
    const deps = depsForFile(filePath);
    fileDepsCache.set(filePath, deps);
    return deps;
  }

  const graph = {};
  for (const t of tasks) {
    const taskName = t.name;
    const taskfileLoc = t.location?.taskfile ? path.resolve(t.location.taskfile) : rootAbs;
    const fileDeps = getDepsForFile(taskfileLoc);
    const prefixes = filePrefixes.get(taskfileLoc) || [];
    const relName = stripPrefixes(taskName, prefixes);
    const deps = fileDeps[relName] || [];
    graph[taskName] = deps;
  }

  return graph;
}

/**
 * Resolves the `includes:` section of the root Taskfile.
 * Maps namespace -> absolute path of included taskfile.
 */
function resolveIncludes(rootTaskfile) {
  const content = fs.readFileSync(rootTaskfile, 'utf8');
  const doc = yaml.parse(content) || {};
  const includes = doc.includes || {};
  const nsMap = {};

  for (const [name, val] of Object.entries(includes)) {
    let incPath = typeof val === 'string' ? val : val?.taskfile;
    if (!incPath) continue;
    if (!path.isAbsolute(incPath)) {
      incPath = path.join(path.dirname(rootTaskfile), incPath);
    }
    nsMap[name] = path.resolve(incPath);
  }

  return nsMap;
}

/**
 * Maps absolute taskfile path -> array of namespace prefixes.
 */
function invertIncludes(namespaces) {
  const inv = new Map();
  for (const [ns, p] of Object.entries(namespaces)) {
    const abs = path.resolve(p);
    if (!inv.has(abs)) {
      inv.set(abs, []);
    }
    inv.get(abs).push(ns);
  }
  return inv;
}

/**
 * Strips matching namespace prefix from a full task name.
 */
function stripPrefixes(name, prefixes) {
  for (const p of prefixes) {
    if (name.startsWith(p + ':')) {
      return name.slice(p.length + 1);
    }
  }
  return name;
}

/**
 * Parses one Taskfile YAML source and returns relative task names -> deps.
 */
function depsForFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Taskfile not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.parse(content) || {};
  const tasks = doc.tasks || {};
  const depsMap = {};

  function walk(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}:${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('deps' in v) {
          depsMap[full] = toStringSlice(v.deps);
        } else {
          walk(v, full);
        }
      }
    }
  }

  walk(tasks, '');
  return depsMap;
}

function toStringSlice(v) {
  if (!v) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) {
    return v.map((item) => (typeof item === 'string' ? item : item?.task)).filter(Boolean);
  }
  return [];
}

/**
 * Applies Kahn's topological sort to group requested tasks into parallel execution stages.
 *
 * @param {Record<string, string[]>} graph
 * @param {Array<{task: string, env: string}>} taskRequests
 * @returns {{ groups: Array<{ tasks: Array<{ task: string, env: string }> }> }}
 */
export function schedule(graph, taskRequests) {
  const nameToIdx = new Map();
  for (let i = 0; i < taskRequests.length; i++) {
    const t = taskRequests[i];
    if (!nameToIdx.has(t.task)) {
      nameToIdx.set(t.task, []);
    }
    nameToIdx.get(t.task).push(i);
  }

  const n = taskRequests.length;
  const inDegree = new Array(n).fill(0);
  const adj = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    const t = taskRequests[i];
    const deps = graph[t.task] || [];
    for (const dep of deps) {
      const parentIndices = nameToIdx.get(dep) || [];
      for (const j of parentIndices) {
        if (j === i) continue;
        inDegree[i]++;
        adj[j].push(i);
      }
    }
  }

  const queue = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) {
      queue.push(i);
    }
  }

  const plan = { groups: [] };
  let processed = 0;

  let currentQueue = queue;
  while (currentQueue.length > 0) {
    const group = {
      tasks: currentQueue.map((idx) => taskRequests[idx]),
    };
    plan.groups.push(group);
    processed += currentQueue.length;

    const nextQueue = [];
    for (const i of currentQueue) {
      for (const j of adj[i]) {
        inDegree[j]--;
        if (inDegree[j] === 0) {
          nextQueue.push(j);
        }
      }
    }
    currentQueue = nextQueue;
  }

  if (processed !== n) {
    throw new CyclicDependencyError();
  }

  return plan;
}

export function sanitizeID(name) {
  return name.replace(/[:.\-/]/g, '_');
}

/**
 * Converts graph to Mermaid graph TD string.
 */
export function graphToMermaid(graph) {
  const nodes = Object.keys(graph).sort();
  const lines = ['graph TD'];

  for (const name of nodes) {
    const id = sanitizeID(name);
    lines.push(`  ${id}["${name}"]`);
  }

  for (const name of nodes) {
    const deps = [...(graph[name] || [])].sort();
    const toID = sanitizeID(name);
    for (const dep of deps) {
      const fromID = sanitizeID(dep);
      lines.push(`  ${fromID} --> ${toID}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Converts graph to JSON string { nodes: string[], edges: Array<{from: string, to: string}> }.
 */
export function graphToJSON(graph) {
  const nodes = Object.keys(graph).sort();
  const edges = [];

  for (const name of nodes) {
    const deps = [...(graph[name] || [])].sort();
    for (const dep of deps) {
      edges.push({ from: dep, to: name });
    }
  }

  return JSON.stringify({ nodes, edges });
}
