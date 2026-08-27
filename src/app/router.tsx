import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTubeMilestones } from '../hooks/useTubeMilestones';
import HomePage from '../features/home/HomePage';
import { LandingPage } from '../features/landing/LandingPage';
import { AppShell } from '../components/layout/AppShell';
import { ChannelSelector } from '../components/feedback/ChannelSelector';
import { ScreenSkeleton } from '../components/feedback/ScreenSkeleton';
import { SyncingState } from '../components/feedback/SyncingState';
import { OAuthCallbackPage } from '../features/auth/OAuthCallbackPage';
import { DeletionPending } from '../components/feedback/DeletionPending';
import { PasswordRecoveryPage } from '../features/auth/PasswordRecoveryPage';

const JourneyPage = lazy(() => import('../features/journey/JourneyPage'));
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));

export function AppRouter() {
  const {
    data,
    pendingChannels,
    isInitializing,
    status,
    syncStage,
    authUser,
    isPasswordRecovery,
    updatePassword,
    completePasswordRecovery,
  } = useTubeMilestones({ backgroundSync: true });
  const location = useLocation();

  if (isPasswordRecovery) {
    return (
      <PasswordRecoveryPage
        updatePassword={updatePassword}
        completePasswordRecovery={completePasswordRecovery}
      />
    );
  }
  if (isInitializing) return <ScreenSkeleton />;
  if (location.pathname === '/oauth/youtube') return <OAuthCallbackPage />;
  if (pendingChannels.length > 0) return <ChannelSelector />;
  if (status === 'DELETION_PENDING' && !data) return <DeletionPending />;
  if (!data && authUser && location.pathname === '/settings') {
    return (
      <Suspense fallback={<ScreenSkeleton />}>
        <SettingsPage />
      </Suspense>
    );
  }
  if (!data) {
    if (status === 'SYNCING') return <SyncingState stage={syncStage} />;
    return <LandingPage />;
  }

  return (
    <AppShell>
      <Suspense fallback={<ScreenSkeleton />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/journey" element={<JourneyPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
