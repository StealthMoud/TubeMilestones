export type ComplianceAction = 'NONE' | 'VERIFY' | 'HOLD_AND_PURGE';
export type ComplianceProcessingResult =
  'VERIFIED' | 'RETRY_LATER' | 'PURGE_QUEUED' | 'CLAIM_LOST';

export interface ComplianceClaim {
  userId: string;
  lastAuthorizationVerifiedAt: string | null;
  grantedScopes: string[];
}

export interface ComplianceTokenSet {
  refreshToken: string | null;
  scopes: string[];
}

export interface ComplianceProcessingDependencies {
  readCredential(): Promise<string>;
  refreshCredential(
    refreshToken: string,
    grantedScopes: readonly string[],
  ): Promise<ComplianceTokenSet>;
  storeRotatedCredential(refreshToken: string): Promise<void>;
  markVerified(tokens: ComplianceTokenSet): Promise<boolean>;
  markFailed(code: string, action: ComplianceAction): Promise<boolean>;
  queueAuthorizedDataPurge(): Promise<boolean>;
  errorCode(error: unknown): string;
}

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

export async function processComplianceClaim(
  claim: ComplianceClaim,
  dependencies: ComplianceProcessingDependencies,
  now: Date,
): Promise<ComplianceProcessingResult> {
  try {
    const credential = await dependencies.readCredential();
    const tokens = await dependencies.refreshCredential(
      credential,
      claim.grantedScopes,
    );
    if (tokens.refreshToken) {
      await dependencies.storeRotatedCredential(tokens.refreshToken);
    }
    return (await dependencies.markVerified(tokens)) ? 'VERIFIED' : 'CLAIM_LOST';
  } catch (error) {
    const code = dependencies.errorCode(error);
    const action = isPermanentGoogleFailure(code)
      ? 'HOLD_AND_PURGE'
      : complianceAction(claim.lastAuthorizationVerifiedAt, now, true);
    if (
      action === 'HOLD_AND_PURGE' &&
      !(await dependencies.queueAuthorizedDataPurge())
    ) {
      if (!(await dependencies.markFailed(code, 'VERIFY'))) return 'CLAIM_LOST';
      return 'RETRY_LATER';
    }
    if (!(await dependencies.markFailed(code, action))) return 'CLAIM_LOST';
    if (action !== 'HOLD_AND_PURGE') return 'RETRY_LATER';
    return 'PURGE_QUEUED';
  }
}
