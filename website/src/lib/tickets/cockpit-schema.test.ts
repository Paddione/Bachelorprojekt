import { describe, it, expect } from 'vitest';
import { COCKPIT_ROLLUP_VIEW_SQL } from './cockpit-schema';

describe('COCKPIT_ROLLUP_VIEW_SQL', () => {
  it('creates the rollup view idempotently', () => {
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('CREATE VIEW tickets.v_cockpit_rollup');
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('WITH RECURSIVE');
  });

  it('aggregates all five leaf-count columns', () => {
    for (const col of ['total_leaves','done_leaves','blocked_leaves','in_progress_leaves','awaiting_deploy_leaves','open_leaves']) {
      expect(COCKPIT_ROLLUP_VIEW_SQL).toContain(col);
    }
  });

  it('computes pct_done and a three-branch health', () => {
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('pct_done');
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('blocked_leaves');
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain("'red'");
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain("'green'");
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain("'amber'");
  });

  it('joins agg before WHERE (valid SQL order, no placeholder)', () => {
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('LEFT JOIN agg a ON a.container_id = c.id');
    expect(COCKPIT_ROLLUP_VIEW_SQL).not.toContain('PLACEHOLDER');
    expect(COCKPIT_ROLLUP_VIEW_SQL.indexOf('LEFT JOIN agg'))
      .toBeLessThan(COCKPIT_ROLLUP_VIEW_SQL.indexOf("WHERE c.type IN ('project', 'feature')"));
  });

  it('excludes archived leaves from total_leaves count (leaves CTE filters archived)', () => {
    // archived tickets are cancelled/obsolete and must not contribute to progress math
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain("d.status <> 'archived'");
  });

  it('includes qa_review in in_progress_leaves bucket', () => {
    // qa_review must fall into exactly one bucket so done+blocked+inProgress+open == total
    // Verify qa_review is in the FILTER for in_progress_leaves (same FILTER expression as in_review)
    expect(COCKPIT_ROLLUP_VIEW_SQL).toMatch(
      /FILTER\s*\(WHERE status IN\s*\([^)]*'in_review'[^)]*'qa_review'[^)]*\)\)/,
    );
    // qa_review must NOT appear in the open_leaves bucket
    const openLeavesLine = COCKPIT_ROLLUP_VIEW_SQL
      .split('\n')
      .find(l => l.includes('open_leaves') && l.includes('FILTER'));
    expect(openLeavesLine).toBeDefined();
    expect(openLeavesLine).not.toContain('qa_review');
  });

  it('aggregates an awaiting_deploy_leaves column in its own bucket', () => {
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('awaiting_deploy_leaves');
    const inProgLine = COCKPIT_ROLLUP_VIEW_SQL
      .split('\n').find(l => l.includes('in_progress_leaves') && l.includes('FILTER'));
    expect(inProgLine).toBeDefined();
    expect(inProgLine).not.toContain('awaiting_deploy');
  });
});
