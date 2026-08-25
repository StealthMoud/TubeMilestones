import { formatCompactNumber, formatRemaining, subscriberPrecisionFor } from './format';

describe('metric formatting', () => {
  it.each([
    [742, '742'],
    [1_000, '1K'],
    [1_200, '1.2K'],
    [12_400, '12.4K'],
    [123_000, '123K'],
    [1_050_000, '1.05M'],
    [10_000_000, '10M'],
    [1_000_000_000, '1B'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatCompactNumber(value)).toBe(expected);
  });

  it('does not round 999,999 up to a false 1M milestone', () => {
    expect(formatCompactNumber(999_999)).toBe('999K');
  });

  it('uses approximate copy for rounded subscriber counts', () => {
    expect(
      formatRemaining(2_000, 'subscribers', 'ROUNDED_THREE_SIGNIFICANT_FIGURES'),
    ).toBe('About 2K to go');
  });

  it('models exact, rounded, and hidden subscriber values', () => {
    expect(subscriberPrecisionFor(false, 742)).toBe('EXACT');
    expect(subscriberPrecisionFor(false, 12_300)).toBe(
      'ROUNDED_THREE_SIGNIFICANT_FIGURES',
    );
    expect(subscriberPrecisionFor(true, null)).toBe('HIDDEN');
  });
});
