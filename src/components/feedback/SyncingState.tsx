import { BrandMark } from '../common/BrandMark';
import type { SyncStage } from '../../services/sync/syncCoordinator';

const STEPS: Array<{ stage: SyncStage; label: string }> = [
  { stage: 'CONNECTING', label: 'Connecting to YouTube' },
  { stage: 'CHANNEL', label: 'Loading your channel' },
  { stage: 'ANALYTICS', label: 'Loading Analytics' },
  { stage: 'MILESTONES', label: 'Building your milestone journey' },
];

export function SyncingState({ stage }: { stage: SyncStage | null }) {
  const currentIndex = Math.max(
    0,
    STEPS.findIndex((step) => step.stage === stage),
  );
  return (
    <main className="sync-state" aria-live="polite" aria-busy="true">
      <BrandMark size={54} title="TubeMilestones" />
      <div className="sync-state__copy">
        <p className="eyebrow">Preparing your journey</p>
        <h1>{STEPS[currentIndex]?.label ?? 'Connecting to YouTube'}...</h1>
      </div>
      <ol className="sync-steps">
        {STEPS.map((step, index) => (
          <li
            key={step.stage}
            className={index <= currentIndex ? 'is-active' : undefined}
            aria-current={index === currentIndex ? 'step' : undefined}
          >
            <span className="sync-step__node" />
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      <div className="sync-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
