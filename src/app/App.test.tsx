import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardData } from '../domain/models';
import { createDemoDashboard } from '../fixtures/demoData';
import type { useAnalyticsHistory } from '../features/analytics/useAnalyticsHistory';
import type { useTubeMilestones } from '../hooks/useTubeMilestones';
import { TubeMilestonesError } from '../services/errors';
import type { Connection } from '../services/supabase/dashboardRepository';
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
  user_metadata: { full_name: 'Creator Profile' },
  aud: 'authenticated',
  created_at: '2026-08-26T00:00:00.000Z',
} as User;

const PROFILE = {
  user_id: USER.id,
  display_name: null,
  theme: 'system' as const,
  selected_channel_id: null,
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
};

function connection(
  id: string,
  googleEmail: string,
  status: Connection['status'] = 'CONNECTED',
): Connection {
  return {
    id,
    user_id: USER.id,
    google_subject: `subject-${id}`,
    google_email: googleEmail,
    status,
    connected_at: '2026-08-26T00:00:00.000Z',
    last_authorization_verified_at: '2026-08-26T00:00:00.000Z',
    last_verification_attempt_at: '2026-08-26T00:00:00.000Z',
    verification_retry_count: 0,
    verification_claim_id: null,
    verification_claimed_at: null,
    last_synced_at: '2026-08-26T00:00:00.000Z',
    last_sync_started_at: null,
    last_sync_error_code: null,
    granted_scopes: [],
    created_at: '2026-08-26T00:00:00.000Z',
    updated_at: '2026-08-26T00:00:00.000Z',
  };
}

