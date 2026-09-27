/**
 * Report und Regression-Gate des agent-bench.
 *
 * Beide Funktionen lesen ausschliesslich abgeschlossene Laeufe unterhalb von
 * `<runDir>` = `$AGENT_BENCH_RUNS/<run-id>/`:
 *
 *   <runDir>/manifest.json                       Lauf-Metadaten (siehe unten)
 *   <runDir>/cases/<case-id>/case.json           Snapshot der Fall-Definition
 *   <runDir>/runs/<fall>__<variante>__<rolle>__<modell>__<rep>/result.json
 *   <runDir>/runs/<…>/trace.jsonl                Recorder-Trace (JSONL)
 *
 * `result.json`:
 *   { case, variant, perspective, role, model, rep, split, source_ref,
 *     score: { scoring_version, outcome, errors, detours, effort, score, events },
 *     usage, infra_error?, reason? }
 *
 * `infra_error` truthy heisst: der Lauf hat das Modell nicht geprueft (Model
 * ladete nicht, GPU belegt, Kernel abgelehnt). Solche Laeufe landen NIE im
 * Score — sie wuerden sonst dem Modell die Schuld fuer die Infrastruktur geben.
 *
 * Matrix-Definition (Task 6.1):
 *   marginal(Rolle, Modell) = Mittel aller Laeufe dieser Zelle ohne infra_error
 *   zelle(A, B)             = mittel(kombination) - (marginalA + marginalB - gesamt)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MATRIX_PAIRS = [
  ['planner', 'code-worker'],
  ['code-worker', 'reviewer'],
];

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (v) => (v === null ? 'n/a' : v.toFixed(1));
const stdev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Laedt Manifest + alle `result.json` eines Laufs. */
export function loadRun(runDir) {
  const manifest = readJson(join(runDir, 'manifest.json')) || {};
  const runsDir = join(runDir, 'runs');
  const runs = [];
  if (existsSync(runsDir)) {
    for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(runsDir, entry.name);
      const result = readJson(join(dir, 'result.json'));
      if (!result) continue;
      runs.push({ ...result, dir, trace: join(dir, 'trace.jsonl') });
    }
  }
  runs.sort((a, b) => `${a.case}__${a.variant}__${a.role}__${a.model}`.localeCompare(`${b.case}__${b.variant}__${b.role}__${b.model}`));
  const cases = new Map();
  for (const c of manifest.cases || []) cases.set(c.id, c);
  return { runDir, manifest, runs, cases };
}

const splitOf = (loaded, run) => {
  if (run.split) return run.split;
  const snap = readJson(join(loaded.runDir, 'cases', String(run.case), 'case.json'));
  if (snap?.split) return snap.split;
  return loaded.cases.get(run.case)?.split || null;
};

const isInfra = (run) => Boolean(run.infra_error);
const value = (run) => Number(run.score?.score ?? 0);

/** Task 6.1 — Report als JSON + Markdown. */
/**
 * Markdown-Tabellenzelle sicher escapen: Backslash zuerst, dann Pipe, Zeilenumbrueche flach.
 * Ohne den Backslash-Schritt bricht ein Wert wie `a\|b` die Tabelle auf (`\\|` = literaler
 * Backslash gefolgt von einem unescapter Trenner) — CodeQL js/regex/incomplete-escaping [T900561].
 */
