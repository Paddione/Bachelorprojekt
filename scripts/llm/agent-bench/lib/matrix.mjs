// lib/matrix.mjs — Kombinationsmatrix, Stufen-Cache und Scheduler (p4).
// Node 22, nur Standardbibliothek, ESM. Reines Modul: kein Prozess, kein Netz.
//
// Auftrags-Modell: ein Job misst genau eine (Rolle, Modell)-Zelle und schreibt
// genau ein result.json (Schema: lib/report.mjs, Header-Kommentar dort).
// Verzeichnisname: <fall>__<variante>__<rolle>__<modell>__<rep>[__...]:
// Kettungs-Suffixe (__via-<plan>, __pair-<o>+<w>) erweitern den Namen, der
// Report gruppiert weiterhin nach Fall/Variante/Rep und bleibt kompatibel.

export const STAGES = Object.freeze(['plan', 'execute', 'review']);

// Produktions-Baseline fuer das quick-Profil: Planer/Orchestrator qwen38-27b,
// Worker qwen35-4b. Wird nur aufgenommen, wenn beide Modelle gewaehlt sind.
export const BASELINE = Object.freeze({
  planner: 'qwen38-27b',
  orch: 'qwen38-27b',
  worker: 'qwen35-4b',
  reviewer: 'qwen38-27b',
});

export const DEFAULT_MAX_JOBS = 400;

