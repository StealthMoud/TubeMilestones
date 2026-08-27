import { describe, expect, it } from 'vitest';
import {
  deriveDisplayName,
  normalizeDisplayName,
  profileInitials,
  validateDisplayName,
} from './profile';

describe('TubeMilestones profile identity', () => {
  it('prefers an explicit profile name over Auth metadata and email', () => {
    expect(
      deriveDisplayName(
        { display_name: 'Mahmoud' },
        {
          email: 'stealthmoud@example.com',
          user_metadata: { full_name: 'Metadata Name', name: 'Other Name' },
        },
      ),
    ).toBe('Mahmoud');
  });

  it('uses Google full_name, then name, then the email local-part', () => {
    expect(
      deriveDisplayName(null, {
        email: 'creator@example.com',
        user_metadata: { full_name: '  Creator One  ', name: 'Creator Two' },
      }),
    ).toBe('Creator One');
    expect(
      deriveDisplayName(null, {
        email: 'creator@example.com',
        user_metadata: { name: 'Creator Two' },
      }),
    ).toBe('Creator Two');
    expect(
      deriveDisplayName({ display_name: null }, { email: 'creator@example.com' }),
    ).toBe('creator');
  });

  it('falls back safely and creates concise initials', () => {
    expect(deriveDisplayName(null, null)).toBe('TubeMilestones user');
    expect(profileInitials('Mahmoud Rahimi')).toBe('MR');
    expect(profileInitials('', 'stealth.moud@example.com')).toBe('SM');
  });

  it('trims a valid saved name and rejects blank or overlong input', () => {
    expect(normalizeDisplayName('  Mahmoud  ')).toBe('Mahmoud');
    expect(validateDisplayName('   ')).toBe('Enter a display name.');
    expect(validateDisplayName('x'.repeat(81))).toBe(
      'Display name must be 80 characters or fewer.',
    );
    expect(() => normalizeDisplayName('   ')).toThrow('Enter a display name.');
  });
});
