import { useState, type FormEvent } from 'react';
import {
  Check,
  Circle,
  Download,
  ExternalLink,
  Flag,
  Plus,
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
  formatPercent,
  formatRemaining,
  metricLabel,
} from '../../domain/metrics/format';
import { formatReportingDay } from '../../domain/metrics/dates';
import { channelMetricValue } from '../../domain/metrics/currentValue';
import { exportMilestoneImage } from './exportMilestoneImage';

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
  const [exportError, setExportError] = useState<string | null>(null);

  if (!data) return null;

  const value = channelMetricValue(data.channel, data.analyticsSummary, metric);
  const subscriberPrecision: SubscriberPrecision =
    metric === 'subscribers' ? data.channel.subscriberCountPrecision : 'EXACT';
  const standardDefinitions = definitionsFor(metric);
  const nextDefinition = standardDefinitions.find(
    ({ target: candidate }) => value !== null && candidate > value,
  );
  const nextTarget = nextDefinition?.target;
  const achievedDefinitions =
    value === null
      ? []
      : standardDefinitions
          .filter(({ target: candidate }) => candidate <= value)
          .reverse();
  const achievedCurrentValue = value ?? 0;
  const nextIndex = standardDefinitions.findIndex(
    ({ target: candidate }) => value !== null && candidate > value,
  );
  const previousTarget =
    nextIndex > 0 ? (standardDefinitions[nextIndex - 1]?.target ?? 0) : 0;
  const segmentProgress =
    value !== null && nextTarget !== undefined
      ? Math.min(
          1,
          Math.max(0, (value - previousTarget) / (nextTarget - previousTarget)),
        )
      : null;
  const stateByTarget = new Map(
    data.milestoneStates
      .filter((state) => state.metric === metric)
      .map((state) => [state.target, state]),
  );

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

      <div className="journey-layout">
        <div className="journey-primary">
          <section className="journey-upcoming" aria-labelledby="upcoming-title">
            <div className="section-heading-inline journey-section-heading">
              <div>
                <p>{metricLabel(metric)}</p>
                <h2 id="upcoming-title">Next milestone</h2>
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

            {value === null ? (
              <div className="journey-empty">
                <Circle size={24} strokeWidth={1.5} aria-hidden="true" />
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
            ) : nextDefinition && segmentProgress !== null ? (
              <article
                className="journey-next"
                role="progressbar"
                aria-label={`Progress to ${formatFullNumber(nextDefinition.target)} ${metricLabel(metric)}`}
                aria-valuemin={previousTarget}
                aria-valuemax={nextDefinition.target}
                aria-valuenow={value}
              >
                <div className="journey-next__target">
                  <span className="journey-next__icon" aria-hidden="true">
                    <Flag size={17} strokeWidth={2} />
                  </span>
                  <span>
                    <small>Next checkpoint</small>
                    <strong>{formatCompactNumber(nextDefinition.target)}</strong>
                    <b>{metricLabel(metric)}</b>
                  </span>
                </div>
                <div className="journey-next__current">
                  <span>Current</span>
                  <strong>{formatCompactNumber(value)}</strong>
                  <small>/ {formatCompactNumber(nextDefinition.target)}</small>
                </div>
                <div className="journey-next__track" aria-hidden="true">
                  <span style={{ width: `${segmentProgress * 100}%` }} />
                </div>
                <div className="journey-next__footer">
                  <strong>
                    {formatRemaining(
                      Math.max(0, nextDefinition.target - value),
                      metric,
                      subscriberPrecision,
                    )}
                  </strong>
                  <span>{formatPercent(segmentProgress)} through this segment</span>
                </div>
              </article>
            ) : (
              <div className="journey-complete">
                <Check size={20} aria-hidden="true" />
                <span>
                  <strong>Highest configured milestone achieved.</strong>
                  <small>Your completed milestones are listed below.</small>
                </span>
              </div>
            )}

            {subscriberPrecision === 'ROUNDED_THREE_SIGNIFICANT_FIGURES' ? (
              <p className="journey-precision-note">
                YouTube reports this subscriber count with three significant figures.
                Remaining distance is approximate.
              </p>
            ) : null}
          </section>

          <section className="journey-achieved" aria-labelledby="achieved-title">
            <div className="section-heading-inline journey-section-heading">
              <div>
                <p>History</p>
                <h2 id="achieved-title">Milestones achieved</h2>
              </div>
              <span>
                {achievedDefinitions.length}{' '}
                {achievedDefinitions.length === 1 ? 'milestone' : 'milestones'}
              </span>
            </div>
            {achievedDefinitions.length === 0 ? (
              <div className="journey-empty journey-empty--compact">
                <Circle size={22} strokeWidth={1.5} aria-hidden="true" />
                <h3>Your first milestone will appear here.</h3>
                <p>Only achieved milestones are kept in this history.</p>
              </div>
            ) : (
              <ol className="journey-achieved-list">
                {achievedDefinitions.map((definition) => {
                  const state = stateByTarget.get(definition.target);
                  const observed = historyLabel(state);
                  return (
                    <li key={definition.target}>
                      <span className="journey-achieved__mark" aria-hidden="true">
                        <Check size={16} strokeWidth={2.4} />
                      </span>
                      <div className="journey-achieved__copy">
                        <h3>
                          {formatCompactNumber(definition.target)}{' '}
                          <span>{metricLabel(metric)}</span>
                        </h3>
                        <p>{observed}</p>
                        <small>
                          Currently {formatFullNumber(achievedCurrentValue)}{' '}
                          {metricLabel(metric)}
                        </small>
                      </div>
                      <button
                        className="milestone-export"
                        type="button"
                        title="Export milestone as a PNG image"
                        aria-label={`Export ${formatFullNumber(definition.target)} ${metricLabel(metric)} milestone as an image`}
                        onClick={() => {
                          setExportError(null);
                          void exportMilestoneImage({
                            channelTitle: data.channel.title,
                            metricLabel: metricLabel(metric),
                            target: formatFullNumber(definition.target),
                            observedLabel: observed,
                            currentValue: `${formatFullNumber(achievedCurrentValue)} ${metricLabel(metric)}`,
                          }).catch(() =>
                            setExportError(
                              'The milestone image could not be exported. Please try again.',
                            ),
                          );
                        }}
                      >
                        <Download size={16} aria-hidden="true" />
                        <span>Export image</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {exportError ? (
              <p className="form-error" role="alert">
                {exportError}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="journey-secondary" aria-label="Journey supporting tools">
          <section className="custom-goals" aria-labelledby="custom-goals-title">
            <div className="section-heading-inline">
              <div>
                <p>Your targets</p>
                <h2 id="custom-goals-title">Custom checkpoints</h2>
              </div>
              <Button
                variant="quiet"
                icon={<Plus size={17} />}
                onClick={openGoalDialog}
              >
                Add
              </Button>
            </div>
            {data.customGoals.length === 0 ? (
              <div className="custom-goals-empty">
                <span>
                  <strong>No custom checkpoints</strong>
                  <small>Create one for a personal target.</small>
                </span>
              </div>
            ) : (
              <ul className="custom-goal-list">
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
                    <li key={goal.id} className="custom-goal-row">
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
                    </li>
                  );
                })}
              </ul>
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
              Full ad-revenue reference: meet the subscriber target and either the
              public watch-hours or Shorts views target. Thresholds and regional
              availability can change.
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
              Enter the values shown in YouTube Studio. TubeMilestones cannot retrieve
              these exact figures through the APIs it uses. {YPP_DISCLAIMER}
            </p>
            <small>
              Policy reference {YPP_POLICY.version}. Earlier-access reference:{' '}
              {formatCompactNumber(YPP_POLICY.expanded.subscriberTarget)} subscribers
              plus{' '}
              {formatCompactNumber(YPP_POLICY.expanded.qualifiedPublicWatchHoursTarget)}{' '}
              public watch hours or{' '}
              {formatCompactNumber(YPP_POLICY.expanded.qualifiedShortsViewsTarget)}{' '}
              Shorts views.
            </small>
          </section>
        </aside>
      </div>

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
