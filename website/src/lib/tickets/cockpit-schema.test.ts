import { describe, it, expect } from 'vitest';
import { COCKPIT_ROLLUP_VIEW_SQL } from './cockpit-schema';

describe('COCKPIT_ROLLUP_VIEW_SQL', () => {
  it('creates the rollup view idempotently', () => {
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('CREATE OR REPLACE VIEW tickets.v_cockpit_rollup');
    expect(COCKPIT_ROLLUP_VIEW_SQL).toContain('WITH RECURSIVE');
  });

  it('aggregates all five leaf-count columns', () => {
    for (const col of ['total_leaves','done_leaves','blocked_leaves','in_progress_leaves','open_leaves']) {
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
});