export function mdCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function buildReport(runDir) {
  const loaded = loadRun(runDir);
  const { manifest } = loaded;
  const scored = loaded.runs.filter((r) => !isInfra(r) && r.score);
  const infraRuns = loaded.runs.filter(isInfra);
  const overall = mean(scored.map(value));

  const marginal = new Map();
  for (const r of scored) {
    const key = `${r.role}|${r.model}`;
    if (!marginal.has(key)) marginal.set(key, []);
    marginal.get(key).push(value(r));
  }
  const marginals = [...marginal.entries()].map(([key, xs]) => {
    const [role, model] = key.split('|');
    return { role, model, mean: mean(xs), n: xs.length };
  });

  // In der Kette ist der Planner-Outcome das Mittel der `execute`-Outcomes:
  // der Planwert wird im Lauf bereits so gesetzt; hier nur nachvollziehbar halten.
  const cells = new Map();
  for (const r of scored) {
    const group = `${r.case}__${r.variant}__${r.rep ?? 0}`;
    if (!cells.has(group)) cells.set(group, []);
    cells.get(group).push(r);
  }

  const matrices = [];
  const findings = [];
  for (const [roleA, roleB] of MATRIX_PAIRS) {
    const keysA = marginals.filter((m) => m.role === roleA);
    const keysB = marginals.filter((m) => m.role === roleB);
    const rows = [];
    for (const a of keysA) {
      for (const b of keysB) {
        const paired = [];
        for (const group of cells.values()) {
          const ra = group.find((r) => r.role === a.role && r.model === a.model);
          const rb = group.find((r) => r.role === b.role && r.model === b.model);
          if (ra && rb) paired.push((value(ra) + value(rb)) / 2);
        }
        if (!paired.length) continue;
        const combo = mean(paired);
        rows.push({ a: a.model, b: b.model, combo, delta: combo - (a.mean + b.mean - overall) });
        const homogeneous = keysA
          .map((x) => keysB.find((y) => y.model === x.model))
          .filter(Boolean)
          .map((x) => x.mean)
          .filter((v) => v !== null);
        if (rows.length && homogeneous.length && combo > Math.max(...homogeneous)) {
          findings.push({
            roles: [roleA, roleB],
            models: [a.model, b.model],
            combo,
            best_homogeneous: Math.max(...homogeneous),
            delta: combo - Math.max(...homogeneous),
          });
        }
      }
    }
    matrices.push({ roles: [roleA, roleB], rows });
  }

  const json = {
    run_id: manifest.run_id || null,
    revision: manifest.revision || null,
    scoring_version: manifest.scoring_version || null,
    profile: manifest.profile || null,
    seed: manifest.seed ?? null,
    sampled: manifest.sampled ?? scored.length,
    repetitions: manifest.repetitions ?? 1,
    command: manifest.command || null,
    servers: manifest.servers || [],
    overall: overall,
    marginals,
    matrices,
    findings,
    infra_errors: infraRuns.map((r) => ({
      case: r.case, variant: r.variant, role: r.role, model: r.model, rep: r.rep ?? 0, reason: r.reason || r.infra_error,
    })),
    counts: { runs: loaded.runs.length, scored: scored.length, infra: infraRuns.length },
  };

  const lines = [];
  lines.push(`# agent-bench Report ${json.run_id || ''}`.trim());
  lines.push('');
  lines.push(`- Revision: \`${json.revision}\``);
  lines.push(`- Scoring-Version: \`${json.scoring_version}\``);
  lines.push(`- Profil: \`${json.profile}\` · Seed: \`${json.seed}\` · sampled: \`${json.sampled}\` · Reps: \`${json.repetitions}\``);
  lines.push(`- Laeufe: ${json.counts.runs} (bewertet ${json.counts.scored}, Infrastrukturfehler ${json.counts.infra})`);
  lines.push(`- Messbefehl: \`${json.command}\``);
  lines.push('');
  lines.push('## Server');
  lines.push('');
  lines.push('| Modell | Engine | Kommandozeile |');
  lines.push('| --- | --- | --- |');
  for (const s of json.servers) lines.push(`| ${mdCell(s.id)} | ${mdCell(s.engine)} | \`${mdCell(s.command || s.url || '')}\` |`);
  if (!json.servers.length) lines.push('| (keine) | | |');
  lines.push('');
  lines.push('## Marginal-Score je (Rolle, Modell)');
  lines.push('');
  lines.push('| Rolle | Modell | Score | n |');
  lines.push('| --- | --- | --- | --- |');
  for (const m of marginals) lines.push(`| ${m.role} | ${m.model} | ${fmt(m.mean)} | ${m.n} |`);
  lines.push('');
  for (const matrix of matrices) {
    lines.push(`## Kompatibilitaetsmatrix ${matrix.roles[0]} x ${matrix.roles[1]}`);
    lines.push('');
    lines.push(`| ${matrix.roles[0]} | ${matrix.roles[1]} | Score | Delta |`);
    lines.push('| --- | --- | --- | --- |');
    for (const row of matrix.rows) lines.push(`| ${row.a} | ${row.b} | ${fmt(row.combo)} | ${fmt(row.delta)} |`);
    if (!matrix.rows.length) lines.push(`| (keine Paarung) | | | |`);
    lines.push('');
  }
  lines.push('## Entdeckungen (besser als jede homogene Belegung)');
  lines.push('');
  if (json.findings.length) {
    for (const f of json.findings) {
      lines.push(`- ${f.roles.join(' x ')}: \`${f.models.join('` + `')}\` = ${fmt(f.combo)} > ${fmt(f.best_homogeneous)} (homogen bestes)`);
    }
  } else {
    lines.push('- keine');
  }
  lines.push('');
  lines.push('## Infrastrukturfehler (nicht im Score)');
  lines.push('');
  if (json.infra_errors.length) {
    lines.push('| Fall | Variante | Rolle | Modell | Rep | Grund |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const e of json.infra_errors) {
      lines.push(`| ${mdCell(e.case)} | ${mdCell(e.variant)} | ${mdCell(e.role)} | ${mdCell(e.model)} | ${e.rep} | ${mdCell(e.reason)} |`);
    }
  } else {
    lines.push('- keine');
  }
  lines.push('');
  return { json, markdown: lines.join('\n') };
}

