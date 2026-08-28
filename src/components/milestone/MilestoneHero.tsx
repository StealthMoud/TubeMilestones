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
  const unavailable = currentValue === null || precision === 'HIDDEN';
  const hiddenSubscribers = metric === 'subscribers' && precision === 'HIDDEN';
  const railProgress = Math.min(
    1,
    Math.max(0, segmentProgress ?? (nextTarget === null && !unavailable ? 1 : 0)),
  );
  const markerPosition = Math.min(98, Math.max(2, railProgress * 100));
  const remaining =
    currentValue === null || nextTarget === null
      ? 0
      : Math.max(0, nextTarget - currentValue);
  const label = metricLabel(metric);
  const rounded =
    metric === 'subscribers' && precision === 'ROUNDED_THREE_SIGNIFICANT_FIGURES';
  const accessibleValue = unavailable
    ? hiddenSubscribers
      ? 'Subscriber count hidden. Milestone progress is unavailable.'
      : `${label} is not available. Milestone progress is unavailable.`
    : nextTarget === null
      ? `${formatFullNumber(currentValue)} ${label}. Highest configured checkpoint achieved.`
      : `${rounded ? 'Approximately ' : ''}${formatFullNumber(currentValue)} ${label}. Current segment ${formatFullNumber(previousTarget)} to ${formatFullNumber(nextTarget)}. ${formatPercent(railProgress)} through the segment. ${rounded ? 'Remaining distance is approximate.' : `${formatFullNumber(remaining)} remaining.`}`;
  const activeSegment = !unavailable && nextTarget !== null;

  return (
    <section
      className="milestone-hero"
      aria-labelledby="next-milestone-title"
      role={activeSegment ? 'progressbar' : undefined}
      aria-valuemin={activeSegment ? previousTarget : undefined}
      aria-valuemax={activeSegment ? nextTarget : undefined}
      aria-valuenow={activeSegment ? currentValue : undefined}
      aria-valuetext={activeSegment ? accessibleValue : undefined}
    >
      <div className="milestone-hero__summary">
        <div className="milestone-hero__value">
          <span>Current</span>
          <strong>{unavailable ? '—' : formatCompactNumber(currentValue)}</strong>
          <small>{label}</small>
        </div>
        <span className="milestone-hero__relation" aria-hidden="true">
          →
        </span>
        <div className="milestone-hero__target">
          <span>Next milestone</span>
          <h2 id="next-milestone-title">
            {unavailable
              ? hiddenSubscribers
                ? 'Count hidden'
                : 'Not available'
              : nextTarget === null
                ? 'Trail complete'
                : formatCompactNumber(nextTarget)}
          </h2>
          {!unavailable && nextTarget !== null ? <small>{label}</small> : null}
        </div>
        {!unavailable ? (
          <div className="milestone-hero__percent">
            <span>{nextTarget === null ? 'Journey' : 'Segment progress'}</span>
            <strong>{formatPercent(nextTarget === null ? 1 : railProgress)}</strong>
            <small>{nextTarget === null ? 'complete' : 'through segment'}</small>
          </div>
        ) : null}
      </div>

      {unavailable ? (
        <div className="milestone-hero__hidden">
          <p>
            {hiddenSubscribers
              ? 'This channel hides its subscriber count, so TubeMilestones cannot calculate subscriber checkpoints.'
              : `${label} is not available yet. Other channel milestones continue to work normally.`}
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
            {nextTarget !== null ? (
              <span>
                Current segment {formatCompactNumber(previousTarget)} →{' '}
                {formatCompactNumber(nextTarget)}
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
