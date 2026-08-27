import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { summarizeAnalyticsRange } from '../../domain/analytics/calculations';
import { formatReportingDay } from '../../domain/metrics/dates';
import { formatCompactNumber, formatFullNumber } from '../../domain/metrics/format';
import type { AnalyticsMetric } from '../../domain/models';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';
import { userMessageForError } from '../../services/errors';
import { type AnalyticsRange, useAnalyticsHistory } from './useAnalyticsHistory';

const RANGES: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '7D', label: '7D' },
  { value: '28D', label: '28D' },
  { value: '90D', label: '90D' },
  { value: '365D', label: '365D' },
  { value: 'ALL', label: 'Available' },
];

const METRICS: Array<{ value: AnalyticsMetric; label: string }> = [
  { value: 'views', label: 'Views' },
  { value: 'subscribers', label: 'Net subscribers' },
  { value: 'watchHours', label: 'Watch time' },
];

function metricValue(value: number, metric: AnalyticsMetric, compact = false): string {
  if (metric === 'watchHours') {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)}h`;
  }
  return compact ? formatCompactNumber(value) : formatFullNumber(value);
}

function metricNoun(metric: AnalyticsMetric): string {
  return metric === 'views'
    ? 'views'
    : metric === 'subscribers'
      ? 'net subscribers'
      : 'Analytics watch hours';
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const metric = (payload[0]?.name ?? 'views') as AnalyticsMetric;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="analytics-tooltip">
      <span>{formatReportingDay(String(label))}</span>
      <strong>
        {metricValue(value, metric)} {metricNoun(metric)}
      </strong>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isDemo } = useTubeMilestones();
  const [range, setRange] = useState<AnalyticsRange>('28D');
  const [metric, setMetric] = useState<AnalyticsMetric>('views');
  const history = useAnalyticsHistory(data, range, isDemo);
  const rangeDays =
    range === 'ALL' ? Math.max(1, history.rows.length) : Number.parseInt(range, 10);
  const summary = useMemo(
    () => summarizeAnalyticsRange(history.rows, rangeDays, metric),
    [history.rows, metric, rangeDays],
  );
  const overview = useMemo(
    () => ({
      subscribers: history.rows.reduce(
        (total, row) => total + row.subscribersGained - row.subscribersLost,
        0,
      ),
      watchHours:
        history.rows.reduce((total, row) => total + row.estimatedMinutesWatched, 0) /
        60,
      bestDay:
        [...history.rows].sort((left, right) => right.views - left.views)[0] ?? null,
    }),
    [history.rows],
  );

  if (!data) return null;
  const chartData = summary.current.map((row) => ({
    day: row.day,
    value:
      metric === 'views'
        ? row.views
        : metric === 'subscribers'
          ? row.subscribersGained - row.subscribersLost
          : row.estimatedMinutesWatched / 60,
  }));
  const availableThrough =
    data.analyticsSummary?.availableThrough ?? history.rows.at(-1)?.day ?? null;
  const rangeLabel = RANGES.find(({ value }) => value === range)?.label ?? range;
  const comparison =
    range === 'ALL'
      ? 'All available history'
      : summary.difference === null
        ? 'Comparison needs an earlier complete period'
        : summary.difference === 0
          ? 'No change vs previous period'
          : `${summary.difference > 0 ? '+' : '−'}${metricValue(Math.abs(summary.difference), metric, true)} vs previous period`;

  return (
    <div className="page page--analytics page-enter">
      <header className="analytics-heading">
        <div>
          <p className="page-heading__context">Analytics</p>
          <h1>{METRICS.find(({ value }) => value === metric)?.label}</h1>
        </div>
        <div
          className="segmented-scroll analytics-range"
          role="group"
          aria-label="Analytics range"
        >
          {RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segment-button"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div
        className="segmented-scroll analytics-metrics"
        role="group"
        aria-label="Analytics metric"
      >
        {METRICS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="segment-button"
            aria-pressed={metric === option.value}
            onClick={() => setMetric(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {history.partial ? (
        <div className="context-banner context-banner--warning" role="status">
          Older history is temporarily unavailable. Recent data is still shown.
        </div>
      ) : null}
      {history.error ? (
        <div className="context-banner context-banner--warning" role="status">
          {userMessageForError(history.error)} Recent data is still shown.
        </div>
      ) : null}

      {history.rows.length === 0 ? (
        <section className="analytics-empty" aria-labelledby="analytics-empty-title">
          <p className="eyebrow">No reportable days</p>
          <h2 id="analytics-empty-title">Analytics isn't available yet.</h2>
          <p>Channel milestones still work. YouTube Analytics can arrive later.</p>
        </section>
      ) : (
        <>
          <section className="analytics-focus" aria-labelledby="analytics-value-title">
            <div className="analytics-summary-row">
              <div className="analytics-value">
                <span id="analytics-value-title">
                  {range === 'ALL' ? 'Available history' : `${rangeLabel} total`}
                </span>
                <strong>{metricValue(summary.total, metric, true)}</strong>
                <p>{comparison}</p>
              </div>
              <dl className="analytics-details" aria-label="Analytics summary">
                <div>
                  <dt>Net subscribers</dt>
                  <dd>
                    {overview.subscribers >= 0 ? '+' : ''}
                    {formatFullNumber(overview.subscribers)}
                  </dd>
                </div>
                <div>
                  <dt>Watch time</dt>
                  <dd>{formatCompactNumber(overview.watchHours)}h</dd>
                </div>
                <div>
                  <dt>Best day</dt>
                  <dd>
                    {overview.bestDay
                      ? formatReportingDay(overview.bestDay.day)
                      : 'Unavailable'}
                  </dd>
                </div>
                <div>
                  <dt>Analytics through</dt>
                  <dd>
                    {availableThrough
                      ? formatReportingDay(availableThrough)
                      : 'Unavailable'}
                  </dd>
                </div>
              </dl>
            </div>
            <div
              className={`analytics-chart${history.isLoading ? ' is-loading' : ''}`}
              aria-hidden="true"
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={250}
                initialDimension={{ width: 800, height: 300 }}
              >
                <AreaChart
                  data={chartData}
                  margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--color-border)"
                    strokeDasharray="2 6"
                  />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={34}
                    tick={{ fill: 'var(--tm-text-muted)', fontSize: 11 }}
                    tickFormatter={(day: string) =>
                      formatReportingDay(day, { month: 'short', day: 'numeric' })
                    }
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    tick={{ fill: 'var(--tm-text-muted)', fontSize: 10 }}
                    tickFormatter={(value: number) => metricValue(value, metric, true)}
                  />
                  <Tooltip
                    content={ChartTooltip}
                    cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={metric}
                    stroke="var(--tm-primary-strong)"
                    strokeWidth={2}
                    fill="var(--color-accent)"
                    fillOpacity={0.08}
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--tm-milestone)', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <p className="analytics-accessible-summary">
            {rangeLabel} total: {metricValue(summary.total, metric)}{' '}
            {metricNoun(metric)}.
            {overview.bestDay
              ? ` Best day by views was ${formatReportingDay(overview.bestDay.day)}.`
              : ''}
          </p>
        </>
      )}
    </div>
  );
}
