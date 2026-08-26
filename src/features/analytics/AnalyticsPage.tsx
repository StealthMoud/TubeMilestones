import { useId, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Clock3,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
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
import { useApp } from '../../app/AppProvider';
import {
  summarizeAnalyticsRange,
  type RangeSummary,
} from '../../domain/analytics/calculations';
import type { AnalyticsMetric } from '../../domain/models';
import { formatCompactNumber, formatFullNumber } from '../../domain/metrics/format';
import { formatReportingDay } from '../../domain/metrics/dates';

const RANGES = [7, 28, 90, 365] as const;
type AnalyticsRange = (typeof RANGES)[number];

const METRICS: Array<{ value: AnalyticsMetric; label: string }> = [
  { value: 'views', label: 'Views' },
  { value: 'subscribers', label: 'Subscribers' },
  { value: 'watchHours', label: 'Watch time' },
];

function metricNoun(metric: AnalyticsMetric, value: number): string {
  switch (metric) {
    case 'views':
      return Math.abs(value) === 1 ? 'view' : 'views';
    case 'subscribers':
      return `net ${Math.abs(value) === 1 ? 'subscriber' : 'subscribers'}`;
    case 'watchHours':
      return 'Analytics watch hours';
  }
}

function formatMetricValue(value: number, metric: AnalyticsMetric): string {
  if (metric === 'watchHours') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
  }
  return formatFullNumber(value);
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const metric = (payload[0]?.name ?? 'views') as AnalyticsMetric;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="analytics-tooltip">
      <span>{formatReportingDay(String(label))}</span>
      <strong>
        {formatMetricValue(value, metric)} {metricNoun(metric, value)}
      </strong>
    </div>
  );
}

function comparisonCopy(summary: RangeSummary, days: number, metric: AnalyticsMetric) {
  if (summary.difference === null) {
    return 'Previous-period comparison needs a complete earlier range.';
  }
  if (summary.difference === 0) {
    return `No change from the previous ${days} days.`;
  }
  return `${formatMetricValue(Math.abs(summary.difference), metric)} ${
    summary.difference > 0 ? 'more' : 'fewer'
  } than the previous ${days} days.`;
}

export default function AnalyticsPage() {
  const { data } = useApp();
  const [range, setRange] = useState<AnalyticsRange>(28);
  const [metric, setMetric] = useState<AnalyticsMetric>('views');
  const gradientId = useId().replaceAll(':', '');
  const summary = useMemo(
    () => summarizeAnalyticsRange(data?.analyticsDaily ?? [], range, metric),
    [data?.analyticsDaily, metric, range],
  );

  if (!data) return null;

  const analyticsRows = data.analyticsDaily;
  const hasAnalytics = analyticsRows.length > 0 && data.analyticsSummary !== null;
  const chartData = summary.current.map((row) => ({
    day: row.day,
    value:
      metric === 'views'
        ? row.views
        : metric === 'subscribers'
          ? row.subscribersGained - row.subscribersLost
          : row.estimatedMinutesWatched / 60,
  }));
  const peak = summary.peak;
  const accessibleSummary = peak
    ? `Last ${range} days: ${formatMetricValue(summary.total, metric)} ${metricNoun(metric, summary.total)}. Highest daily ${metricNoun(metric, peak.value)}: ${formatMetricValue(peak.value, metric)} on ${formatReportingDay(peak.day)}.`
    : null;
  const availableThrough =
    data.analyticsSummary?.availableThrough ?? analyticsRows.at(-1)?.day ?? null;

  return (
    <div className="page page--analytics page-enter">
      <header className="page-heading analytics-heading">
        <div>
          <p className="page-heading__context">YouTube Analytics</p>
          <h1>Recent channel movement.</h1>
        </div>
        {availableThrough ? (
          <div className="analytics-freshness-chip">
            <CalendarDays size={16} aria-hidden="true" />
            Through {formatReportingDay(availableThrough)}
          </div>
        ) : null}
      </header>

      <div className="analytics-controls">
        <div className="segmented-scroll" role="group" aria-label="Analytics range">
          {RANGES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className="segment-button"
              aria-pressed={range === candidate}
              onClick={() => setRange(candidate)}
            >
              {candidate}D
            </button>
          ))}
        </div>
        <div className="segmented-scroll" role="group" aria-label="Analytics metric">
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
      </div>

      {!hasAnalytics ? (
        <section className="analytics-empty" aria-labelledby="analytics-empty-title">
          <BarChart3 size={34} strokeWidth={1.5} aria-hidden="true" />
          <h2 id="analytics-empty-title">Analytics isn't available yet.</h2>
          <p>
            Your channel milestones still work normally. Analytics may be delayed, or
            this Google account may not have access to the selected channel's reports.
          </p>
        </section>
      ) : (
        <>
          <section className="analytics-chart-panel" aria-labelledby="chart-title">
            <div className="analytics-chart-panel__heading">
              <div>
                <p>Last {range} days</p>
                <h2 id="chart-title">
                  {METRICS.find(({ value }) => value === metric)?.label}
                </h2>
              </div>
              <strong>{formatCompactNumber(summary.total)}</strong>
            </div>

            <div className="analytics-chart" aria-hidden="true">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={260}
                initialDimension={{ width: 800, height: 320 }}
              >
                <AreaChart
                  data={chartData}
                  margin={{ top: 18, right: 8, bottom: 0, left: -14 }}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--tm-primary)"
                        stopOpacity={0.34}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--tm-primary)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--tm-border)"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                    tick={{ fill: 'var(--tm-text-muted)', fontSize: 11 }}
                    tickFormatter={(day: string) =>
                      formatReportingDay(day, { month: 'short', day: 'numeric' })
                    }
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={54}
                    tick={{ fill: 'var(--tm-text-muted)', fontSize: 11 }}
                    tickFormatter={(value: number) => formatCompactNumber(value)}
                  />
                  <Tooltip
                    content={ChartTooltip}
                    cursor={{ stroke: 'var(--tm-primary)', strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={metric}
                    stroke="var(--tm-primary-strong)"
                    strokeWidth={2.4}
                    fill={`url(#${gradientId})`}
                    dot={
                      chartData.length === 1
                        ? { r: 4, fill: 'var(--tm-primary-strong)' }
                        : false
                    }
                    activeDot={{ r: 5, fill: 'var(--tm-milestone)', strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section
            className="analytics-summary"
            aria-labelledby="analytics-summary-title"
          >
            <div className="analytics-summary__primary">
              <p>Period total</p>
              <strong>{formatMetricValue(summary.total, metric)}</strong>
              <span>{metricNoun(metric, summary.total)}</span>
            </div>
            <div className="analytics-summary__comparison">
              {summary.difference !== null && summary.difference < 0 ? (
                <TrendingDown size={21} aria-hidden="true" />
              ) : (
                <TrendingUp size={21} aria-hidden="true" />
              )}
              <div>
                <strong>Previous period</strong>
                <span>{comparisonCopy(summary, range, metric)}</span>
              </div>
            </div>
            <div className="analytics-summary__freshness">
              <Clock3 size={20} aria-hidden="true" />
              <div>
                <strong>Data freshness</strong>
                <span>
                  {availableThrough
                    ? `YouTube Analytics available through ${formatReportingDay(availableThrough, { month: 'long', day: 'numeric', year: 'numeric' })}.`
                    : 'No available-through date reported.'}
                </span>
              </div>
            </div>
            {accessibleSummary ? (
              <p id="analytics-summary-title" className="analytics-accessible-summary">
                {accessibleSummary}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
