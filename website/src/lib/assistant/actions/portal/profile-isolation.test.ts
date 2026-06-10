import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies that the portal action handlers import.
// These modules are not available in the unit test environment.
vi.mock('../../../../caldav.js', () => ({}));
vi.mock('../../../../email.js', () => ({}));
vi.mock('../../../../messaging-db.js', () => ({}));
vi.mock('../../../../website-db.js', () => ({
  getCustomerByKeycloakId: vi.fn().mockResolvedValue(null),
}));

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

  it('all 8 portal actions are registered', () => {
    const portalIds = listActionsFor('portal').map((a) => a.id).sort();
    expect(portalIds).toEqual([
      'portal:book-session',
      'portal:cancel-session',
      'portal:message-coach',
      'portal:move-session',
      'portal:request-session',
      'portal:sign-document',
      'portal:start-questionnaire',
      'portal:upload-file',
    ]);
  });
});
