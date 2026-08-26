import { useState, type FormEvent } from 'react';
import {
  Database,
  ExternalLink,
  Info,
  Palette,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react';
import appPackage from '../../../package.json';
import { useApp } from '../../app/AppProvider';
import { Button } from '../../components/common/Button';
import { ChannelAvatar } from '../../components/common/ChannelAvatar';
import { Modal } from '../../components/common/Modal';
import type { ThemePreference } from '../../domain/models';
import { formatReportingDay } from '../../domain/metrics/dates';

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export default function SettingsPage() {
  const {
    data,
    status,
    connect,
    disconnect,
    clearLocalData,
    setTheme,
    updateManualMetrics,
  } = useApp();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [watchHours, setWatchHours] = useState(
    data?.manualMetrics?.qualifiedPublicWatchHours?.toString() ?? '',
  );
  const [shortsViews, setShortsViews] = useState(
    data?.manualMetrics?.qualifiedShortsViews?.toString() ?? '',
  );
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSaved, setManualSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!data) return null;

  const parseOptionalMetric = (value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
  };

  const saveManualMetrics = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const qualifiedPublicWatchHours = parseOptionalMetric(watchHours);
    const qualifiedShortsViews = parseOptionalMetric(shortsViews);
    if (Number.isNaN(qualifiedPublicWatchHours) || Number.isNaN(qualifiedShortsViews)) {
      setManualError('Manual values must be zero or a positive number.');
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

  return (
    <div className="page page--settings page-enter">
      <header className="page-heading">
        <p className="page-heading__context">Preferences and data</p>
        <h1>Settings.</h1>
      </header>

      <section className="settings-section" aria-labelledby="connected-channel-title">
        <div className="settings-section__heading">
          <ShieldCheck size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2 id="connected-channel-title">Connected channel</h2>
            <p>Read-only Google authorization</p>
          </div>
        </div>
        <div className="connected-channel-card">
          <ChannelAvatar
            title={data.channel.title}
            src={data.channel.thumbnailUrl}
            size="large"
          />
          <div className="connected-channel-card__identity">
            <strong>{data.channel.title}</strong>
            <span title={data.channel.channelId}>{data.channel.channelId}</span>
          </div>
          <div className="connected-channel-card__actions">
            <Button
              variant="secondary"
              icon={<RefreshCw size={17} aria-hidden="true" />}
              onClick={() => void connect()}
              disabled={status === 'AUTHORIZING' || status === 'SYNCING'}
            >
              Reconnect
            </Button>
            <Button
              variant="danger"
              icon={<Unplug size={17} aria-hidden="true" />}
              onClick={() => setDisconnectOpen(true)}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="data-settings-title">
        <div className="settings-section__heading">
          <Database size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2 id="data-settings-title">Data</h2>
            <p>Saved only in this browser</p>
          </div>
        </div>
        <dl className="settings-detail-list">
          <div>
            <dt>Last YouTube Data refresh</dt>
            <dd>{formatTimestamp(data.channel.updatedAt)}</dd>
          </div>
          <div>
            <dt>Analytics available through</dt>
            <dd>
              {data.analyticsSummary?.availableThrough
                ? formatReportingDay(data.analyticsSummary.availableThrough, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Not available'}
            </dd>
          </div>
          <div>
            <dt>Tracking began</dt>
            <dd>{formatTimestamp(data.metadata.trackingStartedAt)}</dd>
          </div>
        </dl>
        <div className="settings-section__action-row">
          <div>
            <strong>Clear local data</strong>
            <span>Delete saved channel history and return to the landing page.</span>
          </div>
          <Button
            variant="danger"
            icon={<Trash2 size={17} aria-hidden="true" />}
            onClick={() => setClearOpen(true)}
          >
            Clear data
          </Button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="appearance-title">
        <div className="settings-section__heading">
          <Palette size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2 id="appearance-title">Appearance</h2>
            <p>Follow your device or choose a theme</p>
          </div>
        </div>
        <div className="theme-choices" role="radiogroup" aria-label="Color theme">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={data.metadata.themePreference === option.value}
              onClick={() => void setTheme(option.value)}
            >
              <i aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="manual-metrics-title">
        <div className="settings-section__heading">
          <PencilLine size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2 id="manual-metrics-title">Manual YPP metrics</h2>
            <p>Optional guidance values from YouTube Studio</p>
          </div>
        </div>
        <p className="settings-section__intro">
          Enter the values shown in YouTube Studio. TubeMilestones cannot retrieve these
          exact qualified figures through the APIs it uses. Check YouTube Studio for
          official eligibility.
        </p>
        <form
          className="manual-metrics-form"
          onSubmit={(event) => void saveManualMetrics(event)}
        >
          <label className="form-field">
            <span>Qualified public watch hours</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={watchHours}
              placeholder="2840"
              onChange={(event) => {
                setWatchHours(event.target.value);
                setManualSaved(false);
              }}
            />
            <small>Use the current eligibility window displayed in Studio.</small>
          </label>
          <label className="form-field">
            <span>Qualified public Shorts views</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={shortsViews}
              placeholder="3000000"
              onChange={(event) => {
                setShortsViews(event.target.value);
                setManualSaved(false);
              }}
            />
            <small>Use the current eligibility window displayed in Studio.</small>
          </label>
          {manualError ? <p className="form-error">{manualError}</p> : null}
          {manualSaved ? (
            <p className="manual-save-success" role="status">
              Manual values saved locally.
            </p>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save manual values'}
          </Button>
        </form>
      </section>

      <section className="settings-section" aria-labelledby="privacy-settings-title">
        <div className="settings-section__heading">
          <ShieldCheck size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2 id="privacy-settings-title">Privacy</h2>
            <p>Local-first by architecture</p>
          </div>
        </div>
        <div className="privacy-columns">
          <div>
            <strong>Stored in this browser</strong>
            <ul>
              <li>Authorized channel statistics and snapshots</li>
              <li>Analytics rows, milestones and custom goals</li>
              <li>Theme and manual guidance values</li>
            </ul>
          </div>
          <div>
            <strong>Not stored</strong>
            <ul>
              <li>OAuth access tokens after this tab session</li>
              <li>Google passwords or TubeMilestones accounts</li>
              <li>Your data on a TubeMilestones server</li>
            </ul>
          </div>
        </div>
        <div className="settings-link-row">
          <a href="./privacy.html">
            Privacy policy <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            Manage Google permissions <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section
        className="settings-section settings-section--about"
        aria-labelledby="about-title"
      >
        <div className="settings-section__heading">
          <Info size={21} strokeWidth={1.7} aria-hidden="true" />
          <div>
            <h2 id="about-title">About</h2>
            <p>TubeMilestones {appPackage.version}</p>
          </div>
        </div>
        <p>
          TubeMilestones uses the YouTube Data API and YouTube Analytics API under
          read-only authorization. It is an independent application and is not
          affiliated with or endorsed by YouTube or Google.
        </p>
        <p>
          TubeMilestones does not determine official YouTube Partner Program
          eligibility. Policies, thresholds and Analytics availability can change.
        </p>
        <div className="settings-link-row">
          <a
            href="https://github.com/StealthMoud/TubeMilestones"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a href="./terms.html">
            Terms <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </section>

      <Modal
        open={disconnectOpen}
        title="Disconnect YouTube?"
        description="TubeMilestones will attempt to revoke the active Google token, then delete this channel's saved history, goals and manual values from this browser. This does not delete or change anything on YouTube."
        onClose={() => setDisconnectOpen(false)}
      >
        <div className="modal-actions">
          <Button variant="quiet" onClick={() => setDisconnectOpen(false)}>
            Keep connected
          </Button>
          <Button variant="danger" onClick={() => void disconnect()}>
            Disconnect and delete
          </Button>
        </div>
      </Modal>

      <Modal
        open={clearOpen}
        title="Clear local data?"
        description="This permanently deletes the saved channel, Analytics history, milestones, goals and manual values from this browser. Google permission is managed separately."
        onClose={() => setClearOpen(false)}
      >
        <div className="modal-actions">
          <Button variant="quiet" onClick={() => setClearOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void clearLocalData()}>
            Clear local data
          </Button>
        </div>
      </Modal>
    </div>
  );
}
