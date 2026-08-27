import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { channelMetricValue } from '../domain/metrics/currentValue';
import type {
  Channel,
  CustomGoal,
  DashboardData,
  ManualMetrics,
  MetricType,
  MilestoneState,
  ThemePreference,
} from '../domain/models';
import { useDemo } from '../fixtures/DemoProvider';
import {
  TubeMilestonesError,
  asTubeMilestonesError,
  userMessageForError,
} from '../services/errors';
import {
  addYouTubeAccount,
  createGoal,
  deleteGoal,
  markCelebrationSeen,
  reconnectYouTubeAccount,
  requestAccountDeletion,
  requestYouTubeDisconnect,
  saveManualValues,
  selectChannel,
  synchronizeChannel,
  updateTheme,
} from '../services/supabase/actions';
import {
  loadCloudDashboard,
  type Connection,
} from '../services/supabase/dashboardRepository';
import { useDocumentTheme } from './useDocumentTheme';
import { ApplicationAuthError } from '../auth/authErrors';

export type AppStatus =
  | 'UNCONFIGURED'
  | 'SIGNED_OUT'
  | 'CONNECT_YOUTUBE'
  | 'AUTHORIZING'
  | 'SYNCING'
  | 'READY'
  | 'REAUTH_REQUIRED'
  | 'COMPLIANCE_HOLD'
  | 'DELETION_PENDING'
  | 'API_ERROR';

export type SyncStage =
  'CONNECTING' | 'CHANNEL' | 'ANALYTICS' | 'MILESTONES' | 'COMPLETE';

interface GoalInput {
  metric: MetricType;
  target: number;
  title: string | null;
  targetDate: string | null;
}

function demoGoalState(data: DashboardData, goal: CustomGoal): MilestoneState {
  const current = channelMetricValue(data.channel, data.analyticsSummary, goal.metric);
  const complete = current !== null && current >= goal.target;
  return {
    id: `${goal.channelId}:custom:${goal.id}`,
    channelId: goal.channelId,
    metric: goal.metric,
    target: goal.target,
    status: complete ? 'ACHIEVED' : 'NEXT',
    detectedAt: null,
    detectionType: complete ? 'USER_CREATED_ALREADY_COMPLETE' : 'PREEXISTING',
    celebrationSeen: true,
    customGoalId: goal.id,
  };
}

function connectionStatus(connection: Connection | null, hasData: boolean): AppStatus {
  if (!connection) return 'CONNECT_YOUTUBE';
  if (connection.status === 'DELETION_PENDING') return 'DELETION_PENDING';
  if (connection.status === 'REAUTH_REQUIRED') return 'REAUTH_REQUIRED';
  if (connection.status === 'COMPLIANCE_HOLD') return 'COMPLIANCE_HOLD';
  if (connection.status === 'SYNCING') return 'SYNCING';
  return hasData ? 'READY' : 'SYNCING';
}

const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'login@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-08-26T00:00:00.000Z',
} as User;

function demoConnection(data: DashboardData, reauthRequired: boolean): Connection {
  return {
    id: data.channel.connectionId,
    user_id: DEMO_USER.id,
    google_subject: 'demo-google-subject',
    google_email: 'youtube-owner@example.com',
    status: reauthRequired ? 'REAUTH_REQUIRED' : 'CONNECTED',
    connected_at: data.metadata.trackingStartedAt ?? data.channel.publishedAt,
    last_authorization_verified_at: data.metadata.authorizationVerifiedAt,
    last_verification_attempt_at: data.metadata.authorizationVerifiedAt,
    verification_retry_count: 0,
    verification_claim_id: null,
    verification_claimed_at: null,
    last_synced_at: data.channel.updatedAt,
    last_sync_started_at: null,
    last_sync_error_code: reauthRequired ? 'YOUTUBE_REAUTH_REQUIRED' : null,
    granted_scopes: [],
    created_at: data.metadata.trackingStartedAt ?? data.channel.publishedAt,
    updated_at: data.channel.updatedAt,
  };
}

