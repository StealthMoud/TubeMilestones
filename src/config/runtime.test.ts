import { resolveApplicationBaseUrl } from './runtime';

describe('resolveApplicationBaseUrl', () => {
  it('keeps the GitHub Pages project path while removing route state', () => {
    expect(
      resolveApplicationBaseUrl(
        'https://stealthmoud.github.io/TubeMilestones/?auth=callback#/settings',
        './',
      ),
    ).toBe('https://stealthmoud.github.io/TubeMilestones/');
  });
});
