import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { db } from '../db/db';
import { createDemoDashboard } from '../fixtures/demoData';
import { App } from './App';

async function seedStoredFixture(verifiedAt: string) {
  const fixture = createDemoDashboard('small');
  await db.channels.put(fixture.channel);
  await db.channelSnapshots.bulkAdd(fixture.snapshots);
  await db.analyticsDaily.bulkPut(fixture.analyticsDaily);
  if (fixture.analyticsSummary) {
    await db.analyticsSummary.put(fixture.analyticsSummary);
  }
  await db.milestoneStates.bulkPut(fixture.milestoneStates);
  await db.customGoals.bulkPut(fixture.customGoals);
  if (fixture.manualMetrics) await db.manualMetrics.put(fixture.manualMetrics);
  await db.metadata.put({
    ...fixture.metadata,
    authorizationVerifiedAt: verifiedAt,
  });
}

describe('saved authorization states', () => {
  beforeEach(async () => {
    window.location.hash = '#/';
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('shows valid cached progress when no in-memory token exists', async () => {
    await seedStoredFixture(new Date().toISOString());
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Here is where you stand.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Saved progress is ready. Reconnect to refresh from YouTube.'),
    ).toBeInTheDocument();
  });

  it('requires reauthorization after the 30-day boundary', async () => {
    const stale = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000).toISOString();
    await seedStoredFixture(stale);
    render(<App />);

    expect(
      await screen.findByText(
        'Reconnect YouTube to access your saved channel history.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Northstar Frames')).not.toBeInTheDocument();
  });
});
