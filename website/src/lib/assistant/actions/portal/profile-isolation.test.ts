import { describe, it, expect } from 'vitest';
import './index';
import '../admin/index';
import { listActionsFor } from '../../actions';

describe('portal/admin action isolation', () => {
  it('admin actions never appear in the portal whitelist', () => {
    const portalIds = listActionsFor('portal').map((a) => a.id);
    expect(portalIds.every((id) => !id.startsWith('admin:'))).toBe(true);
  });

  it('portal actions never appear in the admin whitelist', () => {
    const adminIds = listActionsFor('admin').map((a) => a.id);
    expect(adminIds.every((id) => !id.startsWith('portal:'))).toBe(true);
  });

  it('all 7 portal actions are registered', () => {
    const portalIds = listActionsFor('portal').map((a) => a.id).sort();
    expect(portalIds).toEqual([
      'portal:book-session',
      'portal:cancel-session',
      'portal:message-coach',
      'portal:move-session',
      'portal:sign-document',
      'portal:start-questionnaire',
      'portal:upload-file',
    ]);
  });
});
