/**
 * business-settings.ts — typed opening hours, booking buffers and holidays.
 *
 * Pure module (T901023): no project imports, no pool/env/clock access. All
 * inputs arrive as parameters; parsers validate strictly and throw RangeError.
 */

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayWindow {
  open: string;
  close: string;
}

export type OpeningHours = Record<Weekday, DayWindow[]>;

export interface BookingBuffers {
  preMin: number;
  postMin: number;
}

export type Holidays = string[];

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const MAX_BUFFER_MIN = 240;

export const DEFAULT_OPENING_HOURS: OpeningHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

export const DEFAULT_BOOKING_BUFFERS: BookingBuffers = { preMin: 0, postMin: 0 };

export const DEFAULT_HOLIDAYS: Holidays = [];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRealDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() + 1 === m && probe.getUTCDate() === d;
}

export function parseOpeningHours(value: unknown): OpeningHours {
  if (!isRecord(value)) throw new RangeError('opening_hours must be an object');
  const out: OpeningHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  for (const [key, intervals] of Object.entries(value)) {
    if (!(WEEKDAYS as readonly string[]).includes(key)) {
      throw new RangeError(`opening_hours: unknown weekday ${JSON.stringify(key)}`);
    }
    if (!Array.isArray(intervals)) {
      throw new RangeError(`opening_hours.${key}: must be an array`);
    }
    const windows: DayWindow[] = [];
    for (const interval of intervals) {
      if (!isRecord(interval) || typeof interval.open !== 'string' || typeof interval.close !== 'string') {
        throw new RangeError(`opening_hours.${key}: interval needs string open/close`);
      }
      for (const field of Object.keys(interval)) {
        if (field !== 'open' && field !== 'close') {
          throw new RangeError(`opening_hours.${key}: unknown field ${JSON.stringify(field)}`);
        }
      }
      if (!TIME_RE.test(interval.open) || !TIME_RE.test(interval.close)) {
        throw new RangeError(`opening_hours.${key}: time must be HH:MM`);
      }
      if (!(interval.open < interval.close)) {
        throw new RangeError(`opening_hours.${key}: open must precede close`);
      }
      windows.push({ open: interval.open, close: interval.close });
    }
    windows.sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0));
    out[key as Weekday] = windows;
  }
  return out;
}

export function parseBookingBuffers(value: unknown): BookingBuffers {
  if (!isRecord(value)) throw new RangeError('booking_buffers must be an object');
  for (const key of Object.keys(value)) {
    if (key !== 'preMin' && key !== 'postMin') {
      throw new RangeError(`booking_buffers: unknown key ${JSON.stringify(key)}`);
    }
  }
  const { preMin, postMin } = value;
  if (typeof preMin !== 'number' || !Number.isInteger(preMin) || preMin < 0 || preMin > MAX_BUFFER_MIN) {
    throw new RangeError('booking_buffers.preMin must be an integer 0..MAX_BUFFER_MIN');
  }
  if (typeof postMin !== 'number' || !Number.isInteger(postMin) || postMin < 0 || postMin > MAX_BUFFER_MIN) {
    throw new RangeError('booking_buffers.postMin must be an integer 0..MAX_BUFFER_MIN');
  }
  return { preMin, postMin };
}

export function parseHolidays(value: unknown): Holidays {
  if (!Array.isArray(value)) throw new RangeError('holidays must be an array');
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !isRealDay(entry)) {
      throw new RangeError('holidays: entries must be real YYYY-MM-DD days');
    }
    if (seen.has(entry)) throw new RangeError(`holidays: duplicate ${entry}`);
    seen.add(entry);
  }
  return [...seen].sort();
}
