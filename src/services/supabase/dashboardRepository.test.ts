import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCloudDashboard } from './dashboardRepository';

const clientMocks = vi.hoisted(() => ({
  requireSupabaseClient: vi.fn(),
}));

vi.mock('./client', () => ({
  requireSupabaseClient: clientMocks.requireSupabaseClient,
}));

const USER_ID = '86d4f90b-5aa1-43b0-9625-6fe933b730af';

function queryResult<T>(data: T) {
  return Promise.resolve({ data, error: null });
}

describe('cloud account loading', () => {
  beforeEach(() => {
    clientMocks.requireSupabaseClient.mockReset();
  });

  it('returns profile and connection state when no channel dashboard exists', async () => {
    const profile = {
      user_id: USER_ID,
      display_name: null,
      theme: 'dark' as const,
      selected_channel_id: null,
      created_at: '2026-08-27T00:00:00.000Z',
      updated_at: '2026-08-27T00:00:00.000Z',
    };
    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: () => queryResult(profile) }),
          }),
        };
      }
      if (table === 'youtube_connections' || table === 'channels') {
        return {
          select: () => ({
            eq: () => ({ order: () => queryResult([]) }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    clientMocks.requireSupabaseClient.mockReturnValue({ from });

    await expect(loadCloudDashboard(USER_ID)).resolves.toEqual({
      profile,
      connections: [],
      selectedConnection: null,
      channels: [],
      dashboard: null,
    });
    expect(from).toHaveBeenCalledTimes(3);
  });
});
