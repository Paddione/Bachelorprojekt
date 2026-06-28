import { describe, it, expect, vi } from 'vitest';

vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    listParticipants = vi.fn().mockResolvedValue([]);
  },
}));

const listActiveCallRooms = vi.fn();
const listAllMeetings = vi.fn();
const query = vi.fn();
vi.mock('./nextcloud-talk-db', () => ({
  listActiveCallRooms: (...a: unknown[]) => listActiveCallRooms(...a),
}));
vi.mock('./website-db', () => ({
  listAllMeetings: (...a: unknown[]) => listAllMeetings(...a),
  pool: { query: (...a: unknown[]) => query(...a) },
}));

import { fetchLiveCockpitData } from './live-state';
import * as loggerModule from './logger';

describe('live-state.fetchLiveCockpitData', () => {
  it('returns empty state when all sub-fetches are empty', async () => {
    listActiveCallRooms.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce({ rows: [] }); // polls
    listAllMeetings.mockResolvedValueOnce([]);
    const out = await fetchLiveCockpitData();
    expect(out.rooms).toEqual([]);
    expect(out.pollActive).toBeNull();
    expect(out.recentSessions).toEqual([]);
    expect(out.stream.live).toBe(false);
    expect(out.stream.recording).toBe(false);
    expect(out.schedule.nextEvent).toBeNull();
  });

  it('maps active poll row to ActivePoll', async () => {
    listActiveCallRooms.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce({ rows: [{ id: 'p1', question: 'Q?', kind: 'text' }] });
    listAllMeetings.mockResolvedValueOnce([]);
    const out = await fetchLiveCockpitData();
    expect(out.pollActive).toEqual({ id: 'p1', question: 'Q?', kind: 'text' });
  });

  it('returns null pollActive when polls query errors out', async () => {
    listActiveCallRooms.mockResolvedValueOnce([]);
    query.mockRejectedValueOnce(new Error('polls broken'));
    listAllMeetings.mockResolvedValueOnce([]);
    const errSpy = vi.spyOn(loggerModule.logger, 'error').mockReturnValue(undefined as any);
    const out = await fetchLiveCockpitData();
    expect(out.pollActive).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('falls back to [] for recentSessions when listAllMeetings throws', async () => {
    listActiveCallRooms.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce({ rows: [] });
    listAllMeetings.mockRejectedValueOnce(new Error('meetings broken'));
    const errSpy = vi.spyOn(loggerModule.logger, 'error').mockReturnValue(undefined as any);
    const out = await fetchLiveCockpitData();
    expect(out.recentSessions).toEqual([]);
    errSpy.mockRestore();
  });
});
