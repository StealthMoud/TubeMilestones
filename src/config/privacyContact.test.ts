import { parsePrivacyContactEmail } from './privacyContact';

describe('privacy contact configuration', () => {
  it('accepts a configured public support address', () => {
    expect(parsePrivacyContactEmail(' privacy@example.test ')).toBe(
      'privacy@example.test',
    );
  });

  it.each([undefined, '', 'not-an-email', 'privacy@example', 'a\n@example.test'])(
    'uses the unconfigured state for %s',
    (value) => {
      expect(parsePrivacyContactEmail(value)).toBeNull();
    },
  );
});
