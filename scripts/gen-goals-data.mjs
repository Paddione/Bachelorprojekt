#!/usr/bin/env node
/**
 * gen-goals-data.mjs — parses .claude/lib/goals.md (the SSOT for repository
 * health goals) and emits website/src/lib/goals-data.generated.json, an
 * array matching the HealthGoal TypeScript shape (website/src/lib/goals-data.ts).
 *
 * Mirrors the scripts/openspec-status-map.sh -> website/src/data/openspec-status.json
 * pattern, wired into `task freshness:regenerate` / `task freshness:check`.
 *
 * Env overrides (for BATS fixtures, mirrors OPENSPEC_ROOT in openspec-status-map.sh):
 *   GOALS_MD_PATH  — default .claude/lib/goals.md
 *   GOALS_JSON_OUT — default website/src/lib/goals-data.generated.json
 *
 * Parses two goal representations:
 *   1. H2-section entries (Prio A/B): `## G-<id> — <title>` with a
 *      `**<prio> · Baseline:** … · **Target:** …` meta blockquote line.
 *   2. Table-row entries (Prio C — Green Gates): `| **G-<id>** | Title | Current | Target | Measurement |`.
 *
 * Fail-loud (exit != 0, stderr names the offending id):
 *   - a `## G-<id>` heading with no meta blockquote line before the next heading
 *   - a Baseline:/Target: field with zero digits that isn't the literal token "n/a"
 *   - a Prio-C table row whose ID column doesn't match G-[A-Z0-9-]+
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const GOALS_MD_PATH = process.env.GOALS_MD_PATH
  ? resolve(process.cwd(), process.env.GOALS_MD_PATH)
  : join(ROOT, '.claude/lib/goals.md');
const GOALS_JSON_OUT = process.env.GOALS_JSON_OUT
  ? resolve(process.cwd(), process.env.GOALS_JSON_OUT)
  : join(ROOT, 'website/src/lib/goals-data.generated.json');

const CATEGORY_MAP = {
  GIT: 'Repo-Hygiene',
  SPEC: 'Prozess',
  SIZE: 'Code-Größe',
  DOC: 'Dokumentation',
  CQ: 'Code-Qualität',
  RH: 'Kern-Ziele',
  DB: 'Datenbank',
  TEST: 'Test-Health',
  SEC: 'Sicherheit',
  AGENTIC: 'Agent-Tooling',
  CI: 'CI/CD',
  CD: 'CI/CD',
  DEP: 'Dependencies',
  IMG: 'Dependencies',
  K8S: 'Infrastruktur',
  CFG: 'Konfiguration',
  DORA: 'CI/CD',
  FE: 'Frontend',
  E2E: 'Test-Health',
  OPS: 'Infrastruktur',
};

function categoryFor(id) {
  // Non-greedy + \d*$ erlaubt Ziffern im Präfix selbst (G-E2E01 → "E2E", nicht "E")
  const m = id.match(/^G-([A-Za-z][A-Za-z0-9]*?)\d*$/);
  return (m && CATEGORY_MAP[m[1]]) || 'Sonstige';
}

function firstNumber(text) {
  const m = String(text).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function fieldHasNoDigitsAndNotNA(field) {
  const trimmed = String(field).trim();
  return !/\d/.test(trimmed) && trimmed.toLowerCase() !== 'n/a';
}

// "6 → 7 🔴" -> {baseline:6, current:7}; "17 (unverändert)" -> {baseline:17, current:17};
// "n/a → 0" -> {baseline:null, current:0}; "n/a" -> {baseline:null, current:null}.
function parseBaselineCurrent(field) {
  const arrowIdx = field.indexOf('→');
  if (arrowIdx === -1) {
    const baseline = firstNumber(field);
    return { baseline, current: baseline };
  }
  const before = field.slice(0, arrowIdx);
  const after = field.slice(arrowIdx + 1);
  const baseline = firstNumber(before);
  const afterNum = firstNumber(after);
  return { baseline, current: afterNum !== null ? afterNum : baseline };
}

function directionFromTarget(targetField, baseline, target) {
  if (/[≤<]/.test(targetField)) return 'lower';
  if (/[≥>]/.test(targetField)) return 'higher';
  if (baseline !== null && target !== null) {
    if (baseline > target) return 'lower';
    if (baseline < target) return 'higher';
  }
  return 'lower';
}

function titleFromHeading(rawTitle) {
  return rawTitle.split(/:\s+/)[0].trim();
}

function parseTableCell(text) {
  const cleaned = text.replace(/[✓🔴🟡⚠️❌]/g, '').trim();
  if (/^Exit\s+-?\d+$/i.test(cleaned)) return { value: null, unitHint: 'Exit' };
  const num = firstNumber(cleaned);
  if (num !== null) return { value: num, unitHint: null };
  return { value: null, unitHint: cleaned };
}

// Markdown table cells can contain a backslash-escaped pipe (`\|`) to embed a
// literal `|` without terminating the cell (e.g. shell pipelines in the
// measurement column). Undo that escaping once the cell has been extracted.
function unescapePipes(text) {
  return text.replace(/\\\|/g, '|');
}

function main() {
  const content = readFileSync(GOALS_MD_PATH, 'utf8');
  const errors = [];
  const goals = [];

  const updateMatches = [...content.matchAll(/\*\*Baseline-Update\s+([\d-]+)/g)];
  const dateMatch = content.match(/\*\*Baseline-Stichtag:\*\*\s*`([\d-]+)`/);
  const measuredAt = updateMatches.length > 0
    ? updateMatches[updateMatches.length - 1][1]
    : (dateMatch ? dateMatch[1] : '');

  // --- 1. H2-section entries (Prio A/B) ---
  // Fenced code blocks can contain shell comment lines ("# ...") that look
  // like Markdown headings to a naive line-anchored regex — exclude any
  // heading match that falls inside a ```…``` span.
  const codeFenceRe = /```[\s\S]*?```/g;
  const codeSpans = [...content.matchAll(codeFenceRe)].map((m) => [m.index, m.index + m[0].length]);
  const insideCodeFence = (idx) => codeSpans.some(([s, e]) => idx >= s && idx < e);

  const headingRe = /^(#{1,2})[ \t](.*)$/gm;
  const headings = [...content.matchAll(headingRe)]
    .filter((m) => !insideCodeFence(m.index))
    .map((m) => ({
      index: m.index,
      end: m.index + m[0].length,
      level: m[1].length,
      text: m[2],
    }));

  const goalHeadingRe = /^(G-[A-Z0-9]+)\s*[—-]\s*(.*)$/;
  const metaRe = /^>\s*\*\*([ABC])\s*·\s*Baseline:\*\*([^·]*)·\s*\*\*Target:\*\*([^·]*)/m;
  const measurementRe = /```(?:bash|sql)\n([\s\S]*?)```/;

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (h.level !== 2) continue;
    const gm = h.text.match(goalHeadingRe);
    if (!gm) continue;
    const id = gm[1];
    const rawTitle = gm[2];

    const next = headings.find((x) => x.index > h.index);
    const regionEnd = next ? next.index : content.length;
    const region = content.slice(h.end, regionEnd);

    const metaMatch = region.match(metaRe);
    if (!metaMatch) {
      errors.push(`${id}: keine Meta-Zeile (**<Prio> · Baseline:** … · **Target:** …) vor der nächsten Überschrift gefunden`);
      continue;
    }

    const priority = metaMatch[1];
    const baselineField = metaMatch[2].trim();
    const targetField = metaMatch[3].trim();

    let hadFieldError = false;
    if (fieldHasNoDigitsAndNotNA(baselineField)) {
      errors.push(`${id}: Baseline-Feld ('${baselineField}') enthält keine Zahl und ist nicht 'n/a'`);
      hadFieldError = true;
    }
    if (fieldHasNoDigitsAndNotNA(targetField)) {
      errors.push(`${id}: Target-Feld ('${targetField}') enthält keine Zahl und ist nicht 'n/a'`);
      hadFieldError = true;
    }
    if (hadFieldError) continue;

    const { baseline, current } = parseBaselineCurrent(baselineField);
    const target = firstNumber(targetField);
    const direction = directionFromTarget(targetField, baseline, target);
    const measurementMatch = region.match(measurementRe);

    goals.push({
      id,
      title: titleFromHeading(rawTitle),
      category: categoryFor(id),
      priority,
      direction,
      baseline,
      current,
      target,
      unit: '',
      status: 'unknown',
      measurement: measurementMatch ? measurementMatch[1].trim() : '',
      source: `.claude/lib/goals.md · ${id}`,
      measured_at: measuredAt,
    });
  }

  // --- 2. Table-row entries (Prio C — Green Gates) ---
  const prioCStart = content.indexOf('# Priorität C');
  if (prioCStart !== -1) {
    const nextH1 = content.indexOf('# Mess-Werkzeug', prioCStart);
    const prioCRegion = content.slice(prioCStart, nextH1 !== -1 ? nextH1 : content.length);
    // Cells are captured escape-aware ((?:[^|\\]|\\.)*) so a markdown-escaped
    // pipe (`\|`, used to embed a literal `|` inside e.g. a shell pipeline in
    // the measurement column) doesn't prematurely terminate the cell.
    const cell = String.raw`((?:[^|\\]|\\.)*)`;
    const tableRowRe = new RegExp(
      String.raw`^\|\s*\*\*([^*]+)\*\*\s*\|${cell}\|${cell}\|${cell}\|${cell}\|`,
      'gm'
    );
    for (const m of prioCRegion.matchAll(tableRowRe)) {
      const rawId = m[1].trim();
      if (!/^G-[A-Z0-9-]+$/.test(rawId)) {
        errors.push(`Prio-C-Tabellenzeile: ID-Spalte '${rawId}' entspricht nicht G-[A-Z0-9-]+`);
        continue;
      }
      const title = unescapePipes(m[2]).trim();
      const currentCell = parseTableCell(unescapePipes(m[3]));
      const targetCellRaw = unescapePipes(m[4]);
      const targetCell = parseTableCell(targetCellRaw);
      const measurement = unescapePipes(m[5]).trim().replace(/^`|`$/g, '');

      goals.push({
        id: rawId,
        title,
        category: categoryFor(rawId),
        priority: 'C',
        direction: /≥/.test(targetCellRaw) ? 'higher' : 'lower',
        baseline: null,
        current: currentCell.value,
        target: targetCell.value,
        unit: currentCell.unitHint || targetCell.unitHint || '',
        status: 'unknown',
        measurement,
        source: `.claude/lib/goals.md · ${rawId}`,
        measured_at: measuredAt,
      });
    }
  }

  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    console.error(`gen-goals-data: ${errors.length} Fehler — Abbruch (kein Output geschrieben)`);
    process.exit(1);
  }

  mkdirSync(dirname(GOALS_JSON_OUT), { recursive: true });
  writeFileSync(GOALS_JSON_OUT, JSON.stringify(goals, null, 2) + '\n');
  console.log(`✓ ${goals.length} goals → ${GOALS_JSON_OUT}`);
}

main();
