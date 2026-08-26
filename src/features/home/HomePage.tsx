import { ArrowRight, Clock3, Eye, Library, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useApp } from '../../app/AppProvider';
import { recentMovement } from '../../domain/analytics/calculations';
import { definitionsFor } from '../../domain/milestones/definitions';
import { evaluateMilestones } from '../../domain/milestones/engine';
import type { MetricSource, MetricType } from '../../domain/models';
import {
  formatCompactNumber,
  formatFullNumber,
  metricLabel,
} from '../../domain/metrics/format';
import { formatReportingDay } from '../../domain/metrics/dates';
import { channelMetricValue } from '../../services/sync/syncCoordinator';
import { MetricSelector } from '../../components/common/MetricSelector';
import { MilestoneHero } from '../../components/milestone/MilestoneHero';

const QUICK_METRICS: Array<{
  metric: MetricType;
  label: string;
  source: MetricSource;
  icon: typeof Users;
}> = [
  {
    metric: 'subscribers',
    label: 'Subscribers',
    source: 'YOUTUBE_DATA_API',
    icon: Users,
  },
  { metric: 'views', label: 'Channel views', source: 'YOUTUBE_DATA_API', icon: Eye },
  { metric: 'uploads', label: 'Uploads', source: 'YOUTUBE_DATA_API', icon: Library },
  {
    metric: 'watchHours',
    label: 'Available Analytics watch time',
    source: 'YOUTUBE_ANALYTICS_API',
    icon: Clock3,
  },
];

const SOURCE_LABELS: Record<MetricSource, string> = {
  YOUTUBE_DATA_API: 'YouTube Data API',
  YOUTUBE_ANALYTICS_API: 'YouTube Analytics API',
  USER_ENTERED: 'Manual value',
};

export default function HomePage() {
  const { data } = useApp();
  const [metric, setMetric] = useState<MetricType>('subscribers');
  if (!data) return null;

  const currentValue = channelMetricValue(data.channel, data.analyticsSummary, metric);
  const precision =
    metric === 'subscribers' ? data.channel.subscriberCountPrecision : 'EXACT';
  const evaluation = evaluateMilestones({
    previousValue: currentValue,
    currentValue,
    milestoneDefinitions: definitionsFor(metric),
    trackingStartedAt: data.metadata.trackingStartedAt ?? data.channel.updatedAt,
    observedAt: data.channel.updatedAt,
    precision,
  });
  const movement = recentMovement(data.analyticsDaily.slice(-28));
  const metricDefinitions = definitionsFor(metric);
  const nextIndex = metricDefinitions.findIndex(
    ({ target }) => currentValue !== null && target > currentValue,
  );
  const journeyStart = Math.max(
    0,
    (nextIndex === -1 ? metricDefinitions.length : nextIndex) - 2,
  );
  const journeyNodes =
    currentValue === null
      ? []
      : metricDefinitions.slice(journeyStart, journeyStart + 3);

  return (
    <div className="page page--home page-enter">
      <header className="page-heading page-heading--compact">
        <div>
          <p className="page-heading__context">Your channel</p>
          <h1>Here is where you stand.</h1>
        </div>
      </header>

      <MetricSelector value={metric} onChange={setMetric} />

      <MilestoneHero
        metric={metric}
        currentValue={currentValue}
        previousTarget={evaluation.currentMilestone?.target ?? 0}
        nextTarget={evaluation.nextMilestone?.target ?? null}
        segmentProgress={evaluation.progress}
        precision={precision}
      />

      <section className="quick-metrics" aria-labelledby="quick-metrics-title">
        <div className="section-heading-inline">
          <h2 id="quick-metrics-title">Channel position</h2>
          <span>Current API values</span>
        </div>
        <div className="quick-metrics__grid">
          {QUICK_METRICS.map(({ metric: itemMetric, label, source, icon: Icon }) => {
            const value = channelMetricValue(
              data.channel,
              data.analyticsSummary,
              itemMetric,
            );
            return (
              <article key={itemMetric} className="metric-card">
                <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
                <strong>
                  {value === null ? 'Unavailable' : formatCompactNumber(value)}
                </strong>
                <small>{SOURCE_LABELS[source]}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="movement-panel" aria-labelledby="movement-title">
        <div className="section-heading-inline">
          <div>
            <p>Last 28 days</p>
            <h2 id="movement-title">Recent movement</h2>
          </div>
          {movement.availableThrough ? (
            <span>Through {formatReportingDay(movement.availableThrough)}</span>
          ) : null}
        </div>
        {data.analyticsDaily.length === 0 ? (
          <div className="empty-inline">
            <p>
              Analytics isn't available yet. Your channel milestones still work
              normally.
            </p>
          </div>
        ) : (
          <div className="movement-values">
            <div>
              <strong>
                {movement.netSubscribers >= 0 ? '+' : ''}
                {formatFullNumber(movement.netSubscribers)}
              </strong>
              <span>net subscribers</span>
            </div>
            <div>
              <strong>{formatCompactNumber(movement.views)}</strong>
              <span>views</span>
            </div>
            <div>
              <strong>{formatCompactNumber(movement.watchHours)}</strong>
              <span>Analytics watch hours</span>
            </div>
          </div>
        )}
      </section>

      <section className="journey-preview" aria-labelledby="journey-preview-title">
        <div className="section-heading-inline">
          <div>
            <p>Progress trail</p>
            <h2 id="journey-preview-title">Your nearby checkpoints</h2>
          </div>
          <Link to="/journey">
            Open Journey <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {journeyNodes.length > 0 ? (
          <ol className="journey-preview__nodes">
            {journeyNodes.map((node) => {
              const achieved = currentValue !== null && node.target <= currentValue;
              const next = node.target === evaluation.nextMilestone?.target;
              return (
                <li
                  key={node.target}
                  className={achieved ? 'is-achieved' : next ? 'is-next' : undefined}
                >
                  <span className="journey-preview__node" aria-hidden="true" />
                  <small>{achieved ? 'Achieved' : next ? 'Next' : 'Future'}</small>
                  <strong>{formatCompactNumber(node.target)}</strong>
                  <span>{metricLabel(metric)}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="empty-inline">
            <p>This checkpoint trail is unavailable while the count is hidden.</p>
          </div>
        )}
      </section>
    </div>
  );
}
