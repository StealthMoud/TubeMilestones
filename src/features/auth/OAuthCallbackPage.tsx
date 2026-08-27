import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../../components/common/BrandMark';
import { Button } from '../../components/common/Button';
import { SyncingState } from '../../components/feedback/SyncingState';

const SAFE_ERROR_COPY: Record<string, string> = {
  OAUTH_STATE_INVALID: 'This connection request is invalid. Start again.',
  OAUTH_STATE_EXPIRED: 'This connection request expired. Start again.',
  OAUTH_STATE_USED: 'This connection request was already used. Start again.',
  OAUTH_DENIED: 'YouTube access was not approved.',
  OAUTH_CODE_MISSING: 'Google did not return an authorization code.',
  YOUTUBE_REAUTH_REQUIRED: 'Google did not provide the required offline access.',
  GOOGLE_IDENTITY_FAILED: 'Google account identity could not be verified.',
  YOUTUBE_ACCOUNT_MISMATCH:
    'That is not the Google account connected here. Return and reconnect the matching account.',
  YOUTUBE_CHANNELS_ALREADY_CONNECTED:
    'Every channel from that account is already connected to TubeMilestones.',
  YOUTUBE_API_ERROR: 'The YouTube connection could not be verified.',
  SUPABASE_ERROR: 'TubeMilestones could not finish the connection.',
};

export function OAuthCallbackPage() {
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const result = parameters.get('result');
  const code = parameters.get('code') ?? 'SUPABASE_ERROR';

  useEffect(() => {
    if (result !== 'success' || started.current) return;
    started.current = true;
    navigate('/', { replace: true });
  }, [navigate, result]);

  if (result === 'success') {
    return <SyncingState stage="CHANNEL" />;
  }

  return (
    <main className="connection-result">
      <BrandMark size={48} title="TubeMilestones" />
      <div>
        <p className="eyebrow">Connection not completed</p>
        <h1>YouTube is not connected.</h1>
        <p>{SAFE_ERROR_COPY[code] ?? SAFE_ERROR_COPY.SUPABASE_ERROR}</p>
      </div>
      <div className="connection-result__actions">
        <Button onClick={() => navigate('/settings', { replace: true })}>
          Return to TubeMilestones
        </Button>
      </div>
    </main>
  );
}
