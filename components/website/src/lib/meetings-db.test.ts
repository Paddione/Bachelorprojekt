import { describe, it, expect, vi, beforeEach } from 'vitest';

const { Pool, query, connect, clientQuery, clientRelease } = vi.hoisted(() => {
  const query = vi.fn(async (..._args: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> => ({ rows: [], rowCount: 0 }));
  const clientQuery = vi.fn(async (..._args: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> => ({ rows: [], rowCount: 0 }));
  const clientRelease = vi.fn();
  const connect = vi.fn(async (..._args: unknown[]) => ({ query: clientQuery, release: clientRelease }));
  class Pool {
    constructor(_opts: unknown) { /* ignore config */ }
    query(...a: unknown[]) { return query(...a); }
    connect(...a: unknown[]) { return connect(...a); }
    end() { return Promise.resolve(); }
  }
  return { Pool, query, connect, clientQuery, clientRelease };
});
vi.mock('pg', () => ({ default: { Pool }, Pool }));
vi.mock('dns', () => ({ default: { resolve4: vi.fn() }, resolve4: vi.fn() }));

import {
  initMeetingsDb,
  initMeetingProjectLink,
  getMeetingByRoomToken,
  createMeeting,
  updateMeetingStatus,
  saveTranscript,
  saveArtifact,
  saveInsight,
  releaseMeeting,
  getMeetingsForClient,
  listAllMeetings,
  getMeetingDetail,
} from './meetings-db';

function defaultQueryImpl() {
  return async (..._args: unknown[]) => ({ rows: [], rowCount: 0 });
}

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(defaultQueryImpl());
  connect.mockClear();
  clientQuery.mockReset();
  clientQuery.mockImplementation(defaultQueryImpl());
  clientRelease.mockClear();
});

describe('meetings-db: schema init', () => {
  it('initMeetingsDb: creates table then adds released_at column', async () => {
    await initMeetingsDb();
    const calls = query.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => /CREATE TABLE IF NOT EXISTS meetings/.test(s))).toBe(true);
    expect(calls.some((s) => /ALTER TABLE meetings ADD COLUMN IF NOT EXISTS released_at/.test(s))).toBe(true);
  });

  it('initMeetingProjectLink: adds project_id column + index', async () => {
    await initMeetingProjectLink();
    const calls = query.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => /ADD COLUMN IF NOT EXISTS project_id/.test(s))).toBe(true);
    expect(calls.some((s) => /CREATE INDEX IF NOT EXISTS idx_meetings_project/.test(s))).toBe(true);
  });
});

