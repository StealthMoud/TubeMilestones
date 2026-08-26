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
      <div className="milestone-hero__heading">
        <div>
          <p className="eyebrow">Next milestone</p>
          <h2 id="next-milestone-title">
            {hidden
              ? 'Count hidden'
              : nextTarget === null
                ? 'Trail complete'
                : formatCompactNumber(nextTarget)}
          </h2>
          <span>{label}</span>
        </div>
        {!hidden ? (
          <strong className="milestone-hero__percent">
            {formatPercent(clampedOverall)}
          </strong>
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
          <div className="milestone-hero__value">
            <strong>{formatCompactNumber(currentValue)}</strong>
            {nextTarget ? <span>/ {formatCompactNumber(nextTarget)}</span> : null}
          </div>
          <svg
            className="milestone-track"
            viewBox="0 0 640 112"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className="milestone-track__base"
              d="M24 78C150 78 158 33 292 33C428 33 438 77 616 50"
              pathLength="1"
            />
            <path
              className="milestone-track__fill"
              d="M24 78C150 78 158 33 292 33C428 33 438 77 616 50"
              pathLength="1"
              style={{ strokeDashoffset: 1 - clampedOverall }}
            />
            <circle className="milestone-track__past" cx="24" cy="78" r="7" />
            <circle className="milestone-track__current" cx="292" cy="33" r="9" />
            <circle className="milestone-track__next" cx="616" cy="50" r="8" />
          </svg>
          <div className="milestone-hero__footer">
            <span>
              {nextTarget === null
                ? 'Highest configured checkpoint achieved'
                : formatRemaining(remaining, metric, precision)}
            </span>
            {nextTarget !== null && segmentProgress !== null ? (
              <span className="milestone-hero__segment">
                {formatPercent(segmentProgress)} through the{' '}
                {formatCompactNumber(previousTarget)} to{' '}
                {formatCompactNumber(nextTarget)} segment
              </span>
            ) : null}
          </div>
          {rounded ? (
            <p className="metric-precision-note">
              YouTube's API rounds subscriber counts above 1K. Progress uses the
              API-reported value.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
