import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react';
import appPackage from '../../../package.json';
import { Button } from '../../components/common/Button';
import { ChannelAvatar } from '../../components/common/ChannelAvatar';
import { Modal } from '../../components/common/Modal';
import type { ThemePreference } from '../../domain/models';
import { formatReportingDay } from '../../domain/metrics/dates';
import { SignInMethodsSettings } from '../auth/SignInMethodsSettings';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function parseOptionalMetric(value: string, integer = false): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  const valid =
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= Number.MAX_SAFE_INTEGER &&
    (!integer || Number.isSafeInteger(parsed));
  return valid ? parsed : Number.NaN;
}

export default function SettingsPage() {
  const {
    data,
    connections,
    selectedConnection,
    channels,
    status,
    authUser,
    authMethods,
    isDemo,
    refresh,
    addYouTubeAccount,
    reconnectYouTubeAccount,
    disconnectYouTubeAccount,
    deleteAccount,
    signOut,
    updatePassword,
    setTheme,
    updateManualMetrics,
  } = useTubeMilestones();
  const [disconnectTargetId, setDisconnectTargetId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [watchHours, setWatchHours] = useState(
    data?.manualMetrics?.qualifiedPublicWatchHours?.toString() ?? '',
  );
  const [shortsViews, setShortsViews] = useState(
    data?.manualMetrics?.qualifiedShortsViews?.toString() ?? '',
  );
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSaved, setManualSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [destructivePending, setDestructivePending] = useState(false);

  const accountSettings = (
    <section className="settings-group" aria-labelledby="account-title">
      <h2 id="account-title">TubeMilestones account</h2>
      <div className="settings-list">
        <div className="settings-row settings-row--account-identity">
          <div className="settings-row__copy">
            <strong>{authUser?.email ?? 'Demo session'}</strong>
            <span>Used only to sign into TubeMilestones.</span>
          </div>
        </div>
        <SignInMethodsSettings
          methods={authMethods}
          updatePassword={updatePassword}
          disabled={isDemo}
        />
        <div className="settings-row settings-row--account-actions">
          <div className="settings-row__copy">
            <strong>Account session</strong>
            <span>Signing out does not disconnect any YouTube account.</span>
          </div>
          {!isDemo ? (
            <Button variant="quiet" onClick={() => void signOut()}>
              Sign out
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );

  if (!data) {
    return (
      <div className="page page--settings page--account-only page-enter">
        <Link className="settings-back-link" to="/">
          Back to YouTube connection
        </Link>
        <header className="page-heading">
          <p className="page-heading__context">Account access</p>
          <h1>Settings</h1>
        </header>
        {accountSettings}
      </div>
    );
  }

  const saveManualMetrics = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const qualifiedPublicWatchHours = parseOptionalMetric(watchHours);
    const qualifiedShortsViews = parseOptionalMetric(shortsViews, true);
    if (Number.isNaN(qualifiedPublicWatchHours) || Number.isNaN(qualifiedShortsViews)) {
      setManualError(
        'Manual values must be zero or a positive safe number; Shorts views must be a whole number.',
      );
      setManualSaved(false);
      return;
    }
    setSaving(true);
    setManualError(null);
    setManualSaved(false);
    try {
      await updateManualMetrics({
        qualifiedPublicWatchHours,
        qualifiedShortsViews,
      });
      setManualSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const confirmDisconnect = async () => {
    if (!disconnectTargetId) return;
    setDestructivePending(true);
    try {
      await disconnectYouTubeAccount(disconnectTargetId);
      setDisconnectTargetId(null);
    } finally {
      setDestructivePending(false);
    }
  };

  const confirmDelete = async () => {
    setDestructivePending(true);
    try {
      await deleteAccount();
      setDeleteOpen(false);
    } finally {
      setDestructivePending(false);
    }
  };

  const refreshing = status === 'AUTHORIZING' || status === 'SYNCING';
  const disconnectTarget =
    connections.find(({ id }) => id === disconnectTargetId) ?? null;

  return (
    <div className="page page--settings page-enter">
      <header className="page-heading">
        <p className="page-heading__context">Account and preferences</p>
        <h1>Settings</h1>
      </header>

      {accountSettings}

      <section className="settings-group" aria-labelledby="youtube-accounts-title">
        <div className="settings-group__heading">
          <div>
            <h2 id="youtube-accounts-title">Connected YouTube accounts</h2>
            <p>Each Google authorization and its channels are managed independently.</p>
          </div>
        </div>
        <div className="settings-list settings-connections">
          {connections.length > 0 ? (
            connections.map((account) => {
              const accountChannels = channels.filter(
                ({ connectionId }) => connectionId === account.id,
              );
              const isSelected = account.id === selectedConnection?.id;
              return (
                <div className="settings-connection" key={account.id}>
                  <div className="settings-connection__heading">
                    <div className="settings-row__copy">
                      <strong>
                        {account.google_email ?? 'Connected Google account'}
                      </strong>
                      <span>
                        {account.status === 'CONNECTED'
                          ? 'Read-only YouTube access'
                          : account.status.replaceAll('_', ' ').toLowerCase()}
                      </span>
                    </div>
                    <span
                      className={`settings-status${
                        account.status === 'CONNECTED' ? '' : ' is-warning'
                      }`}
                    >
                      {isSelected
                        ? 'Current account'
                        : account.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <div className="settings-connection__channels">
                    {accountChannels.map((channel) => (
                      <div key={channel.channelId}>
                        <ChannelAvatar
                          title={channel.title}
                          src={channel.thumbnailUrl}
                          size="small"
                        />
                        <span>
                          <strong>{channel.title}</strong>
                          <small>{channel.youtubeChannelId}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="settings-connection__actions">
                    <Button
                      variant="quiet"
                      icon={<RotateCw size={16} aria-hidden="true" />}
                      disabled={refreshing || isDemo}
                      onClick={() => void reconnectYouTubeAccount(account.id)}
                    >
                      Reconnect
                    </Button>
                    <Button
                      variant="danger"
                      icon={<Unplug size={16} aria-hidden="true" />}
                      disabled={destructivePending}
                      onClick={() => setDisconnectTargetId(account.id)}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="settings-row settings-row--identity">
              <ChannelAvatar
                title={data.channel.title}
                src={data.channel.thumbnailUrl}
                size="large"
              />
              <div className="settings-row__copy">
                <strong>{data.channel.title}</strong>
                <span>Demo YouTube account</span>
              </div>
            </div>
          )}
          <div className="settings-row">
            <div className="settings-row__copy">
              <strong>Add another YouTube account</strong>
              <span>Google will always show the account chooser.</span>
            </div>
            <Button
              variant="secondary"
              icon={<Plus size={16} aria-hidden="true" />}
              disabled={refreshing || isDemo}
              onClick={() => void addYouTubeAccount()}
            >
              Add account
            </Button>
          </div>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="appearance-title">
        <h2 id="appearance-title">Appearance</h2>
        <div className="settings-list">
          <div className="settings-row settings-row--stack-mobile">
            <div className="settings-row__copy">
              <strong>Color theme</strong>
              <span>Follow your device or choose a fixed appearance.</span>
            </div>
            <div className="theme-segmented" role="radiogroup" aria-label="Color theme">
              {THEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={data.metadata.themePreference === option.value}
                  onClick={() => void setTheme(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="youtube-data-title">
        <h2 id="youtube-data-title">YouTube data</h2>
        <div className="settings-list">
          <div className="settings-row">
            <div className="settings-row__copy">
              <strong>Last refresh</strong>
              <span>
                {formatTimestamp(
                  selectedConnection?.last_synced_at ?? data.channel.updatedAt,
                )}
              </span>
            </div>
            <Button
              variant="secondary"
              icon={<RefreshCw size={17} aria-hidden="true" />}
              disabled={refreshing || isDemo}
              onClick={() => void refresh()}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
          <div className="settings-row">
            <div className="settings-row__copy">
              <strong>Analytics available through</strong>
              <span>
                {data.analyticsSummary?.availableThrough
                  ? formatReportingDay(data.analyticsSummary.availableThrough, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Not available'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="manual-metrics-title">
        <div className="settings-group__heading">
          <div>
            <h2 id="manual-metrics-title">YPP guidance</h2>
            <p>Optional figures copied from YouTube Studio.</p>
          </div>
          <span className="source-badge">User entered</span>
        </div>
        <form className="settings-list manual-settings" onSubmit={saveManualMetrics}>
          <label className="settings-field-row">
            <span>
              <strong>Qualified public watch hours</strong>
              <small>Use the current eligibility window shown in Studio.</small>
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={watchHours}
              placeholder="Not entered"
              onChange={(event) => {
                setWatchHours(event.target.value);
                setManualSaved(false);
              }}
            />
          </label>
          <label className="settings-field-row">
            <span>
              <strong>Qualified public Shorts views</strong>
              <small>Use the current eligibility window shown in Studio.</small>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={shortsViews}
              placeholder="Not entered"
              onChange={(event) => {
                setShortsViews(event.target.value);
                setManualSaved(false);
              }}
            />
          </label>
          <div className="settings-form-footer">
            <p>
              These are guidance values, not an eligibility determination. YouTube
              Studio remains the source of truth.
            </p>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save values'}
            </Button>
          </div>
          {manualError ? <p className="form-error">{manualError}</p> : null}
          {manualSaved ? (
            <p className="manual-save-success" role="status">
              User-entered values saved.
            </p>
          ) : null}
        </form>
      </section>

      <section className="settings-group" aria-labelledby="privacy-title">
        <div className="settings-group__heading">
          <div>
            <h2 id="privacy-title">Data &amp; privacy</h2>
            <p>Server-side credentials, per-user isolation, and complete deletion.</p>
          </div>
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div className="settings-list">
          {!isDemo ? (
            <div className="settings-row">
              <div className="settings-row__copy">
                <strong>Delete TubeMilestones account</strong>
                <span>Delete the account and all hot and archived data.</span>
              </div>
              <Button
                variant="danger"
                icon={<Trash2 size={16} aria-hidden="true" />}
                onClick={() => setDeleteOpen(true)}
              >
                Delete account
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="settings-group" aria-labelledby="about-title">
        <h2 id="about-title">About</h2>
        <div className="settings-list settings-list--links">
          <a href="./privacy.html">
            <span>Privacy policy</span>
            <ExternalLink size={15} aria-hidden="true" />
          </a>
          <a href="./terms.html">
            <span>Terms</span>
            <ExternalLink size={15} aria-hidden="true" />
          </a>
          <a
            href="https://github.com/StealthMoud/TubeMilestones"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>GitHub</span>
            <ExternalLink size={15} aria-hidden="true" />
          </a>
          <div className="settings-row">
            <div className="settings-row__copy">
              <strong>TubeMilestones {appPackage.version}</strong>
              <span>Independent from YouTube and Google.</span>
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={disconnectTargetId !== null}
        title="Disconnect this YouTube account?"
        description={`Disconnecting ${
          disconnectTarget?.google_email ?? 'this Google account'
        } removes only its TubeMilestones authorization, channels, and saved channel data. Other connected accounts stay available. It does not delete anything from YouTube.`}
        onClose={() => setDisconnectTargetId(null)}
      >
        <div className="modal-actions">
          <Button variant="quiet" onClick={() => setDisconnectTargetId(null)}>
            Keep connected
          </Button>
          <Button
            variant="danger"
            disabled={destructivePending}
            onClick={() => void confirmDisconnect()}
          >
            {destructivePending ? 'Disconnecting…' : 'Disconnect and delete data'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete your TubeMilestones account?"
        description="This permanently removes every connected YouTube account, all hot database records, encrypted archives, and your TubeMilestones account. This cannot be undone."
        onClose={() => setDeleteOpen(false)}
      >
        <div className="modal-actions">
          <Button variant="quiet" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={destructivePending}
            onClick={() => void confirmDelete()}
          >
            {destructivePending ? 'Deleting…' : 'Permanently delete account'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
