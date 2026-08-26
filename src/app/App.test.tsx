import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardData } from '../domain/models';
import { createDemoDashboard } from '../fixtures/demoData';
import type { useAnalyticsHistory } from '../features/analytics/useAnalyticsHistory';
import type { useTubeMilestones } from '../hooks/useTubeMilestones';
import { TubeMilestonesError } from '../services/errors';
import { AppRouter } from './router';

const hookMocks = vi.hoisted(() => ({
  useTubeMilestones: vi.fn(),
  useAnalyticsHistory: vi.fn(),
}));

vi.mock('../hooks/useTubeMilestones', () => ({
  useTubeMilestones: hookMocks.useTubeMilestones,
}));

vi.mock('../features/analytics/useAnalyticsHistory', () => ({
  useAnalyticsHistory: hookMocks.useAnalyticsHistory,
}));

type AppState = ReturnType<typeof useTubeMilestones>;
type HistoryState = ReturnType<typeof useAnalyticsHistory>;

const USER = {
  id: '86d4f90b-5aa1-43b0-9625-6fe933b730af',
  email: 'creator@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-08-26T00:00:00.000Z',
} as User;

function appState(overrides: Partial<AppState> = {}): AppState {
  const data = createDemoDashboard('small');
  return {
    status: 'READY',
    syncStage: null,
    data,
    connection: null,
    warnings: [],
    error: null,
    pendingChannels: [],
    isInitializing: false,
    isDemo: true,
    oauthConfigured: true,
    authUser: null,
    newMilestone: null,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    chooseChannel: vi.fn().mockResolvedValue({
      kind: 'READY',
      selectedChannelId: data.channel.channelId,
      channels: [],
      warnings: [],
      newMilestoneIds: [],
      archive: { archivedPeriods: [], configuration: 'ready' },
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue({
      deletionId: '62cc4d74-ff7d-4736-b27e-3a5997fb3d3f',
      status: 'COMPLETE',
    }),
    setTheme: vi.fn().mockResolvedValue(undefined),
    addGoal: vi.fn().mockResolvedValue(undefined),
    removeGoal: vi.fn().mockResolvedValue(undefined),
    updateManualMetrics: vi.fn().mockResolvedValue(undefined),
    dismissCelebration: vi.fn().mockResolvedValue(undefined),
    startDemo: vi.fn(),
    exitDemo: vi.fn(),
    ...overrides,
  };
}

function historyState(
  data: DashboardData | null,
  overrides: Partial<HistoryState> = {},
): HistoryState {
  return {
    rows: data?.analyticsDaily ?? [],
    partial: null,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function show(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  );
}

describe('TubeMilestones cloud application states', () => {
  beforeEach(() => {
    const current = appState();
    hookMocks.useTubeMilestones.mockReturnValue(current);
    hookMocks.useAnalyticsHistory.mockImplementation((data: DashboardData | null) =>
      historyState(data),
    );
  });

  it('renders the focused public landing and disables sign-in when cloud config is absent', () => {
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'UNCONFIGURED',
        data: null,
        oauthConfigured: false,
        isDemo: false,
      }),
    );
    show('/');
    expect(
      screen.getByRole('heading', {
        name: 'Your YouTube journey, one milestone at a time.',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByText(/Cloud connection is not configured/)).toBeVisible();
  });

  it('starts Supabase Google sign-in from the first landing step', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({ status: 'SIGNED_OUT', data: null, isDemo: false, signIn }),
    );
    show('/');
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('shows a separate server-side YouTube connection step after account sign-in', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'CONNECT_YOUTUBE',
        data: null,
        isDemo: false,
        authUser: USER,
        connect,
      }),
    );
    show('/');
    expect(
      screen.getByRole('heading', { name: 'Connect your YouTube channel.' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Connect YouTube' }));
    expect(connect).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/cannot edit, upload, or delete YouTube content/),
    ).toBeVisible();
  });

  it('uses staged initial-sync feedback without blocking on an empty shell', () => {
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({ status: 'SYNCING', syncStage: 'CHANNEL', data: null, isDemo: false }),
    );
    show('/');
    expect(
      screen.getByRole('heading', { name: 'Loading your channel...' }),
    ).toBeVisible();
    expect(screen.getByText('Loading your channel')).toBeVisible();
  });

  it('renders Home with the next milestone as the dominant focal point', () => {
    show('/');
    expect(screen.getByRole('heading', { name: '1K' })).toBeVisible();
    expect(screen.getByText('258 subscribers to go')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Recent movement' })).toBeVisible();
  });

  it('renders the differentiated Journey path and changes milestone metrics', async () => {
    show('/journey');
    expect(
      await screen.findByRole('heading', { name: 'Your milestone journey.' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Views' }));
    expect(screen.getByText('48.2K now')).toBeVisible();
    expect(screen.getByText('Next checkpoint')).toBeVisible();
  });

  it('renders 28-day Analytics as one focus value with secondary rows', async () => {
    show('/analytics');
    expect(
      await screen.findByRole('heading', { name: 'Views' }, { timeout: 5_000 }),
    ).toBeVisible();
    expect(screen.getByText('28D total')).toBeVisible();
    expect(screen.getAllByText('Net subscribers')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: '7D' }));
    expect(screen.getByText('7D total')).toBeVisible();
  });

  it('keeps hot Analytics visible when archive history is partial', async () => {
    const data = createDemoDashboard('small');
    hookMocks.useTubeMilestones.mockReturnValue(appState({ data }));
    hookMocks.useAnalyticsHistory.mockReturnValue(
      historyState(data, {
        partial: { errorCode: 'R2_UNAVAILABLE' },
        rows: data.analyticsDaily,
      }),
    );
    show('/analytics');
    await screen.findByRole('heading', { name: 'Views' }, { timeout: 5_000 });
    await userEvent.click(screen.getByRole('button', { name: '365D' }));
    expect(screen.getByText(/Older history is temporarily unavailable/)).toBeVisible();
    expect(screen.getByText('365D total')).toBeVisible();
  });

  it('renders native grouped Settings and confirms destructive disconnects', async () => {
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({ isDemo: false, authUser: USER }),
    );
    show('/settings');
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByText('User entered')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(
      screen.getByRole('dialog', { name: 'Disconnect YouTube?' }),
    ).toHaveTextContent('It does not delete anything from YouTube.');
  });

  it('shows reauthorization in context and routes the action through OAuth', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({ status: 'REAUTH_REQUIRED', isDemo: false, authUser: USER, connect }),
    );
    show('/');
    await userEvent.click(screen.getByRole('button', { name: /^Reconnect$/u }));
    expect(connect).toHaveBeenCalledOnce();
  });

  it('runs the first sync after the safe OAuth callback and shows deletion-pending state', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({ status: 'CONNECT_YOUTUBE', data: null, isDemo: false, refresh }),
    );
    const view = show('/oauth/youtube?result=success');
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    view.unmount();

    hookMocks.useTubeMilestones.mockReturnValue(
      appState({ status: 'DELETION_PENDING', data: null, isDemo: false }),
    );
    show('/');
    expect(
      screen.getByRole('heading', {
        name: 'Your saved YouTube data is being removed.',
      }),
    ).toBeVisible();
  });

  it('keeps safe partial data visible alongside typed API warnings', () => {
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        error: new TubeMilestonesError('ANALYTICS_UNAVAILABLE', 'analytics delayed'),
      }),
    );
    show('/');
    expect(screen.getByRole('heading', { name: '1K' })).toBeVisible();
  });
});
