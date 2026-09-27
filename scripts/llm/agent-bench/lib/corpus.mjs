/**
 * Trainings-Korpus aus agent-bench-Laeufen (Task 6.3).
 *
 * Harte Regel: **nur `split: train`**. Eval-Faelle sind das Messgeraet und
 * duerfen niemals in SFT- oder Preference-Daten wandern, sonst ist der
 * spaetere Trainingslauf auf demselben Material evaluiert wie der Report.
 *
 * "Saubere" Trajektorie: `outcome === 1 && errors === 0 && detours === 0`.
 * Alles andere wandert nach `gaps.json` — und bei vorhandener sauberer
 * Trajektorie nicht in `sft.jsonl`.
 *
 * Ausgaben in `outDir`:
 *   sft.jsonl          eine Zeile je (Variante, Rolle) mit sauberer Trajektorie
 *   preferences.jsonl  eine Zeile je (Variante, Rolle) mit unterschiedlichen Scores
 *   gaps.json          (Variante, Rolle) ohne saubere Trajektorie
 *   images/            kopierte Bilddateien (Spuren behalten `image_ref`)
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { loadRun } from './report.mjs';

const readJsonl = (file) => {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const writeJsonl = (file, rows) => writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));

const value = (run) => Number(run.score?.score ?? 0);
const tokens = (run) => Number(run.usage?.total_tokens ?? run.score?.effort?.total_tokens ?? 0);
const isClean = (run) => run.score?.outcome === 1 && (run.score?.errors ?? 0) === 0 && (run.score?.detours ?? 0) === 0;

/** Traegende Prompts und Antwort aus einem Recorder-Trace. */
export function trajectory(run) {
  const lines = readJsonl(run.trace);
  if (!lines.length) return null;
  const last = lines[lines.length - 1];
  const prompt = last.request?.messages || [];
  const tools = last.request?.tools || [];
  const answer = last.response?.message || null;
  return { prompt, tools, answer, turns: lines.length, images: last.images || [] };
}

/** Trajektorien aller Laeufe eines Knotens `(case, variant, role, model, rep)`. */
function collect(runDirs) {
  const nodes = new Map();
  for (const runDir of runDirs) {
    const loaded = loadRun(runDir);
    for (const run of loaded.runs) {
      const split = run.split || loaded.cases.get(run.case)?.split || null;
      if (run.infra_error || !run.score) continue;
      const key = `${run.case}|${run.variant}|${run.role}`;
      if (!nodes.has(key)) nodes.set(key, []);
      nodes.get(key).push({ ...run, split, loaded });
    }
  }
  return nodes;
}

/** Task 6.3 — schreibt `sft.jsonl`, `preferences.jsonl`, `gaps.json`, `images/`. */
export function exportCorpus(runDirs, outDir) {
  const nodes = collect(Array.isArray(runDirs) ? runDirs : [runDirs]);
  mkdirSync(join(outDir, 'images'), { recursive: true });

  const sft = [];
  const preferences = [];
  const gaps = [];
  let evalSkipped = 0;

  for (const key of [...nodes.keys()].sort()) {
    const all = nodes.get(key);
    const train = all.filter((r) => r.split === 'train');
    evalSkipped += all.length - train.length;
    if (!train.length) continue;
    const [idCase, idVariant, idRole] = key.split('|');
    const clean = train.filter(isClean).sort((a, b) => value(b) - value(a) || tokens(a) - tokens(b));
    const best = clean[0] || null;
    const meta = {
      case: idCase,
      source_ref: best?.source_ref || train[0].loaded.cases.get(idCase)?.source_ref || null,
      perspective: best?.perspective || null,
      role: idRole,
      model: best?.model || null,
      scoring_version: best?.score?.scoring_version || null,
      run_id: best ? basename(best.dir) : null,
    };

    if (best) {
      const traj = trajectory(best);
      if (traj) {
        sft.push({
          messages: [...traj.prompt, traj.answer].filter(Boolean),
          tools: traj.tools,
          meta: { ...meta, variant: idVariant, turns: traj.turns, tokens: tokens(best) },
        });
        copyImages(traj, best, outDir);
      }
    } else {
      gaps.push({ case: idCase, variant: idVariant, role: idRole, reason: 'keine saubere Trajektorie' });
    }

    const ranked = [...train].sort((a, b) => value(b) - value(a));
    const worst = ranked[ranked.length - 1];
    if (best && worst && best !== worst && value(best) !== value(worst)) {
      const good = trajectory(best);
      const bad = trajectory(worst);
      if (good && bad) {
        preferences.push({
          prompt_messages: good.prompt,
          chosen: good.answer,
          rejected: bad.answer,
          meta: { ...meta, variant: idVariant, chosen_score: value(best), rejected_score: value(worst) },
        });
      }
    }
  }

  writeJsonl(join(outDir, 'sft.jsonl'), sft);
  writeJsonl(join(outDir, 'preferences.jsonl'), preferences);
  writeJsonl(join(outDir, 'gaps.json'), gaps);
  return { outDir, sft: sft.length, preferences: preferences.length, gaps: gaps.length, evalSkipped };
}

/** Kopiert die Bilddateien einer Trajektorie nach `outDir/images/`. */
function copyImages(traj, run, outDir) {
  for (const image of traj.images || []) {
    if (!image?.file) continue;
    const src = join(run.dir, image.file);
    if (!existsSync(src)) continue;
    const dest = join(outDir, 'images', `${image.sha256 || 'img'}${basename(src).slice(basename(src).lastIndexOf('.'))}`);
    if (!existsSync(dest)) copyFileSync(src, dest);
  }
}

/** Bildverweise in `sft.jsonl` auf den Korpus-Ordner zeigen lassen. */
export function imageRef(sha256) {
  return { image_ref: `images/${sha256}` };
}
