/**
 * tools/dsh/index.js — Bundle entry point for Bachelorprojekt DSH bundle.
 *
 * Autoloads all plugins from plugins/*.mjs at boot time. An empty or missing
 * plugins/ directory is NOT an error — this allows the bundle to boot at any
 * intermediate state while p3/p4 write their plugins. The cordis.patch.yml
 * rows reference this entry and the cc-hooks bridge; this file ensures that
 * any plugin file present is mounted without requiring patch changes.
 *
 * Convention: each plugin exports { name, inject?, setup(ctx) }.
 */
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginsDir = join(__dirname, 'plugins')

export const name = 'dsh-bachelorprojekt'

export async function apply(ctx) {
  let entries
  try {
    entries = await readdir(pluginsDir)
  } catch {
    // plugins/ directory missing — no plugins to mount, not an error.
    return
  }

  for (const entry of entries) {
    if (!entry.endsWith('.mjs')) continue
    try {
      const mod = await import(join(pluginsDir, entry))
      if (typeof mod.apply === 'function' || typeof mod === 'function') {
        ctx.plugin(mod)
      }
    } catch (err) {
      console.error(`[dsh-bachelorprojekt] failed to load plugin ${entry}:`, err.message)
    }
  }
}
