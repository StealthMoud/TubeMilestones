import { ChartNoAxesCombined, Home, RefreshCw, Route, Settings, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { useApp } from '../../app/AppProvider';
import { formatReportingDay } from '../../domain/metrics/dates';
import { userMessageForError } from '../../services/errors';
import { BrandMark } from '../common/BrandMark';
import { ChannelAvatar } from '../common/ChannelAvatar';
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
          <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data, status, warnings, isDemo, isCached, hasToken, refresh, exitDemo } =
    useApp();
  if (!data) return null;

  const analyticsThrough = data.analyticsSummary?.availableThrough;
  const updated = formatDistanceToNowStrict(new Date(data.channel.updatedAt), {
    addSuffix: true,
  });

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
        <div className="sidebar-channel">
          <ChannelAvatar
            title={data.channel.title}
            src={data.channel.thumbnailUrl}
            size="small"
          />
          <span>{data.channel.title}</span>
        </div>
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
            <ChannelAvatar
              title={data.channel.title}
              src={data.channel.thumbnailUrl}
              size="small"
            />
            <div>
              <strong>TubeMilestones</strong>
              <span className="app-header__channel">{data.channel.title}</span>
            </div>
          </div>
          <div className="app-header__freshness">
            <span>Updated {updated}</span>
            {analyticsThrough ? (
              <span>Analytics through {formatReportingDay(analyticsThrough)}</span>
            ) : null}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={hasToken ? 'Refresh YouTube data' : 'Reconnect to refresh'}
            title={hasToken ? 'Refresh YouTube data' : 'Reconnect to refresh'}
            onClick={() => void refresh()}
            disabled={status === 'SYNCING' || isDemo}
          >
            <RefreshCw
              size={20}
              strokeWidth={1.8}
              className={status === 'SYNCING' ? 'is-spinning' : undefined}
            />
          </button>
        </header>

        {isCached && !hasToken ? (
          <div className="context-banner context-banner--info">
            <span>Saved progress is ready. Reconnect to refresh from YouTube.</span>
            <button type="button" onClick={() => void refresh()}>
              Reconnect
            </button>
          </div>
        ) : null}
        {status === 'TOKEN_EXPIRED' && data ? (
          <div className="context-banner context-banner--warning">
            <span>Reconnect YouTube to refresh your progress.</span>
            <button type="button" onClick={() => void refresh()}>
              Reconnect
            </button>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="context-banner context-banner--warning" role="status">
            <span>{userMessageForError(warnings[0])}</span>
          </div>
        ) : null}

        <main id="main-content" className="app-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <div className="mobile-navigation-wrap">
        <MainNavigation />
      </div>
      <MilestoneCelebration />
    </div>
  );
}