export function useTubeMilestones(options: { backgroundSync?: boolean } = {}) {
  const auth = useAuth();
  const demo = useDemo();
  const queryClient = useQueryClient();
  const cloud = useQuery({
    queryKey: ['cloud-dashboard', auth.user?.id],
    queryFn: () => loadCloudDashboard(auth.user?.id ?? ''),
    enabled: auth.configured && Boolean(auth.user) && !demo.isDemo,
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['cloud-dashboard', auth.user?.id],
    });
    await queryClient.invalidateQueries({ queryKey: ['analytics-history'] });
  }, [auth.user?.id, queryClient]);

  const addAccountMutation = useMutation({ mutationFn: addYouTubeAccount });
  const reconnectMutation = useMutation({ mutationFn: reconnectYouTubeAccount });
  const syncMutation = useMutation({
    mutationFn: synchronizeChannel,
    onSuccess: invalidate,
  });
  const channelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      if (!auth.user) throw new TubeMilestonesError('AUTH_REQUIRED', 'Sign in first.');
      await selectChannel(auth.user.id, channelId);
      await invalidate();
      return synchronizeChannel({ channelId, manual: false });
    },
    onSettled: invalidate,
  });
  const disconnectMutation = useMutation({
    mutationFn: requestYouTubeDisconnect,
    onSettled: invalidate,
  });
  const deleteAccountMutation = useMutation({
    mutationFn: requestAccountDeletion,
    onSuccess: async ({ status }) => {
      if (status === 'COMPLETE') await auth.signOut().catch(() => undefined);
      await invalidate();
    },
  });

  const data = demo.data ?? cloud.data?.dashboard ?? null;
  const fixtureConnection = demo.data
    ? demoConnection(demo.data, demo.scenario === 'reauth')
    : null;
  const connections = fixtureConnection
    ? [fixtureConnection]
    : (cloud.data?.connections ?? []);
  const selectedConnection =
    fixtureConnection ?? cloud.data?.selectedConnection ?? null;
  const channels = demo.data ? [demo.data.channel] : (cloud.data?.channels ?? []);
  const backgroundSyncKey = useRef<string | null>(null);
  const pendingChannels: Channel[] =
    !demo.isDemo && !data
      ? channels.filter(
          (channel) =>
            connections.find(({ id }) => id === channel.connectionId)?.status !==
            'DELETION_PENDING',
        )
      : [];
  const busy =
    addAccountMutation.isPending ||
    reconnectMutation.isPending ||
    syncMutation.isPending ||
    channelMutation.isPending;
  const status: AppStatus = demo.isDemo
    ? demo.scenario === 'auth' || demo.scenario === 'password-recovery'
      ? 'SIGNED_OUT'
      : demo.scenario === 'unconnected'
        ? 'CONNECT_YOUTUBE'
        : demo.scenario === 'reauth'
          ? 'REAUTH_REQUIRED'
          : demo.scenario === 'deletion-pending'
            ? 'DELETION_PENDING'
            : 'READY'
    : !auth.configured
      ? 'UNCONFIGURED'
      : !auth.user
        ? 'SIGNED_OUT'
        : busy
          ? addAccountMutation.isPending || reconnectMutation.isPending
            ? 'AUTHORIZING'
            : 'SYNCING'
          : connectionStatus(selectedConnection, Boolean(data));
  const isInitializing =
    !demo.isDemo && (auth.isLoading || (Boolean(auth.user) && cloud.isLoading));
  const theme = data?.metadata.themePreference ?? 'system';
  useDocumentTheme(theme);

  useEffect(() => {
    if (
      !options.backgroundSync ||
      demo.isDemo ||
      !auth.user ||
      !data ||
      !selectedConnection ||
      selectedConnection.status !== 'CONNECTED' ||
      syncMutation.isPending
    ) {
      return;
    }
    const lastSync = selectedConnection.last_synced_at
      ? new Date(selectedConnection.last_synced_at).getTime()
      : 0;
    const stale =
      !Number.isFinite(lastSync) || Date.now() - lastSync >= 15 * 60 * 1_000;
    const key = `${auth.user.id}:${selectedConnection.id}:${selectedConnection.last_synced_at ?? 'never'}`;
    if (!stale || backgroundSyncKey.current === key) return;
    backgroundSyncKey.current = key;
    syncMutation.mutate({ channelId: data.channel.channelId, manual: false });
  }, [
    auth.user,
    data,
    demo.isDemo,
    options.backgroundSync,
    selectedConnection,
    syncMutation,
  ]);

  const mutationError =
    addAccountMutation.error ??
    reconnectMutation.error ??
    syncMutation.error ??
    channelMutation.error ??
    disconnectMutation.error ??
    deleteAccountMutation.error;
  const error =
    demo.scenario === 'api-error'
      ? new TubeMilestonesError('YOUTUBE_API_ERROR', 'Fixture YouTube error.')
      : cloud.error
        ? asTubeMilestonesError(cloud.error)
        : mutationError
          ? asTubeMilestonesError(mutationError)
          : null;
  const warnings = [
    ...(demo.scenario === 'api-error'
      ? [new TubeMilestonesError('YOUTUBE_API_ERROR', 'Fixture YouTube error.')]
      : []),
    ...(syncMutation.data?.warnings ?? []).map(
      (code) =>
        new TubeMilestonesError(
          code === 'ANALYTICS_UNAVAILABLE' ? code : 'SUPABASE_ERROR',
          userMessageForError(
            new TubeMilestonesError(
              code === 'ANALYTICS_UNAVAILABLE' ? code : 'SUPABASE_ERROR',
              code,
            ),
          ),
        ),
    ),
  ];
  const newMilestone =
    data?.milestoneStates.find(
      (milestone) =>
        milestone.status === 'ACHIEVED' &&
        milestone.detectionType === 'TRACKED_CROSSING' &&
        !milestone.celebrationSeen,
    ) ?? null;

  return {
    status,
    syncStage: status === 'SYNCING' ? ('CONNECTING' as SyncStage) : null,
    data,
    connections,
    selectedConnection,
    channels,
    warnings,
    error,
    pendingChannels,
    isInitializing,
    isDemo: demo.isDemo,
    oauthConfigured: demo.isDemo || auth.configured,
    authUser: demo.scenario === 'unconnected' ? DEMO_USER : auth.user,
    authMethods:
      demo.scenario === 'password-recovery'
        ? { google: false, password: true }
        : auth.signInMethods,
    isPasswordRecovery:
      demo.scenario === 'password-recovery' || auth.isPasswordRecovery,
    newMilestone,
    signInWithGoogle: async () => {
      if (!demo.isDemo) await auth.signInWithGoogle();
    },
    signInWithPassword: async (email: string, password: string) => {
      if (demo.scenario === 'auth') {
        throw new ApplicationAuthError('INVALID_CREDENTIALS');
      }
      await auth.signInWithPassword(email, password);
    },
    signUpWithPassword: async (email: string, password: string) => {
      if (demo.scenario === 'auth') {
        return { status: 'CONFIRMATION_REQUIRED' as const, email: email.trim() };
      }
      return auth.signUpWithPassword(email, password);
    },
    requestPasswordReset: async (email: string) => {
      if (demo.scenario !== 'auth') await auth.requestPasswordReset(email);
    },
    updatePassword: async (password: string) => {
      if (demo.scenario === 'password-recovery') return DEMO_USER;
      return auth.updatePassword(password);
    },
    completePasswordRecovery: () => {
      if (demo.scenario === 'password-recovery') demo.exitDemo();
      else auth.completePasswordRecovery();
    },
    signOut: auth.signOut,
    addYouTubeAccount: async () => {
      if (!demo.isDemo) await addAccountMutation.mutateAsync();
    },
    reconnectYouTubeAccount: async (connectionId: string) => {
      if (!demo.isDemo) await reconnectMutation.mutateAsync(connectionId);
    },
    refresh: async () => {
      if (!demo.isDemo)
        await syncMutation.mutateAsync({ channelId: data?.channel.channelId });
    },
    chooseChannel: async (channelId: string) => channelMutation.mutateAsync(channelId),
    disconnectYouTubeAccount: async (connectionId: string) => {
      if (demo.isDemo) demo.exitDemo();
      else await disconnectMutation.mutateAsync(connectionId);
    },
    deleteAccount: async () => deleteAccountMutation.mutateAsync(),
    setTheme: async (nextTheme: ThemePreference) => {
      if (demo.data) {
        demo.setData({
          ...demo.data,
          metadata: { ...demo.data.metadata, themePreference: nextTheme },
        });
      } else if (auth.user) {
        await updateTheme(auth.user.id, nextTheme);
        await invalidate();
      }
    },
    addGoal: async (input: GoalInput) => {
      if (!data) return;
      if (demo.data) {
        const goal: CustomGoal = {
          id: crypto.randomUUID(),
          channelId: data.channel.channelId,
          metric: input.metric,
          target: input.target,
          title: input.title,
          createdAt: new Date().toISOString(),
          targetDate: input.targetDate,
        };
        demo.setData({
          ...demo.data,
          customGoals: [...demo.data.customGoals, goal],
          milestoneStates: [...demo.data.milestoneStates, demoGoalState(data, goal)],
        });
      } else if (auth.user) {
        await createGoal({
          userId: auth.user.id,
          channelId: data.channel.channelId,
          ...input,
        });
        await invalidate();
      }
    },
    removeGoal: async (goalId: string) => {
      if (demo.data) {
        demo.setData({
          ...demo.data,
          customGoals: demo.data.customGoals.filter(({ id }) => id !== goalId),
          milestoneStates: demo.data.milestoneStates.filter(
            ({ customGoalId }) => customGoalId !== goalId,
          ),
        });
      } else {
        await deleteGoal(goalId);
        await invalidate();
      }
    },
    updateManualMetrics: async (
      input: Omit<ManualMetrics, 'channelId' | 'updatedAt'>,
    ) => {
      if (!data) return;
      if (demo.data) {
        demo.setData({
          ...demo.data,
          manualMetrics: {
            channelId: data.channel.channelId,
            ...input,
            updatedAt: new Date().toISOString(),
          },
        });
      } else if (auth.user) {
        await saveManualValues({
          userId: auth.user.id,
          channelId: data.channel.channelId,
          ...input,
        });
        await invalidate();
      }
    },
    dismissCelebration: async () => {
      if (!newMilestone) return;
      if (demo.data) {
        demo.setData({
          ...demo.data,
          milestoneStates: demo.data.milestoneStates.map((milestone) =>
            milestone.id === newMilestone.id
              ? { ...milestone, celebrationSeen: true }
              : milestone,
          ),
        });
      } else {
        await markCelebrationSeen(newMilestone.id);
        await invalidate();
      }
    },
    startDemo: demo.startDemo,
    exitDemo: demo.exitDemo,
  };
}
