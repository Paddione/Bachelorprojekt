import { describe, it, expect } from 'vitest';
import {
  parseOpeningHours,
  parseBookingBuffers,
  parseHolidays,
  DEFAULT_OPENING_HOURS,
  DEFAULT_BOOKING_BUFFERS,
  DEFAULT_HOLIDAYS,
  MAX_BUFFER_MIN,
  WEEKDAYS,
} from '../business-settings.js';

describe('parseOpeningHours', () => {
  it('accepts valid weekday intervals', () => {
    const hours = parseOpeningHours({
      mon: [{ open: '09:00', close: '17:00' }],
      tue: [],
    });
    expect(hours.mon).toEqual([{ open: '09:00', close: '17:00' }]);
    expect(hours.tue).toEqual([]);
  });

  it('accepts several intervals per day and returns them sorted by start', () => {
    const hours = parseOpeningHours({
      wed: [
        { open: '13:00', close: '17:00' },
        { open: '09:00', close: '12:00' },
      ],
    });
    expect(hours.wed).toEqual([
      { open: '09:00', close: '12:00' },
      { open: '13:00', close: '17:00' },
    ]);
  });

  it('defaults missing weekdays to closed', () => {
    const hours = parseOpeningHours({});
    for (const day of WEEKDAYS) {
      expect(hours[day]).toEqual([]);
    }
  });

  it('rejects intervals where close is not after open', () => {
    expect(() => parseOpeningHours({ mon: [{ open: '17:00', close: '09:00' }] })).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: [{ open: '09:00', close: '09:00' }] })).toThrow(RangeError);
  });

  it('rejects empty or incomplete intervals', () => {
    expect(() => parseOpeningHours({ mon: [{}] })).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: [{ open: '09:00' }] })).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: [{ close: '17:00' }] })).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: [null] })).toThrow(RangeError);
  });

  it('rejects times outside the 24h leading-zero HH:MM shape', () => {
    expect(() => parseOpeningHours({ mon: [{ open: '9:00', close: '17:00' }] })).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: [{ open: '09:00', close: '24:00' }] })).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: [{ open: '09:60', close: '17:00' }] })).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: [{ open: 'ab:cd', close: '17:00' }] })).toThrow(RangeError);
  });

  it('rejects unknown weekday keys', () => {
    expect(() => parseOpeningHours({ funday: [] })).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: [], MON: [] })).toThrow(RangeError);
  });

  it('rejects non-object blobs', () => {
    expect(() => parseOpeningHours(null)).toThrow(RangeError);
    expect(() => parseOpeningHours([])).toThrow(RangeError);
    expect(() => parseOpeningHours('09:00')).toThrow(RangeError);
    expect(() => parseOpeningHours({ mon: 'closed' })).toThrow(RangeError);
  });
});

describe('parseBookingBuffers', () => {
  it('accepts zero and positive buffers up to the cap', () => {
    expect(parseBookingBuffers({ preMin: 0, postMin: 0 })).toEqual({ preMin: 0, postMin: 0 });
    expect(parseBookingBuffers({ preMin: 15, postMin: 30 })).toEqual({ preMin: 15, postMin: 30 });
    expect(parseBookingBuffers({ preMin: MAX_BUFFER_MIN, postMin: MAX_BUFFER_MIN })).toEqual({
      preMin: MAX_BUFFER_MIN,
      postMin: MAX_BUFFER_MIN,
    });
  });

  it('rejects negative or absurd buffers', () => {
    expect(() => parseBookingBuffers({ preMin: -5, postMin: 0 })).toThrow(RangeError);
    expect(() => parseBookingBuffers({ preMin: 0, postMin: -1 })).toThrow(RangeError);
    expect(() => parseBookingBuffers({ preMin: MAX_BUFFER_MIN + 1, postMin: 0 })).toThrow(RangeError);
    expect(() => parseBookingBuffers({ preMin: 0, postMin: 100000 })).toThrow(RangeError);
  });

  it('rejects non-integer buffers', () => {
    expect(() => parseBookingBuffers({ preMin: 1.5, postMin: 0 })).toThrow(RangeError);
    expect(() => parseBookingBuffers({ preMin: 0, postMin: '30' })).toThrow(RangeError);
  });

  it('rejects unknown keys and missing fields', () => {
    expect(() => parseBookingBuffers({ preMin: 0, postMin: 0, pauseMin: 5 })).toThrow(RangeError);
    expect(() => parseBookingBuffers({ preMin: 5 })).toThrow(RangeError);
    expect(() => parseBookingBuffers({})).toThrow(RangeError);
    expect(() => parseBookingBuffers(null)).toThrow(RangeError);
  });
});

describe('parseHolidays', () => {
  it('accepts ISO days and returns them sorted ascending', () => {
    expect(parseHolidays(['2026-12-25', '2026-01-01'])).toEqual(['2026-01-01', '2026-12-25']);
    expect(parseHolidays([])).toEqual([]);
  });

  it('rejects duplicate entries', () => {
    expect(() => parseHolidays(['2026-12-25', '2026-12-25'])).toThrow(RangeError);
  });

  it('rejects invalid calendar days', () => {
    expect(() => parseHolidays(['2026-02-30'])).toThrow(RangeError);
    expect(() => parseHolidays(['2026-13-01'])).toThrow(RangeError);
    expect(() => parseHolidays(['not-a-date'])).toThrow(RangeError);
    expect(() => parseHolidays(['2026-1-1'])).toThrow(RangeError);
    expect(() => parseHolidays(['2026-01-01', 123])).toThrow(RangeError);
  });

  it('rejects non-array blobs', () => {
    expect(() => parseHolidays(null)).toThrow(RangeError);
    expect(() => parseHolidays({})).toThrow(RangeError);
    expect(() => parseHolidays('2026-01-01')).toThrow(RangeError);
  });
});

describe('settings defaults', () => {
  it('ships all days closed, zero buffers and an empty holiday list', () => {
    for (const day of WEEKDAYS) {
      expect(DEFAULT_OPENING_HOURS[day]).toEqual([]);
    }
    expect(DEFAULT_BOOKING_BUFFERS).toEqual({ preMin: 0, postMin: 0 });
    expect(DEFAULT_HOLIDAYS).toEqual([]);
    expect(MAX_BUFFER_MIN).toBe(240);
  });
});
