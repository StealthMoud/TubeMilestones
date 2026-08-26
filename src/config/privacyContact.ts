export function parsePrivacyContactEmail(value: string | undefined): string | null {
  const email = value?.trim() ?? '';
  const hasControlCharacter = [...email].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (
    !email ||
    email.length > 254 ||
    hasControlCharacter ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    return null;
  }
  return email;
}
