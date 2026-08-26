import { Check } from 'lucide-react';
import { useApp } from '../../app/AppProvider';
import { formatCompactNumber, metricLabel } from '../../domain/metrics/format';
import { Button } from '../common/Button';

export function MilestoneCelebration() {
  const { newMilestone, dismissCelebration } = useApp();
  if (!newMilestone) return null;

  return (
    <div className="celebration-backdrop" role="presentation">
      <section
        className="celebration"
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
      >
        <span className="celebration__rings" aria-hidden="true">
          <Check size={32} strokeWidth={2} />
        </span>
        <p className="eyebrow">Checkpoint observed</p>
        <h2 id="celebration-title">
          {formatCompactNumber(newMilestone.target)} {metricLabel(newMilestone.metric)}
        </h2>
        <p>
          TubeMilestones first observed this crossing today. The exact platform crossing
          time may be earlier.
        </p>
        <Button onClick={() => void dismissCelebration()}>Continue</Button>
      </section>
    </div>
  );
}
