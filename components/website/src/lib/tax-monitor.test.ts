import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const getSiteSetting = vi.fn();
const setSiteSetting = vi.fn();
const initTaxMonitorTables = vi.fn();

vi.mock('./website-db', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
  getSiteSetting: (...a: unknown[]) => getSiteSetting(...a),
  setSiteSetting: (...a: unknown[]) => setSiteSetting(...a),
  initTaxMonitorTables: (...a: unknown[]) => initTaxMonitorTables(...a),
}));

import {
  getTaxMode, setTaxMode, getYearRevenue, checkThreshold, TaxThresholdStatus,
  checkAndApplyTaxModeSwitch, getMonthlyBreakdown, getUstvaExport,
  THRESHOLD_KLEIN, THRESHOLD_HARD,
} from './tax-monitor';

beforeEach(() => {
  query.mockReset();
  getSiteSetting.mockReset();
  setSiteSetting.mockReset();
  initTaxMonitorTables.mockReset();
  initTaxMonitorTables.mockResolvedValue(undefined);
});

it('returns 0 revenue for an empty brand', async () => {
  query.mockResolvedValueOnce({ rows: [{ total: '0' }] });
  const r = await getYearRevenue('test-empty', 2025);
  expect(r).toBe(0);
});

it('correctly classifies threshold status', () => {
  expect(checkThreshold(0)).toBe(TaxThresholdStatus.Safe);
  expect(checkThreshold(20000)).toBe(TaxThresholdStatus.Warning);
  expect(checkThreshold(24999)).toBe(TaxThresholdStatus.Warning);
  expect(checkThreshold(25000)).toBe(TaxThresholdStatus.Exceeded);
  expect(checkThreshold(100001)).toBe(TaxThresholdStatus.HardExceeded);
});

describe('getTaxMode', () => {
  it('defaults to kleinunternehmer when the setting is unset', async () => {
    getSiteSetting.mockResolvedValueOnce(null);
    expect(await getTaxMode('mentolder')).toBe('kleinunternehmer');
  });

  it('defaults to kleinunternehmer for any value other than regelbesteuerung', async () => {
    getSiteSetting.mockResolvedValueOnce('garbage');
    expect(await getTaxMode('mentolder')).toBe('kleinunternehmer');
  });

  it('returns regelbesteuerung when explicitly set', async () => {
    getSiteSetting.mockResolvedValueOnce('regelbesteuerung');
    expect(await getTaxMode('mentolder')).toBe('regelbesteuerung');
  });
});

describe('setTaxMode', () => {
  it('is a no-op when the mode is unchanged', async () => {
    getSiteSetting.mockResolvedValueOnce('kleinunternehmer');
    await setTaxMode('mentolder', 'kleinunternehmer');
    expect(setSiteSetting).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(initTaxMonitorTables).toHaveBeenCalledTimes(1);
  });

  it('persists the switch and logs a tax_mode_changes row', async () => {
    getSiteSetting.mockResolvedValueOnce('kleinunternehmer');
    query.mockResolvedValueOnce({ rows: [] });
    await setTaxMode('mentolder', 'regelbesteuerung', {
      triggerInvoiceId: 'inv-1', yearRevenue: 30000, notes: 'manual',
    });
    expect(setSiteSetting).toHaveBeenCalledWith('mentolder', 'tax_mode', 'regelbesteuerung');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO tax_mode_changes/);
    expect(params).toEqual(['mentolder', 'kleinunternehmer', 'regelbesteuerung', 'inv-1', 30000, 'manual']);
  });

  it('defaults opts fields to null when omitted', async () => {
    getSiteSetting.mockResolvedValueOnce('kleinunternehmer');
    query.mockResolvedValueOnce({ rows: [] });
    await setTaxMode('mentolder', 'regelbesteuerung');
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toEqual(['mentolder', 'kleinunternehmer', 'regelbesteuerung', null, null, null]);
  });
});

describe('getYearRevenue', () => {
  it('queries with brand + year and casts total to a number', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '12345.67' }] });
    const r = await getYearRevenue('mentolder', 2026);
    expect(r).toBe(12345.67);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FROM billing_invoices/);
    expect(params).toEqual(['mentolder', 2026]);
  });
});

