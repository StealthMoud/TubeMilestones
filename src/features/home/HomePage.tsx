import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MetricSelector } from '../../components/common/MetricSelector';
import { MilestoneHero } from '../../components/milestone/MilestoneHero';
import { recentMovement } from '../../domain/analytics/calculations';
import { definitionsFor } from '../../domain/milestones/definitions';
import { evaluateMilestones } from '../../domain/milestones/engine';
import { channelMetricValue } from '../../domain/metrics/currentValue';
import { formatReportingDay } from '../../domain/metrics/dates';
import { formatCompactNumber, formatFullNumber } from '../../domain/metrics/format';
import type { MetricType } from '../../domain/models';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';

export default function HomePage() {
  const { data } = useTubeMilestones();
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
  const movementRows = data.analyticsDaily.slice(-28);
  const movement = recentMovement(movementRows);
  const chartRows = movementRows.slice(-14);
  const denseMovement = movementRows.length >= 8;
  const maxChartViews = Math.max(1, ...chartRows.map(({ views }) => views));
  const definitions = definitionsFor(metric);
  const achievedNodes =
    currentValue === null
      ? []
      : definitions.filter(({ target }) => target <= currentValue).slice(-2);
  const nextNode =
    currentValue === null
      ? undefined
      : definitions.find(({ target }) => target > currentValue);
  const journeyNodes = nextNode ? [...achievedNodes, nextNode] : achievedNodes;
  const watchHours = data.analyticsSummary
    ? data.analyticsSummary.estimatedMinutesWatched / 60
    : null;
  const kpis = [
    {
      label: 'Subscribers',
      value:
        data.channel.subscriberCount === null
          ? 'Hidden'
          : formatCompactNumber(data.channel.subscriberCount),
      full:
        data.channel.subscriberCount === null
          ? 'Subscriber count hidden'
          : formatFullNumber(data.channel.subscriberCount),
      context:
        data.channel.subscriberCountPrecision === 'ROUNDED_THREE_SIGNIFICANT_FIGURES'
          ? 'YouTube estimate'
          : 'Channel total',
    },
    {
      label: 'Views',
      value: formatCompactNumber(data.channel.viewCount),
      full: formatFullNumber(data.channel.viewCount),
      context: 'Channel total',
    },
    {
      label: 'Uploads',
      value: formatCompactNumber(data.channel.videoCount),
      full: formatFullNumber(data.channel.videoCount),
      context: 'Published videos',
    },
    {
      label: 'Watch time',
      value: watchHours === null ? '—' : `${formatCompactNumber(watchHours)}h`,
      full:
        watchHours === null
          ? 'Analytics unavailable'
          : `${formatFullNumber(watchHours)} hours`,
      context: watchHours === null ? 'Not available' : 'Available history',
    },
  ];

  return (
    <div className="page page--home page-enter">
      <header className="home-heading">
        <div>
          <p className="page-heading__context">Channel overview</p>
          <h1 dir="auto">{data.channel.title}</h1>
        </div>
      </header>

      <section className="home-overview" aria-label="Channel milestone overview">
        <div className="home-overview__toolbar">
          <span>Milestone metric</span>
          <MetricSelector value={metric} onChange={setMetric} />
        </div>
        <MilestoneHero
          metric={metric}
          currentValue={currentValue}
          previousTarget={evaluation.currentMilestone?.target ?? 0}
          nextTarget={evaluation.nextMilestone?.target ?? null}
          segmentProgress={evaluation.progress}
          precision={precision}
        />
        <dl className="home-kpis" aria-label="Channel totals">
          {kpis.map((kpi) => (
            <div key={kpi.label} title={kpi.full}>
              <dt>{kpi.label}</dt>
              <dd>{kpi.value}</dd>
              <span>{kpi.context}</span>
            </div>
          ))}
        </dl>
      </section>

      <div className="home-support-grid">
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
              <strong>Analytics is still arriving.</strong>
              <p>Channel milestones continue to work normally.</p>
            </div>
          ) : !denseMovement ? (
            <div className="movement-sparse">
              <dl className="movement-sparse__values">
                <div>
                  <dd>
                    {movement.netSubscribers >= 0 ? '+' : ''}
                    {formatFullNumber(movement.netSubscribers)}
                  </dd>
                  <dt>subscribers</dt>
                </div>
                <div>
                  <dd>
                    {movement.views > 0 ? '+' : ''}
                    {formatFullNumber(movement.views)}
                  </dd>
                  <dt>views</dt>
                </div>
                <div>
                  <dd>
                    {movement.watchHours > 0 ? '+' : ''}
                    {formatCompactNumber(movement.watchHours)}h
                  </dd>
                  <dt>watch time</dt>
                </div>
              </dl>
              <p>
                {movementRows.length} reported{' '}
                {movementRows.length === 1 ? 'day' : 'days'} since{' '}
                {formatReportingDay(movementRows[0]!.day)}
              </p>
            </div>
          ) : (
            <>
              <ol className="movement-chart" aria-hidden="true">
                {chartRows.map((row) => (
                  <li
                    key={row.day}
                    style={{
                      height: `${Math.max(10, (row.views / maxChartViews) * 100)}%`,
                    }}
                  />
                ))}
              </ol>
              <dl className="movement-values">
                <div>
                  <dt>Subscribers</dt>
                  <dd>
                    {movement.netSubscribers >= 0 ? '+' : ''}
                    {formatFullNumber(movement.netSubscribers)}
                  </dd>
                </div>
                <div>
                  <dt>Views</dt>
                  <dd>{formatCompactNumber(movement.views)}</dd>
                </div>
                <div>
                  <dt>Watch time</dt>
                  <dd>{formatCompactNumber(movement.watchHours)}h</dd>
                </div>
              </dl>
            </>
          )}
        </section>

        <section className="journey-preview" aria-labelledby="journey-preview-title">
          <div className="section-heading-inline">
            <div>
              <p>Past and next</p>
              <h2 id="journey-preview-title">Journey checkpoints</h2>
            </div>
            <Link to="/journey">
              View journey <ArrowRight size={15} aria-hidden="true" />
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
                    <span>
                      <small>{achieved ? 'Achieved' : next ? 'Next' : ''}</small>
                      <strong>{formatCompactNumber(node.target)}</strong>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="empty-inline">
              <strong>Subscriber path unavailable.</strong>
              <p>This channel has chosen to hide its subscriber count.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
