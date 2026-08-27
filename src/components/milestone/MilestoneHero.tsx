import type { MetricType, SubscriberPrecision } from '../../domain/models';
import {
  formatCompactNumber,
  formatFullNumber,
  formatPercent,
  formatRemaining,
  metricLabel,
} from '../../domain/metrics/format';

interface MilestoneHeroProps {
  metric: MetricType;
  currentValue: number | null;
  previousTarget: number;
  nextTarget: number | null;
  segmentProgress: number | null;
  precision: SubscriberPrecision;
}

export function MilestoneHero({
  metric,
  currentValue,
  previousTarget,
  nextTarget,
  segmentProgress,
  precision,
}: MilestoneHeroProps) {
  const hidden = currentValue === null || precision === 'HIDDEN';
  const overallProgress =
    hidden || nextTarget === null
      ? nextTarget === null
        ? 1
        : 0
      : currentValue / nextTarget;
  const clampedOverall = Math.min(1, Math.max(0, overallProgress));
  const railProgress = Math.min(1, Math.max(0, segmentProgress ?? clampedOverall));
  const markerPosition = Math.min(98, Math.max(2, railProgress * 100));
  const remaining =
    currentValue === null || nextTarget === null
      ? 0
      : Math.max(0, nextTarget - currentValue);
  const label = metricLabel(metric);
  const rounded =
    metric === 'subscribers' && precision === 'ROUNDED_THREE_SIGNIFICANT_FIGURES';
  const accessibleValue = hidden
    ? 'Subscriber count hidden. Milestone progress is unavailable.'
    : nextTarget === null
      ? `${formatFullNumber(currentValue)} ${label}. Highest configured checkpoint achieved.`
      : `${rounded ? 'Approximately ' : ''}${formatFullNumber(currentValue)} of ${formatFullNumber(nextTarget)} ${label}. ${rounded ? 'API-reported progress' : `${formatFullNumber(remaining)} remaining`}. ${formatPercent(clampedOverall)} complete.`;

  return (
    <section
      className="milestone-hero"
      aria-labelledby="next-milestone-title"
      role={hidden ? undefined : 'progressbar'}
      aria-valuemin={hidden ? undefined : 0}
      aria-valuemax={hidden ? undefined : 100}
      aria-valuenow={hidden ? undefined : Math.round(clampedOverall * 100)}
      aria-valuetext={accessibleValue}
    >
      <div className="milestone-hero__summary">
        <div className="milestone-hero__value">
          <span>Current</span>
          <strong>{hidden ? '—' : formatCompactNumber(currentValue)}</strong>
          <small>{label}</small>
        </div>
        <div className="milestone-hero__target">
          <span>Next milestone</span>
          <h2 id="next-milestone-title">
            {hidden
              ? 'Count hidden'
              : nextTarget === null
                ? 'Trail complete'
                : formatCompactNumber(nextTarget)}
          </h2>
          {!hidden && nextTarget !== null ? <small>{label}</small> : null}
        </div>
        {!hidden ? (
          <div className="milestone-hero__percent">
            <strong>{formatPercent(clampedOverall)}</strong>
            <span>{nextTarget === null ? 'complete' : 'to next'}</span>
          </div>
        ) : null}
      </div>

      {hidden ? (
        <div className="milestone-hero__hidden">
          <p>
            This channel hides its subscriber count, so TubeMilestones cannot calculate
            subscriber checkpoints.
          </p>
        </div>
      ) : (
        <>
          <div className="milestone-rail" aria-hidden="true">
            <div className="milestone-rail__track">
              <span style={{ width: `${railProgress * 100}%` }} />
              <i style={{ left: `${markerPosition}%` }} />
            </div>
            <div className="milestone-rail__labels">
              <span>{formatCompactNumber(previousTarget)}</span>
              <span>
                {nextTarget === null
                  ? 'Highest checkpoint'
                  : formatCompactNumber(nextTarget)}
              </span>
            </div>
          </div>
          <div className="milestone-hero__footer">
            <strong>
              {nextTarget === null
                ? 'Highest configured checkpoint achieved'
                : formatRemaining(remaining, metric, precision)}
            </strong>
            {nextTarget !== null && segmentProgress !== null ? (
              <span>
                {formatPercent(segmentProgress)} through the{' '}
                {formatCompactNumber(previousTarget)}–{formatCompactNumber(nextTarget)}{' '}
                segment
              </span>
            ) : null}
          </div>
          {rounded ? (
            <p className="metric-precision-note">
              YouTube rounds subscriber counts above 1K. Progress uses the API-reported
              value.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
