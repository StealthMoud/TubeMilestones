export interface YppThresholdSet {
  subscriberTarget: number;
  qualifiedPublicWatchHoursTarget: number;
  qualifiedShortsViewsTarget: number;
  watchHoursWindowDays: number;
  shortsViewsWindowDays: number;
}

export const YPP_POLICY = {
  version: '2026-08-26',
  effectiveThrough: '2027-01-31',
  expanded: {
    subscriberTarget: 500,
    qualifiedPublicWatchHoursTarget: 3_000,
    qualifiedShortsViewsTarget: 3_000_000,
    watchHoursWindowDays: 365,
    shortsViewsWindowDays: 90,
  } satisfies YppThresholdSet,
  full: {
    subscriberTarget: 1_000,
    qualifiedPublicWatchHoursTarget: 4_000,
    qualifiedShortsViewsTarget: 10_000_000,
    watchHoursWindowDays: 365,
    shortsViewsWindowDays: 90,
  } satisfies YppThresholdSet,
  sourceUrl: 'https://support.google.com/youtube/answer/72851',
} as const;

export const YPP_DISCLAIMER =
  'Manual values are guidance only. Check YouTube Studio for official eligibility, regional availability, and current policy.';
