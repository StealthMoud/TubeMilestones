import { formatReportingDay, parseReportingDay, toReportingDay } from './dates';

describe('reporting day handling', () => {
  it('formats a YouTube reporting day without a timezone shift', () => {
    expect(formatReportingDay('2026-08-24')).toBe('Aug 24');
  });

  it('round-trips a reporting day through UTC', () => {
    expect(toReportingDay(parseReportingDay('2026-01-01'))).toBe('2026-01-01');
  });

  it('rejects impossible reporting days', () => {
    expect(() => parseReportingDay('2026-02-30')).toThrow(RangeError);
    expect(() => parseReportingDay('08/24/2026')).toThrow(RangeError);
  });
});
