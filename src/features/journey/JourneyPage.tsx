import { useState, type FormEvent } from 'react';
import {
  Check,
  Circle,
  ExternalLink,
  Flag,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTubeMilestones } from '../../hooks/useTubeMilestones';
import { Button } from '../../components/common/Button';
import { MetricSelector } from '../../components/common/MetricSelector';
import { Modal } from '../../components/common/Modal';
import { YPP_DISCLAIMER, YPP_POLICY } from '../../config/yppPolicy';
import { definitionsFor } from '../../domain/milestones/definitions';
import type {
  CustomGoal,
  MetricType,
  MilestoneState,
  SubscriberPrecision,
} from '../../domain/models';
import {
  formatCompactNumber,
  formatFullNumber,
  metricLabel,
} from '../../domain/metrics/format';
import { formatReportingDay } from '../../domain/metrics/dates';
import { channelMetricValue } from '../../domain/metrics/currentValue';

function formatObservedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function historyLabel(state: MilestoneState | undefined): string {
  if (!state) return 'Achieved';
  if (state.detectionType === 'TRACKED_CROSSING' && state.detectedAt) {
    return `First observed ${formatObservedAt(state.detectedAt)}`;
  }
  if (state.detectionType === 'USER_CREATED_ALREADY_COMPLETE') {
    return 'Already complete when created';
  }
  return 'Achieved before tracking';
}

function goalTitle(goal: CustomGoal): string {
  return (
    goal.title?.trim() ||
    `Reach ${formatCompactNumber(goal.target)} ${metricLabel(goal.metric)}`
  );
}

interface GuidanceMeterProps {
  label: string;
  value: number | null;
  target: number;
  source: string;
  approximate?: boolean;
}

