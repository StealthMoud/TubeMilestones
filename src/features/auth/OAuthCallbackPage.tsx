import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../../components/common/BrandMark';
import { Button } from '../../components/common/Button';
import { SyncingState } from '../../components/feedback/SyncingState';
import { youtubeOAuthTestingMode } from '../../config/runtime';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';
import { userMessageForError } from '../../services/errors';

const SAFE_ERROR_COPY: Record<string, string> = {
  OAUTH_CODE_MISSING: 'Google did not return an authorization code.',
  YOUTUBE_REAUTH_REQUIRED: 'Google did not provide the required offline access.',
  GOOGLE_IDENTITY_FAILED: 'Google account identity could not be verified.',
  YOUTUBE_ACCOUNT_MISMATCH:
    'That is not the Google account connected here. Choose the matching account and try reconnecting again.',
  YOUTUBE_CHANNELS_ALREADY_CONNECTED:
    'Every channel from that account is already connected to TubeMilestones.',
  YOUTUBE_API_ERROR: 'The YouTube connection could not be verified.',
  SUPABASE_ERROR: 'TubeMilestones could not finish the connection.',
};

const EXPIRED_STATE_CODES = new Set([
  'OAUTH_STATE_INVALID',
  'OAUTH_STATE_EXPIRED',
  'OAUTH_STATE_USED',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function OAuthCallbackPage() {
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const { addYouTubeAccount, reconnectYouTubeAccount } = useTubeMilestones();
  const result = parameters.get('result');
  const code = parameters.get('code') ?? 'SUPABASE_ERROR';
  const requestedConnectionId = parameters.get('connectionId');
  const reconnect =
    parameters.get('intent') === 'RECONNECT' &&
    Boolean(requestedConnectionId && UUID_PATTERN.test(requestedConnectionId));
  const expired = EXPIRED_STATE_CODES.has(code);

  useEffect(() => {
    if (result !== 'success' || started.current) return;
    started.current = true;
    navigate('/', { replace: true });
  }, [navigate, result]);

  if (result === 'success') {
    return <SyncingState stage="CHANNEL" />;
  }

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      if (reconnect && requestedConnectionId) {
        await reconnectYouTubeAccount(requestedConnectionId);
      } else {
        await addYouTubeAccount();
      }
    } catch (error) {
      setRetryError(userMessageForError(error));
      setRetrying(false);
    }
  };

  const denialCopy = youtubeOAuthTestingMode()
    ? 'Google did not allow this account to connect. Make sure this Google account is an approved TubeMilestones test user.'
    : 'Google did not allow this account to connect.';
  const copy =
    code === 'OAUTH_DENIED'
      ? denialCopy
      : expired
        ? 'This connection attempt can no longer be used.'
        : (SAFE_ERROR_COPY[code] ?? SAFE_ERROR_COPY.SUPABASE_ERROR);

  return (
    <main className="connection-result">
      <BrandMark size={48} title="TubeMilestones" />
      <div>
        <p className="eyebrow">Connection not completed</p>
        <h1>{expired ? 'YouTube connection expired' : 'YouTube is not connected.'}</h1>
        <p>{copy}</p>
        {retryError ? (
          <p className="form-error" role="alert">
            {retryError}
          </p>
        ) : null}
      </div>
      <div className="connection-result__actions">
        <Button onClick={() => void retry()} disabled={retrying}>
          {retrying
            ? 'Opening Google…'
            : reconnect
              ? 'Try reconnecting again'
              : 'Start a new connection'}
        </Button>
        <Button variant="quiet" onClick={() => navigate('/', { replace: true })}>
          Back to TubeMilestones
        </Button>
      </div>
    </main>
  );
}