function appState(overrides: Partial<AppState> = {}): AppState {
  const data = createDemoDashboard('small');
  const selectedConnection = connection(
    data.channel.connectionId,
    'youtube-owner@example.com',
  );
  return {
    status: 'READY',
    syncStage: null,
    data,
    profile: PROFILE,
    displayName: 'Creator Profile',
    profileInitials: 'CP',
    connections: [selectedConnection],
    selectedConnection,
    channels: [data.channel],
    warnings: [],
    error: null,
    pendingChannels: [],
    isInitializing: false,
    isDemo: true,
    oauthConfigured: true,
    authUser: null,
    authMethods: { google: false, password: false },
    isPasswordRecovery: false,
    newMilestone: null,
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signInWithPassword: vi.fn().mockResolvedValue(undefined),
    signUpWithPassword: vi.fn().mockResolvedValue({
      status: 'CONFIRMATION_REQUIRED',
      email: 'creator@example.com',
    }),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(USER),
    completePasswordRecovery: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue('Creator Profile'),
    addYouTubeAccount: vi.fn().mockResolvedValue(undefined),
    reconnectYouTubeAccount: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    chooseChannel: vi.fn().mockResolvedValue({
      kind: 'READY',
      selectedChannelId: data.channel.channelId,
      channels: [],
      warnings: [],
      newMilestoneIds: [],
      archive: { archivedPeriods: [], configuration: 'ready' },
    }),
    disconnectYouTubeAccount: vi.fn().mockResolvedValue(undefined),
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
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    const addYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'SIGNED_OUT',
        data: null,
        isDemo: false,
        signInWithGoogle,
        addYouTubeAccount,
      }),
    );
    show('/');
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithGoogle).toHaveBeenCalledOnce();
    expect(addYouTubeAccount).not.toHaveBeenCalled();
  });

  it('signs in with a password without creating a YouTube connection', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue(undefined);
    const addYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'SIGNED_OUT',
        data: null,
        isDemo: false,
        signInWithPassword,
        addYouTubeAccount,
      }),
    );
    show('/');
    await userEvent.type(screen.getByLabelText('Email'), 'creator@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signInWithPassword).toHaveBeenCalledWith('creator@example.com', 'password');
    expect(addYouTubeAccount).not.toHaveBeenCalled();
  });

  it('shows a separate server-side YouTube connection step after account sign-in', async () => {
    const addYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'CONNECT_YOUTUBE',
        data: null,
        isDemo: false,
        authUser: USER,
        addYouTubeAccount,
      }),
    );
    show('/');
    expect(
      screen.getByRole('heading', { name: 'Connect a YouTube account.' }),
    ).toBeVisible();
    expect(screen.getByText(/can be a different Google account/)).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Connect YouTube account' }),
    );
    expect(addYouTubeAccount).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/cannot edit, upload, or delete YouTube content/),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Account settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('keeps every account-level setting available before the first YouTube connection', async () => {
    const addYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'CONNECT_YOUTUBE',
        data: null,
        isDemo: false,
        authUser: USER,
        authMethods: { google: true, password: false },
        connections: [],
        selectedConnection: null,
        channels: [],
        addYouTubeAccount,
      }),
    );
    show('/settings');
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'TubeMilestones profile' }),
    ).toBeVisible();
    expect(screen.getAllByText(USER.email!).length).toBeGreaterThan(0);
    expect(screen.getByText('Google').closest('div')).toHaveTextContent('Connected');
    expect(screen.getByRole('button', { name: 'Add password' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Connected YouTube accounts' }),
    ).toBeVisible();
    expect(screen.getByText('No YouTube accounts connected yet.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Add YouTube account' }));
    expect(addYouTubeAccount).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Data & privacy' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'About' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'YouTube data' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'YPP guidance' })).toBeNull();
  });

  it('edits the profile inline without requiring dashboard data', async () => {
    const updateProfile = vi.fn().mockResolvedValue('Mahmoud');
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'CONNECT_YOUTUBE',
        data: null,
        isDemo: false,
        authUser: USER,
        connections: [],
        selectedConnection: null,
        channels: [],
        profile: { ...PROFILE, display_name: null },
        displayName: 'Creator Profile',
        updateProfile,
      }),
    );
    show('/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const input = screen.getByLabelText('Display name');
    await userEvent.clear(input);
    await userEvent.type(input, '  Mahmoud  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateProfile).toHaveBeenCalledWith('  Mahmoud  ');
    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated.');
  });

  it('requires typed confirmation before deleting a zero-connection account', async () => {
    const deleteAccount = vi.fn().mockResolvedValue({
      deletionId: '62cc4d74-ff7d-4736-b27e-3a5997fb3d3f',
      status: 'COMPLETE' as const,
    });
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'CONNECT_YOUTUBE',
        data: null,
        isDemo: false,
        authUser: USER,
        connections: [],
        selectedConnection: null,
        channels: [],
        deleteAccount,
      }),
    );
    show('/settings');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete account' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Delete TubeMilestones account?',
    });
    expect(dialog).toHaveTextContent(
      'It does not delete anything from YouTube itself.',
    );
    const finalDelete = screen.getByRole('button', {
      name: 'Permanently delete account',
    });
    expect(finalDelete).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type DELETE to confirm/u), {
      target: { value: 'DELETE' },
    });
    const enabledDelete = screen.getByRole('button', {
      name: 'Permanently delete account',
    });
    expect(enabledDelete).toBeEnabled();
    await userEvent.click(enabledDelete);
    expect(deleteAccount).toHaveBeenCalledOnce();
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

  it('switches across all channels while a bad non-selected connection stays isolated', async () => {
    const data = createDemoDashboard('small');
    const other = createDemoDashboard('growing').channel;
    const connectionA = connection(
      '71000000-0000-4000-8000-000000000001',
      'account-a@example.com',
    );
    const connectionB = connection(
      '71000000-0000-4000-8000-000000000002',
      'account-b@example.com',
      'REAUTH_REQUIRED',
    );
    const connectionC = connection(
      '71000000-0000-4000-8000-000000000003',
      'account-c@example.com',
    );
    data.channel = { ...data.channel, connectionId: connectionA.id };
    const channelB = { ...other, connectionId: connectionB.id };
    const channelC = {
      ...createDemoDashboard('large').channel,
      connectionId: connectionC.id,
    };
    const chooseChannel = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        data,
        connections: [connectionA, connectionB, connectionC],
        selectedConnection: connectionA,
        channels: [data.channel, channelB, channelC],
        chooseChannel,
      }),
    );

    show('/');
    expect(screen.getByRole('heading', { name: '1K' })).toBeVisible();
    const switcher = screen.getByLabelText(
      `Current channel: ${data.channel.title}. Switch channel`,
    );
    await userEvent.click(switcher);
    switcher.closest('details')?.setAttribute('open', '');
    expect(screen.getByText(/account-a@example\.com/u)).toBeVisible();
    expect(screen.getByText(/account-b@example\.com/u)).toBeVisible();
    expect(screen.getByText(/account-c@example\.com/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Atlas Cut/u }));
    expect(chooseChannel).toHaveBeenCalledWith(channelC.channelId);
  });

  it('renders the differentiated Journey path and changes milestone metrics', async () => {
    show('/journey');
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Your milestone journey.' },
        { timeout: 5_000 },
      ),
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
    await userEvent.click(screen.getByRole('button', { name: 'Available' }));
    expect(screen.getByText('Available history')).toBeVisible();
    expect(screen.queryByText('All time')).not.toBeInTheDocument();
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
      screen.getByRole('dialog', { name: 'Disconnect this YouTube account?' }),
    ).toHaveTextContent('Other connected accounts stay available.');
  });

  it('starts a fresh add flow for each first, second, and third account action', async () => {
    const addYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        isDemo: false,
        authUser: USER,
        addYouTubeAccount,
      }),
    );
    show('/settings');
    const addAnother = await screen.findByRole('button', {
      name: 'Add another YouTube account',
    });
    await userEvent.click(addAnother);
    await userEvent.click(addAnother);
    await userEvent.click(addAnother);
    expect(addYouTubeAccount).toHaveBeenCalledTimes(3);
  });

  it('separates login identity from YouTube accounts and scopes account actions', async () => {
    const data = createDemoDashboard('small');
    const connectionA = connection(
      '72000000-0000-4000-8000-000000000001',
      'youtube-a@example.com',
    );
    const connectionB = connection(
      '72000000-0000-4000-8000-000000000002',
      'youtube-b@example.com',
    );
    data.channel = { ...data.channel, connectionId: connectionA.id };
    const channelB = {
      ...createDemoDashboard('growing').channel,
      connectionId: connectionB.id,
    };
    const signOut = vi.fn().mockResolvedValue(undefined);
    const reconnectYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    const disconnectYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        data,
        isDemo: false,
        authUser: USER,
        connections: [connectionA, connectionB],
        selectedConnection: connectionA,
        channels: [data.channel, channelB],
        signOut,
        reconnectYouTubeAccount,
        disconnectYouTubeAccount,
      }),
    );

    show('/settings');
    expect((await screen.findAllByText(USER.email!)).length).toBeGreaterThan(0);
    expect(screen.getByText('Used only to sign into TubeMilestones.')).toBeVisible();
    expect(screen.getAllByText('youtube-a@example.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('youtube-b@example.com').length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'Sign out' }).at(-1)!);
    expect(signOut).toHaveBeenCalledOnce();
    expect(disconnectYouTubeAccount).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Reconnect' })[1]!);
    expect(reconnectYouTubeAccount).toHaveBeenCalledWith(connectionB.id);
    await userEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[1]!);
    expect(
      screen.getByRole('dialog', { name: 'Disconnect this YouTube account?' }),
    ).toHaveTextContent('youtube-b@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Disconnect YouTube account' }),
    );
    expect(disconnectYouTubeAccount).toHaveBeenCalledWith(connectionB.id);
  });

  it('adds password login to the current UUID without touching connected YouTube accounts', async () => {
    const updatePassword = vi.fn().mockResolvedValue(USER);
    const reconnectYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    const disconnectYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        isDemo: false,
        authUser: USER,
        authMethods: { google: true, password: false },
        updatePassword,
        reconnectYouTubeAccount,
        disconnectYouTubeAccount,
      }),
    );

    show('/settings');
    await screen.findByRole('heading', { name: 'Settings' });
    await userEvent.click(screen.getByRole('button', { name: 'Add password' }));
    await userEvent.type(screen.getByLabelText('New password'), 'new password');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'new password');
    await userEvent.click(screen.getByRole('button', { name: 'Add password' }));

    expect(updatePassword).toHaveBeenCalledWith('new password');
    await expect(updatePassword.mock.results[0]!.value).resolves.toMatchObject({
      id: USER.id,
    });
    expect(screen.getAllByText('youtube-owner@example.com').length).toBeGreaterThan(0);
    expect(reconnectYouTubeAccount).not.toHaveBeenCalled();
    expect(disconnectYouTubeAccount).not.toHaveBeenCalled();
  });

  it('renders and completes the password recovery callback independently', async () => {
    const updatePassword = vi.fn().mockResolvedValue(USER);
    const completePasswordRecovery = vi.fn();
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({ isPasswordRecovery: true, updatePassword, completePasswordRecovery }),
    );
    show('/');
    expect(
      screen.getByRole('heading', { name: 'Choose a new password' }),
    ).toBeVisible();
    await userEvent.type(screen.getByLabelText('New password'), 'new password');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'new password');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(updatePassword).toHaveBeenCalledWith('new password');
    await userEvent.click(
      screen.getByRole('button', { name: 'Continue to TubeMilestones' }),
    );
    expect(completePasswordRecovery).toHaveBeenCalledOnce();
  });

  it('shows reauthorization in context and routes the action through OAuth', async () => {
    const reconnectYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    const current = appState({
      status: 'REAUTH_REQUIRED',
      isDemo: false,
      authUser: USER,
      reconnectYouTubeAccount,
    });
    hookMocks.useTubeMilestones.mockReturnValue(current);
    show('/');
    await userEvent.click(screen.getByRole('button', { name: /^Reconnect$/u }));
    expect(reconnectYouTubeAccount).toHaveBeenCalledWith(
      current.selectedConnection?.id,
    );
  });

  it('returns from the safe OAuth callback and shows deletion-pending state', async () => {
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'CONNECT_YOUTUBE',
        data: null,
        isDemo: false,
        authUser: USER,
      }),
    );
    const view = show('/oauth/youtube?result=success');
    expect(
      await screen.findByRole('heading', { name: 'Connect a YouTube account.' }),
    ).toBeVisible();
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

  it('starts a new add attempt from an expired OAuth result', async () => {
    const addYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(
      appState({
        status: 'CONNECT_YOUTUBE',
        data: null,
        isDemo: false,
        authUser: USER,
        connections: [],
        selectedConnection: null,
        channels: [],
        addYouTubeAccount,
      }),
    );
    show('/oauth/youtube?result=error&code=OAUTH_STATE_USED&intent=ADD');
    expect(
      screen.getByRole('heading', { name: 'YouTube connection expired' }),
    ).toBeVisible();
    expect(
      screen.getByText('This connection attempt can no longer be used.'),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Start a new connection' }),
    );
    expect(addYouTubeAccount).toHaveBeenCalledOnce();
  });

  it('starts a new connection-scoped reconnect attempt from an OAuth failure', async () => {
    const connectionId = '71000000-0000-4000-8000-000000000001';
    const reconnectYouTubeAccount = vi.fn().mockResolvedValue(undefined);
    hookMocks.useTubeMilestones.mockReturnValue(appState({ reconnectYouTubeAccount }));
    show(
      `/oauth/youtube?result=error&code=YOUTUBE_ACCOUNT_MISMATCH&intent=RECONNECT&connectionId=${connectionId}`,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Try reconnecting again' }),
    );
    expect(reconnectYouTubeAccount).toHaveBeenCalledWith(connectionId);
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