describe('meetings-db: getMeetingByRoomToken', () => {
  it('returns the mapped meeting when a row matches', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM meetings m\s+JOIN customers c ON m\.customer_id = c\.id\s+WHERE m\.talk_room_token/.test(sql)) {
        return {
          rows: [{
            id: 'm-1', customerId: 'c-1', customerName: 'Bob', customerEmail: 'bob@x.com',
            meetingType: 'consult', status: 'scheduled', talkRoomToken: 'tok-1',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await getMeetingByRoomToken('tok-1');
    expect(result).toEqual({
      id: 'm-1', customerId: 'c-1', customerName: 'Bob', customerEmail: 'bob@x.com',
      meetingType: 'consult', status: 'scheduled', talkRoomToken: 'tok-1',
    });
    const call = query.mock.calls.find((c) => /WHERE m\.talk_room_token = \$1/.test(c[0] as string));
    expect(call![1]).toEqual(['tok-1']);
  });

  it('returns null when no meeting matches the room token', async () => {
    const result = await getMeetingByRoomToken('missing-tok');
    expect(result).toBeNull();
  });
});

describe('meetings-db: createMeeting', () => {
  it('inserts with provided params and returns the created row', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/INSERT INTO meetings/.test(sql)) {
        return {
          rows: [{
            id: 'm-2', customerId: params![0], status: 'scheduled', released_at: null,
            projectId: params![4], projectName: null,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const meeting = await createMeeting({
      customerId: 'c-9',
      meetingType: 'onboarding',
      scheduledAt: new Date('2026-01-01T00:00:00Z'),
      talkRoomToken: 'tok-9',
      projectId: 'p-9',
    });
    expect(meeting.id).toBe('m-2');
    expect(meeting.customerId).toBe('c-9');
    expect(meeting.projectId).toBe('p-9');

    const call = query.mock.calls.find((c) => /INSERT INTO meetings/.test(c[0] as string));
    expect(call![1]).toEqual(['c-9', 'onboarding', new Date('2026-01-01T00:00:00Z'), 'tok-9', 'p-9']);
  });

  it('defaults projectId to null when not provided', async () => {
    await createMeeting({ customerId: 'c-1', meetingType: 'consult' });
    const call = query.mock.calls.find((c) => /INSERT INTO meetings/.test(c[0] as string));
    const params = call![1] as unknown[];
    expect(params[4]).toBeNull();
    expect(params[2]).toBeUndefined();
    expect(params[3]).toBeUndefined();
  });
});

describe('meetings-db: updateMeetingStatus', () => {
  it('builds only the base SET clause when no extras are given', async () => {
    await updateMeetingStatus('m-1', 'in_progress');
    const call = query.mock.calls.find((c) => /UPDATE meetings SET/.test(c[0] as string));
    expect(call![0]).toMatch(/UPDATE meetings SET status = \$2 WHERE id = \$1/);
    expect(call![1]).toEqual(['m-1', 'in_progress']);
  });

  it('appends all extras with incrementing placeholders when provided', async () => {
    const startedAt = new Date('2026-01-01T10:00:00Z');
    const endedAt = new Date('2026-01-01T11:00:00Z');
    await updateMeetingStatus('m-2', 'completed', {
      startedAt, endedAt, durationSeconds: 3600, recordingPath: '/rec/m-2.mp4',
    });
    const call = query.mock.calls.find((c) => /UPDATE meetings SET/.test(c[0] as string));
    const sql = call![0] as string;
    expect(sql).toMatch(/status = \$2/);
    expect(sql).toMatch(/started_at = \$3/);
    expect(sql).toMatch(/ended_at = \$4/);
    expect(sql).toMatch(/duration_seconds = \$5/);
    expect(sql).toMatch(/recording_path = \$6/);
    expect(call![1]).toEqual(['m-2', 'completed', startedAt, endedAt, 3600, '/rec/m-2.mp4']);
  });
});

describe('meetings-db: saveTranscript', () => {
  it('inserts the transcript and each segment inside a transaction, then commits', async () => {
    clientQuery.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO transcripts/.test(sql)) return { rows: [{ id: 't-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const result = await saveTranscript({
      meetingId: 'm-1',
      fullText: 'hello world',
      segments: [
        { start: 0, end: 1, text: 'hello', speaker: 'A' },
        { start: 1, end: 2, text: 'world' },
      ],
    });
    expect(result).toEqual({ id: 't-1', meetingId: 'm-1' });

    const calls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toMatch(/BEGIN/);
    expect(calls.some((s) => /INSERT INTO transcripts/.test(s))).toBe(true);
    expect(calls.filter((s) => /INSERT INTO transcript_segments/.test(s))).toHaveLength(2);
    expect(calls[calls.length - 1]).toMatch(/COMMIT/);
    expect(clientRelease).toHaveBeenCalledTimes(1);

    const seg0Call = clientQuery.mock.calls.find(
      (c) => /INSERT INTO transcript_segments/.test(c[0] as string) && (c[1] as unknown[])[1] === 0,
    );
    expect(seg0Call![1]).toEqual(['t-1', 0, 0, 1, 'hello', 'A']);
  });

  it('skips segment inserts when no segments are given, and uses defaults for language/model', async () => {
    clientQuery.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO transcripts/.test(sql)) return { rows: [{ id: 't-2' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await saveTranscript({ meetingId: 'm-2', fullText: 'plain text' });
    const insertCall = clientQuery.mock.calls.find((c) => /INSERT INTO transcripts/.test(c[0] as string));
    expect(insertCall![1]).toEqual(['m-2', 'plain text', 'de', 'Systran/faster-whisper-medium', undefined]);
    expect(clientQuery.mock.calls.some((c) => /INSERT INTO transcript_segments/.test(c[0] as string))).toBe(false);
  });

  it('rolls back and rethrows when the transcript insert fails', async () => {
    clientQuery.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO transcripts/.test(sql)) throw new Error('boom');
      return { rows: [], rowCount: 0 };
    });
    await expect(saveTranscript({ meetingId: 'm-3', fullText: 'x' })).rejects.toThrow('boom');
    const calls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls.some((s) => /ROLLBACK/.test(s))).toBe(true);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });
});

describe('meetings-db: saveArtifact', () => {
  it('inserts and returns the new artifact id, serializing metadata', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO meeting_artifacts/.test(sql)) return { rows: [{ id: 'a-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const id = await saveArtifact({
      meetingId: 'm-1', artifactType: 'document', name: 'notes.txt', metadata: { pages: 2 },
    });
    expect(id).toBe('a-1');
    const call = query.mock.calls.find((c) => /INSERT INTO meeting_artifacts/.test(c[0] as string));
    expect(call![1]).toEqual(['m-1', 'document', 'notes.txt', undefined, undefined, JSON.stringify({ pages: 2 })]);
  });

  it('defaults metadata to an empty object when not provided', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO meeting_artifacts/.test(sql)) return { rows: [{ id: 'a-2' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await saveArtifact({ meetingId: 'm-1', artifactType: 'screenshot', name: 'shot.png' });
    const call = query.mock.calls.find((c) => /INSERT INTO meeting_artifacts/.test(c[0] as string));
    expect((call![1] as unknown[])[5]).toBe('{}');
  });
});

describe('meetings-db: saveInsight', () => {
  it('inserts and returns the new insight id', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO meeting_insights/.test(sql)) return { rows: [{ id: 'i-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const id = await saveInsight({ meetingId: 'm-1', insightType: 'summary', content: 'It went well', generatedBy: 'ai' });
    expect(id).toBe('i-1');
    const call = query.mock.calls.find((c) => /INSERT INTO meeting_insights/.test(c[0] as string));
    expect(call![1]).toEqual(['m-1', 'summary', 'It went well', 'ai']);
  });

  it('defaults generatedBy to "system"', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/INSERT INTO meeting_insights/.test(sql)) return { rows: [{ id: 'i-2' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await saveInsight({ meetingId: 'm-1', insightType: 'sentiment', content: 'positive' });
    const call = query.mock.calls.find((c) => /INSERT INTO meeting_insights/.test(c[0] as string));
    expect((call![1] as unknown[])[3]).toBe('system');
  });
});

describe('meetings-db: releaseMeeting', () => {
  it('sets released_at to now for the given meeting', async () => {
    await releaseMeeting('m-5');
    const call = query.mock.calls.find((c) => /UPDATE meetings SET released_at = NOW\(\)/.test(c[0] as string));
    expect(call![1]).toEqual(['m-5']);
  });
});

describe('meetings-db: getMeetingsForClient', () => {
  it('returns all meetings for a client email when onlyReleased is false', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/WHERE c\.email = \$1/.test(sql) && !/released_at IS NOT NULL/.test(sql)) {
        return { rows: [{ id: 'm-1', customerId: 'c-1', status: 'scheduled' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const meetings = await getMeetingsForClient('client@x.com');
    expect(meetings).toEqual([{ id: 'm-1', customerId: 'c-1', status: 'scheduled' }]);
    const call = query.mock.calls.find((c) => /WHERE c\.email = \$1/.test(c[0] as string));
    expect(call![1]).toEqual(['client@x.com']);
  });

  it('filters to only released meetings when onlyReleased is true', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/WHERE c\.email = \$1 AND m\.released_at IS NOT NULL/.test(sql)) {
        return { rows: [{ id: 'm-2' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const meetings = await getMeetingsForClient('client@x.com', true);
    expect(meetings).toEqual([{ id: 'm-2' }]);
  });
});

describe('meetings-db: listAllMeetings', () => {
  it('lists meetings with a default limit and no filter', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/FROM meetings m/.test(sql) && /ORDER BY m\.created_at DESC/.test(sql)) {
        expect(params).toEqual([200]);
        return { rows: [{ id: 'm-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const list = await listAllMeetings();
    expect(list).toEqual([{ id: 'm-1' }]);
  });

  it('applies the unassignedOnly filter and custom limit', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      const params = __args[1] as unknown[] | undefined;
      if (/FROM meetings m/.test(sql) && /ORDER BY m\.created_at DESC/.test(sql)) {
        expect(sql).toMatch(/WHERE c\.name LIKE '%@unknown\.local%' OR m\.meeting_type = 'Talk-Session'/);
        expect(params).toEqual([5]);
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    await listAllMeetings({ unassignedOnly: true, limit: 5 });
  });
});

describe('meetings-db: getMeetingDetail', () => {
  it('returns null when the meeting does not exist', async () => {
    const detail = await getMeetingDetail('missing');
    expect(detail).toBeNull();
  });

  it('returns the meeting with its transcript and artifacts when found', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM meetings m[\s\S]*WHERE m\.id = \$1/.test(sql)) {
        return { rows: [{ id: 'm-1', meetingType: 'consult', status: 'done', customerName: 'Bob' }], rowCount: 1 };
      }
      if (/FROM transcripts WHERE meeting_id/.test(sql)) {
        return { rows: [{ id: 't-1', fullText: 'hi' }], rowCount: 1 };
      }
      if (/FROM meeting_artifacts WHERE meeting_id/.test(sql)) {
        return { rows: [{ id: 'a-1', artifactType: 'document', name: 'x', storagePath: null, contentText: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const detail = await getMeetingDetail('m-1');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('m-1');
    expect(detail!.transcript).toEqual({ id: 't-1', fullText: 'hi' });
    expect(detail!.artifacts).toEqual([{ id: 'a-1', artifactType: 'document', name: 'x', storagePath: null, contentText: null }]);
  });

  it('returns a null transcript when none exists yet', async () => {
    query.mockImplementation(async (...__args: unknown[]) => {
      const sql = __args[0] as string;
      if (/FROM meetings m[\s\S]*WHERE m\.id = \$1/.test(sql)) {
        return { rows: [{ id: 'm-2' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const detail = await getMeetingDetail('m-2');
    expect(detail!.transcript).toBeNull();
    expect(detail!.artifacts).toEqual([]);
  });
});
