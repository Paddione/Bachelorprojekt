#!/usr/bin/env node
/**
 * scripts/factory/pipeline-runner.js
 * Host-side helper runner for the sandboxed pipeline.js script.
 * Has full access to Node.js APIs and can safely import all helper modules.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync, execSync } from 'child_process';

const D = await import('./pipeline-decompose.cjs');
const P = await import('./pipeline-partials.cjs');
const SQ = await import('./scout-quality-check.cjs');
const _msgBridge = await import('./agent-msg-bridge.cjs');
const ACIModule = await import('./aci.cjs');
const { decideDeployTransition } = await import('./deploy-transition.cjs');
const { resolveTaskSource } = await import('./task-source.cjs');
const otelEmit = await import('./otel-emit.cjs');
const evalCtxModule = await import('./eval-context.cjs');

const REPO = '/home/patrick/Bachelorprojekt';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const payload = args[1] ? JSON.parse(args[1]) : {};

  if (!process.env.TICKET_PHASE_DRIVER) {
    process.env.TICKET_PHASE_DRIVER = 'factory';
  }

  if (command === 'scout') {
    const { ticket_id, title, slug, description, brand } = payload;

    // ── Pre-gate: spec quality check before scout.sh invocation ─────────
    // If spec <300 chars and LLM fallback cannot salvage, return SCOUT_WEAK
    // immediately without invoking scout.sh (T002241).
    const specContent = `${title || ''}\n${description || ''}`;
    const preGateResult = SQ.evaluateSpecPreGate(specContent, {
      llmEnabled: process.env.SCOUT_LLM_ENABLED === 'true',
      title: title || '',
      slug: slug || '',
    });
    const blockTicket = () => {
      try {
        execFileSync('bash', [
          path.join(REPO, 'scripts/ticket.sh'), 'release-slot', '--id', String(ticket_id)
        ], { stdio: 'ignore', timeout: 15000, env: { ...process.env, BRAND: brand } });
      } catch {}
      try {
        execFileSync('bash', [
          path.join(REPO, 'scripts/ticket.sh'), 'update-status', '--id', String(ticket_id), '--status', 'blocked'
        ], { stdio: 'ignore', timeout: 15000, env: { ...process.env, BRAND: brand } });
      } catch {}
    };

    if (preGateResult.weak) {
      const reason = preGateResult.reasons[0] || 'spec_too_short';
      console.log(JSON.stringify({ sqGateResult: { status: 'scout_weak', ticket_id: String(ticket_id), reasons: [reason] } }));
      try {
        const phaseEvent = (ph, state, detail) => {
          try {
            const a = [path.join(REPO, 'scripts/ticket.sh'), 'phase', String(ticket_id), ph, state, '--driver', 'factory'];
            if (detail) a.push('--detail', String(detail).slice(0, 240));
            execFileSync('bash', a, { stdio: 'ignore', timeout: 15000, env: { ...process.env, BRAND: brand } });
          } catch {}
        };
        phaseEvent('scout', 'blocked', `scout_weak: ${reason}`);
      } catch {}
      blockTicket();
      return;
    }

    const scoutJson = execFileSync('bash', [
      path.join(REPO, 'scripts/factory/scout.sh'),
      '--ticket-id', String(ticket_id),
      '--title', String(title),
      '--slug', String(slug ?? ''),
      '--description', String(description ?? ''),
      '--repo', REPO
    ], { encoding: 'utf8', timeout: 60000 });

    let scout = JSON.parse(scoutJson);

    try {
      execFileSync('bash', [
        path.join(REPO, 'scripts/ticket.sh'), 'set-touched-files',
        '--id', String(ticket_id),
        '--files', scout.touched_files.join(',')
      ], { stdio: 'ignore', timeout: 15000, env: { ...process.env, BRAND: brand } });
    } catch (e) {
      console.error(`scout:persist set-touched-files failed (non-fatal): ${e.message}`);
    }

    const phaseEvent = (ph, state, detail) => {
      try {
        const a = [path.join(REPO, 'scripts/ticket.sh'), 'phase', String(ticket_id), ph, state, '--driver', 'factory'];
        if (detail) a.push('--detail', String(detail).slice(0, 240));
        execFileSync('bash', a, { stdio: 'ignore', timeout: 15000, env: { ...process.env, BRAND: brand } });
      } catch {}
      try { otelEmit.emitPhase(ph, state, { brand, ticket_id }); } catch {}
    };

    const sqGate = SQ.runScoutGate({ ...scout, title, description }, ticket_id, REPO, { execFileSync }, console.log, phaseEvent);
    if (sqGate) {
      console.log(JSON.stringify({ sqGateResult: sqGate, complexity: scout.complexity, touched_files: scout.touched_files, risk_areas: scout.risk_areas, similar_tickets: scout.similar_tickets }));
      blockTicket();
      return;
    }

    let scsSuggestedFiles = [];
    try {
      const BASE_URL = process.env.WEBSITE_BASE_URL ?? 'http://website.workspace.svc.cluster.local:4321';
      const scsRes = await fetch(
        `${BASE_URL}/api/codesearch?q=${encodeURIComponent(title)}&limit=5`,
        { headers: { Cookie: process.env.ADMIN_COOKIE ?? '' }, signal: AbortSignal.timeout(8000) }
      );
      if (scsRes.ok) {
        const scsJson = await scsRes.json();
        scsSuggestedFiles = scsJson.results ?? [];
        if (scsSuggestedFiles.length > 0) {
          scout.touched_files = scout.touched_files || [];
          const existingSet = new Set(scout.touched_files);
          const scsPaths = scsSuggestedFiles.map(f => `${REPO}/${f.path}`);
          for (const p of scsPaths) {
            if (!existingSet.has(p)) {
              scout.touched_files.push(p);
              existingSet.add(p);
            }
          }
        }
      }
    } catch (scsErr) {
      console.error(`SCS: unavailable (graceful degradation) — ${scsErr.message ?? scsErr}`);
    }

    console.log(JSON.stringify({
      sqGateResult: null,
      complexity: scout.complexity,
      touched_files: scout.touched_files,
      risk_areas: scout.risk_areas,
      similar_tickets: scout.similar_tickets
    }));

  } else if (command === 'get-injections') {
    const { ticket_id, phase, slug } = payload;
    try {
      const sh = (a, opt) => execFileSync('bash', [path.join(REPO, 'scripts/ticket.sh'), ...a], opt);
      const rows = JSON.parse(sh(['get-injections', '--id', String(ticket_id), '--phase', phase, '--consume', '--format', 'json'], { encoding: 'utf8', timeout: 20000 }).trim() || '[]');
      if (!Array.isArray(rows) || !rows.length) {
        console.log('');
        return;
      }
      const inbox = path.join(REPO, `.worktrees/${slug || 'unknown'}`, 'assets-inbox', String(ticket_id));
      const lines = [];
      const files = (r) => r.target_files ? r.target_files.join(', ') : '';
      for (const r of rows) {
        if (r.kind === 'asset' && r.data_url && r.filename) {
          try {
            fs.mkdirSync(inbox, { recursive: true });
            const dest = path.join(inbox, path.basename(String(r.filename)));
            fs.writeFileSync(dest, Buffer.from(String(r.data_url).replace(/^data:[^;]+;base64,/, ''), 'base64'));
            lines.push(`ASSET available at ${dest}${files(r) ? ` (for: ${files(r)})` : ''}`);
          } catch (e) {
            console.error(`Injections write asset failed: ${e.message}`);
          }
        } else if (r.content || r.title) {
          lines.push(`- ${r.title ? r.title + ': ' : ''}${r.content ?? ''}${files(r) ? ` [files: ${files(r)}]` : ''}`);
        }
      }
      try {
        sh(['add-comment', '--id', String(ticket_id), '--author', 'factory', '--body', `consumed ${rows.length} @ ${phase}`], { stdio: 'ignore', timeout: 15000 });
      } catch {}
      if (lines.length) {
        console.log(`\n\nOPERATOR INJECTED CONTEXT — verbindlich berücksichtigen:\n${lines.join('\n')}\n`);
      } else {
        console.log('');
      }
    } catch (e) {
      console.log('');
    }

  } else if (command === 'phase-event') {
    const { ticket_id, phase, state, detail, brand } = payload;
    try {
      const a = [path.join(REPO, 'scripts/ticket.sh'), 'phase', String(ticket_id), phase, state, '--driver', 'factory'];
      if (detail) a.push('--detail', String(detail).slice(0, 240));
      execFileSync('bash', a, { stdio: 'ignore', timeout: 15000, env: { ...process.env, BRAND: brand } });
    } catch {}
    try { otelEmit.emitPhase(phase, state, { brand, ticket_id }); } catch {}

  } else if (command === 'dryrun-mark') {
    // T002361: graduating a ticket out of dry-run-first is the ONLY exit from that
    // loop, so unlike phase-event above this must NOT swallow failures. A silently
    // skipped marker is the bug: guard_dryrun_ok stays unsatisfied, every tick forces
    // another preview, and one headless session burns per round.
    // T001816 originally added this call as a bullet inside the Deploy-phase agent
    // prompt, which made a mandatory state transition depend on model compliance.
    const { ticket_id, brand } = payload;
    execFileSync('bash',
      [path.join(REPO, 'scripts/ticket.sh'), 'dryrun-mark', '--id', String(ticket_id)],
      { stdio: 'ignore', timeout: 30000, env: { ...process.env, BRAND: brand } });
    process.stdout.write(`dryrun-mark: ok ${ticket_id}\n`);

  } else if (command === 'broadcast') {
    const { msg, label } = payload;
    if (_msgBridge && typeof _msgBridge.broadcast === 'function') {
      _msgBridge.broadcast(msg, label);
    }

  } else if (command === 'ticket-get') {
    const { ticket_id, brand } = payload;
    try {
      const ticketJson = execFileSync('bash',
        [path.join(REPO, 'scripts/ticket.sh'), 'get', '--id', String(ticket_id)],
        { encoding: 'utf8', timeout: 15000, env: { ...process.env, BRAND: brand } });
      console.log(ticketJson);
    } catch (e) {
      console.log('{}');
    }

  } else if (command === 'plan-lint-check') {
    const { ticket_id, planFilePath } = payload;
    let lintOut;
    try {
      lintOut = execFileSync('bash', [
        path.join(REPO, 'scripts/plan-lint.sh'), '--json', planFilePath
      ], { encoding: 'utf8', timeout: 20000 });
    } catch (e) {
      lintOut = e.stdout || e.message;
    }

    if (/"verdict"\s*:\s*"FAIL"/.test(lintOut)) {
      console.log(JSON.stringify({ status: 'retry', lintOut }));
    } else {
      console.log(JSON.stringify({ status: 'ok', lintOut }));
    }

  } else if (command === 'plan-lint-block') {
    const { ticket_id, lintOut } = payload;
    const shSafeTicketId = String(ticket_id).replace(/[^A-Za-z0-9_-]/g, '');
    const reasonB64 = Buffer.from(`plan-lint FAIL: ${String(lintOut).slice(0, 300)}`, 'utf8').toString('base64');

    execFileSync('bash', [path.join(REPO, 'scripts/ticket.sh'), 'release-slot', '--id', shSafeTicketId], { stdio: 'ignore' });
    execFileSync('bash', [path.join(REPO, 'scripts/ticket.sh'), 'update-status', '--id', shSafeTicketId, '--status', 'backlog'], { stdio: 'ignore' });
    execFileSync('bash', [path.join(REPO, 'scripts/ticket.sh'), 'add-comment', '--id', shSafeTicketId, '--body', Buffer.from(reasonB64, 'base64').toString('utf8')], { stdio: 'ignore' });

  } else if (command === 'eval-context') {
    const { ticket_id } = payload;
    try {
      const evalCtx = evalCtxModule.buildEvalContext(String(ticket_id), {
        fixturesDir: path.join(REPO, 'tests/factory-eval/fixtures'),
        outDir: path.join(REPO, 'docs/factory-eval')
      });
      console.log(evalCtx || '');
    } catch {
      console.log('');
    }

  } else if (command === 'filter-findings') {
    const { ticket_id, cleanDiff, allFindings } = payload;
    try {
      const tmpDir = '/tmp';
      const diffFile = path.join(tmpDir, `ci-filter-diff-${ticket_id}.diff`);
      fs.writeFileSync(diffFile, String(cleanDiff), 'utf8');
      try {
        const raw = execSync(
          `node ${REPO}/scripts/factory/review-finding-filter.mjs --cli --diff ${diffFile} --stdin`,
          { input: JSON.stringify(allFindings), encoding: 'utf8', timeout: 10000 }
        );
        console.log(raw);
      } finally {
        try { fs.unlinkSync(diffFile) } catch {}
      }
    } catch (e) {
      console.log(JSON.stringify({ kept: allFindings }));
    }

  } else if (command === 'run-qa-lens') {
    const { workWt, workBranch, ticket_id } = payload;
    try {
      const raw = execFileSync('node', [
        path.join(REPO, 'scripts/factory/qa-lens.mjs'),
        '--worktree', workWt, '--branch', workBranch, '--ticket', String(ticket_id),
        '--diff-range', 'origin/main...HEAD',
      ], { encoding: 'utf8', timeout: 40 * 60 * 1000 });
      console.log(raw);
    } catch (err) {
      console.log(JSON.stringify({
        findings: [{ severity: 'medium', file: '(qa-lens)', description: `qa-lens spawn failed: ${String(err.message || err).slice(0, 300)}` }],
        summary: 'qa-lens spawn failed'
      }));
    }

  } else if (command === 'resolve-partial-services') {
    const { touchedFiles } = payload;
    try {
      const csv = (touchedFiles ?? []).join(',');
      const out = execFileSync('bash', ['-c',
        `source ${REPO}/scripts/factory/service-registry.sh && resolve_partial_services "$1"`,
        'bash', csv],
        { encoding: 'utf8' }).trim();
      console.log(out.length > 0 ? out : '');
    } catch {
      console.log('');
    }

  } else if (command === 'decide-deploy') {
    const { deployOutput, isWebsite } = payload;
    const res = decideDeployTransition({ deployOutput, isWebsite: isWebsite ?? false });
    console.log(JSON.stringify(res));

  } else if (command === 'provision') {
    const res = D.provision(payload);
    console.log(JSON.stringify(res));

  } else if (command === 'aci-enabled') {
    console.log(process.env.ACI_ENABLED === 'true' ? 'true' : 'false');

  } else if (command === 'aci-validate') {
    const { target_files, workWt } = payload;
    const ACI = process.env.ACI_ENABLED === 'true' ? ACIModule : null;
    if (!ACI) {
      console.log(JSON.stringify({ valid: true, failures: [] }));
      return;
    }
    const failures = [];
    for (const f of target_files) {
      const v = ACI.validate(path.join(workWt, f));
      if (!v.valid) {
        failures.push({ file: f, error: v.error, label: v.label });
      }
    }
    console.log(JSON.stringify({ valid: failures.length === 0, failures }));

  } else if (command === 'conflict-escalate') {
    const { ticket_id, brand, conflict } = payload;
    const shSafeTicketId = String(ticket_id).replace(/[^A-Za-z0-9_-]/g, '');
    execFileSync('bash', [
      path.join(REPO, 'scripts/ticket.sh'), 'release-slot', '--id', shSafeTicketId
    ], { stdio: 'ignore', env: { ...process.env, BRAND: brand } });
    execFileSync('bash', [
      path.join(REPO, 'scripts/ticket.sh'), 'update-status', '--id', shSafeTicketId, '--status', 'backlog'
    ], { stdio: 'ignore', env: { ...process.env, BRAND: brand } });
    console.log("conflict escalated");

  } else if (command === 'guard-overwrite') {
    // Generic agent overwrite guard (not bonsai-specific).
    // Detects when an agent used `write` (whole-file overwrite) instead of `edit`
    // by checking if committed files shrank to <30% of their line count.
    // Runs on the worktree branch (HEAD~1 vs HEAD).
    // On detection: reverts the file to HEAD~1 and re-commits with a revert message.
    // Duplicate of guard-bonsai-overwrite.sh logic, but worktree-aware and generic.
    const { agent: agentName, files, worktree } = payload;
    const WT = worktree || REPO;
    const LOGFILE = path.join(REPO, '.bonsai-write-guard.log');
    const THRESHOLD_PCT = 30;
    let reverted = 0;
    let revertDetails = [];

    // Check if HEAD has a parent commit to compare against
    let hasParent = false;
    try {
      execFileSync('git', ['-C', WT, 'rev-parse', 'HEAD~1'], { stdio: 'ignore', timeout: 5000 });
      hasParent = true;
    } catch { /* first commit on branch — nothing to compare */ }

    if (hasParent) {
      const targetFiles = Array.isArray(files) && files.length > 0
        ? files
        : (() => {
            try {
              return execFileSync('git', ['-C', WT, 'diff', '--name-only', '--diff-filter=M', 'HEAD~1..HEAD'], { encoding: 'utf8', timeout: 10000 }).trim().split('\n').filter(Boolean);
            } catch { return []; }
          })();

      for (const file of targetFiles) {
        if (!file) continue;
        try {
          const headLines = execFileSync('git', ['-C', WT, 'show', `HEAD~1:${file}`], { encoding: 'utf8', timeout: 10000 }).trim().split('\n').length;
          const currentLines = execFileSync('git', ['-C', WT, 'show', `HEAD:${file}`], { encoding: 'utf8', timeout: 10000 }).trim().split('\n').length;

          // Only flag if HEAD~1 had significant content (>5 lines)
          if (headLines > 5 && currentLines > 0 && currentLines < (headLines * THRESHOLD_PCT / 100)) {
            // Overwrite detected — revert to previous version
            execFileSync('git', ['-C', WT, 'checkout', 'HEAD~1', '--', file], { stdio: 'ignore', timeout: 10000 });
            const now = new Date().toISOString();
            const logLine = `[${now}] GUARD:factory-${agentName} REVERTED ${file} (overwrite: ${headLines}→${currentLines} lines, <${THRESHOLD_PCT}%)`;
            fs.appendFileSync(LOGFILE, logLine + '\n');
            reverted++;
            revertDetails.push({ file, before: headLines, after: currentLines });
          }
        } catch {
          // File doesn't exist in HEAD~1 (new file) — skip
        }
      }

      if (reverted > 0) {
        execFileSync('git', ['-C', WT, 'add', '-A'], { stdio: 'ignore', timeout: 10000 });
        execFileSync('git', ['-C', WT, 'commit', '-m', `fix(${agentName}): revert overwrite — agent used write instead of edit [guard]`], { stdio: 'ignore', timeout: 10000 });
      }
    }

    console.log(JSON.stringify({ status: reverted > 0 ? 'blocked' : 'pass', agent: agentName, reverted, details: revertDetails }));

  } else if (command === 'resolve-task-source') {
    const { slug } = payload;
    try {
      const pathVal = resolveTaskSource(slug, REPO);
      console.log(pathVal);
    } catch (e) {
      console.log('');
    }

  } else if (command === 'read-partials') {
    // tasks.d/ partial fan-out (T002074): parse the change's partial manifest
    // and emit the batch sub_features form (with per-partial implement prompts).
    // T002082: dependency-based scheduling — order by depends_on, skip done partials.
    const { slug, changeDir, ctx } = payload;
    try {
      const dir = changeDir || path.join(REPO, 'openspec/changes', String(slug || ''));
      const res = P.readPartials(dir);
      // [T002327] Report what was skipped and why. Until now this branch knew which
      // partials were already done but kept it to itself, so pipeline.js could not
      // tell "resumed, 3 of 5 already finished" from "no manifest, falling back to
      // the LLM decompose". That indistinguishability is what hid the ordering bug
      // (read-partials ran before the worktree existed) for as long as it did.
      // Purely additive: no existing field is renamed or removed, because
      // pipeline.js:321 tests `partials.partials` and `Array.isArray(sub_features)`.
      res.manifest = res.partials ? 'present' : 'absent';
      res.skipped = [];
      res.done_lookup = 'skipped';   // 'ok' | 'failed' | 'skipped'
      res.order = 'skipped';         // 'ok' | 'failed' | 'skipped'
      if (res.partials) {
        const idsBefore = (res.sub_features || []).map((sf) => sf.id);
        // Read done partial IDs from factory_phase_events (partial-done with tests:'pass')
        let doneIds = [];
        try {
          const { orderAndFilter } = await import('./partial-order.cjs');
          const sql = "SELECT detail FROM tickets.factory_phase_events e "
            + "JOIN tickets.tickets t ON t.id = e.ticket_id "
            + "WHERE t.external_id = :'ext_id' AND e.phase = 'implement' AND e.state = 'partial-done';";
          const raw = execFileSync('bash', ['-c',
            `source ${REPO}/scripts/factory/lib.sh; factory_resolve; factory_psql -v ext_id="$1"`,
            'bash', String(ctx?.ticketId || slug || '')],
            { input: sql, encoding: 'utf8', timeout: 15000, env: { ...process.env, BRAND: ctx?.brand || 'mentolder' } }).trim();
          const events = JSON.parse(raw || '[]');
          for (const ev of events) {
            try {
              const detail = typeof ev.detail === 'string' ? JSON.parse(ev.detail) : ev.detail;
              if (detail?.tests === 'pass' && detail?.partial) doneIds.push(detail.partial);
            } catch { /* skip malformed */ }
          }
          res.done_lookup = 'ok';
        } catch {
          // Behaviour is deliberately unchanged: keep going with an empty doneIds
          // rather than aborting the tick. Only the SILENCE is removed — without
          // this flag a failed phase-event query looks exactly like "nothing done
          // yet", and the pipeline would quietly redo finished work.
          res.done_lookup = 'failed';
        }

        try {
          const { orderAndFilter } = await import('./partial-order.cjs');
          res.sub_features = orderAndFilter(res.sub_features, doneIds)
            .map((id) => res.sub_features.find((sf) => sf.id === id))
            .filter(Boolean);
          res.order = 'ok';
        } catch { /* keep original order on D2 errors — pipeline falls back to LLM decompose */
          res.order = 'failed';
        }

        const idsAfter = new Set((res.sub_features || []).map((sf) => sf.id));
        res.skipped = idsBefore.filter((id) => !idsAfter.has(id));

        res.sub_features = res.sub_features.map((sf) => ({
          ...sf,
          prompt: P.buildPartialPrompt(sf, ctx || {}),
        }));
      }
      console.log(JSON.stringify(res));
    } catch (e) {
      // manifest:'error' — the directory could not be read at all. Distinct from
      // manifest:'absent' (a legitimate plan without tasks.d/), so the caller can
      // tell an environment fault from a design choice. [T002327]
      console.log(JSON.stringify({ partials: false, manifest: 'error', skipped: [], error: String(e.message || e) }));
    }

  } else if (command === 'deploy-prompt') {
    // Deploy-phase prompt builder (extracted from pipeline.js — T002074).
    console.log(P.buildDeployPrompt(payload || {}));

  } else if (command === 'pr-gate') {
    // PR-gate (Design §4b): read the ticket's phase events host-side and answer
    // whether a verify/pr-ready event authorises PR creation.
    const { ticket_id, brand } = payload;
    try {
      const sql = "SELECT COALESCE(json_agg(json_build_object('phase',e.phase,'state',e.state)),'[]') "
        + 'FROM tickets.factory_phase_events e JOIN tickets.tickets t ON t.id = e.ticket_id '
        + "WHERE t.external_id = :'ext_id';";
      const raw = execFileSync('bash', ['-c',
        `source ${REPO}/scripts/factory/lib.sh; factory_resolve; factory_psql -v ext_id="$1"`,
        'bash', String(ticket_id)],
        { input: sql, encoding: 'utf8', timeout: 15000, env: { ...process.env, BRAND: brand || 'mentolder' } }).trim();
      const events = JSON.parse(raw || '[]');
      console.log(JSON.stringify({ pr_ready: P.prGateSatisfied(events) }));
    } catch (e) {
      console.log(JSON.stringify({ pr_ready: false }));
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
