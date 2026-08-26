import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { db } from '../db/db';
import {
  authorizationCacheStatus,
  clearAuthorizedData,
  deleteCustomGoal,
  ensureMetadata,
  loadSelectedChannelData,
  markCelebrationSeen,
  saveCustomGoal,
  saveManualMetrics,
  saveMilestoneStates,
  setThemePreference,
} from '../db/repositories/appRepository';
import type {
  Channel,
  CustomGoal,
  DashboardData,
  ManualMetrics,
  MetricType,
  MilestoneState,
  ThemePreference,
} from '../domain/models';
import {
  createDemoDashboard,
  demoFixtureFromLocation,
  isDemoModeAllowed,
  type DemoFixtureName,
} from '../fixtures/demoData';
import type { AuthorizationStatus } from '../features/auth/authState';
import { asTubeMilestonesError, TubeMilestonesError } from '../services/errors';
import {
  googleClientId,
  isGoogleOAuthConfigured,
  loadGoogleIdentityServices,
  requestGoogleAccessToken,
  revokeGoogleAccess,
  type OAuthSession,
} from '../services/google/identity';
import {
  channelMetricValue,
  synchronizeTubeMilestones,
  type SyncStage,
} from '../services/sync/syncCoordinator';

interface AppContextValue {
  status: AuthorizationStatus;
  syncStage: SyncStage | null;
  data: DashboardData | null;
  warnings: TubeMilestonesError[];
  error: TubeMilestonesError | null;
  pendingChannels: Channel[];
  isInitializing: boolean;
  isDemo: boolean;
  isCached: boolean;
  hasStaleCache: boolean;
  hasToken: boolean;
  oauthConfigured: boolean;
  newMilestone: MilestoneState | null;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  chooseChannel(channelId: string): Promise<void>;
  disconnect(): Promise<void>;
  clearLocalData(): Promise<void>;
  setTheme(theme: ThemePreference): Promise<void>;
  addGoal(input: {
    metric: MetricType;
    target: number;
    title: string | null;
    targetDate: string | null;
  }): Promise<void>;
  removeGoal(goalId: string): Promise<void>;
  updateManualMetrics(input: {
    qualifiedPublicWatchHours: number | null;
    qualifiedShortsViews: number | null;
  }): Promise<void>;
  dismissCelebration(): Promise<void>;
  startDemo(name?: DemoFixtureName): void;
  exitDemo(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

function statusForError(error: TubeMilestonesError): AuthorizationStatus {
  switch (error.code) {
    case 'PERMISSION_DENIED':
      return 'PERMISSION_DENIED';
    case 'NO_CHANNEL':
      return 'NO_CHANNEL';
    case 'TOKEN_EXPIRED':
      return 'TOKEN_EXPIRED';
    case 'NETWORK_UNAVAILABLE':
    case 'TIMEOUT':
      return 'NETWORK_ERROR';
    case 'QUOTA_EXCEEDED':
    case 'RATE_LIMITED':
      return 'QUOTA_ERROR';
    default:
      return 'API_ERROR';
  }
}

function customMilestoneState(data: DashboardData, goal: CustomGoal): MilestoneState {
  const currentValue = channelMetricValue(
    data.channel,
    data.analyticsSummary,
    goal.metric,
  );
  const complete = currentValue !== null && currentValue >= goal.target;
  return {
    id: `${goal.channelId}:custom:${goal.id}`,
    channelId: goal.channelId,
    metric: goal.metric,
    target: goal.target,
    status: complete ? 'ACHIEVED' : 'NEXT',
    detectedAt: null,
    detectionType: complete ? 'USER_CREATED_ALREADY_COMPLETE' : 'PREEXISTING',
    celebrationSeen: true,
  };
}

function useDocumentTheme(theme: ThemePreference): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      const themeMeta = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]',
      );
      themeMeta?.setAttribute('content', resolved === 'dark' ? '#111116' : '#f5f4f8');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const configured = isGoogleOAuthConfigured();
  const [status, setStatus] = useState<AuthorizationStatus>(
    configured ? 'DISCONNECTED' : 'UNCONFIGURED',
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [warnings, setWarnings] = useState<TubeMilestonesError[]>([]);
  const [error, setError] = useState<TubeMilestonesError | null>(null);
  const [syncStage, setSyncStage] = useState<SyncStage | null>(null);
  const [pendingChannels, setPendingChannels] = useState<Channel[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [hasStaleCache, setHasStaleCache] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [newMilestone, setNewMilestone] = useState<MilestoneState | null>(null);
  const sessionRef = useRef<OAuthSession | null>(null);

  useDocumentTheme(theme);

  const loadStoredData = useCallback(async (): Promise<DashboardData | null> => {
    const stored = await loadSelectedChannelData();
    setData(stored);
    return stored;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const requestedDemo = demoFixtureFromLocation();
      if (requestedDemo && isDemoModeAllowed()) {
        if (!cancelled) {
          const fixture = createDemoDashboard(requestedDemo);
          setData(fixture);
          setThemeState(fixture.metadata.themePreference);
          setIsDemo(true);
          setStatus('READY');
          setIsInitializing(false);
        }
        return;
      }

      const metadata = await ensureMetadata();
      const stored = await loadSelectedChannelData();
      if (cancelled) return;
      setThemeState(metadata.themePreference);
      const cacheStatus = authorizationCacheStatus(metadata);
      if (stored && cacheStatus === 'valid') {
        setData(stored);
        setIsCached(true);
        setStatus('READY');
      } else if (stored && cacheStatus === 'stale') {
        setHasStaleCache(true);
        setStatus('TOKEN_EXPIRED');
      } else {
        setStatus(configured ? 'DISCONNECTED' : 'UNCONFIGURED');
      }
      setIsInitializing(false);
    };
    void initialize().catch((initializationError: unknown) => {
      if (cancelled) return;
      const typed = asTubeMilestonesError(initializationError);
      setError(typed);
      setStatus('API_ERROR');
      setIsInitializing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    void loadGoogleIdentityServices().catch(() => {
      // The user-facing connection action retries and reports a typed error.
    });
  }, [configured]);

  const runSync = useCallback(
    async (session: OAuthSession, selectedChannelId?: string | null) => {
      setStatus('SYNCING');
      setSyncStage('CONNECTING');
      setError(null);
      const result = await synchronizeTubeMilestones(session.accessToken, {
        selectedChannelId,
        onStage: setSyncStage,
      });

      if (result.kind === 'CHANNEL_SELECTION_REQUIRED') {
        setPendingChannels(result.channels);
        setStatus('AUTHORIZED');
        setSyncStage(null);
        return;
      }

      setPendingChannels([]);
      setData(result.data);
      setWarnings(result.warnings);
      setIsCached(false);
      setHasStaleCache(false);
      setStatus('READY');
      setSyncStage(null);
      setNewMilestone(result.newMilestones[0] ?? null);
    },
    [],
  );

  const handleConnectionError = useCallback(
    async (connectionError: unknown) => {
      const typed = asTubeMilestonesError(connectionError);
      setError(typed);
      setSyncStage(null);
      setStatus(statusForError(typed));
      if (
        hasStaleCache &&
        ['OAUTH_REJECTED', 'PERMISSION_DENIED'].includes(typed.code)
      ) {
        await clearAuthorizedData();
        setData(null);
        setHasStaleCache(false);
      }
    },
    [hasStaleCache],
  );

  const connect = useCallback(async () => {
    if (!configured) {
      setError(
        new TubeMilestonesError(
          'OAUTH_REJECTED',
          'Google OAuth is not configured for this deployment.',
        ),
      );
      setStatus('UNCONFIGURED');
      return;
    }
    setStatus('AUTHORIZING');
    setError(null);
    try {
      const session = await requestGoogleAccessToken('select_account');
      sessionRef.current = session;
      setHasToken(true);
      setStatus('AUTHORIZED');
      await runSync(session);
    } catch (connectionError) {
      await handleConnectionError(connectionError);
    }
  }, [configured, handleConnectionError, runSync]);

  const refresh = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.expiresAt <= Date.now()) {
      sessionRef.current = null;
      setHasToken(false);
      await connect();
      return;
    }
    try {
      await runSync(session, data?.channel.channelId);
    } catch (refreshError) {
      await handleConnectionError(refreshError);
    }
  }, [connect, data, handleConnectionError, runSync]);

  const chooseChannel = useCallback(
    async (channelId: string) => {
      const session = sessionRef.current;
      if (!session || session.expiresAt <= Date.now()) {
        setStatus('TOKEN_EXPIRED');
        setHasToken(false);
        return;
      }
      try {
        await runSync(session, channelId);
      } catch (selectionError) {
        await handleConnectionError(selectionError);
      }
    },
    [handleConnectionError, runSync],
  );

  const disconnect = useCallback(async () => {
    const session = sessionRef.current;
    const revokeWarning: TubeMilestonesError[] = [];
    if (session && session.expiresAt > Date.now()) {
      try {
        await revokeGoogleAccess(session.accessToken);
      } catch (revokeError) {
        revokeWarning.push(asTubeMilestonesError(revokeError));
      }
    }
    sessionRef.current = null;
    setHasToken(false);
    await clearAuthorizedData();
    setData(null);
    setWarnings(revokeWarning);
    setError(null);
    setPendingChannels([]);
    setHasStaleCache(false);
    setIsCached(false);
    setStatus(configured ? 'DISCONNECTED' : 'UNCONFIGURED');
  }, [configured]);

  const clearLocalData = useCallback(async () => {
    await clearAuthorizedData();
    setData(null);
    setWarnings([]);
    setError(null);
    setPendingChannels([]);
    setHasStaleCache(false);
    setIsCached(false);
    setStatus(configured ? 'DISCONNECTED' : 'UNCONFIGURED');
  }, [configured]);

  const setTheme = useCallback(
    async (preference: ThemePreference) => {
      setThemeState(preference);
      if (isDemo) {
        setData((current) =>
          current
            ? {
                ...current,
                metadata: { ...current.metadata, themePreference: preference },
              }
            : current,
        );
        return;
      }
      await setThemePreference(preference);
      await loadStoredData();
    },
    [isDemo, loadStoredData],
  );

  const addGoal = useCallback(
    async (input: {
      metric: MetricType;
      target: number;
      title: string | null;
      targetDate: string | null;
    }) => {
      if (!data) return;
      const goal: CustomGoal = {
        id: crypto.randomUUID(),
        channelId: data.channel.channelId,
        metric: input.metric,
        target: input.target,
        title: input.title,
        createdAt: new Date().toISOString(),
        targetDate: input.targetDate,
      };
      const state = customMilestoneState(data, goal);
      if (isDemo) {
        setData({
          ...data,
          customGoals: [...data.customGoals, goal],
          milestoneStates: [...data.milestoneStates, state],
        });
        return;
      }
      await saveCustomGoal(goal);
      await saveMilestoneStates([state]);
      await loadStoredData();
    },
    [data, isDemo, loadStoredData],
  );

  const removeGoal = useCallback(
    async (goalId: string) => {
      if (!data) return;
      const stateId = `${data.channel.channelId}:custom:${goalId}`;
      if (isDemo) {
        setData({
          ...data,
          customGoals: data.customGoals.filter(({ id }) => id !== goalId),
          milestoneStates: data.milestoneStates.filter(({ id }) => id !== stateId),
        });
        return;
      }
      await deleteCustomGoal(goalId);
      await db.milestoneStates.delete(stateId);
      await loadStoredData();
    },
    [data, isDemo, loadStoredData],
  );

  const updateManualMetrics = useCallback(
    async (input: {
      qualifiedPublicWatchHours: number | null;
      qualifiedShortsViews: number | null;
    }) => {
      if (!data) return;
      const metrics: ManualMetrics = {
        channelId: data.channel.channelId,
        ...input,
        updatedAt: new Date().toISOString(),
      };
      if (isDemo) {
        setData({ ...data, manualMetrics: metrics });
        return;
      }
      await saveManualMetrics(metrics);
      await loadStoredData();
    },
    [data, isDemo, loadStoredData],
  );

  const dismissCelebration = useCallback(async () => {
    const milestone = newMilestone;
    setNewMilestone(null);
    if (milestone && !isDemo) await markCelebrationSeen(milestone.id);
  }, [isDemo, newMilestone]);

  const startDemo = useCallback((name: DemoFixtureName = 'small') => {
    if (!isDemoModeAllowed()) return;
    const fixture = createDemoDashboard(name);
    setData(fixture);
    setThemeState(fixture.metadata.themePreference);
    setIsDemo(true);
    setIsCached(false);
    setHasStaleCache(false);
    setWarnings([]);
    setError(null);
    setStatus('READY');
  }, []);

  const exitDemo = useCallback(() => {
    setIsDemo(false);
    setData(null);
    setWarnings([]);
    setError(null);
    window.location.hash = '#/';
    setStatus(configured ? 'DISCONNECTED' : 'UNCONFIGURED');
  }, [configured]);

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      syncStage,
      data,
      warnings,
      error,
      pendingChannels,
      isInitializing,
      isDemo,
      isCached,
      hasStaleCache,
      hasToken,
      oauthConfigured: googleClientId().length > 0,
      newMilestone,
      connect,
      refresh,
      chooseChannel,
      disconnect,
      clearLocalData,
      setTheme,
      addGoal,
      removeGoal,
      updateManualMetrics,
      dismissCelebration,
      startDemo,
      exitDemo,
    }),
    [
      status,
      syncStage,
      data,
      warnings,
      error,
      pendingChannels,
      isInitializing,
      isDemo,
      isCached,
      hasStaleCache,
      hasToken,
      newMilestone,
      connect,
      refresh,
      chooseChannel,
      disconnect,
      clearLocalData,
      setTheme,
      addGoal,
      removeGoal,
      updateManualMetrics,
      dismissCelebration,
      startDemo,
      exitDemo,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Context hooks intentionally live beside their provider to keep the session boundary explicit.
// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
