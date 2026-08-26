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
import {
  formatCompactNumber,
  formatFullNumber,
  metricLabel,
} from '../../domain/metrics/format';
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
  const movement = recentMovement(data.analyticsDaily.slice(-28));
  const definitions = definitionsFor(metric);
  const nextIndex = definitions.findIndex(
    ({ target }) => currentValue !== null && target > currentValue,
  );
  const start = Math.max(0, (nextIndex === -1 ? definitions.length : nextIndex) - 1);
  const journeyNodes = currentValue === null ? [] : definitions.slice(start, start + 3);

  return (
    <div className="page page--home page-enter">
      <div className="home-context">
        <span>Where you are</span>
        <strong>{metricLabel(metric)}</strong>
      </div>

      <MilestoneHero
        metric={metric}
        currentValue={currentValue}
        previousTarget={evaluation.currentMilestone?.target ?? 0}
        nextTarget={evaluation.nextMilestone?.target ?? null}
        segmentProgress={evaluation.progress}
        precision={precision}
      />

      <MetricSelector value={metric} onChange={setMetric} />

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
              Analytics isn't available yet. Channel milestones still work normally.
            </p>
          </div>
        ) : (
          <dl className="movement-values">
            <div>
              <dd>
                {movement.netSubscribers >= 0 ? '+' : ''}
                {formatFullNumber(movement.netSubscribers)}
              </dd>
              <dt>Subscribers</dt>
            </div>
            <div>
              <dd>{formatCompactNumber(movement.views)}</dd>
              <dt>Views</dt>
            </div>
            <div>
              <dd>{formatCompactNumber(movement.watchHours)}h</dd>
              <dt>Watch time</dt>
            </div>
          </dl>
        )}
      </section>

      <section className="journey-preview" aria-labelledby="journey-preview-title">
        <div className="section-heading-inline">
          <div>
            <p>Your path</p>
            <h2 id="journey-preview-title">Nearby checkpoints</h2>
          </div>
          <Link to="/journey">
            Open Journey <ArrowRight size={15} aria-hidden="true" />
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
                  <small>{achieved ? 'Past' : next ? 'Next' : 'Beyond'}</small>
                  <strong>{formatCompactNumber(node.target)}</strong>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="empty-inline">
            <p>This path is unavailable while the subscriber count is hidden.</p>
          </div>
        )}
      </section>
    </div>
  );
}
