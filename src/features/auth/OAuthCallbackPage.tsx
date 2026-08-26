import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../../components/common/BrandMark';
import { Button } from '../../components/common/Button';
import { SyncingState } from '../../components/feedback/SyncingState';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';

const SAFE_ERROR_COPY: Record<string, string> = {
  OAUTH_STATE_INVALID: 'This connection request is invalid. Start again.',
  OAUTH_STATE_EXPIRED: 'This connection request expired. Start again.',
  OAUTH_STATE_USED: 'This connection request was already used. Start again.',
  OAUTH_DENIED: 'YouTube access was not approved.',
  OAUTH_CODE_MISSING: 'Google did not return an authorization code.',
  YOUTUBE_REAUTH_REQUIRED: 'Google did not provide the required offline access.',
  YOUTUBE_API_ERROR: 'The YouTube connection could not be verified.',
  SUPABASE_ERROR: 'TubeMilestones could not finish the connection.',
};

export function OAuthCallbackPage() {
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const { refresh, connect } = useTubeMilestones();
  const started = useRef(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const result = parameters.get('result');
  const code = parameters.get('code') ?? 'SUPABASE_ERROR';

  useEffect(() => {
    if (result !== 'success' || started.current) return;
    started.current = true;
    void refresh()
      .then(() => navigate('/', { replace: true }))
      .catch(() => setSyncFailed(true));
  }, [navigate, refresh, result]);

  if (result === 'success' && !syncFailed) {
    return <SyncingState stage="ANALYTICS" />;
  }

  return (
    <main className="connection-result">
      <BrandMark size={48} title="TubeMilestones" />
      <div>
        <p className="eyebrow">Connection not completed</p>
        <h1>
          {syncFailed
            ? 'Your first sync could not finish.'
            : 'YouTube is not connected.'}
        </h1>
        <p>
          {syncFailed
            ? 'Your authorization is saved securely. Try the initial sync again.'
            : (SAFE_ERROR_COPY[code] ?? SAFE_ERROR_COPY.SUPABASE_ERROR)}
        </p>
      </div>
      <div className="connection-result__actions">
        {syncFailed ? (
          <Button onClick={() => window.location.reload()}>Retry sync</Button>
        ) : (
          <Button onClick={() => void connect()}>Connect YouTube</Button>
        )}
        <Button variant="quiet" onClick={() => navigate('/', { replace: true })}>
          Return home
        </Button>
      </div>
    </main>
  );
}
