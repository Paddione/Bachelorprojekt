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
    const { slug, changeDir, ctx } = payload;
    try {
      const dir = changeDir || path.join(REPO, 'openspec/changes', String(slug || ''));
      const res = P.readPartials(dir);
      if (res.partials) {
        res.sub_features = res.sub_features.map((sf) => ({
          ...sf,
          prompt: P.buildPartialPrompt(sf, ctx || {}),
        }));
      }
      console.log(JSON.stringify(res));
    } catch (e) {
      console.log(JSON.stringify({ partials: false, error: String(e.message || e) }));
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
