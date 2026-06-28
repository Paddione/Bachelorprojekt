// scripts/docs-gen/discover.mjs
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, sep, basename } from 'node:path';

/**
 * @typedef {Object} SourceDoc
 * @property {'skill'|'agent'|'doc'} type
 * @property {'repo'|string} provenance        // 'repo' or '<plugin>@<version>'
 * @property {string} name                     // kebab-ish source name
 * @property {string} sourcePath               // absolute path
 * @property {string} raw                       // file contents
 */

// docs subtrees excluded from the published site: internal process artifacts,
// transient snapshots, and operational data not relevant to the dev workflow.
const DOC_EXCLUDE_PREFIXES = [
  join('docs', 'superpowers', 'specs'),   // brainstorming specs — internal, not published
  join('docs', 'superpowers', 'plans'),   // dated plan files — transient, archived after merge
  join('docs', 'agent-guide', 'maps'),    // grep-only repo maps (S3), not a published doc page
  join('docs', 'drift-reports'),          // operational drift snapshots
  join('docs', 'audits'),                 // audit log snapshots
];

/**
 * Classify a path as 'repo' provenance or '<plugin>@<version>'.
 * A plugin-cache path has shape: <pluginsRoot>/<marketplace>/<plugin>/<version>/...
 * The plugin is the segment after the marketplace dir; the version is the next segment.
 * @param {string} absPath
 * @param {string} pluginsRoot
 * @returns {'repo'|string}
 */
export function resolveProvenance(absPath, pluginsRoot) {
  if (!pluginsRoot) return 'repo';
  const rootNorm = pluginsRoot.endsWith(sep) ? pluginsRoot.slice(0, -1) : pluginsRoot;
  if (absPath !== rootNorm && !absPath.startsWith(rootNorm + sep)) return 'repo';
  const rel = absPath.slice(rootNorm.length + 1);
  const segs = rel.split(sep).filter(Boolean);
  // segs: [marketplace, plugin, version, ...]
  if (segs.length < 3) return 'repo';
  const plugin = segs[1];
  const version = segs[2];
  return `${plugin}@${version}`;
}

// Read a markdown/skill file into a SourceDoc.
async function makeSourceDoc(type, name, sourcePath, pluginsRoot) {
  const raw = await readFile(sourcePath, 'utf8');
  return {
    type,
    provenance: resolveProvenance(sourcePath, pluginsRoot),
    name,
    sourcePath,
    raw,
  };
}

// List direct child directories of `dir` (absolute paths). Returns [] if dir absent.
async function listDirs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(join(dir, e.name));
  }
  return out;
}

// List direct child *.md files of `dir` (absolute paths). Returns [] if dir absent.
async function listMdFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.md')) out.push(join(dir, e.name));
  }
  return out;
}

// Repo skills: .claude/skills/<name>/SKILL.md, plus superpowers/<sub>/SKILL.md (one deeper).
// Also: top-level *.md files directly under .claude/skills/ (e.g. OVERVIEW.md) render as 'doc'
// pages — they are index/overview content, not invokable per-skill SKILL.md files.
async function discoverRepoSkills(repoRoot, pluginsRoot) {
  const skillsRoot = join(repoRoot, '.claude', 'skills');
  const docs = [];
  for (const dir of await listDirs(skillsRoot)) {
    const name = basename(dir);
    if (name === 'superpowers') {
      for (const subDir of await listDirs(dir)) {
        const md = join(subDir, 'SKILL.md');
        if (existsSync(md)) docs.push(await makeSourceDoc('skill', basename(subDir), md, pluginsRoot));
      }
      continue;
    }
    const md = join(dir, 'SKILL.md');
    if (existsSync(md)) docs.push(await makeSourceDoc('skill', name, md, pluginsRoot));
  }
  for (const md of await listMdFiles(skillsRoot)) {
    docs.push(await makeSourceDoc('doc', basename(md, '.md'), md, pluginsRoot));
  }
  return docs;
}

// Repo agents: .claude/agents/*.md
async function discoverRepoAgents(repoRoot, pluginsRoot) {
  const agentsRoot = join(repoRoot, '.claude', 'agents');
  const docs = [];
  for (const md of await listMdFiles(agentsRoot)) {
    docs.push(await makeSourceDoc('agent', basename(md, '.md'), md, pluginsRoot));
  }
  return docs;
}

// Plugin skills & agents under <pluginsRoot>/<marketplace>/<plugin>/<version>/{skills|agents}.
async function discoverPluginSources(pluginsRoot) {
  const docs = [];
  if (!pluginsRoot || !existsSync(pluginsRoot)) {
    console.warn(`[discover] plugins root absent, skipping plugin sources: ${pluginsRoot}`);
    return docs;
  }
  for (const marketplaceDir of await listDirs(pluginsRoot)) {
    for (const pluginDir of await listDirs(marketplaceDir)) {
      for (const versionDir of await listDirs(pluginDir)) {
        // skills/<name>/SKILL.md
        const skillsRoot = join(versionDir, 'skills');
        for (const skillDir of await listDirs(skillsRoot)) {
          const md = join(skillDir, 'SKILL.md');
          if (existsSync(md)) docs.push(await makeSourceDoc('skill', basename(skillDir), md, pluginsRoot));
        }
        // agents/*.md
        const agentsRoot = join(versionDir, 'agents');
        for (const md of await listMdFiles(agentsRoot)) {
          docs.push(await makeSourceDoc('agent', basename(md, '.md'), md, pluginsRoot));
        }
      }
    }
  }
  return docs;
}

// Recursively collect docs/**/*.md, excluding the internal-process subtrees.
async function discoverDocs(repoRoot, pluginsRoot) {
  const docsRoot = join(repoRoot, 'docs');
  const docs = [];
  if (!existsSync(docsRoot)) return docs;

  const excluded = (absPath) =>
    DOC_EXCLUDE_PREFIXES.some((p) => {
      const full = join(repoRoot, p);
      return absPath === full || absPath.startsWith(full + sep);
    });

  async function walk(dir) {
    if (excluded(dir)) return;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile() && e.name.endsWith('.md') && !excluded(abs)) {
        docs.push(await makeSourceDoc('doc', basename(abs, '.md'), abs, pluginsRoot));
      }
    }
  }
  await walk(docsRoot);
  return docs;
}

/**
 * Discover all source types and return a deterministically sorted SourceDoc[].
 * @param {{ repoRoot: string, pluginsRoot: string, homeDir: string }} opts
 * @returns {Promise<SourceDoc[]>}
 */
export async function discoverSources({ repoRoot, pluginsRoot, homeDir }) {
  // homeDir is accepted for API symmetry with the caller; pluginsRoot is the
  // authoritative plugin-cache location and is used directly.
  void homeDir;
  const groups = await Promise.all([
    discoverRepoSkills(repoRoot, pluginsRoot),
    discoverRepoAgents(repoRoot, pluginsRoot),
    discoverPluginSources(pluginsRoot),
    discoverDocs(repoRoot, pluginsRoot),
  ]);
  const all = groups.flat();
  all.sort((a, b) =>
    a.type === b.type ? a.sourcePath.localeCompare(b.sourcePath) : a.type.localeCompare(b.type)
  );
  return all;
}
