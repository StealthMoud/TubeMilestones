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
  UserRound,
} from 'lucide-react';
import appPackage from '../../../package.json';
import { Button } from '../../components/common/Button';
import { ChannelAvatar } from '../../components/common/ChannelAvatar';
import { Modal } from '../../components/common/Modal';
import { ProfileAvatar } from '../../components/common/ProfileAvatar';
import { formatReportingDay } from '../../domain/metrics/dates';
import type { ThemePreference } from '../../domain/models';
import { validateDisplayName } from '../../domain/profile';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';
import { asTubeMilestonesError, userMessageForError } from '../../services/errors';
import { SignInMethodsSettings } from '../auth/SignInMethodsSettings';

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

function connectionStatusLabel(status: string): string {
  return status === 'CONNECTED'
    ? 'Connected'
    : status
        .replaceAll('_', ' ')
        .toLocaleLowerCase()
        .replace(/^./u, (character) => character.toLocaleUpperCase());
}

export default function SettingsPage() {
  const {
    data,
    profile,
    displayName,
    profileInitials,
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
    updateProfile,
    setTheme,
    updateManualMetrics,
  } = useTubeMilestones();
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState(
    profile?.display_name ?? displayName,
  );
  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [disconnectTargetId, setDisconnectTargetId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
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

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateDisplayName(profileDraft);
    if (validation) {
      setProfileError(validation);
      setProfileSaved(false);
      return;
    }
    setProfilePending(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const saved = await updateProfile(profileDraft);
      setProfileDraft(saved);
      setProfileEditing(false);
      setProfileSaved(true);
    } catch (error) {
      const typed = asTubeMilestonesError(error);
      setProfileError(
        typed.code === 'INVALID_REQUEST' ? typed.message : userMessageForError(typed),
      );
    } finally {
      setProfilePending(false);
    }
  };

  const saveManualMetrics = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
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

  const closeDeleteDialog = () => {
    setDeleteOpen(false);
    setDeleteConfirmation('');
  };

  const confirmDelete = async () => {
    if (deleteConfirmation !== 'DELETE') return;
    setDestructivePending(true);
    try {
      await deleteAccount();
      closeDeleteDialog();
    } finally {
      setDestructivePending(false);
    }
  };

  const refreshing = status === 'AUTHORIZING' || status === 'SYNCING';
  const disconnectTarget =
    connections.find(({ id }) => id === disconnectTargetId) ?? null;
  const theme = profile?.theme ?? 'system';

  return (
    <div
      className={`page page--settings page-enter${data ? '' : ' page--account-only'}`}
    >
      {!data ? (
        <Link className="settings-back-link" to="/">
          Back to YouTube connection
        </Link>
      ) : null}
      <header className="page-heading">
        <p className="page-heading__context">Account and preferences</p>
        <h1>Settings</h1>
      </header>

      <section className="settings-group" aria-labelledby="profile-title">
        <div className="settings-group__heading">
          <div>
            <h2 id="profile-title">TubeMilestones profile</h2>
            <p>Your profile is separate from every connected YouTube account.</p>
          </div>
          <UserRound size={20} aria-hidden="true" />
        </div>
        <div className="settings-list settings-profile">
          <div className="settings-profile__summary">
            <ProfileAvatar initials={profileInitials} size="large" />
            <div className="settings-row__copy">
              <strong>{displayName}</strong>
              <span>{authUser?.email ?? 'Demo session'}</span>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setProfileDraft(profile?.display_name ?? displayName);
                setProfileEditing((current) => !current);
                setProfileError(null);
                setProfileSaved(false);
              }}
            >
              {profileEditing ? 'Close editor' : 'Edit profile'}
            </Button>
          </div>
          {profileEditing ? (
            <form className="profile-edit-form" onSubmit={saveProfile} noValidate>
              <label className="form-field">
                <span>Display name</span>
                <input
                  type="text"
                  name="displayName"
                  value={profileDraft}
                  maxLength={80}
                  autoComplete="name"
                  disabled={profilePending}
                  onChange={(event) => {
                    setProfileDraft(event.target.value);
                    setProfileError(null);
                  }}
                  required
                />
              </label>
              <label className="form-field">
                <span>Email</span>
                <input
                  type="email"
                  value={authUser?.email ?? ''}
                  readOnly
                  aria-readonly="true"
                />
                <small>Email changes are not available here.</small>
              </label>
              {profileError ? (
                <p className="form-error" role="alert">
                  {profileError}
                </p>
              ) : null}
              <div className="profile-edit-form__actions">
                <Button
                  variant="quiet"
                  disabled={profilePending}
                  onClick={() => {
                    setProfileEditing(false);
                    setProfileError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={profilePending}>
                  {profilePending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          ) : null}
          {profileSaved ? (
            <p className="settings-inline-success" role="status">
              Profile updated.
            </p>
          ) : null}
        </div>
      </section>

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
            <Button variant="quiet" disabled={isDemo} onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="youtube-accounts-title">
        <div className="settings-group__heading">
          <div>
            <h2 id="youtube-accounts-title">Connected YouTube accounts</h2>
            <p>
              One TubeMilestones account can connect multiple independent Google
              accounts.
            </p>
          </div>
        </div>
        <div className="settings-list settings-connections">
          {connections.length > 0 ? (
            connections.map((account) => {
              const accountChannels = channels.filter(
                ({ connectionId }) => connectionId === account.id,
              );
              return (
                <div className="settings-connection" key={account.id}>
                  <div className="settings-connection__heading">
                    <div className="settings-row__copy">
                      <strong>
                        {account.google_email ?? 'Connected Google account'}
                      </strong>
                      <span>Google authorization for the channels listed below.</span>
                    </div>
                    <span
                      className={`settings-status${
                        account.status === 'CONNECTED' ? '' : ' is-warning'
                      }`}
                    >
                      {connectionStatusLabel(account.status)}
                    </span>
                  </div>
                  <div className="settings-connection__channels">
                    <p>Channels</p>
                    {accountChannels.length > 0 ? (
                      accountChannels.map((channel) => (
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
                      ))
                    ) : (
                      <small>No channels available yet.</small>
                    )}
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
            <div className="settings-empty-connection">
              <div>
                <strong>No YouTube accounts connected yet.</strong>
                <p>
                  You can connect multiple YouTube accounts. They do not need to match
                  the email you use to sign into TubeMilestones.
                </p>
              </div>
              <Button
                icon={<Plus size={16} aria-hidden="true" />}
                disabled={refreshing || isDemo}
                onClick={() => void addYouTubeAccount()}
              >
                Add YouTube account
              </Button>
            </div>
          )}
          {connections.length > 0 ? (
            <div className="settings-row settings-row--add-account">
              <div className="settings-row__copy">
                <strong>Add another YouTube account</strong>
                <span>Google will open a fresh account chooser every time.</span>
              </div>
              <Button
                variant="secondary"
                icon={<Plus size={16} aria-hidden="true" />}
                disabled={refreshing || isDemo}
                onClick={() => void addYouTubeAccount()}
              >
                Add another YouTube account
              </Button>
            </div>
          ) : null}
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
                  aria-checked={theme === option.value}
                  onClick={() => void setTheme(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {data ? (
        <>
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
            <form
              className="settings-list manual-settings"
              onSubmit={saveManualMetrics}
            >
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
        </>
      ) : null}

      <section className="settings-group" aria-labelledby="privacy-title">
        <div className="settings-group__heading">
          <div>
            <h2 id="privacy-title">Data &amp; privacy</h2>
            <p>
              Understand what TubeMilestones can access and how your data is handled.
            </p>
          </div>
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div className="settings-list">
          <div className="settings-row">
            <div className="settings-row__copy">
              <strong>YouTube access</strong>
              <span>
                Read-only. TubeMilestones cannot edit or delete YouTube content.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="settings-group settings-group--danger"
        aria-labelledby="danger-title"
      >
        <div className="settings-group__heading">
          <div>
            <h2 id="danger-title">Danger zone</h2>
            <p>Permanent account-level actions.</p>
          </div>
        </div>
        <div className="settings-list">
          <div className="settings-row settings-row--danger">
            <div className="settings-row__copy">
              <strong>Delete TubeMilestones account</strong>
              <span>
                Permanently delete your TubeMilestones account, connected YouTube
                authorizations, saved milestones, analytics history, and archived data.
              </span>
            </div>
            <Button
              variant="danger"
              icon={<Trash2 size={16} aria-hidden="true" />}
              onClick={() => setDeleteOpen(true)}
            >
              Delete account
            </Button>
          </div>
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
            disabled={destructivePending || isDemo}
            onClick={() => void confirmDisconnect()}
          >
            {destructivePending ? 'Disconnecting…' : 'Disconnect YouTube account'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete TubeMilestones account?"
        description="This permanently deletes your entire TubeMilestones account and cannot be undone."
        onClose={closeDeleteDialog}
      >
        <div className="account-delete-confirmation">
          <p>This permanently deletes:</p>
          <ul>
            <li>your TubeMilestones profile</li>
            <li>all connected YouTube accounts from TubeMilestones</li>
            <li>saved channel data and milestones</li>
            <li>analytics history and encrypted archives</li>
          </ul>
          <p className="account-delete-confirmation__youtube-note">
            It does not delete anything from YouTube itself.
          </p>
          <label className="form-field">
            <span>
              Type <strong>DELETE</strong> to confirm
            </span>
            <input
              type="text"
              value={deleteConfirmation}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <Button variant="quiet" onClick={closeDeleteDialog}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={destructivePending || isDemo || deleteConfirmation !== 'DELETE'}
            onClick={() => void confirmDelete()}
          >
            {destructivePending ? 'Deleting…' : 'Permanently delete account'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