function GuidanceMeter({
  label,
  value,
  target,
  source,
  approximate = false,
}: GuidanceMeterProps) {
  const progress = value === null ? 0 : Math.min(1, value / target);
  const readableValue =
    value === null
      ? 'Unavailable'
      : `${approximate ? 'About ' : ''}${formatFullNumber(value)} of ${formatFullNumber(target)}`;

  return (
    <div className="guidance-meter">
      <div className="guidance-meter__copy">
        <div>
          <strong>{label}</strong>
          <span>{source}</span>
        </div>
        <span>{readableValue}</span>
      </div>
      <div
        className="guidance-meter__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={value ?? undefined}
        aria-valuetext={readableValue}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

export default function JourneyPage() {
  const { data, addGoal, removeGoal } = useTubeMilestones();
  const [metric, setMetric] = useState<MetricType>('subscribers');
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalMetric, setGoalMetric] = useState<MetricType>('subscribers');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!data) return null;

  const value = channelMetricValue(data.channel, data.analyticsSummary, metric);
  const subscriberPrecision: SubscriberPrecision =
    metric === 'subscribers' ? data.channel.subscriberCountPrecision : 'EXACT';
  const standardDefinitions = definitionsFor(metric);
  const nextTarget = standardDefinitions.find(
    ({ target: candidate }) => value !== null && candidate > value,
  )?.target;
  const stateByTarget = new Map(
    data.milestoneStates
      .filter((state) => state.metric === metric)
      .map((state) => [state.target, state]),
  );
  const metricUnavailable = value === null;

  const resetGoalForm = () => {
    setTitle('');
    setTarget('');
    setTargetDate('');
    setGoalMetric(metric);
    setFormError(null);
  };

  const openGoalDialog = () => {
    resetGoalForm();
    setGoalDialogOpen(true);
  };

  const submitGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedTarget = Number(target);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setFormError('Enter a target greater than zero.');
      return;
    }
    if (
      parsedTarget > Number.MAX_SAFE_INTEGER ||
      (goalMetric !== 'watchHours' && !Number.isSafeInteger(parsedTarget))
    ) {
      setFormError(
        goalMetric === 'watchHours'
          ? 'Enter a smaller target.'
          : 'This metric needs a whole-number target.',
      );
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await addGoal({
        metric: goalMetric,
        target: parsedTarget,
        title: title.trim() || null,
        targetDate: targetDate || null,
      });
      setGoalDialogOpen(false);
      resetGoalForm();
    } finally {
      setSaving(false);
    }
  };

  const manualHours = data.manualMetrics?.qualifiedPublicWatchHours ?? null;
  const manualShorts = data.manualMetrics?.qualifiedShortsViews ?? null;

  return (
    <div className="page page--journey page-enter">
      <header className="page-heading journey-heading">
        <div>
          <p className="page-heading__context">Progress trail</p>
          <h1>Your milestone journey.</h1>
        </div>
        <Button
          variant="secondary"
          icon={<Plus size={18} aria-hidden="true" />}
          onClick={openGoalDialog}
        >
          Create checkpoint
        </Button>
      </header>

      <MetricSelector value={metric} onChange={setMetric} />

      <section className="journey-trail-panel" aria-labelledby="standard-trail-title">
        <div className="section-heading-inline journey-trail-panel__heading">
          <div>
            <p>{metricLabel(metric)}</p>
            <h2 id="standard-trail-title">Standard checkpoints</h2>
          </div>
          {value !== null ? (
            <span>
              {subscriberPrecision === 'ROUNDED_THREE_SIGNIFICANT_FIGURES'
                ? 'About '
                : ''}
              {formatCompactNumber(value)} now
            </span>
          ) : null}
        </div>

        {metricUnavailable ? (
          <div className="journey-empty">
            <Circle size={30} strokeWidth={1.5} aria-hidden="true" />
            <h3>
              {metric === 'subscribers'
                ? 'Subscriber count is hidden.'
                : 'This metric is not available yet.'}
            </h3>
            <p>
              {metric === 'subscribers'
                ? 'YouTube does not expose a count for this channel, so subscriber progress cannot be calculated.'
                : "Analytics isn't available yet. Your other channel milestones still work normally."}
            </p>
          </div>
        ) : (
          <ol className="journey-trail">
            {standardDefinitions.map((definition, index) => {
              const achieved = definition.target <= value;
              const next = definition.target === nextTarget;
              const state = stateByTarget.get(definition.target);
              const stateName = achieved ? 'achieved' : next ? 'next' : 'future';
              return (
                <li
                  key={definition.target}
                  className={`journey-node journey-node--${stateName}`}
                >
                  <span className="journey-node__rail" aria-hidden="true">
                    <i>
                      {achieved ? (
                        <Check size={16} strokeWidth={2.4} />
                      ) : next ? (
                        <Flag size={15} strokeWidth={2} />
                      ) : null}
                    </i>
                    {index < standardDefinitions.length - 1 ? <b /> : null}
                  </span>
                  <div className="journey-node__body">
                    <div>
                      <strong>{formatCompactNumber(definition.target)}</strong>
                      <span>{metricLabel(metric)}</span>
                    </div>
                    <p>
                      {achieved
                        ? historyLabel(state)
                        : next
                          ? 'Next checkpoint'
                          : 'Future checkpoint'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {subscriberPrecision === 'ROUNDED_THREE_SIGNIFICANT_FIGURES' ? (
          <p className="journey-precision-note">
            YouTube reports this subscriber count with three significant figures.
            Position and remaining distance are approximate.
          </p>
        ) : null}
      </section>

      <section className="custom-goals" aria-labelledby="custom-goals-title">
        <div className="section-heading-inline">
          <div>
            <p>Your targets</p>
            <h2 id="custom-goals-title">Custom checkpoints</h2>
          </div>
          <Button variant="quiet" icon={<Plus size={17} />} onClick={openGoalDialog}>
            Add
          </Button>
        </div>
        {data.customGoals.length === 0 ? (
          <button className="custom-goals-empty" type="button" onClick={openGoalDialog}>
            <Sparkles size={24} strokeWidth={1.6} aria-hidden="true" />
            <strong>Create your own checkpoint.</strong>
            <span>Choose a metric, target and optional date.</span>
          </button>
        ) : (
          <div className="custom-goal-grid">
            {data.customGoals.map((goal) => {
              const current = channelMetricValue(
                data.channel,
                data.analyticsSummary,
                goal.metric,
              );
              const complete = current !== null && current >= goal.target;
              const state = data.milestoneStates.find(
                ({ customGoalId }) => customGoalId === goal.id,
              );
              return (
                <article key={goal.id} className="custom-goal-card">
                  <div className="custom-goal-card__topline">
                    <span>{complete ? 'Complete' : 'Custom checkpoint'}</span>
                    <button
                      type="button"
                      aria-label={`Delete ${goalTitle(goal)}`}
                      onClick={() => void removeGoal(goal.id)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                  <h3>{goalTitle(goal)}</h3>
                  <p>
                    {complete
                      ? historyLabel(state)
                      : current === null
                        ? 'Current value unavailable'
                        : `${formatCompactNumber(Math.max(0, goal.target - current))} remaining`}
                  </p>
                  {goal.targetDate ? (
                    <small>
                      Target date{' '}
                      {formatReportingDay(goal.targetDate, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </small>
                  ) : (
                    <small>No target date</small>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="ypp-guide" aria-labelledby="ypp-guide-title">
        <div className="ypp-guide__heading">
          <div>
            <p className="page-heading__context">Manual guidance</p>
            <h2 id="ypp-guide-title">YouTube Partner Program progress</h2>
          </div>
          <a href={YPP_POLICY.sourceUrl} target="_blank" rel="noopener noreferrer">
            Current policy <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
        <p className="ypp-guide__intro">
          Full ad-revenue reference: meet the subscriber target and either the public
          watch-hours or Shorts views target. Thresholds and regional availability can
          change.
        </p>
        <div className="ypp-guide__meters">
          <GuidanceMeter
            label="Subscribers"
            value={data.channel.subscriberCount}
            target={YPP_POLICY.full.subscriberTarget}
            source="YouTube Data API"
            approximate={
              data.channel.subscriberCountPrecision ===
              'ROUNDED_THREE_SIGNIFICANT_FIGURES'
            }
          />
          <GuidanceMeter
            label="Qualified public watch hours"
            value={manualHours}
            target={YPP_POLICY.full.qualifiedPublicWatchHoursTarget}
            source="Manual value"
          />
          <GuidanceMeter
            label="Qualified public Shorts views"
            value={manualShorts}
            target={YPP_POLICY.full.qualifiedShortsViewsTarget}
            source="Manual value"
          />
        </div>
        <p className="ypp-guide__note">
          Enter the values shown in YouTube Studio. TubeMilestones cannot retrieve these
          exact figures through the APIs it uses. {YPP_DISCLAIMER}
        </p>
        <small>
          Policy reference {YPP_POLICY.version}. Earlier-access reference:{' '}
          {formatCompactNumber(YPP_POLICY.expanded.subscriberTarget)} subscribers plus{' '}
          {formatCompactNumber(YPP_POLICY.expanded.qualifiedPublicWatchHoursTarget)}{' '}
          public watch hours or{' '}
          {formatCompactNumber(YPP_POLICY.expanded.qualifiedShortsViewsTarget)} Shorts
          views.
        </small>
      </section>

      <Modal
        open={goalDialogOpen}
        title="Create a checkpoint"
        description="Set your own target. TubeMilestones records your date but does not predict when you will finish."
        onClose={() => setGoalDialogOpen(false)}
      >
        <form className="form-stack" onSubmit={(event) => void submitGoal(event)}>
          <label className="form-field">
            <span>Metric</span>
            <select
              value={goalMetric}
              onChange={(event) => setGoalMetric(event.target.value as MetricType)}
            >
              <option value="subscribers">Subscribers</option>
              <option value="views">Channel views</option>
              <option value="uploads">Uploads</option>
              <option value="watchHours">Analytics watch hours</option>
            </select>
          </label>
          <label className="form-field">
            <span>Target</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="any"
              required
              value={target}
              placeholder="2500"
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Title (optional)</span>
            <input
              type="text"
              maxLength={80}
              value={title}
              placeholder="Reach the next chapter"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Target date (optional)</span>
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </label>
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="modal-actions">
            <Button variant="quiet" onClick={() => setGoalDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create checkpoint'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
