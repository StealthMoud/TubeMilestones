import type { MetricType, SubscriberPrecision } from '../models';

const UNITS = [
  { threshold: 1_000_000_000, suffix: 'B' },
  { threshold: 1_000_000, suffix: 'M' },
  { threshold: 1_000, suffix: 'K' },
] as const;

function decimalsFor(value: number): number {
  if (value >= 100) return 0;
  if (value >= 10) return Number.isInteger(value) ? 0 : 1;
  if (Number.isInteger(value)) return 0;
  return value >= 1 ? 2 : 2;
}

function truncate(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.trunc(value * factor) / factor;
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Unavailable';

  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);
  const unit = UNITS.find((candidate) => magnitude >= candidate.threshold);

  if (!unit) {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: Number.isInteger(magnitude) ? 0 : 1,
    }).format(value);
  }

  const scaled = magnitude / unit.threshold;
  const decimals = decimalsFor(scaled);
  const safeValue = truncate(scaled, decimals);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(safeValue);

  return `${sign}${formatted}${unit.suffix}`;
}

export function formatFullNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(progress: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: progress < 0.1 ? 1 : 0,
  }).format(progress);
}

export function metricLabel(metric: MetricType, singular = false): string {
  const labels: Record<MetricType, string> = {
    subscribers: singular ? 'subscriber' : 'subscribers',
    views: singular ? 'view' : 'views',
    uploads: singular ? 'upload' : 'uploads',
    watchHours: 'Analytics watch hours',
  };
  return labels[metric];
}

export function formatRemaining(
  remaining: number,
  metric: MetricType,
  precision: SubscriberPrecision = 'EXACT',
): string {
  if (precision === 'HIDDEN') return 'Subscriber count hidden';
  if (metric === 'subscribers' && precision === 'ROUNDED_THREE_SIGNIFICANT_FIGURES') {
    return `About ${formatCompactNumber(remaining)} to go`;
  }
  return `${formatFullNumber(remaining)} ${metricLabel(metric, remaining === 1)} to go`;
}

export function subscriberPrecisionFor(
  hiddenSubscriberCount: boolean,
  subscriberCount: number | null,
): SubscriberPrecision {
  if (hiddenSubscriberCount || subscriberCount === null) return 'HIDDEN';
  return subscriberCount > 1_000 ? 'ROUNDED_THREE_SIGNIFICANT_FIGURES' : 'EXACT';
}
