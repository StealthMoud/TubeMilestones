// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluateBackendMilestones } from './milestones';

describe('backend milestone persistence rows', () => {
  it('omits generated ids from new rows so Postgres can apply its default', () => {
    const evaluation = evaluateBackendMilestones({
      userId: '00000000-0000-4000-8000-000000000001',
      channelId: '00000000-0000-4000-8000-000000000002',
      previous: null,
      current: {
        subscriberCount: '25',
        viewCount: '1288',
        videoCount: '4',
      },
      previousWatchMinutes: null,
      currentWatchMinutes: '430',
      observedAt: '2026-08-27T20:32:18.000Z',
      existing: [],
      customGoals: [],
    });

    expect(evaluation.rows).toMatchObject([
      { metric: 'views', target: '1000', status: 'ACHIEVED' },
      { metric: 'uploads', target: '1', status: 'ACHIEVED' },
    ]);
    expect(evaluation.rows.every((row) => !Object.hasOwn(row, 'id'))).toBe(true);
  });

  it('recognizes numeric milestone targets returned by PostgREST', () => {
    const existingUpload = {
      id: '00000000-0000-4000-8000-000000000003',
      user_id: '00000000-0000-4000-8000-000000000001',
      channel_id: '00000000-0000-4000-8000-000000000002',
      metric: 'uploads' as const,
      target: 1 as unknown as string,
      status: 'ACHIEVED' as const,
      detection_type: 'PREEXISTING' as const,
      detected_at: null,
      celebration_seen: true,
      custom_goal_id: null,
      created_at: '2026-08-27T20:59:22.000Z',
      updated_at: '2026-08-27T20:59:22.000Z',
    };
    const evaluation = evaluateBackendMilestones({
      userId: existingUpload.user_id,
      channelId: existingUpload.channel_id,
      previous: {
        subscriberCount: '2',
        viewCount: '702',
        videoCount: '11',
      },
      current: {
        subscriberCount: '2',
        viewCount: '702',
        videoCount: '11',
      },
      previousWatchMinutes: '124',
      currentWatchMinutes: '124',
      observedAt: '2026-08-27T21:02:42.000Z',
      existing: [existingUpload],
      customGoals: [],
    });

    expect(evaluation.rows).toContainEqual(
      expect.objectContaining({ id: existingUpload.id, metric: 'uploads', target: 1 }),
    );
    expect(
      evaluation.rows.filter(
        (row) => row.metric === 'uploads' && Number(row.target) === 1,
      ),
    ).toHaveLength(1);
  });
});
