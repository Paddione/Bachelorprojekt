import { describe, it, expect } from 'vitest';
import './index';
import { listActionsFor } from '../../actions';

describe('admin action registration', () => {
  it('registers all 5 admin actions and none on portal', () => {
    const adminIds = listActionsFor('admin').map((a) => a.id).sort();
    expect(adminIds).toEqual([
      'admin:finalize-meeting',
      'admin:resolve-ticket',
      'admin:schedule-followup',
      'admin:send-invoice',
      'admin:write-client-note',
    ]);
    const portalIds = listActionsFor('portal').map((a) => a.id);
    expect(portalIds.every((id) => !id.startsWith('admin:'))).toBe(true);
  });
});
