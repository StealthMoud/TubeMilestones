const DISPLAY_NAME_MAX_LENGTH = 80;

export interface ProfileIdentitySource {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface ProfileNameSource {
  display_name: string | null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a display name.';
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function normalizeDisplayName(value: string): string {
  const validation = validateDisplayName(value);
  if (validation) throw new Error(validation);
  return value.trim();
}

export function deriveDisplayName(
  profile: ProfileNameSource | null,
  user: ProfileIdentitySource | null,
): string {
  const explicit = nonEmptyString(profile?.display_name);
  if (explicit) return explicit;

  const metadata = user?.user_metadata;
  const metadataName =
    nonEmptyString(metadata?.full_name) ?? nonEmptyString(metadata?.name);
  if (metadataName) return metadataName;

  const email = nonEmptyString(user?.email);
  const localPart = email?.split('@', 1)[0]?.trim();
  return localPart || 'TubeMilestones user';
}

export function profileInitials(displayName: string, email?: string | null): string {
  const source = nonEmptyString(displayName) ?? nonEmptyString(email) ?? 'TM';
  const words = source
    .replace(/@.*$/u, '')
    .split(/[\s._-]+/u)
    .filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toLocaleUpperCase();
  return initials || 'TM';
}