/** Deterministischer PRNG (mulberry32) fuer die Stichprobe. */
export function mulberry32(seed) {
  let a = Number(seed) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const byId = (pool, id) => pool.models.find((m) => m.id === id);

function needFor(role) {
  if (role === 'vision-worker') return 'vision';
  return 'tools';
}

/** Modelle aus `ids`, die `role` nach Capabilities bedienen koennen. */
export function capableModels(pool, role, ids) {
  const need = needFor(role);
  return ids.filter((id) => {
    const m = byId(pool, id);
    return m && (m.capabilities || []).includes(need);
  });
}

/**
 * Residenz-Regel: zwei Modelle duerfen ein Execute-Paar bilden, wenn sie
 * gleichzeitig resident sein koennen — dasselbe Modell, verschiedene GPUs
 * oder mindestens ein Remote-Modell (API braucht keine GPU).
 */
export function coResident(pool, a, b) {
  if (!a || !b || a === b) return true;
  const ga = byId(pool, a)?.gpu;
  const gb = byId(pool, b)?.gpu;
  if (!ga || !gb || ga === 'remote' || gb === 'remote') return true;
  return ga !== gb;
}

const pairKey = (orch, worker) => `${orch || '-'}+${worker || '-'}`;

function planDirName(caseId, variantId, model, rep) {
  return `${caseId}__${variantId}__planner__${model}__${rep}`;
}

function execDirName(caseId, variantId, role, model, rep, pair, plan) {
  const base = `${caseId}__${variantId}__${role}__${model}__${rep}__pair-${pair}`;
  return plan && plan !== 'ref' ? `${base}__via-${plan}` : base;
}

function reviewDirName(caseId, variantId, model, rep, plan, pair) {
  const base = `${caseId}__${variantId}__reviewer__${model}__${rep}`;
  return plan && plan !== 'ref' ? `${base}__via-${plan}~${pair}` : base;
}

/**
 * buildAssignments({ roles, models, pool, mode, profile, seed, variants, reps, maxJobs })
 * roles: validierte Rollennamen; models: validierte Modell-IDs; variants:
 * [{ caseId, variantId, perspective }] (Volldaten laedt bench.mjs nach).
 * -> { jobs, sampled, stats }
 */
export function buildAssignments({
  roles, models, pool, mode = 'isolated', profile = 'quick', seed = 1, variants = [], reps = null, maxJobs = DEFAULT_MAX_JOBS,
}) {
  if (mode !== 'isolated' && mode !== 'chained') throw new Error(`buildAssignments: unbekannter Modus "${mode}"`);
  if (profile !== 'quick' && profile !== 'full') throw new Error(`buildAssignments: unbekanntes Profil "${profile}"`);
  const repetitions = reps ?? (profile === 'full' ? 3 : 1);
  const want = new Set(roles);
  const planners = want.has('planner') ? capableModels(pool, 'planner', models) : [];
  const orchs = want.has('orchestrator') ? capableModels(pool, 'orchestrator', models) : [];
  const workers = want.has('code-worker') ? capableModels(pool, 'code-worker', models) : [];
  const visions = want.has('vision-worker') ? capableModels(pool, 'vision-worker', models) : [];
  const reviewers = want.has('reviewer') ? capableModels(pool, 'reviewer', models) : [];

  // Execute-Paare: quick = Diagonale + Baseline, full = alles Residente.
  let pairs = [];
  if (orchs.length || workers.length) {
    const orchOpts = orchs.length ? orchs : [null];
    const workerOpts = workers.length ? workers : [null];
    if (profile === 'quick') {
      const diag = new Map();
      for (const m of models) {
        const o = orchs.includes(m) ? m : null;
        const w = workers.includes(m) ? m : null;
        if (o || w) diag.set(pairKey(o, w), [o, w]);
      }
      const bo = orchs.includes(BASELINE.orch) ? BASELINE.orch : null;
      const bw = workers.includes(BASELINE.worker) ? BASELINE.worker : null;
      if ((bo || bw) && models.includes(BASELINE.orch) && models.includes(BASELINE.worker)) {
        diag.set(pairKey(bo, bw), [bo, bw]);
      }
      pairs = [...diag.values()].filter(([o, w]) => coResident(pool, o, w));
    } else {
      for (const o of orchOpts) {
        for (const w of workerOpts) {
          if (!o && !w) continue;
          if (coResident(pool, o, w)) pairs.push([o, w]);
        }
      }
    }
  }

  const chained = mode === 'chained';
  const planKeysFor = () => (chained && planners.length ? [...planners] : ['ref']);

  const jobs = [];
  for (const v of variants) {
    // Rollen, die diese Variante uebt (default: alle gewaehlten).
    const has = (r) => (v.roles || roles).includes(r);
    const vp = has('planner') ? planners : [];
    const vo = has('orchestrator');
    const vw = has('code-worker');
    const vv = has('vision-worker') ? visions : [];
    const vr = has('reviewer') ? reviewers : [];
    const execUpstreams = (vo || vw) ? pairs : [];
    for (let rep = 0; rep < repetitions; rep++) {
      for (const m of vp) {
        jobs.push({
          key: `plan:${v.caseId}:${v.variantId}:${m}:${rep}`,
          stage: 'plan', role: 'planner', model: m,
          caseId: v.caseId, variantId: v.variantId, rep,
          plan: null, pair: null, loadout: [m],
          dirName: planDirName(v.caseId, v.variantId, m, rep),
        });
      }
      for (const plan of planKeysFor()) {
        for (const [o, w] of pairs) {
          const pk = pairKey(o, w);
          const loadout = [...new Set([o, w].filter(Boolean))];
          if (o && vo) {
            jobs.push({
              key: `exec:${v.caseId}:${v.variantId}:${plan}:${pk}:orchestrator:${o}:${rep}`,
              stage: 'execute', role: 'orchestrator', model: o,
              caseId: v.caseId, variantId: v.variantId, rep,
              plan, pair: pk, loadout,
              dirName: execDirName(v.caseId, v.variantId, 'orchestrator', o, rep, pk, plan),
            });
          }
          if (w && vw) {
            jobs.push({
              key: `exec:${v.caseId}:${v.variantId}:${plan}:${pk}:code-worker:${w}:${rep}`,
              stage: 'execute', role: 'code-worker', model: w,
              caseId: v.caseId, variantId: v.variantId, rep,
              plan, pair: pk, loadout,
              dirName: execDirName(v.caseId, v.variantId, 'code-worker', w, rep, pk, plan),
            });
          }
        }
        // Reviewer: in der Kette je (Plan, Paar), sonst einmal mit Referenz.
        // Ohne Execute-Rollen in der Variante: ein Dummy-Upstream mit Referenz.
        const reviewUpstreams = !chained ? [null] : execUpstreams.length ? execUpstreams.map(([o, w]) => pairKey(o, w)) : ['-+-'];
        for (const pk of reviewUpstreams) {
          for (const m of vr) {
            jobs.push({
              key: `review:${v.caseId}:${v.variantId}:${plan}:${pk || 'ref'}:reviewer:${m}:${rep}`,
              stage: 'review', role: 'reviewer', model: m,
              caseId: v.caseId, variantId: v.variantId, rep,
              plan: chained ? plan : 'ref', pair: pk, loadout: [m],
              dirName: reviewDirName(v.caseId, v.variantId, m, rep, chained ? plan : 'ref', pk),
            });
          }
        }
      }
      // Vision haengt an keinem Plan: je Modell einmal.
      if (v.perspective === 'vision') {
        for (const m of vv) {
          jobs.push({
            key: `exec:${v.caseId}:${v.variantId}:vision:${m}:${rep}`,
            stage: 'execute', role: 'vision-worker', model: m,
            caseId: v.caseId, variantId: v.variantId, rep,
            plan: 'ref', pair: null, loadout: [m],
            dirName: `${v.caseId}__${v.variantId}__vision-worker__${m}__${rep}`,
          });
        }
      }
    }
  }

  // Dedup (Diagonale/Baseline koennen zusammenfallen) + Stichprobe.
  const seen = new Set();
  const unique = jobs.filter((j) => (seen.has(j.dirName) ? false : (seen.add(j.dirName), true)));
  let sampled = false;
  let finalJobs = unique;
  if (profile === 'full' && unique.length > maxJobs) {
    // Plaene bleiben immer vollstaendig (Execute braucht sie als Eingabe);
    // die Stichprobe kuerzt nur Execute- und Review-Auftraege.
    const plans = unique.filter((j) => j.stage === 'plan');
    const rest = unique.filter((j) => j.stage !== 'plan');
    const rnd = mulberry32(seed);
    const shuffled = [...rest];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[k]] = [shuffled[k], shuffled[i]];
    }
    finalJobs = [...plans, ...shuffled.slice(0, Math.max(0, maxJobs - plans.length))];
    sampled = true;
  }

  return {
    jobs: finalJobs,
    sampled,
    stats: {
      variants: variants.length, repetitions, planners: planners.length, pairs: pairs.length,
      reviewers: reviewers.length, jobs_total: unique.length, jobs_kept: finalJobs.length, seed,
    },
  };
}

/**
 * schedule(jobs): sortiert stabil nach Loadout (Modellmenge je Auftrag), damit
 * zusammenhaengende Auftraege ohne Umladen laufen. -> { jobs, reloads }
 */
export function schedule(jobs) {
  const key = (j) => [...j.loadout].sort().join('+');
  const indexed = jobs.map((j, i) => [key(j), i, j]);
  indexed.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  const sorted = indexed.map(([, , j]) => j);
  let reloads = 0;
  let prev = null;
  for (const j of sorted) {
    const k = key(j);
    if (prev !== null && k !== prev) reloads += 1;
    prev = k;
  }
  return { jobs: sorted, reloads };
}

/** Stufen-Cache: vorhandenes result.json = erledigt (Resume ohne Wiederholung). */
export function resultPath(runDir, job) {
  return `${runDir}/runs/${job.dirName}/result.json`;
}