describe('checkAndApplyTaxModeSwitch', () => {
  it('returns false and does not switch when revenue is below the threshold', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '5000' }] }); // getYearRevenue
    const out = await checkAndApplyTaxModeSwitch('mentolder', 'inv-1');
    expect(out).toBe(false);
    expect(setSiteSetting).not.toHaveBeenCalled();
    expect(getSiteSetting).not.toHaveBeenCalled();
  });

  it('switches to regelbesteuerung once revenue crosses THRESHOLD_KLEIN', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: String(THRESHOLD_KLEIN) }] }); // getYearRevenue
    getSiteSetting
      .mockResolvedValueOnce('kleinunternehmer') // getTaxMode inside checkAndApplyTaxModeSwitch
      .mockResolvedValueOnce('kleinunternehmer'); // getTaxMode inside setTaxMode
    query.mockResolvedValueOnce({ rows: [] }); // INSERT tax_mode_changes
    const out = await checkAndApplyTaxModeSwitch('mentolder', 'inv-1');
    expect(out).toBe(true);
    expect(setSiteSetting).toHaveBeenCalledWith('mentolder', 'tax_mode', 'regelbesteuerung');
    const insertCall = query.mock.calls.find((c) => /INSERT INTO tax_mode_changes/.test(c[0] as string));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[3]).toBe('inv-1');
    expect(params[4]).toBe(THRESHOLD_KLEIN);
    expect(params[5]).toMatch(/Automatischer Wechsel/);
  });

  it('does not switch again once already on regelbesteuerung', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: String(THRESHOLD_HARD + 1) }] });
    getSiteSetting.mockResolvedValueOnce('regelbesteuerung');
    const out = await checkAndApplyTaxModeSwitch('mentolder', 'inv-1');
    expect(out).toBe(false);
    expect(setSiteSetting).not.toHaveBeenCalled();
  });
});

describe('getMonthlyBreakdown', () => {
  it('builds all 12 months with cumulative revenue and threshold status', async () => {
    query.mockResolvedValueOnce({ rows: [
      { month: 1, net: '10000' },
      { month: 2, net: '11000' }, // cumulative 21000 -> Warning
      { month: 6, net: '5000' },  // cumulative 26000 -> Exceeded
    ] });
    const out = await getMonthlyBreakdown('mentolder', 2026);
    expect(out).toHaveLength(12);
    expect(out[0]).toEqual({ month: 1, net: 10000, cumulative: 10000, status: TaxThresholdStatus.Safe });
    expect(out[1].cumulative).toBe(21000);
    expect(out[1].status).toBe(TaxThresholdStatus.Warning);
    expect(out[5].cumulative).toBe(26000);
    expect(out[5].status).toBe(TaxThresholdStatus.Exceeded);
    // months without data carry forward the cumulative sum with net=0
    expect(out[2].net).toBe(0);
    expect(out[2].cumulative).toBe(21000);
    expect(out[11].net).toBe(0);
  });
});

describe('getUstvaExport', () => {
  it('computes yearly totals across all months when no quarter is given', async () => {
    query.mockResolvedValueOnce({ rows: [
      { tax_rate: '19', net: '1000', tax: '190' },
      { tax_rate: '7', net: '200', tax: '14' },
    ] });
    getSiteSetting.mockResolvedValueOnce('regelbesteuerung');
    const out = await getUstvaExport('mentolder', 2026);
    expect(out.period).toBe('2026');
    expect(out.taxMode).toBe('regelbesteuerung');
    expect(out.revenue19).toBe(1000);
    expect(out.revenue7).toBe(200);
    expect(out.revenue0).toBe(0);
    expect(out.tax19).toBe(190);
    expect(out.tax7).toBe(14);
    expect(out.totalTax).toBe(204);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/GROUP BY tax_rate/);
    expect(params).toEqual(['mentolder', 2026, 1, 12]);
  });

  it('scopes to a quarter and defaults missing rates to 0', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    getSiteSetting.mockResolvedValueOnce('kleinunternehmer');
    const out = await getUstvaExport('mentolder', 2026, 2);
    expect(out.period).toBe('Q2/2026');
    expect(out.taxMode).toBe('kleinunternehmer');
    expect(out.revenue0).toBe(0);
    expect(out.revenue7).toBe(0);
    expect(out.revenue19).toBe(0);
    expect(out.totalTax).toBe(0);
    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['mentolder', 2026, 4, 6]);
  });
});
