import { ChartNoAxesCombined, Home, RefreshCw, Route, Settings, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';
import { formatReportingDay } from '../../domain/metrics/dates';
import { userMessageForError } from '../../services/errors';
import { BrandMark } from '../common/BrandMark';
import { ChannelSwitcher } from '../common/ChannelSwitcher';
import { ProfileMenu } from '../common/ProfileMenu';
import { ChannelUpdateToast } from '../feedback/ChannelUpdateToast';
import { MilestoneCelebration } from '../feedback/MilestoneCelebration';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/journey', label: 'Journey', icon: Route },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

function MainNavigation() {
  return (
    <nav className="main-navigation" aria-label="Main navigation">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `main-navigation__link${isActive ? ' is-active' : ''}`
          }
        >
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const {
    data,
    connections,
    selectedConnection,
    channels,
    status,
    warnings,
    error,
    isDemo,
    authUser,
    newMilestone,
    displayName,
    profileInitials,
    refresh,
    chooseChannel,
    addYouTubeAccount,
    reconnectYouTubeAccount,
    signOut,
    exitDemo,
  } = useTubeMilestones();
  if (!data) return null;

  const analyticsThrough = data.analyticsSummary?.availableThrough;
  const updated = formatDistanceToNowStrict(new Date(data.channel.updatedAt), {
    addSuffix: true,
  });
  const needsAuthorization =
    status === 'REAUTH_REQUIRED' || status === 'COMPLIANCE_HOLD';
  const contextualError = warnings[0] ?? error;
  const freshnessTitle = analyticsThrough
    ? `Updated ${updated}. Analytics through ${formatReportingDay(analyticsThrough)}.`
    : `Updated ${updated}.`;
  const reconnectSelected = () =>
    reconnectYouTubeAccount(selectedConnection?.id ?? data.channel.connectionId);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <NavLink className="sidebar-brand" to="/" aria-label="TubeMilestones Home">
          <BrandMark size={38} />
          <span>TubeMilestones</span>
        </NavLink>
        <MainNavigation />
        <p className="sidebar-note">Read-only creator analytics</p>
      </aside>

      <div className="app-column">
        {isDemo ? (
          <div className="demo-banner" role="status">
            <strong>DEMO DATA</strong>
            <span>These metrics are illustrative.</span>
            <button type="button" onClick={exitDemo} aria-label="Exit demo">
              <X size={18} />
            </button>
          </div>
        ) : null}

        <header className="app-header">
          <div className="app-header__identity">
            <ChannelSwitcher
              selected={data.channel}
              channels={channels}
              connections={connections}
              onSelect={chooseChannel}
              onAddAccount={addYouTubeAccount}
            />
            <span className="app-header__mobile-freshness" title={freshnessTitle}>
              Updated {updated}
            </span>
          </div>
          <span className="app-header__freshness" title={freshnessTitle}>
            Updated {updated}
          </span>
          <div className="app-header__actions">
            <button
              className="icon-button"
              type="button"
              aria-label={
                needsAuthorization ? 'Reconnect YouTube' : 'Refresh YouTube data'
              }
              title={needsAuthorization ? 'Reconnect YouTube' : 'Refresh YouTube data'}
              onClick={() =>
                void (needsAuthorization ? reconnectSelected() : refresh())
              }
              disabled={status === 'SYNCING' || isDemo}
            >
              <RefreshCw
                size={18}
                strokeWidth={1.8}
                className={status === 'SYNCING' ? 'is-spinning' : undefined}
              />
            </button>
            <ProfileMenu
              displayName={displayName}
              initials={profileInitials}
              email={authUser?.email ?? null}
              onAddYouTubeAccount={addYouTubeAccount}
              onSignOut={signOut}
              addDisabled={status === 'AUTHORIZING' || isDemo}
              signOutDisabled={isDemo}
            />
          </div>
        </header>

        {(status === 'REAUTH_REQUIRED' || status === 'COMPLIANCE_HOLD') && data ? (
          <div className="context-banner context-banner--warning">
            <span>Reconnect YouTube to refresh your progress.</span>
            <button type="button" onClick={() => void reconnectSelected()}>
              Reconnect
            </button>
          </div>
        ) : null}
        {contextualError ? (
          <div className="context-banner context-banner--warning" role="status">
            <span>{userMessageForError(contextualError)}</span>
          </div>
        ) : null}

        <main id="main-content" className="app-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <div className="mobile-navigation-wrap">
        <MainNavigation />
      </div>
      {newMilestone ? null : <ChannelUpdateToast data={data} />}
      <MilestoneCelebration />
    </div>
  );
}
