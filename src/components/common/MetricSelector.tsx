import type { MetricType } from '../../domain/models';

const OPTIONS: Array<{ value: MetricType; label: string }> = [
  { value: 'subscribers', label: 'Subscribers' },
  { value: 'views', label: 'Views' },
  { value: 'uploads', label: 'Uploads' },
  { value: 'watchHours', label: 'Watch time' },
];

interface MetricSelectorProps {
  value: MetricType;
  onChange(metric: MetricType): void;
  label?: string;
}

export function MetricSelector({
  value,
  onChange,
  label = 'Choose milestone metric',
}: MetricSelectorProps) {
  return (
    <div className="segmented-scroll" role="group" aria-label={label}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segment-button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