/** Task 6.2 — Regression-Gate gegen einen Baseline-Lauf. */
export function gate(runDir, baselineDir) {
  const next = loadRun(runDir);
  const base = loadRun(baselineDir);
  const nextVersion = next.manifest.scoring_version || null;
  const baseVersion = base.manifest.scoring_version || null;
  if (nextVersion !== baseVersion) {
    return {
      ok: false,
      exit: 2,
      error: `scoring_version mismatch: neu=${nextVersion} baseline=${baseVersion} — Gate verweigert`,
      regressions: [],
    };
  }
  const nextEval = next.runs.filter((r) => splitOf(next, r) === 'eval' && !isInfra(r) && r.score);
  const baseEval = base.runs.filter((r) => splitOf(base, r) === 'eval' && !isInfra(r) && r.score);

  const byRoleVariant = (runs) => {
    const m = new Map();
    for (const r of runs) {
      const key = `${r.role}|${r.variant}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(value(r));
    }
    return m;
  };
  const nextMap = byRoleVariant(nextEval);
  const baseMap = byRoleVariant(baseEval);

  const roleScores = (runs, role) => mean(runs.filter((r) => r.role === role).map(value));
  // Schwelle = 2 x Stabw der *Wiederholungen* einer Zelle. Wiederholungen sind
  // gleiche (Rolle, Variante, Modell) ueber `rep` — verschiedene Modelle sind
  // KEINE Wiederholungen, sonst schluckt die Schwelle genau den Unterschied,
  // den das Gate melden soll.
  const cellNoise = (role) => {
    const cells = new Map();
    for (const r of baseEval) {
      if (r.role !== role) continue;
      const key = `${r.variant}|${r.model}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(value(r));
    }
    const spreads = [...cells.values()].filter((xs) => xs.length > 1).map(stdev);
    return spreads.length ? Math.max(...spreads) : 0;
  };
  const thresholds = new Map();
  for (const role of new Set(baseEval.map((r) => r.role))) {
    thresholds.set(role, Math.max(5, 2 * cellNoise(role)));
  }

  const deltas = [];
  for (const [key, xs] of nextMap) {
    const [role, variant] = key.split('|');
    const before = baseMap.get(key);
    if (!before) continue;
    deltas.push({ role, variant, delta: mean(xs) - mean(before) });
  }

  const regressions = [];
  for (const role of [...new Set(nextEval.map((r) => r.role))].sort()) {
    const threshold = thresholds.get(role) ?? 5;
    const drop = (roleScores(baseEval, role) ?? 0) - (roleScores(nextEval, role) ?? 0);
    if (drop > threshold) regressions.push({ role, delta: -drop, threshold });
  }
  return { ok: regressions.length === 0, exit: regressions.length ? 1 : 0, regressions, deltas, thresholds: [...thresholds] };
}
