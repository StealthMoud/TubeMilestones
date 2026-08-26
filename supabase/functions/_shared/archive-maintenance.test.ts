// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { eligibleArchivePeriods, manifestNeedsArchive } from './archive-maintenance';

describe('archive manifest recovery', () => {
  it('skips verified READY periods and retries incomplete/error states', () => {
    expect(manifestNeedsArchive('READY')).toBe(false);
    expect(manifestNeedsArchive('WRITING')).toBe(true);
    expect(manifestNeedsArchive('UPLOADED')).toBe(true);
    expect(manifestNeedsArchive('ERROR')).toBe(true);
    expect(manifestNeedsArchive(null)).toBe(true);
  });

  it('archives complete old months found in analytics or snapshot history', () => {
    expect(
      eligibleArchivePeriods(
        ['2026-02-14', '2026-04-01'],
        ['2026-01-20', '2026-03-31'],
        new Date('2026-08-26T12:00:00.000Z'),
      ),
    ).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});
