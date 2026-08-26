export type ComplianceAction = 'NONE' | 'VERIFY' | 'HOLD_AND_PURGE';

const DAY_MS = 24 * 60 * 60 * 1_000;

export function complianceAction(
  lastVerifiedAt: string | null,
  now: Date,
  verificationFailed = false,
): ComplianceAction {
  if (!lastVerifiedAt) return 'VERIFY';
  const ageDays = Math.floor((now.getTime() - Date.parse(lastVerifiedAt)) / DAY_MS);
  if (ageDays < 25) return 'NONE';
  if (ageDays >= 30 && verificationFailed) return 'HOLD_AND_PURGE';
  return 'VERIFY';
}

export function isPermanentGoogleFailure(code: string): boolean {
  return code === 'YOUTUBE_REAUTH_REQUIRED';
}
