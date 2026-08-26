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
  createGoal,
  deleteGoal,
  markCelebrationSeen,
  requestAccountDeletion,
  requestYouTubeDisconnect,
  saveManualValues,
  selectChannel,
  startYouTubeAuthorization,
  synchronizeChannel,
  updateTheme,
} from '../services/supabase/actions';
import {
  loadCloudDashboard,
  type Connection,
} from '../services/supabase/dashboardRepository';
import { useDocumentTheme } from './useDocumentTheme';

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
  email: 'creator@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-08-26T00:00:00.000Z',
} as User;

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

  const signInMutation = useMutation({ mutationFn: auth.signInWithGoogle });
  const connectMutation = useMutation({ mutationFn: startYouTubeAuthorization });
  const syncMutation = useMutation({
    mutationFn: synchronizeChannel,
    onSuccess: invalidate,
  });
  const channelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      if (!auth.user) throw new TubeMilestonesError('AUTH_REQUIRED', 'Sign in first.');
      await selectChannel(auth.user.id, channelId);
      return synchronizeChannel({ channelId, manual: false });
    },
    onSuccess: invalidate,
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
  const connection = cloud.data?.connection ?? null;
  const backgroundSyncKey = useRef<string | null>(null);
  const pendingChannels: Channel[] =
    !demo.isDemo && connection && !data ? (cloud.data?.channels ?? []) : [];
  const busy =
    connectMutation.isPending || syncMutation.isPending || channelMutation.isPending;
  const status: AppStatus = demo.isDemo
    ? demo.scenario === 'unconnected'
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
          ? connectMutation.isPending
            ? 'AUTHORIZING'
            : 'SYNCING'
          : connectionStatus(connection, Boolean(data));
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
      !connection ||
      connection.status !== 'CONNECTED' ||
      syncMutation.isPending
    ) {
      return;
    }
    const lastSync = connection.last_synced_at
      ? new Date(connection.last_synced_at).getTime()
      : 0;
    const stale =
      !Number.isFinite(lastSync) || Date.now() - lastSync >= 15 * 60 * 1_000;
    const key = `${auth.user.id}:${connection.last_synced_at ?? 'never'}`;
    if (!stale || backgroundSyncKey.current === key) return;
    backgroundSyncKey.current = key;
    syncMutation.mutate({ channelId: data.channel.channelId, manual: false });
  }, [auth.user, connection, data, demo.isDemo, options.backgroundSync, syncMutation]);

  const mutationError =
    signInMutation.error ??
    connectMutation.error ??
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
    connection,
    warnings,
    error,
    pendingChannels,
    isInitializing,
    isDemo: demo.isDemo,
    oauthConfigured: demo.isDemo || auth.configured,
    authUser: demo.scenario === 'unconnected' ? DEMO_USER : auth.user,
    newMilestone,
    signIn: async () => signInMutation.mutateAsync(),
    signOut: auth.signOut,
    connect: async () => {
      if (!demo.isDemo) await connectMutation.mutateAsync();
    },
    refresh: async () => {
      if (!demo.isDemo)
        await syncMutation.mutateAsync({ channelId: data?.channel.channelId });
    },
    chooseChannel: async (channelId: string) => channelMutation.mutateAsync(channelId),
    disconnect: async () => {
      if (demo.isDemo) demo.exitDemo();
      else await disconnectMutation.mutateAsync();
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
